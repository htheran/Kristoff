const axios = require("axios");
const https = require("https");
const crypto = require("crypto");

let BASE_URL = process.env.BACKEND_URL || "https://10.100.18.136:8080";

// Function to validate and format URL
function formatBaseUrl(url) {
    if (!url) return BASE_URL;
    let formatted = url.trim();
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
        formatted = 'https://' + formatted;
    }
    // Default port if not specified
    if (!formatted.includes(':', formatted.indexOf('//') + 2)) {
        formatted += ':8080';
    }
    return formatted;
}

// Create axios instance
const api = axios.create({
    baseURL: formatBaseUrl(BASE_URL), 
    timeout: 10000,
    httpsAgent: new https.Agent({  
        rejectUnauthorized: false
    })
});

let token = null;
let currentEmail = null;
let currentPassword = null;
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Request interceptor
api.interceptors.request.use(config => {
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, error => Promise.reject(error));

// Response interceptor
api.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry && currentEmail && currentPassword) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                }).catch(err => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const res = await axios.post(`${api.defaults.baseURL}/login`, {
                    email: currentEmail,
                    password: currentPassword
                }, { 
                    httpsAgent: new https.Agent({ rejectUnauthorized: false }) 
                });
                token = res.data.access_token;
                processQueue(null, token);
                originalRequest.headers.Authorization = `Bearer ${token}`;
                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }
        return Promise.reject(error);
    }
);

// Internal diagnostic logs
let internalActivityLogs = [];
const MAX_INTERNAL_LOGS = 50;

function logInternalActivity(type, url, payload, status, response) {
    const entry = {
        timestamp: new Date().toISOString(),
        type,
        url,
        payload: sanitizeObject(payload),
        status,
        response: sanitizeObject(response)
    };
    internalActivityLogs.unshift(entry);
    if (internalActivityLogs.length > MAX_INTERNAL_LOGS) {
        internalActivityLogs.pop();
    }
    // console.log(`[InternalLog] ${type} ${url} - Status: ${status}`);
}

function sanitizeObject(obj) {
    if (!obj) return null;
    try {
        const sanitized = JSON.parse(JSON.stringify(obj));
        const sensitiveKeys = ['ssh_key', 'key', 'ssh_pass', 'password', 'new_password', 'root_pass', 'root_password', 'token', 'access_token', 'ssh_key_pass', 'secret', 'password_encrypted'];
        
        const traverse = (o) => {
            if (!o || typeof o !== 'object') return;
            Object.keys(o).forEach(key => {
                if (sensitiveKeys.includes(key.toLowerCase())) {
                    if (typeof o[key] === 'string' && o[key].length > 8) {
                        o[key] = o[key].substring(0, 4) + '...' + o[key].substring(o[key].length - 4);
                    } else {
                        o[key] = '********';
                    }
                } else if (typeof o[key] === 'object') {
                    traverse(o[key]);
                }
            });
        };
        
        traverse(sanitized);
        return sanitized;
    } catch (e) {
        return null;
    }
}

function getErrorMessage(error, defaultMsg) {
    const status = error.response?.status;
    const data = error.response?.data;
    const url = error.config?.url;
    const method = error.config?.method;
    
    logInternalActivity('ERROR', `${method?.toUpperCase()} ${url}`, error.config?.data ? JSON.parse(error.config.data) : null, status, data);

    if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
        return `La operacion tardo demasiado y se cancelo (Timeout). Verifica los logs en el servidor.`;
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || !error.response) {
        return `Cannot connect to backend. Please check the server. Details: ${error.message || 'No response'}`;
    }
    
    if (data) {
        let msg = "";
        // Check for common error fields in backend responses
        if (data.detail) {
            msg = typeof data.detail === 'object' ? JSON.stringify(data.detail) : data.detail;
        } else if (data.error) {
            msg = data.error;
        } else if (data.message) {
            msg = data.message;
        } else {
            msg = `Server Error: ${JSON.stringify(data).substring(0, 100)}`;
        }
        
        // Append all additional string/object fields from data for maximum visibility
        Object.keys(data).forEach(key => {
            if (!['detail', 'error', 'message', 'status'].includes(key)) {
                const val = data[key];
                if (typeof val === 'string' && val.length > 0) {
                    msg += `\n${key.toUpperCase()}: ${val}`;
                } else if (typeof val === 'object' && val !== null) {
                    msg += `\n${key.toUpperCase()}: ${JSON.stringify(val)}`;
                }
            }
        });
        
        return status ? `[${status}] ${msg}` : msg;
    }
    return error.message || defaultMsg;
}

const client = {
    BASE_URL: api.defaults.baseURL,

    getToken() { return token; },
    getInternalLogs() { return internalActivityLogs; },

    async health(options = {}) {
        try {
            const res = await api.get('/health', { timeout: options.timeout || 5000 });
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, 'Health check failed') };
        }
    },

    async login(email, password) {
        try {
            const res = await api.post('/login', { email, password });
            token = res.data.access_token;
            currentEmail = email;
            currentPassword = password;
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Login failed") };
        }
    },

    logout() {
        token = null;
        currentEmail = null;
        currentPassword = null;
    },

    async register(email, password, companyId, branchId) {
        try {
            const payload = { email, password, full_name: null };
            if (companyId) payload.company_id = parseInt(companyId);
            if (branchId) payload.branch_id = parseInt(branchId);
            const res = await api.post('/register', payload);
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Registration failed") };
        }
    },

    async updateCredential(companyId, credentialId, name, username, password, host, group, notes, services = [], isPersonal = false, environment = null, ssh_key = null, ssh_pass = null, root_pass = null, ssh_user = null, metadata = null) {
        try {
            const payload = { name, username, password, host, group_name: group, notes, services, is_personal: isPersonal, environment, ssh_key, ssh_pass, root_pass, ssh_user , metadata: metadata ? (typeof metadata === "string" ? metadata : JSON.stringify(metadata)) : null };
            const res = await api.put(`/companies/${companyId}/credentials/${credentialId}`, payload);
            logInternalActivity('SUCCESS', `/companies/${companyId}/credentials/${credentialId}`, payload, res.status, res.data);
            return { success: true, data: res.data };
        } catch (error) {
            logInternalActivity('ERROR', `/companies/${companyId}/credentials/${credentialId}`, null, error.response?.status || 0, error.response?.data || error.message);
            return { success: false, error: getErrorMessage(error, "Failed to update credential") };
        }
    },

    async deleteCredential(companyId, credentialId, isPersonal = false) {
        try {
            const res = await api.delete(`/companies/${companyId}/credentials/${credentialId}?is_personal=${isPersonal}`);
            logInternalActivity('SUCCESS', `DELETE /companies/${companyId}/credentials/${credentialId}`, { isPersonal }, res.status, res.data);
            return { success: true };
        } catch (error) {
            logInternalActivity('ERROR', `DELETE /companies/${companyId}/credentials/${credentialId}`, null, error.response?.status || 0, error.response?.data || error.message);
            return { success: false, error: getErrorMessage(error, "Failed to delete credential") };
        }
    },

    async deleteGroup(companyId, groupName, isPersonal = false) {
        try {
            const res = await api.delete(`/companies/${companyId}/credentials/group/${encodeURIComponent(groupName)}?is_personal=${isPersonal}`);
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to delete group") };
        }
    },

    async getCompanies() {
        try {
            const res = await api.get('/companies/public');
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to fetch companies") };
        }
    },

    // Public companies use the same endpoint
    getPublicCompanies() {
        return this.getCompanies();
    },

    async getBranches(companyId) {
        try {
            const res = await api.get(`/companies/${companyId}/branches`);
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to fetch branches") };
        }
    },

    async getPublicBranches(companyId) {
        try {
            const res = await api.get(`/companies/${companyId}/public-branches`);
            // The backend returns {success: true, data: branches} for this specific endpoint
            if (res.data && res.data.data) {
                return { success: true, data: res.data.data };
            }
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to fetch public branches") };
        }
    },

    async getLogs() {
        try {
            const res = await api.get('/logs/activity');
            
            // Satisfy the requirement "rastrear toda actividad":
            // Merge internal client-side logs (especially failed rotations) into the server logs
            const serverLogs = res.data?.items || (Array.isArray(res.data) ? res.data : []);
            
            const internalRotations = internalActivityLogs
                .filter(l => l.url && (l.url.includes('/rotate') || l.url.includes('/share') || l.url.includes('/deploy-keys')) && l.type !== 'INFO')
                .map(l => {
                    const isShare = l.url.includes('/share');
                    const isRotation = l.url.includes('/rotate');
                    const isDeploy = l.url.includes('/deploy-keys');
                    const response = l.response;
                    let isActuallySuccess = l.status >= 200 && l.status < 300;
                    
                    // If it's a group operation and results are provided, verify at least one success
                    if (isActuallySuccess && Array.isArray(response) && response.length > 0) {
                        const successCount = response.filter(r => r.success).length;
                        if (successCount === 0) isActuallySuccess = false;
                    }

                    const statusText = isActuallySuccess ? 'SUCCESS' : 'FAILED';
                    
                    let humanMessage = `[${statusText}] `;
                    
                    if (isShare) {
                        const payload = l.payload || {};
                        const recipient = payload.to_email || payload.toEmail || 'unknown';
                        const perms = payload.permission_level || payload.permission || 'read';
                        const expires = (payload.expires_at || payload.expiresAt) ? new Date(payload.expires_at || payload.expiresAt).toLocaleString() : 'Never';
                        
                        if (l.url.includes('/group')) {
                            const groupName = payload.groupName || 'Unknown Group';
                            humanMessage += `SHARE GROUP by ${currentEmail || 'User'}: Group [${groupName}] shared with ${recipient}. Perms: ${perms}. Expires: ${expires}.`;
                        } else {
                            // Extract credential ID from URL if not in payload (e.g., /credentials/123/share)
                            const urlParts = l.url.split('/');
                            const credId = payload.credentialId || urlParts[urlParts.indexOf('credentials') + 1] || 'Unknown';
                            humanMessage += `SHARE by ${currentEmail || 'User'}: Credential [${credId}] shared with ${recipient}. Perms: ${perms}. Expires: ${expires}.`;
                        }
                    } else if (isRotation) {
                        const payload = l.payload || {};
                        if (l.url.includes('/groups/')) {
                            const urlParts = l.url.split('/');
                            const groupName = urlParts[urlParts.indexOf('groups') + 1] || 'Group';
                            let rotSummary = "";
                            if (Array.isArray(response)) {
                                const ok = response.filter(r => r.success).length;
                                const fail = response.filter(r => !r.success).length;
                                rotSummary = ` | Results: ${ok} OK, ${fail} FAIL`;
                            }
                            humanMessage += `GROUP ROTATION by ${currentEmail || 'User'}: Triggered for group [${groupName}]${rotSummary}.`;
                        } else {
                            const host = payload.host || 'N/A';
                            const user = payload.username || payload.service_username || 'N/A';
                            humanMessage += `ROTATION by ${currentEmail || 'User'}: Attempted for ${user}@${host}.`;
                        }
                    } else if (isDeploy) {
                        const payload = l.payload || {};
                        const groupName = payload.groupName || 'Group';
                        const targetUser = payload.target_user || '';
                        let summary = "";
                        if (Array.isArray(response)) {
                            const successCount = response.filter(r => r.success).length;
                            const failCount = response.filter(r => !r.success).length;
                            summary = ` | Results: ${successCount} OK, ${failCount} FAIL`;
                        }
                        const userSuffix = targetUser ? ` to user [${targetUser}]` : '';
                        humanMessage += `KEY DEPLOY by ${currentEmail || 'User'}: Public key deployment to group [${groupName}]${userSuffix}${summary}.`;
                    } else {
                        humanMessage += `ACTIVITY: ${l.url}`;
                    }

                    return {
                        id: `local-${l.timestamp}-${Math.random().toString(36).substr(2, 5)}`,
                        created_at: l.timestamp,
                        event_type: isActuallySuccess ? (isShare ? 'share' : (isDeploy ? 'deploy' : 'rotation')) : (isShare ? 'share_failed' : (isDeploy ? 'deploy_failed' : 'rotation_failed')),
                        message: humanMessage,
                        success: isActuallySuccess,
                        details: `URL: ${l.url}\nPayload: ${JSON.stringify(l.payload)}\nResponse: ${JSON.stringify(l.response)}`
                    };
                });

            // Combine and sort by date descending
            const combined = [...internalRotations, ...serverLogs].sort((a, b) => 
                new Date(b.created_at) - new Date(a.created_at)
            );

            return { success: true, data: { items: combined } };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to fetch activity logs") };
        }
    },

    async downloadLogs() {
        try {
            const res = await api.get('/logs/activity/download', { responseType: 'arraybuffer' });
            return { success: true, data: res.data, headers: res.headers };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to download logs") };
        }
    },

    async getCredentials(companyId, isPersonal = false) {
        try {
            const url = `/companies/${companyId}/credentials?is_personal=${isPersonal}&limit=1000`;
            const res = await api.get(url);
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to fetch credentials") };
        }
    },

    async getCredential(credentialId, companyId = 1) {
        try {
            // Using default company 1 if not provided, but group share loop will provide it
            const res = await api.get(`/companies/${companyId}/credentials/${credentialId}`);
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to fetch single credential") };
        }
    },

    async getPersonalCredentials() {
        try {
            const res = await api.get('/credentials/personal?limit=1000');
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to fetch personal credentials") };
        }
    },

    async createCompany(name, description) {
        try {
            const res = await api.post('/companies', { name, description });
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to create company") };
        }
    },

    async createBranch(companyId, name, location) {
        try {
            const res = await api.post(`/companies/${companyId}/branches`, { name, location });
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to create branch") };
        }
    },

    async createCredential(companyId, name, username, password, host, group, notes, services = [], isPersonal = false, environment = null, ssh_key = null, ssh_pass = null, root_pass = null, ssh_user = null, metadata = null) {
        try {
            const payload = { 
                name, username, password, host, 
                group_name: group, notes, 
                services: Array.isArray(services) ? services : [], 
                is_personal: isPersonal, environment,
                ssh_key, ssh_pass, root_pass, ssh_user,
                metadata: metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null
            };
            const res = await api.post(`/companies/${companyId}/credentials`, payload);
            logInternalActivity('SUCCESS', `/companies/${companyId}/credentials`, payload, res.status, res.data);
            return { success: true, data: res.data };
        } catch (error) {
            logInternalActivity('ERROR', `/companies/${companyId}/credentials`, null, error.response?.status || 0, error.response?.data || error.message);
            return { success: false, error: getErrorMessage(error, "Failed to create credential") };
        }
    },


    async getPredefinedGroups() {
        try {
            const res = await api.get('/companies/1/credentials/groups/predefined');
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to fetch predefined groups") };
        }
    },

    async addPredefinedGroup(name) {
        try {
            const res = await api.post(`/companies/1/credentials/groups/predefined?group_name=${encodeURIComponent(name)}`);
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to add group") };
        }
    },

    async deletePredefinedGroup(name) {
        try {
            const res = await api.delete(`/companies/1/credentials/groups/predefined/${encodeURIComponent(name)}`);
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to delete group") };
        }
    },


    async rotateServicePassword({ companyId, credentialId, serviceId, payload = {} }) {
        try {
            const res = await api.post(`/companies/${companyId}/credentials/${credentialId}/services/${serviceId}/rotate`, payload, { timeout: 120000 });
            logInternalActivity('SUCCESS', `/rotate-service-api`, { companyId, credentialId, serviceId, ...payload }, res.status, res.data);
            return res.data;
        } catch (err) {
            console.error('Service API rotation error:', err);
            return { success: false, error: err.message };
        }
    },

    async rotatePassword({ companyId, credentialId, payload = {} }) {
        try {
            const res = await api.post(`/companies/${companyId}/credentials/${credentialId}/rotate`, payload, { timeout: 120000 });
            logInternalActivity('SUCCESS', `/rotate`, { companyId, credentialId, ...payload }, res.status, res.data);
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to rotate password") };
        }
    },

    async rotateGroup(companyId, groupName, rotationConfig = {}) {
        try {
            const res = await api.post(`/companies/${companyId}/credentials/groups/${groupName}/rotate`, rotationConfig, { timeout: 600000 });
            logInternalActivity('SUCCESS', `/credentials/groups/${groupName}/rotate`, rotationConfig, res.status, res.data);
            return res.data;
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to rotate group") };
        }
    },

    async deployGroupKeys(companyId, groupName, publicKey, mode = 'append', targetUser = '', targetPass = '') {
        try {
            const payload = { 
                public_key: publicKey, 
                mode: mode,
                target_user: targetUser,
                target_pass: targetPass
            };
            const res = await api.post(`/companies/${companyId}/credentials/groups/${groupName}/deploy-keys`, payload, { timeout: 600000 });
            logInternalActivity('SUCCESS', `/credentials/groups/${groupName}/deploy-keys`, { groupName, ...payload }, res.status, res.data);
            return { success: true, data: res.data };
        } catch (error) {
            // Fallback: If endpoint not found, try using rotation endpoint with specialized payload
            if (error.response && error.response.status === 404) {
                try {
                    const payloadFallback = { 
                        rotation_type: 'key_only', 
                        public_key: publicKey,
                        mode: mode,
                        target_user: targetUser,
                        target_pass: targetPass
                    };
                    const res = await api.post(`/companies/${companyId}/credentials/groups/${groupName}/rotate`, payloadFallback, { timeout: 600000 });
                    logInternalActivity('SUCCESS', `/credentials/groups/${groupName}/deploy-keys-fallback`, { groupName, ...payloadFallback }, res.status, res.data);
                    return { success: true, data: res.data };
                } catch (e) {
                    return { success: false, error: getErrorMessage(e, "Failed to deploy keys via fallback") };
                }
            }
            return { success: false, error: getErrorMessage(error, "Failed to deploy keys") };
        }
    },

    async getPendingUsers() {
        try {
            const res = await api.get('/users/pending');
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to fetch pending users") };
        }
    },

    async getAllUsers() {
        try {
            const res = await api.get('/users/');
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to fetch all users") };
        }
    },

    async approveUser(userId) {
        try {
            const res = await api.post(`/users/${userId}/approve`);
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to approve user") };
        }
    },

    async rejectUser(userId) {
        try {
            const res = await api.post(`/users/${userId}/reject`);
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to reject user") };
        }
    },

    async getCredentialShares(credentialId) {
        try {
            const res = await api.get(`/credentials/${credentialId}/shares`);
            return { success: true, data: res.data.shares };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to load active shares") };
        }
    },

    async shareCredential(credentialId, toEmail, permission, expiresAt, modularPermissions = null) {
        try {
            const payload = {
                to_email: toEmail,
                permission_level: permission,
                expires_at: expiresAt || null
            };
            
            if (modularPermissions) {
                let scopeStr = 'os';
                if (Array.isArray(modularPermissions)) {
                    // Extract non-definition tags (like svc:0, share, etc.)
                    scopeStr = modularPermissions.filter(p => !p.startsWith('__DEFS__:') && !p.startsWith('_M')).join(',');
                    payload.modular_permissions = modularPermissions;
                } else if (typeof modularPermissions === 'object') {
                    const perms = modularPermissions.perms || [];
                    scopeStr = perms.filter(p => !p.startsWith('__DEFS__:') && !p.startsWith('_M')).join(',');
                    payload.modular_permissions = perms;
                    payload.metadata = modularPermissions;
                }
                payload.shared_scope = scopeStr;
            } else {
                payload.shared_scope = 'os';
            }
            
            const res = await api.post(`/credentials/${credentialId}/share`, payload);
            logInternalActivity('SUCCESS', `/credentials/${credentialId}/share`, payload, res.status, res.data);
            return { success: true, data: res.data };
        } catch (error) {
            logInternalActivity('ERROR', `/credentials/${credentialId}/share`, null, error.response?.status || 0, error.response?.data || error.message);
            return { success: false, error: getErrorMessage(error, "Failed to share credential") };
        }
    },

    async shareGroup(groupName, companyId, toEmail, permission, expiresAt) {
        try {
            const params = new URLSearchParams({
                group_name: groupName,
                to_email: toEmail,
                permission: permission
            });
            if (expiresAt) params.append('expires_at', expiresAt);
            const res = await api.post(`/credentials/group?${params.toString()}`);
            logInternalActivity('SUCCESS', `/credentials/group/share`, { groupName, toEmail, permission, expiresAt }, res.status, res.data);
            return { success: true, data: res.data };
        } catch (error) {
            logInternalActivity('ERROR', `/credentials/group/share`, { groupName, toEmail }, error.response?.status || 0, error.response?.data || error.message);
            return { success: false, error: getErrorMessage(error, "Failed to share group") };
        }
    },

    async getCompanyUsers(companyId) {
        try {
            const res = await api.get(`/companies/${companyId}/users`);
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to fetch users") };
        }
    },

    async updateUserAdmin(userId, data) {
        try {
            const res = await api.patch(`/users/${userId}/admin`, data);
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to update user") };
        }
    },

    async updateCompany(companyId, name, description) {
        try {
            const res = await api.put(`/companies/${companyId}`, { name, description });
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to update company") };
        }
    },

    async updateBranch(companyId, branchId, name, location) {
        try {
            const res = await api.put(`/companies/${companyId}/branches/${branchId}`, { name, location });
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to update branch") };
        }
    },

    async getAllBranches() {
        try {
            const res = await api.get('/companies/all/branches');
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to fetch all branches") };
        }
    },

    async deleteBranch(companyId, branchId) {
        try {
            await api.delete(`/companies/${companyId}/branches/${branchId}`);
            return { success: true };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to delete branch") };
        }
    },


    async deleteUser(userId) {
        try {
            await api.delete(`/users/${userId}`);
            return { success: true };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to delete user") };
        }
    },

    async changePassword(oldPassword, newPassword) {
        try {
            const res = await api.post('/users/change-password', { 
                old_password: oldPassword, 
                new_password: newPassword 
            });
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to change password") };
        }
    },

    async resetUserPassword(userId, newPassword) {
        try {
            const res = await api.post(`/users/${userId}/reset-password`, { 
                new_password: newPassword 
            });
            return { success: true, data: res.data };
        } catch (error) {
            return { success: false, error: getErrorMessage(error, "Failed to reset user password") };
        }
    },

    setBaseUrl(url) {
        const newUrl = formatBaseUrl(url);
        api.defaults.baseURL = newUrl;
        this.BASE_URL = newUrl;
        // console.log(`API Base URL updated to: ${newUrl}`);
        return newUrl;
    },

    // TOTP 2FA Helpers (v=144)
    generateTOTPSecret() {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let secret = '';
        const randomValues = crypto.randomBytes(16); // 16 chars = 80 bits
        for (let i = 0; i < 16; i++) {
            secret += alphabet[randomValues[i] & 31];
        }
        return secret;
    },

    verifyTOTP(secret, code) {
        if (!secret || !code) return false;
        try {
            // Robust Base32 Decode
            function base32Decode(base32) {
                const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
                let bits = "";
                for (let i = 0; i < base32.length; i++) {
                    let val = alphabet.indexOf(base32.charAt(i).toUpperCase());
                    if (val >= 0) bits += val.toString(2).padStart(5, '0');
                }
                const bytes = [];
                for (let i = 0; i + 8 <= bits.length; i += 8) {
                    bytes.push(parseInt(bits.substr(i, 8), 2));
                }
                return Buffer.from(bytes);
            }

            const key = base32Decode(secret);
            const epoch = Math.floor(Date.now() / 1000);
            const timeStep = 30;
            const counter = Math.floor(epoch / timeStep);
            
            // Try multiple windows to handle clock drift (total 31 windows = ±450s / ±7.5min)
            const counters = [];
            for (let i = -15; i <= 15; i++) {
                counters.push(counter + i);
            }
            
            console.log(`TOTP: Verifying PIN ${code} against counter ${counter} (±15 windows)`);

            for (let c of counters) {
                const timeBuf = Buffer.alloc(8);
                // The counter must be a 64-bit big-endian integer
                timeBuf.writeUInt32BE(0, 0);
                timeBuf.writeUInt32BE(c, 4);

                const hmac = crypto.createHmac('sha1', key).update(timeBuf).digest();
                const offset = hmac[hmac.length - 1] & 0xf;
                const binary = ((hmac[offset] & 0x7f) << 24) |
                               ((hmac[offset + 1] & 0xff) << 16) |
                               ((hmac[offset + 2] & 0xff) << 8) |
                               (hmac[offset + 3] & 0xff);
                
                const expected = (binary % 1000000).toString().padStart(6, '0');
                if (code === expected) {
                    console.log(`TOTP: Match found at offset ${c - counter}`);
                    return true;
                }
            }
            console.warn(`TOTP: No match found for PIN ${code}`);
            return false;
        } catch (e) {
            console.error('TOTP Verification Error:', e);
            return false;
        }
    }
};

module.exports = client;
