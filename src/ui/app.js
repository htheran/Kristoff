
// v=200: Persistent banner to confirm our changes are LOADED
setTimeout(() => {
    if (typeof Toast !== 'undefined') {
        Toast.info("🚀 MOTOR DE HERENCIA v200 CARGADO", 30000);
    } else {
        alert("🚀 MOTOR DE HERENCIA v200 CARGADO (Falló Toast)");
    }
}, 500);

// Initialize app
window.init = async function() {
    console.log('Kristoff App v200 initializing...');
    
    try {
        setupLoginListeners();
        setupRegisterListeners();
        setupAppListeners();
        await renderPpkProfiles();
    } catch (e) {
        console.error('Initialization error:', e);
        const status = document.getElementById('statusText');
        if (status) {
            status.textContent = 'Init Error: ' + e.message;
            status.style.color = 'red';
        }
    }
    
    // Load persisted server settings
    try {
        const settings = await window.api.getSettings();
        if (settings && settings.backendUrl) {
            window.api.setBaseUrl(settings.backendUrl);
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    
    // Display current backend
    if (DOM.currentBackendDisplay) {
        DOM.currentBackendDisplay.textContent = window.api.BASE_URL;
    }

    showLoginExpiryBanner();  // Show persistent expiry notifications on login screen
    // Run connection test in background (non-blocking)
    testConnection().catch(err => console.error('Health check error:', err));
    // Attempt auto-login if credentials present
    if (DOM.loginEmail && DOM.loginEmail.value && DOM.loginPassword && DOM.loginPassword.value) {
        await attemptLogin(DOM.loginEmail.value, DOM.loginPassword.value);
    }
    
    await loadPredefinedGroups();
    startAutoRefresh();
    
    // v=200: Warm up user cache for inheritance engine
    if (typeof window.loadApprovedUsers === 'function') {
        window.loadApprovedUsers().catch(err => console.error('Cache warmup error:', err));
    }
}

/**
 * Read stored expiry notifications from localStorage and show a banner
 * on the login screen for any that haven't expired yet.
 * This ensures users see the notification even before they log in.
 */
function showLoginExpiryBanner() {
    const now = Date.now();
    const bannerItems = [];

    // Scan all localStorage keys for share_expiry entries
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('share_expiry_')) continue;
        try {
            const stored = JSON.parse(localStorage.getItem(key) || '{}');
            Object.entries(stored).forEach(([credId, info]) => {
                const expMs = new Date(info.expires_at).getTime();
                if (expMs > now) {
                    bannerItems.push(info);
                } else {
                    delete stored[credId];
                }
            });
            localStorage.setItem(key, JSON.stringify(stored));
        } catch(e) {}
    }

    if (bannerItems.length === 0) return;

    let banner = document.getElementById('loginExpiryBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'loginExpiryBanner';
        banner.style.cssText = `
            position:fixed; top:0; left:0; right:0; z-index:9999;
            background:linear-gradient(135deg,#f39c12,#e67e22);
            color:#fff; padding:10px 16px; font-size:13px;
            box-shadow:0 2px 12px rgba(0,0,0,0.3);
            display:flex; flex-direction:column; gap:4px;
        `;
        document.body.prepend(banner);
    }

    banner.innerHTML = `
        <div style="font-weight:700; display:flex; align-items:center; gap:8px;">
            [!] Shared Credential Expiry Reminders
            <button onclick="document.getElementById('loginExpiryBanner').remove()"
                    style="margin-left:auto;background:none;border:none;color:#fff;font-size:16px;cursor:pointer">x</button>
        </div>
        ${bannerItems.map(item => `
            <div>[T] <strong>${item.name}</strong> - Access expires: ${new Date(item.expires_at).toLocaleString()}</div>
        `).join('')}
    `;
}
async function testConnection() {
    if (DOM.statusDot) DOM.statusDot.className = 'status-dot';
    if (DOM.statusText) DOM.statusText.textContent = 'Checking...';
    if (DOM.testConnectionBtn) DOM.testConnectionBtn.disabled = true;

    // Timeout de UI para no quedar bloqueado visualmente
    const uiTimeout = setTimeout(() => {
        if (DOM.statusText && DOM.statusText.textContent === 'Checking...') {
            DOM.statusText.textContent = 'Connection slow...';
            if (DOM.statusDot) DOM.statusDot.classList.add('offline');
        }
    }, 4000);

    let result;
    try {
        result = await window.api.health({ timeout: 3000 });
    } catch (err) {
        console.error('Health check error:', err);
        result = { success: false, error: err.message };
    } finally {
        clearTimeout(uiTimeout);
    }

    if (DOM.testConnectionBtn) DOM.testConnectionBtn.disabled = false;

    if (result.success) {
        if (DOM.statusDot) DOM.statusDot.className = 'status-dot online';
        if (DOM.statusText) DOM.statusText.textContent = 'Server online';
        return true;
    } else {
        if (DOM.statusDot) DOM.statusDot.className = 'status-dot offline';
        if (DOM.statusText) DOM.statusText.textContent = `Server offline (${result.error || 'Connection failed'})`;
        return false;
    }
}

async function attemptLogin(email, password) {
    DOM.setLoading(DOM.loginSubmit, DOM.loginBtnText, DOM.loginBtnLoading, true);
    if (DOM.loginError) {
        DOM.loginError.textContent = '';
        DOM.loginError.classList.remove('info');
    }

    try {
        const result = await window.api.login(email, password);
        if (result.success) {
            AppState.currentUser = result.data;
            // Store user_id for permission checks
            AppState.currentUserId = result.data.user_id || null;
            if (typeof window.loadPersistedGroupShareRules === 'function') {
                window.loadPersistedGroupShareRules();
            }
            // Check if account is pending approval
            if (result.data.status === 'pending' || result.data.is_active === false) {
                if (DOM.loginError) {
                    DOM.loginError.innerHTML = `<span style="color:#f39c12"><strong>Account pending approval</strong></span><br>
                        <span style="font-size:12px">Your registration is awaiting administrator approval.</span>
                    `;
                }
                return;
            }
            showApp();
            await loadCompanies();
            
            // v=152: Ensure initial load of credentials
            if (AppState.allCompanies && AppState.allCompanies.length > 0) {
                const firstCompany = AppState.allCompanies[0];
                AppState.selectedCompany = firstCompany;

                await loadCredentials(firstCompany.id);
            } else {
                // If no company (personal vault only), load it
                await loadPersonalCredentials();
            }

            updateUserInfoDisplay();
        } else {
            if (DOM.loginError) DOM.loginError.textContent = result.error || "Login failed";
        }
    } catch (error) {
        if (DOM.loginError) {
            DOM.loginError.innerHTML = `<strong>Cannot connect to server</strong><br>
                <span style="font-size:12px">Backend: ${window.api.BASE_URL}</span>
            `;
        }
        console.error('Login error:', error);
    } finally {
        DOM.setLoading(DOM.loginSubmit, DOM.loginBtnText, DOM.loginBtnLoading, false);
    }
}

async function attemptRegister(email, password, companyId, branchId) {
    DOM.setLoading(DOM.registerSubmit, DOM.registerBtnText, DOM.registerBtnLoading, true);
    if (DOM.registerError) DOM.registerError.textContent = '';

    try {
        const result = await window.api.register(email, password, companyId, branchId);
        if (result.success) {
            if (DOM.registerError) {
                DOM.registerError.innerHTML = `<span style="color:#27ae60"><strong>Registration successful!</strong> Your account is pending approval.</span>
                `;
            }
            setTimeout(() => {
                showLoginForm();
                if (DOM.loginError) DOM.loginError.innerHTML = `<span style="color:#f39c12"><strong>Account created!</strong> Pending admin approval.</span>`;
            }, 2000);
        } else {
            if (DOM.registerError) DOM.registerError.textContent = result.error || "Registration failed";
        }
    } catch (error) {
        if (DOM.registerError) {
            DOM.registerError.innerHTML = `<strong>Cannot connect to server</strong><br>
                <span style="font-size:12px">Backend: ${window.api.BASE_URL}</span>
            `;
        }
        console.error('Register error:', error);
    } finally {
        DOM.setLoading(DOM.registerSubmit, DOM.registerBtnText, DOM.registerBtnLoading, false);
    }
}

let currentUser = null;
let userCompany = null;
let userBranch = null;

function showApp() {
    DOM.hide(DOM.loginScreen);
    DOM.flex(DOM.appContainer);
    
    const isAdmin = AppState.currentUser && (AppState.currentUser.is_admin || AppState.currentUser.email === 'admin@admin.com');
    
    if (isAdmin) {
        DOM.show(DOM.pendingApprovalsSection);
        DOM.flex(DOM.addCompanyBtn);
        DOM.flex(DOM.addBranchBtn);

        loadPendingApprovals();
    } else {
        DOM.hide(DOM.pendingApprovalsSection);
        DOM.hide(DOM.addCompanyBtn);
        DOM.hide(DOM.addBranchBtn);
    }

    // All users can add credentials if they are in a company
    if (AppState.currentUser && (AppState.currentUser.company_id || isAdmin)) {
        DOM.flex(DOM.addCredentialBtn);
        const _importBtn = document.getElementById('importCredentialsBtn');
        if (_importBtn) _importBtn.style.display = 'inline-flex';
        const _exportBtn = document.getElementById('exportCredentialsBtn');
        if (_exportBtn) _exportBtn.style.display = 'inline-flex';
    }
    
    check2FAAndEnforce(isAdmin);
    
    updateUserInfoDisplay();
    // Set up auto-refresh for admin every 60 seconds
    if (isAdmin && !window._adminRefreshInterval) {
        window._adminRefreshInterval = setInterval(() => {
            loadPendingApprovals();
        }, 60000);
    }
}

async function check2FAAndEnforce(isAdmin) {
    if (isAdmin && !AppState.is2FAVerified) {
        // Fetch personal credentials to see if 2FA exists (v=149)
        // Use a local search to avoid race conditions with AppState.allCredentials
        const res = await window.api.getPersonalCredentials();
        let personalCreds = [];
        if (res.success) {
            personalCreds = Array.isArray(res.data) ? res.data : (res.data?.items || []);
        }

        // Look for _SYSTEM_2FA_ credential in personal vault
        const sys2FA = personalCreds.find(c => c.name === '_SYSTEM_2FA_');
        if (sys2FA) {
            const modal = document.getElementById('twoFactorModal');
            const verifyView = document.getElementById('twoFactorVerifyView');
            const setupView = document.getElementById('twoFactorSetupView');
            if (modal && verifyView && setupView) {
                modal.style.display = 'flex';
                verifyView.style.display = 'block';
                setupView.style.display = 'none';
                if (DOM.appContainer) DOM.appContainer.style.filter = 'blur(10px)';
                const pinInput = document.getElementById('field_2fa_pin');
                if (pinInput) { pinInput.value = ''; pinInput.focus(); }
            }
        } else {
            // No 2FA setup yet, allow entry but prompt setup in profile
            AppState.is2FAVerified = true;
            if (DOM.appContainer) DOM.appContainer.style.filter = 'none';
        }
    } else {
        AppState.is2FAVerified = true;
        if (DOM.appContainer) DOM.appContainer.style.filter = 'none';
    }
    
    // Admin Bulk Section visibility
    const adminSection = document.getElementById('adminBulkSection');
    if (adminSection) {
        adminSection.style.display = isAdmin ? 'block' : 'none';
    }

    // PPK Profile Section visibility
    const ppkSection = document.getElementById('ppkSidebarSection');
    if (ppkSection) {
        ppkSection.style.display = isAdmin ? 'block' : 'none';
    }
    updateUserInfoDisplay();


}

function updateUserInfoDisplay() {
    const user = AppState.currentUser;
    if (!user) return;

    // Update Profile Card
    if (DOM.userEmail) DOM.userEmail.textContent = user.email;
    if (DOM.userRole) {
        if (user.email === 'admin@admin.com') {
            DOM.userRole.textContent = 'SUPER ADMINISTRATOR';
            if (DOM.userCompanyName) DOM.userCompanyName.textContent = 'All Companies';
            if (DOM.userBranchName) DOM.userBranchName.textContent = 'Global Access';
        } else {
            DOM.userRole.textContent = user.is_admin ? 'ADMINISTRATOR' : 'USER';
            if (DOM.userCompanyName) DOM.userCompanyName.textContent = user.company_name || 'None';
            if (DOM.userBranchName) DOM.userBranchName.textContent = user.branch_name || 'None';
        }
    }

    if (user.company_id) {
        window.api.getPublicCompanies().then(res => {
            if (res.success) {
                let companies = res.data;
                if (companies && !Array.isArray(companies)) {
                    companies = companies.companies || companies.data || companies.items || [];
                }
                const company = companies.find(c => c.id == user.company_id);
                if (company) {
                    AppState.userCompany = company;
                    if (DOM.userCompanyName) DOM.userCompanyName.textContent = company.name;
                    
                    window.api.getPublicBranches(company.id).then(branchesRes => {
                        if (branchesRes.success) {
                            let branches = branchesRes.data;
                            if (branches && !Array.isArray(branches)) {
                                branches = branches.branches || branches.data || branches.items || [];
                            }
                            const branch = branches.find(b => b.id == user.branch_id);
                            if (branch) {
                                if (DOM.userBranchName) DOM.userBranchName.textContent = branch.name;
                                AppState.userBranch = branch;
                            }
                        }
                    });
                }
            }
        });
    }
    // Show/Hide admin sections
    const isAdmin = user.is_admin || user.email === 'admin@admin.com';
    const adminSection = document.getElementById('adminBulkSection');
    if (adminSection) {
        adminSection.style.display = isAdmin ? 'block' : 'none';
    }
}

function showLogin() {
    DOM.flex(DOM.loginScreen);
    DOM.hide(DOM.appContainer);
    showLoginForm();
}

function showLoginForm() {
    DOM.show(DOM.loginBox);
    DOM.hide(DOM.registerBox);
    if (DOM.loginError) DOM.loginError.textContent = '';
    if (DOM.registerError) DOM.registerError.textContent = '';
}

async function showRegisterForm() {
    DOM.hide(DOM.loginBox);
    DOM.show(DOM.registerBox);
    if (DOM.loginError) DOM.loginError.textContent = '';
    if (DOM.registerError) DOM.registerError.textContent = '';
    
    // Load companies for registration dropdown
    if (DOM.registerCompany) DOM.registerCompany.innerHTML = '<option value="">Select a company...</option>';
    if (DOM.registerBranch) {
        DOM.registerBranch.innerHTML = '<option value="">Select a branch...</option>';
        DOM.registerBranch.disabled = true;
    }
    
    try {
        const result = await window.api.getPublicCompanies();
        if (result.success) {
            let companies = result.data;
            if (companies && !Array.isArray(companies)) {
                companies = companies.companies || companies.data || companies.items || [];
            }
            companies.forEach(company => {
                const option = document.createElement('option');
                option.value = company.id;
                option.textContent = company.name;
                if (DOM.registerCompany) DOM.registerCompany.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to load companies for registration:', error);
    }
}

function setLoginLoading(loading) {
    if (DOM.loginSubmit) DOM.loginSubmit.disabled = loading;
    if (DOM.loginBtnText) DOM.loginBtnText.style.display = loading ? 'none' : 'inline';
    if (DOM.loginBtnLoading) DOM.loginBtnLoading.style.display = loading ? 'inline' : 'none';
}

function setRegisterLoading(loading) {
    DOM.setLoading(DOM.registerSubmit, DOM.registerBtnText, DOM.registerBtnLoading, loading);
}

function setupLoginListeners() {
    if (DOM.loginForm) {
        DOM.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = DOM.loginEmail.value.trim();
            const password = DOM.loginPassword.value;
            await attemptLogin(email, password);
        });
    }

    if (DOM.showRegisterBtn) DOM.showRegisterBtn.addEventListener('click', showRegisterForm);

    if (DOM.testConnectionBtn) {
        DOM.testConnectionBtn.addEventListener('click', async () => {
            await testConnection();
        });
    }

    if (DOM.toggleServerConfigBtn) {
        DOM.toggleServerConfigBtn.addEventListener('click', () => {
            if (DOM.serverConfigBox.style.display === 'none') {
                DOM.show(DOM.serverConfigBox);
            } else {
                DOM.hide(DOM.serverConfigBox);
            }
        });
    }

    if (DOM.saveBackendUrlBtn) {
        DOM.saveBackendUrlBtn.addEventListener('click', async () => {
            const newUrl = DOM.backendUrlInput.value.trim();
            if (!newUrl) return;
            
            const formattedUrl = window.api.setBaseUrl(newUrl);
            if (DOM.currentBackendDisplay) DOM.currentBackendDisplay.textContent = formattedUrl;
            Toast.success(`Backend URL updated to: ${formattedUrl}`);
            
            // Persist to main process
            await window.api.saveSettings({ backendUrl: formattedUrl });
            
            // Test connection automatically
            await testConnection();
            
            // Hide box after saving
            setTimeout(() => DOM.hide(DOM.serverConfigBox), 1500);
        });
    }

    const btnEmergencyFix = document.getElementById('btnEmergencyFix');
    if (btnEmergencyFix) {
        btnEmergencyFix.addEventListener('click', async () => {
            const display = document.getElementById('corruptIdDisplay');
            const btn = document.getElementById('btnEmergencyFix');
            btn.disabled = true;
            btn.textContent = 'Buscando...';
            display.textContent = 'Buscando en los logs...';
            
            try {
                const res = await window.api.getLogs();
                if (res.success) {
                    const items = res.data?.items || res.data || [];
                    const badLogs = items.filter(l => l.message && l.message.includes("con servicios:"));
                    
                    if (badLogs.length > 0) {
                        display.innerHTML = `SE ENCONTRARON ${badLogs.length} CREDENCIALES CORRUPTAS.<br>Borrando...`;
                        
                        const companyId = AppState.currentUser?.company_id || 1;
                        let successCount = 0;
                        
                        for (const log of badLogs) {
                            if (log.metadata && log.metadata.credential_id) {
                                const badId = log.metadata.credential_id;
                                const delRes1 = await window.api.deleteCredential(companyId, badId, true);
                                const delRes2 = await window.api.deleteCredential(companyId, badId, false);
                                if (delRes1.success || delRes2.success) successCount++;
                            }
                        }
                        
                        if (successCount > 0) {
                            display.innerHTML += `<br><span style="color:green">${successCount} BORRADAS EXITOSAMENTE! Reinicia la app.</span>`;
                        } else {
                            display.innerHTML += '<br>Fall el borrado. Probablemente NO TIENES PERMISOS de Administrador.';
                        }
                    } else {
                        display.textContent = 'No se encontraron credenciales con servicios en los logs recientes.';
                    }
                } else {
                    display.textContent = 'No se pudieron leer los logs: ' + res.error;
                }
            } catch (err) {
                display.textContent = 'Error: ' + err.message;
            } finally {
                btn.disabled = false;
                btn.textContent = 'BUSCAR ID CORRUPTO';
            }
        });
    }
}

function setupRegisterListeners() {
    if (DOM.registerForm) {
        DOM.registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = DOM.registerEmail.value.trim();
            const password = DOM.registerPassword.value;
            const confirm = DOM.registerPasswordConfirm.value;
            const companyId = DOM.registerCompany.value;
            const branchId = DOM.registerBranch.value || null;

            if (password !== confirm) {
                if (DOM.registerError) DOM.registerError.textContent = "Passwords do not match";
                return;
            }

            if (!companyId) {
                if (DOM.registerError) DOM.registerError.textContent = "Please select a company";
                return;
            }

            await attemptRegister(email, password, companyId, branchId);
        });
    }

    if (DOM.registerCompany) {
        DOM.registerCompany.addEventListener('change', async () => {
            const companyId = DOM.registerCompany.value;
            if (companyId) {
                if (DOM.registerBranch) DOM.registerBranch.innerHTML = '<option value="">Loading branches...</option>';
                const res = await window.api.getPublicBranches(companyId);
                if (res.success) {
                    let branches = res.data;
                    if (branches && !Array.isArray(branches)) {
                        branches = branches.branches || branches.data || branches.items || [];
                    }
                    if (DOM.registerBranch) {
                        DOM.registerBranch.innerHTML = '<option value="">Select Branch</option>';
                        branches.forEach(b => {
                            DOM.registerBranch.innerHTML += `<option value="${b.id}">${b.name}</option>`;
                        });
                        DOM.registerBranch.disabled = false;
                    }
                } else {
                    if (DOM.registerBranch) {
                        DOM.registerBranch.innerHTML = '<option value="">No branches found</option>';
                        DOM.registerBranch.disabled = true;
                    }
                }
            } else {
                if (DOM.registerBranch) {
                    DOM.registerBranch.innerHTML = '<option value="">Select Company First</option>';
                    DOM.registerBranch.disabled = true;
                }
            }
        });
    }

    if (DOM.showLoginBtn) DOM.showLoginBtn.addEventListener('click', showLoginForm);
}

function setupAppListeners() {
    if (DOM.logoutBtn) DOM.logoutBtn.addEventListener('click', handleLogout);
    if (DOM.retryBtn) DOM.retryBtn.addEventListener('click', () => loadCompanies());

    const managePpkBtn = document.getElementById('addPpkProfileBtn');
    if (managePpkBtn) {
        managePpkBtn.addEventListener('click', () => openModal('ppk-profile'));
    }
    
    const btnEmergencyFixApp = document.getElementById('btnEmergencyFixApp');
    if (btnEmergencyFixApp) {
        btnEmergencyFixApp.addEventListener('click', async () => {
            const display = document.getElementById('appCorruptIdDisplay');
            btnEmergencyFixApp.disabled = true;
            btnEmergencyFixApp.textContent = 'Buscando...';
            if (display) display.textContent = 'Analizando logs...';
            
            try {
                const res = await window.api.getLogs(null, 500); // Fetch more logs just in case
                if (res.success) {
                    const items = res.data?.items || res.data || [];
                    const badLogs = items.filter(l => l.message && l.message.includes("con servicios:"));
                    
                    if (badLogs.length > 0) {
                        if (display) display.innerHTML = `Detectadas ${badLogs.length} credenciales corruptas. Borrando...`;
                        
                        const companyId = AppState.selectedCompany?.id || AppState.currentUser?.company_id || 1;
                        let successCount = 0;
                        let lastError = '';
                        
                        for (const log of badLogs) {
                            if (log.metadata && log.metadata.credential_id) {
                                const badId = log.metadata.credential_id;
                                
                                // Intento 1: Sobrescribir los servicios (PUT)
                                // Signature: (companyId, credentialId, name, username, password, host, group, notes, services, isPersonal)
                                const putRes = await window.api.updateCredential(
                                    companyId, 
                                    badId, 
                                    'Corrupta Recuperada', 
                                    'recuperado', 
                                    'recuperado', 
                                    'fixed', 
                                    'General', 
                                    'recuperado', 
                                    [], 
                                    false
                                );
                                
                                if (putRes.success) {
                                    successCount++;
                                    continue; // Si se arregl, pasamos a la siguiente
                                }
                                
                                // Intento 2: Borrado (DELETE)
                                const delRes = await window.api.deleteCredential(companyId, badId, false);
                                if (delRes.success) {
                                    successCount++;
                                } else {
                                    lastError = putRes.error || delRes.error;
                                }
                            }
                        }
                        
                        if (successCount > 0) {
                            if (display) display.innerHTML = `<span style="color:green">${successCount} credenciales arregladas! Dale a Retry.</span>`;
                        } else {
                            if (display) display.innerHTML = `<span style="color:red">Fallo: ${lastError}</span>`;
                        }
                    } else {
                        if (display) display.textContent = 'No se encontraron credenciales corruptas en los logs.';
                    }
                } else {
                    if (display) display.textContent = 'Error al leer logs: ' + res.error;
                }
            } catch (err) {
                if (display) display.textContent = 'Error: ' + err.message;
            } finally {
                btnEmergencyFixApp.disabled = false;
                btnEmergencyFixApp.textContent = 'Limpiar Bveda Corrupta';
            }
        });
    }

    if (DOM.searchInput) DOM.searchInput.addEventListener('input', handleSearch);

    if (DOM.addCompanyBtn) DOM.addCompanyBtn.addEventListener('click', () => openModal('company'));
    if (DOM.addBranchBtn) DOM.addBranchBtn.addEventListener('click', () => openModal('branch'));
    if (DOM.addCredentialBtn) DOM.addCredentialBtn.addEventListener('click', () => openModal('credential'));
    
    if (DOM.addPersonalBtn) {
        DOM.addPersonalBtn.addEventListener('click', () => {
            AppState.isPersonalView = true;
            openModal('credential');
        });
    }

    const btnShowPersonal = document.getElementById('btnShowPersonal');
    if (btnShowPersonal) {
        btnShowPersonal.addEventListener('click', () => {
            AppState.isPersonalView = true;
            AppState.selectedCompany = { id: AppState.currentUser?.company_id || 1, name: 'Personal Vault' };
            loadPersonalCredentials();
        });
    }

    if (DOM.btnShowLogs) {
        DOM.btnShowLogs.addEventListener('click', () => {
            loadLogs();
        });
    }

    const btnCloseDetails = document.getElementById('closeDetails');
    if (btnCloseDetails) {
        btnCloseDetails.addEventListener('click', () => {
            window.closeDetailsPanel();
        });
    }

    const btnShowSharedWithMe = document.getElementById('btnShowSharedWithMe');
    if (btnShowSharedWithMe) {
        btnShowSharedWithMe.addEventListener('click', () => {
            AppState.isPersonalView = false;
            AppState.selectedGroup = 'SHARED_WITH_ME';
            renderSidebarGroups();
            filterCredentials();
        });
    }

    const btnShowSharedByMe = document.getElementById('btnShowSharedByMe');
    if (btnShowSharedByMe) {
        btnShowSharedByMe.addEventListener('click', () => {
            AppState.isPersonalView = false;
            AppState.selectedGroup = 'SHARED_BY_ME';
            renderSidebarGroups();
            filterCredentials();
        });
    }

    if (DOM.closeModal) DOM.closeModal.addEventListener('click', hideModal);
    if (DOM.cancelModal) DOM.cancelModal.addEventListener('click', hideModal);
    if (DOM.createForm) DOM.createForm.addEventListener('submit', handleCreateSubmit);

    const btnChangeMyPass = document.getElementById('btnChangeMyPass');
    if (btnChangeMyPass) {
        btnChangeMyPass.addEventListener('click', () => openModal('change-password'));
    }

    // Share modal listeners
    if (DOM.shareForm) DOM.shareForm.addEventListener('submit', window.handleShareSubmit);
    const shareCloseBtns = document.querySelectorAll('#closeShareModal, #cancelShareModal');
    shareCloseBtns.forEach(btn => btn.addEventListener('click', window.closeShareModal));
}

let currentModalType = null;

async function getPpkProfiles() {
    try {
        // v=200: Migrate from localStorage to Backend (PostgreSQL)
        const res = await window.api.getPersonalCredentials();
        let personalCreds = [];
        if (res.success) {
            personalCreds = Array.isArray(res.data) ? res.data : (res.data?.items || []);
        }
        
        // Profiles are stored with group_name = '_PPK_PROFILE_'
        let profiles = personalCreds
            .filter(c => c.group_name === '_PPK_PROFILE_')
            .map(c => ({
                id: c.id,
                name: c.name,
                key: c.ssh_key || c.password // key is stored in ssh_key field
            }));

        // Initial Migration: Check localStorage one last time
        const stored = localStorage.getItem('ppk_profiles');
        if (stored && profiles.length === 0) {
            const localProfiles = JSON.parse(stored);
            for (const p of localProfiles) {
                await savePpkProfile(p);
            }
            localStorage.removeItem('ppk_profiles');
            return getPpkProfiles(); // Recursive call to get synced ones
        }

        return profiles;
    } catch (e) {
        console.error('Error fetching PPK profiles:', e);
        return [];
    }
}

async function savePpkProfile(profile) {
    try {
        const companyId = AppState.currentUser?.company_id || 1;
        if (profile.id && typeof profile.id === 'number' && profile.id > 1000000000) {
            // It's a temporary local ID, create new in backend
            const res = await window.api.createCredential(
                companyId, profile.name, 'ppk', 'ppk', 'N/A', '_PPK_PROFILE_', 'SSH Key Profile', [], true, null, profile.key
            );
            if (!res.success) throw new Error(res.error);
        } else if (profile.id) {
            // Update existing
            const res = await window.api.updateCredential(
                companyId, profile.id, profile.name, 'ppk', 'ppk', 'N/A', '_PPK_PROFILE_', 'SSH Key Profile', [], true, null, profile.key
            );
            if (!res.success) throw new Error(res.error);
        } else {
            // New one
            const res = await window.api.createCredential(
                companyId, profile.name, 'ppk', 'ppk', 'N/A', '_PPK_PROFILE_', 'SSH Key Profile', [], true, null, profile.key
            );
            if (!res.success) throw new Error(res.error);
        }
        await renderPpkProfiles();
    } catch (e) {
        Toast.error("Failed to save PPK profile to DB: " + e.message);
    }
}

async function deletePpkProfile(id) {
    try {
        const companyId = AppState.currentUser?.company_id || 1;
        const res = await window.api.deleteCredential(companyId, id, true);
        if (res.success) {
            Toast.success("PPK Profile deleted from DB");
            await renderPpkProfiles();
        } else {
            throw new Error(res.error);
        }
    } catch (e) {
        Toast.error("Failed to delete PPK profile: " + e.message);
    }
}

async function renderPpkProfiles() {
    const list = document.getElementById('ppkProfilesList');
    if (!list) return;
    
    const profiles = await getPpkProfiles();
    list.innerHTML = '';
    
    if (profiles.length === 0) {
        list.innerHTML = '<div style="color:#7f8c8d; font-size:11px; padding:5px;">No keys saved in DB</div>';
        return;
    }
    
    profiles.forEach(p => {
        const item = document.createElement('div');
        item.className = 'tree-item profile-item';
        item.innerHTML = `
            <span class="tree-icon">🔑</span>
            <span class="tree-label" onclick="openModal('ppk-profile', ${JSON.stringify(p).replace(/"/g, '&quot;')})">${p.name}</span>
            <div class="item-actions">
                <button class="btn-action-small" title="Deploy" onclick='handleDeployProfile(${JSON.stringify(p)})'>🚀</button>
                <button class="btn-action-small delete" title="Delete" onclick="deletePpkProfile(${p.id})">×</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function getPpkCredentialFlags() {
    try {
        return JSON.parse(localStorage.getItem('ppk_enabled_credentials') || '{}');
    } catch (e) {
        return {};
    }
}

function isCredentialPpkEnabled(credential) {
    if (!credential || !credential.id) return false;
    const flags = getPpkCredentialFlags();
    return flags[String(credential.id)] === true;
}

function setCredentialPpkEnabled(credentialId, enabled) {
    if (!credentialId) return;
    const flags = getPpkCredentialFlags();
    const key = String(credentialId);
    if (enabled) {
        flags[key] = true;
    } else {
        delete flags[key];
    }
    localStorage.setItem('ppk_enabled_credentials', JSON.stringify(flags));
}

function getCredentialIdFromResult(result) {
    const data = result?.data || {};
    return data.id || data.credential_id || data.credential?.id || data.data?.id || null;
}

async function getCredentialPpkSection(data = null) {
    const profiles = await getPpkProfiles();
    const hasProfiles = profiles.length > 0;
    const isChecked = hasProfiles && (!data || isCredentialPpkEnabled(data));
    const profileNames = profiles.map(p => p.name).join(', ');
    const label = hasProfiles ? `Use SSH Profiles: ${profileNames}` : 'No PPK profiles saved';
    const helper = hasProfiles
        ? 'This credential will attempt rotation using the profiles listed above.'
        : 'Configure at least one PPK profile from the sidebar to enable SSH rotation.';

    return `<div class="modal-divider"></div>
        <div class="modal-section-header">
            <label>SSH / Password Rotation</label>
        </div>
        <div class="ppk-credential-picker ${hasProfiles ? '' : 'is-empty'}">
            <label class="ppk-check-row">
                <input type="checkbox" id="field_use_ppk_profile" ${isChecked ? 'checked' : ''} ${hasProfiles ? '' : 'disabled'}>
                <span>${label}</span>
            </label>
            <p>${helper}</p>
        </div>`;
}

function removeLegacyCredentialPpkFields() {
    const keyField = document.getElementById('field_ssh_key');
    if (!keyField) return;

    const legacyBox = keyField.closest('div[style*="border-left"]');
    const legacyHeader = legacyBox?.previousElementSibling;
    const legacyDivider = legacyHeader?.previousElementSibling;

    legacyBox?.remove();
    legacyHeader?.remove();
    if (legacyDivider && legacyDivider.classList.contains('modal-divider')) {
        legacyDivider.remove();
    }
}

window.openModal = async function(type, data = null) {
    AppState.currentModalType = type;
    AppState.currentEditingData = data;
    DOM.modalError.textContent = '';
    if (DOM.createForm) DOM.createForm.reset();

    const configs = {
        company: {
            title: 'Add Company',
            fields: `<div class="form-group"><label>Name *</label><input type="text" id="field_name" required></div>
                <div class="form-group"><label>Description</label><input type="text" id="field_description"></div>
            `},
        branch: {
            title: data ? 'Edit Branch' : 'Add Branch',
            fields: `<div class="form-group">
                    <label>Company *</label>
                    <select id="field_company_id" required>
                        <option value="">Select a Company</option>
                        ${(AppState.companies || []).map(c => `<option value="${c.id}" ${(data?.company_id == c.id || AppState.selectedCompany?.id == c.id) ? 'selected' : ''}>${c.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group"><label>Name *</label><input type="text" id="field_name" required value="${data?.name || ''}"></div>
                <div class="form-group"><label>Location</label><input type="text" id="field_location" value="${data?.location || data?.location || ''}"></div>
            `},
        credential: {
            title: data ? 'Edit Credential' : 'Add Credential',
            fields: `<div class="form-group"><label>Name *</label><input type="text" id="field_name" required value="${data ? (data.name || '') : ''}"></div>
                <div class="form-group">
                    <label>Group</label>
                    <select id="field_group">
                        <option value="">No Group</option>
                        ${(AppState.predefinedGroups || []).map(g => `<option value="${g}" ${data?.group_name === g ? 'selected' : ''}>${g}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Environment</label>
                    <select id="field_environment">
                        <option value="Production" ${data?.environment === 'Production' ? 'selected' : ''}>Production</option>
                        <option value="Development" ${data?.environment === 'Development' ? 'selected' : ''}>Development</option>
                        <option value="Testing" ${data?.environment === 'Testing' ? 'selected' : ''}>Testing</option>
                        <option value="Staging" ${data?.environment === 'Staging' ? 'selected' : ''}>Staging</option>
                    </select>
                </div>
                <div class="form-group"><label>Username</label><input type="text" id="field_username" value="${data?.username || ''}"></div>
                <div class="form-group"><label>Password ${data ? '(edit manually or generate a new one)' : '*'}</label>
                    <div class="password-input-row" style="display:flex; gap:8px;">
                        <input type="password" id="field_password" value="${data?.password || ''}" autocomplete="new-password" ${data ? '' : 'required'} style="flex:1;">
                        <button type="button" class="btn-secondary" onclick="togglePasswordVisibility('field_password')" title="Show/Hide Password" style="width:36px; padding:0; display:flex; align-items:center; justify-content:center;">\uD83D\uDC41\uFE0F</button>
                        <button type="button" class="btn-secondary" onclick="openGeneratorModal('field_password')" title="Generate Password" style="width:36px; padding:0; display:flex; align-items:center; justify-content:center;">\uD83D\uDD11</button>
                    </div>
                </div>
                <div class="form-group"><label>Host / IP *</label><input type="text" id="field_host" value="${data?.host || ''}" required></div>
                <div class="form-group"><label>Notes</label><textarea id="field_notes" placeholder="Additional info...">${(data?.notes || '').replace(/\[SUDOER\]/g, '').replace(/###MODULAR_PERMS###[\s\S]*###MODULAR_PERMS###/g, '').trim()}</textarea></div>
                
                <div class="form-group" style="display:flex; align-items:center; gap:10px; margin-top:-5px; margin-bottom:15px;">
                    <input type="checkbox" id="field_is_sudoer" style="width:auto; margin:0;" ${data?.notes?.includes('[SUDOER]') ? 'checked' : ''}>
                    <label for="field_is_sudoer" style="margin:0; cursor:pointer; font-size:12px;">Usuario con permisos sudoers</label>
                </div>
                
                <div class="modal-section-header">
                    <label>Optional Services (FTP, SQL, etc.)</label>
                    <button type="button" class="btn-add-small" id="btnAddServiceRow" title="Add service">+</button>
                </div>
                <div id="modalServicesContainer" class="modal-services-list"></div>
            `},
        'company': {
            title: 'Edit Company',
            fields: `<div class="form-group"><label>Name *</label><input type="text" id="field_name" required value="${data?.name || ''}"></div>
                <div class="form-group"><label>Description</label><textarea id="field_desc">${data?.description || ''}</textarea></div>
            `},
        'admin-user': {
            title: (data) => `Editing User: ${data?.email || 'User'}`,
            fields: (data) => `<div class="form-group">
                    <label>Company</label>
                    <select id="field_company_id" onchange="handleAdminUserCompanyChange(this.value)">
                        <option value="">No Company</option>
                        ${(AppState.allCompanies || []).map(c => `<option value="${c.id}" ${data?.company_id == c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Branch</label>
                    <select id="field_branch_id">
                        <option value="">No Branch</option>
                        ${(AppState.allBranches || []).filter(b => !data?.company_id || b.company_id == data.company_id).map(b => `<option value="${b.id}" ${data?.branch_id == b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                    </select>
                </div>
            `},
        'change-password': {
            title: 'Change My Profile',
            fields: (data) => {
                const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
                // Robust 2FA check that works regardless of current view
                const has2FA = AppState.is2FAVerified && (AppState.sys2FASecret || document.getElementById('twoFactorModal')); 
                // Wait, I don't have AppState.sys2FASecret yet. Let's use a simple check that is more reliable.
                // Actually, I can just check if _SYSTEM_2FA_ exists in personal vault if we are an admin.
                return `
                    <p class="modal-help-text">Update your account settings. ${isAdmin ? 'As an Admin, you can also update your generic email.' : ''}</p>
                    ${isAdmin ? `
                        <div class="form-group">
                            <label>New Email Address (Admin Only)</label>
                            <input type="email" id="field_new_email" value="${AppState.currentUser.email}" required>
                        </div>
                    ` : ''}
                    <div class="form-group"><label>Current Password</label><input type="password" id="field_old_password" required></div>
                    <div class="form-group"><label>New Password</label><input type="password" id="field_new_password" required minlength="6"></div>
                    <div class="form-group"><label>Confirm New Password</label><input type="password" id="field_confirm_password" required minlength="6"></div>
                    
                    ${isAdmin ? `
                        <div style="margin-top:20px; padding-top:15px; border-top:1px solid #eee;">
                            <label style="display:block; margin-bottom:10px; font-weight:bold;">Two-Factor Authentication (2FA)</label>
                            <div style="display:flex; align-items:center; justify-content:space-between; background:#f8f9fa; padding:10px; border-radius:5px;">
                                <span style="font-size:12px;" id="profile2FAStatus">
                                    Checking 2FA status...
                                </span>
                                <button type="button" class="btn-primary" style="font-size:11px; padding:5px 10px;" onclick="open2FASetup()">
                                    Configure Google/Microsoft Auth
                                </button>
                            </div>
                        </div>
                    ` : ''}
                `;
            }},
        'reset-password': {
            title: (data) => `Reset Password for: ${data?.email}`,
            fields: `<div class="form-group"><label>New Password</label><input type="text" id="field_new_password" required minlength="6"></div>
                <p style="font-size:11px; color:#7f8c8d;">The user will be required to use this new password for their next login.</p>
            `}
        ,
        'ppk-profile': {
            title: 'PPK Key Profile',
            fields: (data) => {
                return `<p class="modal-help-text">Save multiple SSH key profiles for different groups or hosts.</p>
                    <input type="hidden" id="field_ppk_id" value="${data?.id || ''}">
                    <div class="form-group"><label>Profile Name *</label><input type="text" id="field_ppk_name" required value="${data?.name || ''}" placeholder="e.g. UPB Admin, Global Root..."></div>
                    <div class="form-group"><label>PPK User *</label><input type="text" id="field_ppk_user" required value="${data?.user || ''}" placeholder="root, ubuntu, admin..."></div>
                    <div class="form-group"><label>PPK / Private Key *</label><textarea id="field_ppk_key" required placeholder="Paste your PPK or private key here..." style="font-family: monospace; font-size: 11px; height: 120px;">${data?.key || ''}</textarea></div>
                    <div class="form-group"><label>PPK Password / Passphrase (optional)</label><input type="password" id="field_ppk_password" value="${data?.password || ''}"></div>
                    <div class="ppk-profile-actions" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">
                        ${data ? `<button type="button" onclick="handleDeployFromPpkModal()" class="btn-primary" style="background:#2980b9;">🚀 Deploy this key to hosts...</button>` : ''}
                        ${data ? `<button type="button" id="btnDeletePpkProfile" class="btn-secondary" style="color:#e74c3c; border-color:#e74c3c;">Delete this profile</button>` : ''}
                    </div>`;
            }
        }
    };

    const config = configs[type];
    if (config) {
        DOM.modalTitle.textContent = typeof config.title === 'function' ? config.title(data) : config.title;
        DOM.modalFields.innerHTML = typeof config.fields === 'function' ? config.fields(data) : config.fields;
        DOM.submitModal.textContent = type === 'ppk-profile' ? 'Save Profile' : (data ? 'Save Changes' : 'Create');
    }
    
    if (type === 'credential') {
        const ppkSection = await getCredentialPpkSection(data);
        DOM.modalFields.innerHTML += ppkSection;
        removeLegacyCredentialPpkFields();

        const btn = document.getElementById('btnAddServiceRow');
        if (btn) btn.addEventListener('click', () => addServiceRowToModal());
        
        // If editing, populate existing services
        if (data && data.services) {
            data.services.forEach(svc => addServiceRowToModal(svc));
        }
    }

    if (type === 'ppk-profile') {
        const deleteBtn = document.getElementById('btnDeletePpkProfile');
        if (deleteBtn && data && data.id) {
            deleteBtn.addEventListener('click', () => {
                if (!confirm(`Delete the profile "${data.name}"?`)) return;
                deletePpkProfile(data.id);
                Toast.success('Profile deleted');
                hideModal();
            });
        }
    }

    if (type === 'change-password') {
        const statusEl = document.getElementById('profile2FAStatus');
        if (statusEl) {
            window.api.getPersonalCredentials().then(res => {
                const creds = res.success ? (Array.isArray(res.data) ? res.data : (res.data?.items || [])) : [];
                const has2FA = creds.some(c => c.name === '_SYSTEM_2FA_');
                statusEl.style.color = has2FA ? '#27ae60' : '#e67e22';
                statusEl.innerHTML = `Status: <strong>${has2FA ? 'ENABLED 🛡️' : 'DISABLED ⚠️'}</strong>`;
                
                const btn = statusEl.nextElementSibling;
                if (btn && btn.tagName === 'BUTTON') {
                    btn.textContent = has2FA ? 'Reset 2FA' : 'Configure Google/Microsoft Auth';
                }
            });
        }
    }

    DOM.flex(DOM.createModal);

    const btnDelete = document.getElementById('btnDeleteCredential');
    if (btnDelete) {
        if (type === 'credential' && data) {
            const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
            if (data.is_personal || isAdmin) {
                btnDelete.style.display = 'inline-block';
            } else {
                btnDelete.style.display = 'none';
            }
        } else {
            btnDelete.style.display = 'none';
        }
    }

    // If it's an admin user edit, ensure we have the companies loaded
    if (type === 'admin-user') {
        if (!AppState.allCompanies || AppState.allCompanies.length === 0) {
            loadCompanies().then(() => {
                DOM.modalFields.innerHTML = typeof configs[type].fields === 'function' ? configs[type].fields(data) : configs[type].fields;
                if (data?.company_id) handleAdminUserCompanyChange(data.company_id, data.branch_id);
            });
        } else if (data?.company_id) {
            handleAdminUserCompanyChange(data.company_id, data.branch_id);
        }
    }
}

async function handleAdminUserCompanyChange(companyId, selectedBranchId = null) {
    const branchSelect = document.getElementById('field_branch_id');
    if (!branchSelect) return;
    
    branchSelect.innerHTML = '<option value="">Loading...</option>';
    
    if (!companyId) {
        branchSelect.innerHTML = '<option value="">No Branch</option>';
        return;
    }
    
    const res = await window.api.getPublicBranches(companyId);
    if (res.success) {
        let branches = res.data;
        if (branches && !Array.isArray(branches)) {
            branches = branches.branches || branches.data || branches.items || [];
        }
        branchSelect.innerHTML = '<option value="">No Branch</option>';
        branches.forEach(b => {
            branchSelect.innerHTML += `<option value="${b.id}" ${selectedBranchId == b.id ? 'selected' : ''}>${b.name}</option>`;
        });
    } else {
        branchSelect.innerHTML = '<option value="">Error loading branches</option>';
    }
}

function addServiceRowToModal(data = null) {
    const container = document.getElementById('modalServicesContainer');
    if (!container) return;
    
    const row = document.createElement('div');
    row.className = 'modal-service-row';
    row.innerHTML = `
        <input type="hidden" class="svc-name" value="${data?.name || ''}">
        <input type="hidden" class="svc-host" value="${data?.host || ''}">
        <select class="svc-type">
            <option value="ftp" ${data?.type === 'ftp' ? 'selected' : ''}>FTP</option>
            <option value="mysql" ${data?.type === 'mysql' ? 'selected' : ''}>SQL</option>
            <option value="ssh" ${data?.type === 'ssh' ? 'selected' : ''}>SSH</option>
            <option value="rdp" ${data?.type === 'rdp' ? 'selected' : ''}>RDP</option>
            <option value="http" ${data?.type === 'http' ? 'selected' : ''}>HTTP</option>
            <option value="https" ${data?.type === 'https' ? 'selected' : ''}>HTTPS</option>
            <option value="other" ${data?.type === 'other' ? 'selected' : ''}>Other</option>
        </select>
        <input type="text" class="svc-user" placeholder="User" value="${data?.username || ''}">
        <input type="text" class="svc-pass" placeholder="Pass" value="${data ? '******' : ''}">
        <button type="button" class="btn-remove-svc" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(row);
}

window.hideModal = function() {
    DOM.hide(DOM.createModal);
    AppState.currentModalType = null;
}

async function handleCreateSubmit(e) {
    e.preventDefault();
    DOM.modalError.textContent = '';

    try {
        let result;
        if (AppState.currentModalType === 'company') {
            const name = document.getElementById('field_name').value.trim();
            const description = (document.getElementById('field_description') || document.getElementById('field_desc'))?.value.trim() || '';
            
            if (AppState.currentEditingData) {
                result = await window.api.updateCompany(AppState.currentEditingData.id, name, description);
            } else {
                result = await window.api.createCompany(name, description);
            }
            
            if (result.success) {
                Toast.success(AppState.currentEditingData ? 'Company updated' : 'Company created');
                await loadCompanies();
            }
        } else if (AppState.currentModalType === 'branch') {
            const companyId = document.getElementById('field_company_id').value;
            const name = document.getElementById('field_name').value.trim();
            const location = document.getElementById('field_loc')?.value.trim() || document.getElementById('field_location')?.value.trim() || '';
            
            if (AppState.currentEditingData) {
                result = await window.api.updateBranch(companyId, AppState.currentEditingData.id, name, location);
            } else {
                result = await window.api.createBranch(companyId, name, location);
            }
            
            if (result.success) {
                Toast.success(AppState.currentEditingData ? 'Branch updated' : 'Branch created');
                if (AppState.selectedCompany && AppState.selectedCompany.id == companyId) {
                    await loadBranches(companyId);
                }
            }
        } else if (AppState.currentModalType === 'credential') {
            const isPersonal = AppState.isPersonalView;
            // For regular users or when no company is explicitly selected, fallback to user's assigned company
            const credCompanyId = isPersonal
                ? (AppState.currentUser?.company_id || AppState.selectedCompany?.id || 1)
                : (AppState.selectedCompany?.id || AppState.currentUser?.company_id || 1);
            
            if (!credCompanyId) {
                DOM.modalError.textContent = 'No target company/vault available';
                return;
            }
            const name = document.getElementById('field_name').value.trim();
            const group = document.getElementById('field_group').value.trim() || null;
            const username = document.getElementById('field_username').value.trim() || null;
            const password = document.getElementById('field_password').value;
            const host = document.getElementById('field_host').value.trim() || null;
            let notes = document.getElementById('field_notes').value.trim();
            const isSudoer = document.getElementById('field_is_sudoer').checked;
            
            // Preserve modular perms if they exist in original data
            if (AppState.currentEditingData?.notes && AppState.currentEditingData.notes.includes('###MODULAR_PERMS###')) {
                const permsMatch = AppState.currentEditingData.notes.match(/###MODULAR_PERMS###[\s\S]*###MODULAR_PERMS###/);
                if (permsMatch) {
                    notes = (notes + ' ' + permsMatch[0]).trim();
                }
            }

            if (isSudoer && !notes.includes('[SUDOER]')) {
                notes = (notes + ' [SUDOER]').trim();
            } else if (!isSudoer && notes.includes('[SUDOER]')) {
                notes = notes.replace(/\[SUDOER\]/g, '').trim();
            }
            if (!notes) notes = null;
            const environment = document.getElementById('field_environment').value;
            const profiles = await getPpkProfiles();
            const ppkProfile = (profiles && profiles.length > 0) ? profiles[0] : null;
            const usePpkProfile = document.getElementById('field_use_ppk_profile')?.checked && ppkProfile;
            
            const ssh_user = document.getElementById('field_ssh_user')?.value.trim() || (usePpkProfile ? ppkProfile.user : null);
            const ssh_key = document.getElementById('field_ssh_key')?.value.trim() || (usePpkProfile ? ppkProfile.key : null);
            const ssh_pass = document.getElementById('field_ssh_pass')?.value || (usePpkProfile ? (ppkProfile.password || null) : null);
            const root_pass = document.getElementById('field_root_pass')?.value || (usePpkProfile ? (password || AppState.currentEditingData?.password || null) : null);
            
            // Collect services
            const services = [];
            const serviceRows = document.querySelectorAll('.modal-service-row');
            serviceRows.forEach(row => {
                const type = row.querySelector('.svc-type').value;
                const user = row.querySelector('.svc-user').value.trim();
                const pass = row.querySelector('.svc-pass').value.trim();
                const svcName = row.querySelector('.svc-name')?.value || `${name} (${type.toUpperCase()})`;
                const svcHost = row.querySelector('.svc-host')?.value || host || 'localhost';
                
                if (user || pass) {
                    services.push({
                        name: svcName,
                        host: svcHost,
                        type: type,
                        username: user,
                        password: pass === '******' ? null : pass
                    });
                }
            });

            // credCompanyId was already calculated and validated at the start of the block
            
            if (AppState.currentEditingData) {
                result = await window.api.updateCredential(
                    credCompanyId,
                    AppState.currentEditingData.id,
                    name,
                    username,
                    password || null,
                    host,
                    group,
                    notes,
                    services,
                    isPersonal,
                    environment,
                    ssh_key,
                    ssh_pass,
                    root_pass,
                    ssh_user
                );
            } else {
                result = await window.api.createCredential(
                    credCompanyId, 
                    name, 
                    username, 
                    password, 
                    host, 
                    group, 
                    notes,
                    services,
                    isPersonal,
                    environment,
                    ssh_key,
                    ssh_pass,
                    root_pass,
                    ssh_user
                );
            }
            console.log("🚀 [DEBUG] API Result:", result);
            if (result.success) {
                const savedCredentialId = AppState.currentEditingData?.id || getCredentialIdFromResult(result);
                console.log("📍 [DEBUG] Saved ID:", savedCredentialId, "Group:", group, "CurrentEditingData:", AppState.currentEditingData);
                if (!savedCredentialId) {
                    Toast.error('No se pudo determinar el ID de la credencial creada; herencia puede no aplicarse. Revisa la consola.');
                }
                setCredentialPpkEnabled(savedCredentialId, !!usePpkProfile);

                // Clear cache before reload
                AppState.allCredentials = [];

                if (isPersonal) {
                    await loadPersonalCredentials();
                    hideModal();
                } else {
                    const reloadId = AppState.selectedCompany?.id || AppState.currentUser?.company_id;
                    if (reloadId) {
                        await loadCredentials(reloadId);
                        
                        // v=200: Robust Auto-Inheritance (Now also for updates to sync services)
                        if (typeof window.propagateGroupShares === 'function') {
                            const isNew = !AppState.currentEditingData;
                            const oldServices = AppState.currentEditingData?.services || [];
                            const servicesChanged = isNew || JSON.stringify(oldServices) !== JSON.stringify(services);
                            const groupChanged = isNew || AppState.currentEditingData?.group_name !== group;

                            if (isNew || servicesChanged || groupChanged) {
                                if (!savedCredentialId) {
                                    console.warn('Cannot propagate group shares because savedCredentialId is missing');
                                } else {
                                    console.log(`[Inheritance] Triggering sync. New:${isNew}, SvcChanged:${servicesChanged}, GroupChanged:${groupChanged}`);
                                    Toast.info("🔍 Sincronizando herencia y servicios...", 2000);
                                    setTimeout(() => {
                                        window.propagateGroupShares(savedCredentialId, group);
                                    }, 1000);
                                }
                            }
                        }
                        
                        // v=200: Force close and UI refresh
                        hideModal();
                        Toast.success(AppState.currentEditingData ? 'Credencial actualizada' : 'Credencial creada y compartida');
                    } else {
                        hideModal();
                    }
                }
            } else {
                DOM.modalError.textContent = result.error || 'Error al guardar la credencial';
            }
        } else if (AppState.currentModalType === 'admin-user') {
            const companyId = document.getElementById('field_company_id').value;
            const branchId = document.getElementById('field_branch_id').value;
            result = await window.api.updateUserAdmin(AppState.currentEditingData.id, {
                company_id: companyId ? parseInt(companyId) : null,
                branch_id: branchId ? parseInt(branchId) : null
            });
            if (result.success) {
                Toast.success('User updated successfully');
                hideModal();
                loadPendingApprovals();
                // Also reload active users
                const currentCid = AppState.selectedCompany?.id || 1;
                window.api.getCompanyUsers(currentCid).then(res => {
                    if (res.success) renderActiveUsers(res.data);
                });
            }
        } else if (AppState.currentModalType === 'change-password') {
            const oldPass = document.getElementById('field_old_password').value;
            const newPass = document.getElementById('field_new_password').value;
            const confirm = document.getElementById('field_confirm_password').value;
            
            if (newPass !== confirm) {
                DOM.modalError.textContent = 'Passwords do not match';
                return;
            }
            
            const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
            const newEmail = isAdmin ? document.getElementById('field_new_email')?.value.trim() : null;

            result = await window.api.changePassword(oldPass, newPass);
            if (result.success) {
                // If admin changed email, try to update it in backend too
                if (isAdmin && newEmail && newEmail !== AppState.currentUser.email) {
                    const userIdMatch = AppState.currentUser.id || 1; 
                    await window.api.updateUserAdmin(userIdMatch, { email: newEmail });
                    Toast.success('Profile and Email updated. Please re-login.');
                    setTimeout(() => logout(), 2000);
                } else {
                    Toast.success('Profile updated successfully');
                }
                hideModal();
            }
        } else if (AppState.currentModalType === 'reset-password') {
            const newPass = document.getElementById('field_new_password').value;
            result = await window.api.resetUserPassword(AppState.currentEditingData.id, newPass);
            if (result.success) {
                Toast.success(`Password reset for ${AppState.currentEditingData.email}`);
                hideModal();
            }
        } else if (AppState.currentModalType === 'ppk-profile') {
            const id = document.getElementById('field_ppk_id').value;
            const name = document.getElementById('field_ppk_name').value.trim();
            const user = document.getElementById('field_ppk_user').value.trim();
            const key = document.getElementById('field_ppk_key').value.trim();
            const password = document.getElementById('field_ppk_password').value;

            if (!name || !user || !key) {
                DOM.modalError.textContent = 'Name, user and key are required';
                return;
            }

            savePpkProfile({ 
                id: id ? parseInt(id) : null,
                name, 
                user, 
                key, 
                password 
            });
            Toast.success('PPK profile saved');
            result = { success: true };
        }

        if (result && result.success) hideModal();
        else if (result && result.error) {
            const err = result.error;
            DOM.modalError.textContent = typeof err === 'object' ? JSON.stringify(err) : err;
        }

    } catch (error) {
        console.error('Submit error:', error);
        DOM.modalError.textContent = 'An unexpected error occurred';
    }
}

// Sharing logic moved to modules/sharing.js

async function loadCompanies() {
    showLoading();
    
    try {
        const result = await window.api.getCompanies();
        
        if (result.success) {
            let companies = result.data;
            if (companies && !Array.isArray(companies)) {
                companies = companies.companies || companies.data || companies.items || [];
            }
            AppState.allCompanies = companies;
            
            if (companies.length === 0) {
                showEmpty();
                if (AppState.currentUser && AppState.currentUser.company_id) {
                    DOM.credentialsList.innerHTML = `<div style="text-align:center; padding:40px; color:#7f8c8d;">
                            <div style="font-size:18px; margin-bottom:10px;">No companies found</div>
                            <div style="font-size:13px;">You are assigned to company ID ${AppState.currentUser.company_id} but it may not be active.</div>
                        </div>
                    `;
                }
            } else {
                const isAdmin = AppState.currentUser && (AppState.currentUser.is_admin || AppState.currentUser.email === 'admin@admin.com');
                let displayCompanies = companies;
                if (!isAdmin && AppState.currentUser && AppState.currentUser.company_id) {
                    displayCompanies = companies.filter(c => c.id == AppState.currentUser.company_id);
                }
                renderCompanies(displayCompanies);
                if (displayCompanies.length === 1) {
                    await selectCompany(displayCompanies[0]);
                } else if (AppState.currentUser && AppState.currentUser.company_id) {
                    const userComp = displayCompanies.find(c => c.id == AppState.currentUser.company_id);
                    if (userComp) {
                        await selectCompany(userComp);
                        // Force load all branches for this company into AppState.allBranches
                        const bRes = await window.api.getPublicBranches(userComp.id);
                        if (bRes.success) {
                            let branches = bRes.data;
                            if (branches && !Array.isArray(branches)) {
                                branches = branches.branches || branches.data || branches.items || [];
                            }
                            AppState.allBranches = branches;
                            updateUserInfoDisplay(); // Refresh profile with new branch names
                        }
                    }
                } else {
                    showEmpty();
                }
            }
        } else {
            showError(result.error);
        }
    } catch (error) {
        showError(error?.message || 'Failed to load companies');
        console.error('Load companies error:', error);
    }
}

function renderCompanies(companies) {
    AppState.companies = companies;
    DOM.companiesList.innerHTML = '';
    
    if (!Array.isArray(companies)) {
        showError('Invalid companies data');
        return;
    }
    
    companies.forEach(company => {
        const item = document.createElement('div');
        item.className = 'tree-item';
        item.dataset.companyId = company.id;
        
        const isAdmin = AppState.currentUser && (AppState.currentUser.is_admin || AppState.currentUser.email === 'admin@admin.com');
        
        item.innerHTML = `<div class="tree-item-content">
                <span class="icon">[C]</span>
                <span class="name">${company.name}</span>
            </div>
            ${isAdmin ? `<button class="btn-icon-small edit-btn" data-action="edit-company">&#9998;</button>` : ''}
        `;
        
        item.querySelector('.tree-item-content').addEventListener('click', () => selectCompany(company));
        if (isAdmin) {
            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openModal('company', company);
            });
        }
        DOM.companiesList.appendChild(item);
    });
}

async function selectCompany(company) {
    // console.log('Selecting company:', company);
    AppState.selectedCompany = company;
    AppState.selectedBranch = null;
    AppState.selectedGroup = null;
    closeDetailsPanel();
    
    // AGGRESSIVE UI CLEANUP
    const allEmptyStates = document.querySelectorAll('.empty-state, #emptyState');
    allEmptyStates.forEach(el => {
        el.style.display = 'none';
        el.innerHTML = ''; // Wipe content too
    });
    
    if (DOM.credentialsList) {
        DOM.credentialsList.innerHTML = '<div style="padding:20px;">Loading...</div>';
        DOM.credentialsList.style.display = 'grid';
        DOM.hide(DOM.logsList);
    }
    
    if (DOM.addCredentialBtn) DOM.flex(DOM.addCredentialBtn);
        const _importBtn = document.getElementById('importCredentialsBtn');
    if (_importBtn) _importBtn.style.display = 'inline-flex';
    const _exportBtn = document.getElementById('exportCredentialsBtn');
    if (_exportBtn) _exportBtn.style.display = 'inline-flex';
    
    if (DOM.panelTitle) DOM.panelTitle.textContent = company.name;
    if (DOM.panelSubtitle) DOM.panelSubtitle.textContent = 'Kristoff Vault';
    if (DOM.breadcrumb) DOM.breadcrumb.textContent = `${company.name} / All`;

    document.querySelectorAll('.tree-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.companyId == company.id) item.classList.add('active');
    });

    await loadBranches(company.id);
    await loadCredentials(company.id);
}

async function loadBranches(companyId) {
    try {
        const result = await window.api.getBranches(companyId);
        const isAdmin = AppState.currentUser && (AppState.currentUser.is_admin || AppState.currentUser.email === 'admin@admin.com');
        
        if (result.success) {
            let branches = result.data;
            if (branches && !Array.isArray(branches)) {
                branches = branches.branches || branches.data || branches.items || [];
            }

            if (branches.length > 0) {
                renderBranches(branches);
                DOM.show(DOM.branchesSection);
            } else if (isAdmin) {
                DOM.branchesList.innerHTML = '<div style="color:#bdc3c7;font-size:12px;padding:8px;">No branches yet</div>';
                DOM.show(DOM.branchesSection);
            } else {
                DOM.hide(DOM.branchesSection);
            }
        } else {
            DOM.hide(DOM.branchesSection);
        }
    } catch (error) {
        console.error('Load branches error:', error);
        DOM.hide(DOM.branchesSection);
    }
}

function renderBranches(branches) {
    DOM.branchesList.innerHTML = '';
    const branchCountEl = document.getElementById('branchCountTotal');
    if (branchCountEl) branchCountEl.textContent = branches.length > 0 ? `(${branches.length})` : '';
    
    branches.forEach(branch => {
        const item = document.createElement('div');
        item.className = 'tree-item';
        item.dataset.branchId = branch.id;
        
        const isAdmin = AppState.currentUser && (AppState.currentUser.is_admin || AppState.currentUser.email === 'admin@admin.com');

        item.innerHTML = `<div class="tree-item-content">
                <span class="icon">[S]</span>
                <span class="name">${branch.name}</span>
            </div>
            ${isAdmin ? `<div class="tree-item-actions">
                    <button class="btn-icon-small edit-btn" data-action="edit-branch" title="Edit">&#9998;</button>
                    <button class="btn-icon-small delete-btn" data-action="delete-branch" title="Delete">&times;</button>
                </div>
            ` : ''}
        `;
        
        item.querySelector('.tree-item-content').addEventListener('click', (e) => {
            e.stopPropagation();
            selectBranch(branch);
        });
        
        if (isAdmin) {
            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openModal('branch', branch);
            });
            item.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                handleDeleteBranch(branch);
            });
        }
        DOM.branchesList.appendChild(item);
    });
}

async function handleDeleteBranch(branch) {
    if (!confirm(`Are you sure you want to delete branch "${branch.name}"?`)) return;
    
    const result = await window.api.deleteBranch(AppState.selectedCompany.id, branch.id);
    if (result.success) {
        Toast.success('Branch deleted');
        loadBranches(AppState.selectedCompany.id);
    } else {
        Toast.error(result.error || 'Failed to delete branch');
    }
}

function selectBranch(branch) {
    AppState.selectedBranch = branch;
    closeDetailsPanel();
    
    document.querySelectorAll('#branchesList .tree-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.branchId == branch.id) item.classList.add('active');
    });
    
    DOM.panelTitle.textContent = branch.name;
    DOM.panelSubtitle.textContent = `Credentials for ${branch.name}`;
    DOM.breadcrumb.textContent = `${AppState.selectedCompany?.name || 'Company'} / ${branch.name}`;
    
    filterCredentials();
}

async function loadPersonalCredentials() {
    if (!AppState.currentUser) return;
    AppState.isPersonalView = true;
    AppState.selectedBranch = null;  // Clear filters
    AppState.selectedGroup = null;
    showLoading();
    DOM.panelTitle.textContent = 'Personal Vault';
    DOM.panelSubtitle.textContent = 'Your private credentials - not visible to anyone else';
    DOM.breadcrumb.textContent = 'Personal / Vault';
    DOM.flex(DOM.addCredentialBtn); // Ensure the add button is visible
    const _importBtn = document.getElementById('importCredentialsBtn');
    if (_importBtn) _importBtn.style.display = 'inline-flex';
    const _exportBtn = document.getElementById('exportCredentialsBtn');
    if (_exportBtn) _exportBtn.style.display = 'inline-flex';
    updateUserInfoDisplay(); // Ensure admin sections are shown
    DOM.hide(DOM.logsList);

    const res = await window.api.getPersonalCredentials();
    if (res.success) {
        // Server returns { items: [...] }
        const items = Array.isArray(res.data) ? res.data : (res.data?.items || []);
        AppState.allCredentials = items; // v=149: Update global state for 2FA detection
        if (items.length === 0) {
            showEmpty();
        } else {
            window.renderCredentials(items);
        }
    } else {
        showError(res.error);
    }
}

async function loadCredentials(companyId) {
    if (!companyId) {
        console.warn('loadCredentials called without companyId');
        return;
    }
    AppState.isPersonalView = false;
    showLoading();
    
    try {
        const result = await window.api.getCredentials(companyId);
        
        if (result.success) {
            let rawCreds = result.data;
            if (rawCreds && !Array.isArray(rawCreds)) {
                rawCreds = rawCreds.items || rawCreds.data || rawCreds.credentials || rawCreds.list || [];
            }
            const items = Array.isArray(rawCreds) ? rawCreds : [];
            
            // For standard users, we also fetch personal credentials as they might contain shared items
            const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
            if (!isAdmin) {
                const personalRes = await window.api.getPersonalCredentials();
                if (personalRes.success) {
                    const personalItems = Array.isArray(personalRes.data) ? personalRes.data : (personalRes.data?.items || []);
                    // Merge and avoid duplicates by ID
                    const existingIds = new Set(items.map(i => i.id));
                    personalItems.forEach(pi => {
                        if (!existingIds.has(pi.id)) items.push(pi);
                    });
                }
            }

            AppState.allCredentials = items;
            console.log(`[Sync] Loaded ${items.length} total credentials for company ${companyId}`);
            if (items.length > 0) console.log('[Sync] Raw Sample:', items[0]);
            
            renderSidebarGroups();
            filterCredentials();
            updateUserInfoDisplay();

            // Notify user about shared credentials with expiration dates
            if (!isAdmin) {
                notifySharedExpiry(AppState.allCredentials);
            }
        } else {
            const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
            if (!isAdmin) {
                console.warn('Company credentials fetch failed for non-admin, falling back to personal vault');
                AppState.isPersonalView = true;
                loadPersonalCredentials();
            } else {
                showError(result.error);
            }
        }
    } catch (error) {
        const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
        if (!isAdmin) {
            AppState.isPersonalView = true;
            loadPersonalCredentials();
        } else {
            showError('Failed to load credentials');
            console.error('Load credentials error:', error);
        }
    }
}

/**
 * Notify user about shared credentials with expiry dates.
 * Uses localStorage so notifications persist across app restarts.
 * Clears entries only after they have actually expired.
 */
function notifySharedExpiry(credentials) {
    const userEmail = AppState.currentUser?.email;
    const storageKey = `share_expiry_${userEmail}`;

    // Load existing stored expiry info
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch(e) {}

    const now = Date.now();
    const withExpiry = credentials.filter(c => c.expires_at);

    withExpiry.forEach(cred => {
        const expMs = new Date(cred.expires_at).getTime();
        const alreadyNotified = stored[cred.id]?.notified;
        const isExpired = expMs <= now;

        // Clean up expired entries from storage
        if (isExpired) {
            delete stored[cred.id];
            return;
        }

        // Store expiry info for login-screen banner
        stored[cred.id] = {
            name: cred.name,
            expires_at: cred.expires_at,
            notified: true
        };

        // Show toast only once per session
        if (!alreadyNotified) {
            const dateStr = new Date(cred.expires_at).toLocaleString();
            Toast.info(`[!] "${cred.name}" shared with you. Expires: ${dateStr}`, 8000);
        }
    });

    localStorage.setItem(storageKey, JSON.stringify(stored));
}

function filterCredentials() {
    const searchTerm = DOM.searchInput.value.toLowerCase().trim();

    let filtered = AppState.allCredentials;

    if (AppState.selectedGroup === 'SHARED_WITH_ME') {
        DOM.panelTitle.textContent = 'Shared with Me';
        DOM.panelSubtitle.textContent = 'Credentials others have shared with you';
        filtered = AppState.allCredentials.filter(c => c.permission_level);
    } else if (AppState.selectedGroup === 'SHARED_BY_ME') {
        DOM.panelTitle.textContent = 'Shared by Me';
        DOM.panelSubtitle.textContent = 'Credentials you have shared with others';
        // This is a heuristic: items you own that have been shared. 
        // For a full list, we would need a dedicated API call.
        filtered = AppState.allCredentials.filter(c => !c.permission_level); 
    } else if (AppState.selectedGroup && AppState.selectedGroup !== 'All') {
        const sel = AppState.selectedGroup;
        filtered = filtered.filter(cred => {
            const g = cred.group_name || 'General';
            // Match exact group OR nested subgroup (e.g. "UPB" matches "UPB/MEDELLIN")
            return g === sel || g.startsWith(sel + '/');
        });
    }

    if (searchTerm) {
        filtered = filtered.filter(cred => {
            if ((cred.name || '').toLowerCase().includes(searchTerm)) return true;
            if ((cred.username || '').toLowerCase().includes(searchTerm)) return true;
            if ((cred.group_name || '').toLowerCase().includes(searchTerm)) return true;
            if ((cred.host || '').toLowerCase().includes(searchTerm)) return true;
            if ((cred.notes || '').toLowerCase().includes(searchTerm)) return true;
            if (Array.isArray(cred.services)) {
                return cred.services.some(svc =>
                    (svc.name || '').toLowerCase().includes(searchTerm) ||
                    (svc.host || '').toLowerCase().includes(searchTerm) ||
                    (svc.service_type || svc.type || '').toLowerCase().includes(searchTerm) ||
                    (svc.username || '').toLowerCase().includes(searchTerm)
                );
            }
            return false;
        });
    }

    if (AppState.selectedBranch) {
        filtered = filtered.filter(cred => cred.branch_id == AppState.selectedBranch.id);
    }

    window.renderCredentials(filtered);
    
    // Update credential count in header
    const titleEl = document.getElementById('panelTitle');
    const rotateGroupBtn = document.getElementById('rotateGroupBtn');
    
    if (titleEl) {
        const baseTitle = AppState.selectedGroup || (AppState.selectedBranch ? AppState.selectedBranch.name : (AppState.selectedCompany ? AppState.selectedCompany.name : 'Credentials'));
        titleEl.innerHTML = `${baseTitle} <span style="font-size:14px; font-weight:normal; color:#7f8c8d;">(${filtered.length} items)</span>`;
    }

    const deployKeyGroupBtn = document.getElementById('deployKeyGroupBtn');
    
    if (rotateGroupBtn) {
        // Show button only if a specific group is selected and user is admin
        const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
        const isTargetGroup = AppState.selectedGroup && !['SHARED_WITH_ME', 'SHARED_BY_ME'].includes(AppState.selectedGroup);
        
        if (isTargetGroup && isAdmin) {
            rotateGroupBtn.style.display = 'block';
            if (deployKeyGroupBtn) deployKeyGroupBtn.style.display = 'block';
        } else {
            rotateGroupBtn.style.display = 'none';
            if (deployKeyGroupBtn) deployKeyGroupBtn.style.display = 'none';
        }
    }
}

function handleDeployFromPpkModal() {
    const profile = JSON.parse(localStorage.getItem('ppk_profile') || '{}');
    if (!profile.key) {
        Toast.warning("No hay una llave configurada en el perfil PPK.");
        return;
    }
    
    // If we are currently viewing a group, use it. Otherwise use 'All'.
    const groupName = AppState.selectedGroup || 'All';
    
    // Close current modal
    document.getElementById('createModal').style.display = 'none';
    
    // Open deployment modal
    handleDeployKeyGroup();
}

async function handleDeployKey(cred) {
    // Reuse the group modal but for a single host
    const groupName = cred.group_name || 'General';
    AppState.selectedGroupForSingleDeploy = groupName; // Temporarily store for context
    
    const modal = document.getElementById('deployKeyModal');
    const groupLabel = document.getElementById('deployKeyGroupName');
    const hostsList = document.getElementById('deployKeyHosts');
    const keyInput = document.getElementById('deployKeyInput');
    const statusEl = document.getElementById('deployKeyStatus');
    const errorEl = document.getElementById('deployKeyError');

    groupLabel.textContent = `Single Host: ${cred.name}`;
    statusEl.textContent = '';
    errorEl.textContent = '';
    
    // Attempt to pre-fill with public key from PPK profile if possible
    try {
        const ppk = JSON.parse(localStorage.getItem('ppk_profile') || '{}');
        if (ppk.key && ppk.key.includes('PUBLIC')) {
            keyInput.value = ppk.key;
        } else {
            keyInput.value = '';
        }
    } catch(e) { keyInput.value = ''; }

    hostsList.innerHTML = `<div style="font-size:12px; margin-bottom:4px;">• ${cred.host}</div>`;
    
    // Store credential ID for the executor
    AppState.singleDeployCredId = cred.id;
    
    modal.style.display = 'flex';
}


function renderSidebarGroups() {
    DOM.groupsList.innerHTML = '';
    
    // Get unique group names from credentials
    const groups = new Set();
    AppState.allCredentials.forEach(c => {
        if (c.group_name) {
            const parts = c.group_name.split('/');
            let currentPath = '';
            parts.forEach((p, i) => {
                currentPath = i === 0 ? p : `${currentPath}/${p}`;
                groups.add(currentPath);
            });
        }
    });

    // v=201: Also include ALL predefined groups (from DB) so empty groups are visible as categories
    if (Array.isArray(AppState.predefinedGroups)) {
        AppState.predefinedGroups.forEach(g => {
            if (g) groups.add(g);
        });
    }

    // Add 'All' group
    const totalCreds = AppState.allCredentials.length;
    addGroupItem(`All (${totalCreds})`, 'All', !AppState.selectedGroup || AppState.selectedGroup === 'All');

    // Add specific groups
    const sortedGroups = Array.from(groups).sort();
    sortedGroups.forEach(group => {
        addGroupItem(group, group, AppState.selectedGroup === group);
    });

    // Update totals in UI
    const groupCountEl = document.getElementById('groupCountTotal');
    if (groupCountEl) groupCountEl.textContent = groups.size > 0 ? `(${groups.size})` : '';
}

function addGroupItem(fullPath, groupValue, isActive) {
    const item = document.createElement('div');
    item.className = 'tree-item' + (isActive ? ' active' : '');
    
    // Calculate indentation and short label for nested paths
    let label = fullPath;
    let indent = 0;
    if (fullPath !== 'All' && fullPath.includes('/')) {
        const parts = fullPath.split('/');
        label = parts[parts.length - 1];
        indent = (parts.length - 1) * 12; // 12px per level
    }

    const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
    const isPersonal = AppState.currentView === 'personal';
    
    let shareHtml = '';
    // v=180: Allow sharing for ALL folder as well
    if (groupValue !== null) {
        shareHtml = `<span class="icon share-group-btn" style="color:#3498db; cursor:pointer; font-size:14px; opacity:0; transition:0.2s; margin-left:5px;" title="Share Entire Group">\uD83D\uDCE4</span>`;
    }

    let deleteHtml = '';
    if (groupValue !== null && (isPersonal || isAdmin)) {
        deleteHtml = `<span class="icon delete-group-btn" style="color:#e74c3c; cursor:pointer; font-size:14px; opacity:0; transition:0.2s; margin-left:10px;" title="Delete Entire Group" onclick="handleDeleteGroup(event, '${groupValue.replace(/'/g, "\\\\'")}', ${isPersonal})">\uD83D\uDDD1\uFE0F</span>`;
    }

    item.innerHTML = `
        <div class="tree-item-content" style="padding-left: ${indent}px">
            <span class="icon">${fullPath === 'All' ? '\uD83D\uDCC2' : '\uD83D\uDCC1'}</span>
            <span class="name">${label}</span>
        </div>
        <div class="tree-item-actions">
            ${shareHtml}
            ${deleteHtml}
        </div>
    `;
    
    if (deleteHtml || shareHtml) {
        item.onmouseenter = () => { 
            const dBtn = item.querySelector('.delete-group-btn'); if(dBtn) dBtn.style.opacity = '1';
            const sBtn = item.querySelector('.share-group-btn'); if(sBtn) sBtn.style.opacity = '1';
        };
        item.onmouseleave = () => { 
            const dBtn = item.querySelector('.delete-group-btn'); if(dBtn) dBtn.style.opacity = '0';
            const sBtn = item.querySelector('.share-group-btn'); if(sBtn) sBtn.style.opacity = '0';
        };
    }

    const shareBtn = item.querySelector('.share-group-btn');
    if (shareBtn) {
        shareBtn.onclick = (e) => {
            e.stopPropagation();
            window.openShareModal(groupValue, true);
        };
    }

    item.onclick = (e) => {
        if (e.target.closest('.delete-group-btn')) return;
        AppState.selectedGroup = groupValue;
        renderSidebarGroups();
        filterCredentials();
    };
    DOM.groupsList.appendChild(item);
}

// renderCredentials moved to modules/credentials.js

function handleSearch(e) {
    closeDetailsPanel();
    filterCredentials();
}

// showDetailsPanel moved to modules/credentials.js

async function handleRotatePassword(credential) {
    if (AppState.isRotating) {
        Toast.warning("Ya hay una rotación en curso. Por favor, espera.");
        return;
    }

    if (!AppState.selectedCompany) {
        Toast.error("Selecciona una compañía primero.");
        return;
    }
    
    if (!confirm(`¿Estás seguro de que deseas ROTAR la contraseña de '${credential.name}'?`)) return;

    AppState.isRotating = true;
    Toast.info("Iniciando rotación de contraseña...", 5000);
    
    let successOccurred = false;
    try {
        const savedLength = parseInt(localStorage.getItem('kristoff_gen_length')) || 24;
        const generatedPass = typeof window.generateSecurePassword === 'function' ? window.generateSecurePassword(savedLength) : Math.random().toString(36).slice(-24);
        const payload = {
            host: credential.host,
            username: credential.username,
            password: credential.password,
            new_password: generatedPass,
            // v=172: Critical Fix - If we are root, the elevation password IS the main password
            root_pass: (credential.username === 'root') ? credential.password : (credential.root_pass || credential.password),
            ssh_user: credential.ssh_user || null,
            ssh_username: credential.ssh_user || null, // Alias for backend compatibility
            ssh_pass: credential.ssh_pass || null,
            ssh_key_pass: credential.ssh_pass || null, // Alias for encrypted keys
            ssh_key: credential.ssh_key || null
        };
        
        const res = await window.api.rotatePassword({ 
            companyId: AppState.selectedCompany.id, 
            credentialId: credential.id, 
            payload 
        });
        
        if (res.success) {
            successOccurred = true;
            
            // v=173: Robust state sync
            const newData = res.data?.credential || res.data?.data || res.data;
            if (newData && typeof newData === 'object') {
                if (newData.password) credential.password = newData.password;
                else credential.password = generatedPass; // Fallback to what we sent

                if (newData.root_pass) credential.root_pass = newData.root_pass;
            } else {
                credential.password = generatedPass;
            }
            
            // console.log('[Rotation] Success. Password updated to:', credential.password);

            Toast.success("¡Rotación completada con éxito!");
            await loadCredentials(AppState.selectedCompany.id);
            const updatedCred = AppState.credentials.find(c => c.id == credential.id) || credential;
            if (updatedCred) showDetailsPanel(updatedCred);
        } else {
            console.error('[Rotation] Failed:', res.error);
            Toast.error(`Error en la rotación: ${res.error} <br><button onclick="showLastRotationTrace()" style="margin-top:8px; padding:4px 8px; background:#e74c3c; color:white; border:none; border-radius:3px; cursor:pointer; font-size:11px;">Ver Traza Técnica</button>`, 20000);
        }
    } catch (err) {
        if (!successOccurred) {
            console.error('Rotation exception:', err);
            Toast.error("Error de conexión al intentar rotar la contraseña.");
        }
    } finally {
        AppState.isRotating = false;
    }
}

async function handleRotateServicePassword(credential, serviceIndex) {
    if (AppState.isRotating) {
        Toast.warning("Ya hay una rotación en curso. Por favor, espera.");
        return;
    }

    const services = credential.services || [];
    const svc = services[serviceIndex];
    if (!svc) {
        Toast.error("Servicio no encontrado.");
        return;
    }

    if (!confirm(`¿Estás seguro de que deseas ROTAR la contraseña del servicio '${svc.name}'?`)) return;

    AppState.isRotating = true;
    Toast.info(`Iniciando rotación de servicio v195 (Promoted Mode)...`, 12000);

    const companyId = AppState.selectedCompany?.id || credential.company_id || 1;

    try {
        const generatedPass = typeof window.generateSecurePassword === 'function' ? window.generateSecurePassword(16) : Math.random().toString(36).slice(-10);
        
        // v=195: Promoted-Service Logic
        // We inject the service target into the 'notes' field and top-level username
        const payload = {
            host: credential.host,
            username: svc.username, // Target user for passwd
            service_username: svc.username, // Alias for backend
            new_password: generatedPass,
            
            ssh_user: credential.ssh_user,
            ssh_username: credential.ssh_user, // Alias
            ssh_pass: credential.ssh_pass,
            ssh_key_pass: credential.ssh_pass, // Alias for encrypted keys
            ssh_key: credential.ssh_key,
            root_pass: (credential.username === 'root') ? credential.password : (credential.root_pass || credential.password),
            
            rotation_target: 'service',
            service_id: svc.id,
            service_index: serviceIndex,
            service_name: svc.name,
            
            notes: `ROTATE_SERVICE_ONLY:${svc.username}:${generatedPass}###${credential.notes}`
        };

        const res = await window.api.rotatePassword({ 
            companyId, 
            credentialId: credential.id, 
            payload 
        });

        if (res.success) {
            Toast.success(`¡Rotación de ${svc.name} completada!`);
            svc.password = generatedPass;
            await loadCredentials(companyId); 
            const updatedCred = AppState.allCredentials.find(c => c.id == credential.id) || credential;
            if (updatedCred) showDetailsPanel(updatedCred);
        } else {
            console.error('[Service Rotation] Failed:', res.error);
            Toast.error(`Fallo en rotación de servicio: ${res.error}`, 15000);
        }
    } catch (err) {
        console.error('v195 Rotation failed:', err);
        Toast.error("Error: " + err.message);
    } finally {
        AppState.isRotating = false;
    }
}


async function handleRotateGroupPassword() {
    if (AppState.isRotating) {
        Toast.warning("Ya hay una rotación en curso. Por favor, espera.");
        return;
    }

    const groupName = AppState.selectedGroup;
    if (!groupName) return;

    if (!confirm(`¿Estás seguro de que deseas rotar TODAS las contraseñas del grupo "${groupName}"?`)) return;

    AppState.isRotating = true;
    Toast.info(`Iniciando rotación del grupo "${groupName}"...`, 5000);

    const companyId = AppState.selectedCompany?.id || AppState.currentUser?.company_id || 1;
    
    try {
        const savedLength = parseInt(localStorage.getItem('kristoff_gen_length')) || 24;
        const result = await window.api.rotateGroup(companyId, groupName, { length: savedLength });

        if (Array.isArray(result)) {
            const successCount = result.filter(r => r.success).length;
            const failCount = result.filter(r => !r.success).length;
            
            if (failCount === 0) {
                Toast.success(`¡Éxito! Se rotaron ${successCount} credenciales.`);
            } else if (successCount > 0) {
                Toast.warning(`Rotación parcial: ${successCount} éxitos, ${failCount} fallos. Revisa los logs.`);
            } else {
                Toast.error(`Falló la rotación de las ${failCount} credenciales del grupo.`);
            }
            await loadCredentials(companyId);
        } else {
            Toast.error(`Error al rotar grupo: ${result.error || 'Desconocido'}`);
        }
    } catch (err) {
        console.error('Group rotation exception:', err);
        Toast.error("Error de conexión al intentar rotar el grupo.");
    } finally {
        AppState.isRotating = false;
    }
}

async function handleDeployProfile(profile) {
    // Called from Sidebar Rocket
    AppState.selectedProfileForDeploy = profile;
    handleDeployKeyGroup(profile);
}

async function handleDeployKeyGroup(preselectedProfile = null) {
    const modal = document.getElementById('deployKeyModal');
    const groupSelect = document.getElementById('deployKeyGroupSelect');
    const keyInput = document.getElementById('deployKeyInput');
    const hostsList = document.getElementById('deployKeyHosts');
    const groupLabel = document.getElementById('deployKeyGroupName');
    const titleEl = document.getElementById('deployKeyTitle');
    const statusEl = document.getElementById('deployKeyStatus');
    const errorEl = document.getElementById('deployKeyError');

    statusEl.textContent = '';
    errorEl.textContent = '';

    // Populate group selector
    const groups = new Set();
    AppState.allCredentials.forEach(c => { if(c.group_name) groups.add(c.group_name); });
    groupSelect.innerHTML = '<option value="All">All Groups (Global)</option>';
    Array.from(groups).sort().forEach(g => {
        groupSelect.innerHTML += `<option value="${g}" ${(AppState.selectedGroup === g || (!AppState.selectedGroup && g === 'General')) ? 'selected' : ''}>${g}</option>`;
    });

    // Pre-fill key if profile provided or fallback to first profile
    if (preselectedProfile) {
        titleEl.textContent = `🚀 Deploy: ${preselectedProfile.name}`;
        keyInput.value = preselectedProfile.key;
    } else {
        titleEl.textContent = `🚀 Deploy SSH Keys`;
        const profiles = await getPpkProfiles();
        if (profiles.length > 0) {
            keyInput.value = profiles[0].key;
        } else {
            keyInput.value = '';
        }
    }

    // Security Validation: Check if it's a private key by mistake
    keyInput.oninput = () => {
        const val = keyInput.value.trim();
        if (val.includes('BEGIN RSA PRIVATE KEY') || val.includes('BEGIN OPENSSH PRIVATE KEY')) {
            Toast.warning("⚠️ ALERTA: Pareces estar pegando una LLAVE PRIVADA. Para el despliegue se recomienda usar la LLAVE PÚBLICA (.pub).", 10000);
            keyInput.style.borderColor = "#e74c3c";
        } else {
            keyInput.style.borderColor = "";
        }
    };

    // Listener for group change to update host list
    groupSelect.onchange = () => {
        const targetGroup = groupSelect.value;
        groupLabel.textContent = targetGroup;
        const hosts = AppState.allCredentials
            .filter(c => targetGroup === 'All' || (c.group_name || 'General') === targetGroup)
            .map(c => c.host)
            .filter((v, i, a) => v && a.indexOf(v) === i);
        hostsList.innerHTML = hosts.map(h => `<div style="font-size:11px; margin-bottom:2px;">• ${h}</div>`).join('');
    };
    groupSelect.onchange();

    modal.style.display = 'flex';
    
    // Set up execution listener
    document.getElementById('btnExecuteDeploy').onclick = executeDeployKeyGroup;
}

async function executeDeployKeyGroup() {
    const groupName = document.getElementById('deployKeyGroupSelect').value;
    const publicKey = document.getElementById('deployKeyInput').value.trim();
    const mode = document.getElementById('deployKeyMode').value;
    const targetUser = document.getElementById('deployKeyUser').value.trim();
    const targetPass = document.getElementById('deployKeyPass').value.trim();
    const statusEl = document.getElementById('deployKeyStatus');
    const errorEl = document.getElementById('deployKeyError');
    const btn = document.getElementById('btnExecuteDeploy');

    if (!publicKey) {
        errorEl.textContent = 'Please provide a public key';
        return;
    }

    if (AppState.isRotating) {
        Toast.warning("Ya hay una operación en curso.");
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Deploying...';
    statusEl.textContent = 'Initializing deployment...';
    errorEl.textContent = '';
    AppState.isRotating = true;

    const companyId = AppState.selectedCompany?.id || AppState.currentUser?.company_id || 1;

    try {
        // Pass mode and user creation data to the API
        const result = await window.api.deployGroupKeys(companyId, groupName, publicKey, mode, targetUser, targetPass);
        
        if (result.success) {
            const data = result.data;
            if (Array.isArray(data)) {
                const successCount = data.filter(r => r.success).length;
                const failCount = data.filter(r => !r.success).length;
                
                if (failCount === 0) {
                    Toast.success(`Successfully deployed keys to ${successCount} hosts.`);
                    document.getElementById('deployKeyModal').style.display = 'none';
                } else {
                    statusEl.textContent = `Completed with issues: ${successCount} success, ${failCount} failures.`;
                    errorEl.innerHTML = 'Some hosts failed. Check Activity Logs for details.';
                }
            } else {
                Toast.success("Key deployment command sent to group.");
                document.getElementById('deployKeyModal').style.display = 'none';
            }
        } else {
            errorEl.textContent = result.error || 'Deployment failed';
        }
    } catch (err) {
        console.error('Key deployment error:', err);
        errorEl.textContent = 'Network error during deployment';
    } finally {
        AppState.isRotating = false;
        btn.disabled = false;
        btn.textContent = 'Start Deployment';
    }
}

window.logout = async function() {
    await handleLogout();
};

async function handleLogout() {
    window.api.logout();
    AppState.reset();
    AppState.is2FAVerified = false;
    
    // UI Cleanup
    if (DOM.appContainer) DOM.appContainer.style.filter = 'none';
    const twoFactorModal = document.getElementById('twoFactorModal');
    if (twoFactorModal) twoFactorModal.style.display = 'none';
    
    showLogin();
    Toast.info('Logged out successfully');
}

window.show2FAReset = function() {
    const verifyView = document.getElementById('twoFactorVerifyView');
    const resetView = document.getElementById('twoFactorResetView');
    if (verifyView) verifyView.style.display = 'none';
    if (resetView) resetView.style.display = 'block';
};

window.show2FAVerify = function() {
    const verifyView = document.getElementById('twoFactorVerifyView');
    const resetView = document.getElementById('twoFactorResetView');
    const setupView = document.getElementById('twoFactorSetupView');
    if (verifyView) verifyView.style.display = 'block';
    if (resetView) resetView.style.display = 'none';
    if (setupView) setupView.style.display = 'none';
};

window.confirm2FAReset = async function(e) {
    if (e) e.preventDefault();
    const passwordInput = document.getElementById('field_2fa_reset_password');
    const password = passwordInput ? passwordInput.value : '';
    const errorEl = document.getElementById('twoFactorResetError');
    const btn = (e && e.target) || document.querySelector('#twoFactorResetView .btn-primary');

    if (!password) {
        if (errorEl) errorEl.textContent = 'Por favor ingresa tu contraseña.';
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Verificando...';
    }

    try {
        const email = AppState.currentUser?.email;
        if (!email) throw new Error('No session detected.');

        // 1. Verify identity
        const loginRes = await window.api.login(email, password);
        if (!loginRes.success) throw new Error('Contraseña incorrecta.');

        // 2. Delete 2FA credential
        const res = await window.api.getPersonalCredentials();
        const personalCreds = res.success ? (Array.isArray(res.data) ? res.data : (res.data?.items || [])) : [];
        const sys2FA = personalCreds.find(c => c.name === '_SYSTEM_2FA_');

        if (sys2FA) {
            const companyId = AppState.currentUser?.company_id || 1;
            await window.api.deleteCredential(companyId, sys2FA.id, true);
        }

        // 3. Success
        AppState.is2FAVerified = true;
        const modal = document.getElementById('twoFactorModal');
        if (modal) modal.style.display = 'none';
        
        // Final unlock
        if (DOM.appContainer) {
            DOM.appContainer.style.display = 'flex';
            DOM.appContainer.style.filter = 'none';
        }
        
        Toast.success('2FA reseteado con éxito. Por favor configúralo de nuevo.');
        
        // Re-load app state
        await loadCompanies();
        await loadPersonalCredentials();
    } catch (err) {
        if (errorEl) errorEl.textContent = err.message;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Reset 2FA Now';
        }
    }
};

async function check2FAAndEnforce(isAdmin) {
    if (isAdmin && !AppState.is2FAVerified) {
        console.log('2FA: Checking enforcement for admin...');
        const res = await window.api.getPersonalCredentials();
        const personalCreds = res.success ? (Array.isArray(res.data) ? res.data : (res.data?.items || [])) : [];

        // Sort by ID descending to get the LATEST setup if multiples exist
        const sys2FA = personalCreds
            .filter(c => c.name === '_SYSTEM_2FA_')
            .sort((a, b) => (b.id || 0) - (a.id || 0))[0];

        if (sys2FA) {
            console.log('2FA: System secret found. ID:', sys2FA.id);
            const modal = document.getElementById('twoFactorModal');
            const verifyView = document.getElementById('twoFactorVerifyView');
            const setupView = document.getElementById('twoFactorSetupView');
            const resetView = document.getElementById('twoFactorResetView');
            
            if (modal && verifyView) {
                modal.style.display = 'flex';
                verifyView.style.display = 'block';
                if (setupView) setupView.style.display = 'none';
                if (resetView) resetView.style.display = 'none';
                
                // CRITICAL: Hide background to prevent seeing app content
                if (DOM.appContainer) {
                    DOM.appContainer.style.display = 'none';
                    DOM.appContainer.style.filter = 'blur(10px)';
                }
                
                const pinInput = document.getElementById('field_2fa_pin');
                if (pinInput) { pinInput.value = ''; pinInput.focus(); }
            }
        } else {
            console.log('2FA: No system secret found. Skipping 2FA.');
            AppState.is2FAVerified = true;
            if (DOM.appContainer) {
                DOM.appContainer.style.display = 'flex';
                DOM.appContainer.style.filter = 'none';
            }
        }
    } else {
        AppState.is2FAVerified = true;
        if (DOM.appContainer) {
            DOM.appContainer.style.display = 'flex';
            DOM.appContainer.style.filter = 'none';
        }
    }
    
    // Admin Bulk Section visibility
    const adminSection = document.getElementById('adminBulkSection');
    if (adminSection) {
        adminSection.style.display = isAdmin ? 'block' : 'none';
    }
}

window.verify2FA = async function(e) {
    const pinInput = document.getElementById('field_2fa_pin');
    const pin = pinInput ? pinInput.value.trim() : '';
    const errorEl = document.getElementById('twoFactorError');
    
    // Use the event target if available, otherwise find the button
    const btn = (e && e.target) || document.querySelector('#twoFactorVerifyView .btn-primary');
    
    if (!pin || pin.length < 6) {
        if (errorEl) errorEl.textContent = 'Please enter a 6-digit code.';
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Verifying...';
    }

    try {
        console.log('2FA: Starting verification for PIN:', pin.substring(0, 2) + '****');
        // Always fetch personal credentials to find the secret, ensuring it's not bypassed
        const res = await window.api.getPersonalCredentials();
        const personalCreds = res.success ? (Array.isArray(res.data) ? res.data : (res.data?.items || [])) : [];
        
        // Use the latest one
        const sys2FA = personalCreds
            .filter(c => c.name === '_SYSTEM_2FA_')
            .sort((a, b) => (b.id || 0) - (a.id || 0))[0];

        if (!sys2FA) {
            console.warn('2FA: _SYSTEM_2FA_ credential disappeared during verification.');
            AppState.is2FAVerified = true;
            const modal = document.getElementById('twoFactorModal');
            if (modal) modal.style.display = 'none';
            if (DOM.appContainer) {
                DOM.appContainer.style.display = 'flex';
                DOM.appContainer.style.filter = 'none';
            }
            return;
        }

        let secret = null;
        if (sys2FA.notes) {
            const secretMatch = sys2FA.notes.match(/###SECRET###(.*?)###SECRET###/s);
            if (secretMatch) {
                secret = secretMatch[1].trim();
                console.log('2FA: Secret extracted via Regex. Length:', secret.length);
            } else {
                // Robust fallback: try to find any 16 or 32 char base32-like string
                const fallbackMatch = sys2FA.notes.match(/[A-Z2-7]{16,32}/i);
                if (fallbackMatch) {
                    secret = fallbackMatch[0].trim();
                    console.log('2FA: Secret extracted via Fallback Regex.');
                } else {
                    secret = sys2FA.notes.trim().split('\n')[0]; 
                    console.log('2FA: Secret extracted via First Line Fallback.');
                }
            }
        }

        if (secret) {
            // Clean the secret from any accidental extra characters
            secret = secret.replace(/[^A-Z2-7]/gi, '').toUpperCase();
            
            console.log('2FA: Final secret (first 4):', secret.substring(0, 4) + '...');
            console.log('2FA: Client Time (ms):', Date.now());

            if (window.api.verifyTOTP(secret, pin)) {
                console.log('2FA: Verification MATCH!');
                AppState.is2FAVerified = true;
                const modal = document.getElementById('twoFactorModal');
                if (modal) modal.style.display = 'none';
                if (DOM.appContainer) {
                    DOM.appContainer.style.display = 'flex';
                    DOM.appContainer.style.filter = 'none';
                }
                Toast.success('Security Verification Successful');
            } else {
                console.error('2FA: Verification FAILED. Check time sync.');
                if (errorEl) {
                    errorEl.textContent = 'Invalid PIN code. Please check your app and system time.';
                }
                if (pinInput) pinInput.value = '';
                setTimeout(() => { if (errorEl) errorEl.textContent = ''; }, 3000);
            }
        } else {
            console.error('2FA: No secret could be extracted from notes.');
            if (errorEl) errorEl.textContent = 'Configuration Error: Secret not found.';
        }
    } catch (err) {
        console.error('2FA: Verification Error:', err);
        if (errorEl) errorEl.textContent = 'Verification Error: ' + err.message;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Verify';
        }
    }
};

window.open2FASetup = function() {
    const email = AppState.currentUser?.email || 'admin@kristoff';
    const secret = window.api.generateTOTPSecret();
    AppState.tempSecret = secret;

    const modal = document.getElementById('twoFactorModal');
    const verifyView = document.getElementById('twoFactorVerifyView');
    const setupView = document.getElementById('twoFactorSetupView');
    const qrImg = document.getElementById('twoFactorQrImg');
    const qrLoading = document.getElementById('twoFactorQrLoading');
    const secretText = document.getElementById('twoFactorSecretText');

    if (modal && verifyView && setupView) {
        modal.style.display = 'flex';
        verifyView.style.display = 'none';
        setupView.style.display = 'block';
        
        if (secretText) secretText.textContent = secret;
        
        // Generate QR Code URL with multiple fallbacks
        const label = `Kristoff:${email}`;
        const issuer = 'Kristoff';
        const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
        const encodedData = encodeURIComponent(otpauth);
        
        // Primary: QRServer (more reliable in some regions)
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodedData}`;
        // Fallback: Google Charts
        const fallbackUrl = `https://chart.googleapis.com/chart?chs=180x180&cht=qr&chl=${encodedData}&choe=UTF-8`;
        
        if (qrImg && qrLoading) {
            qrImg.style.display = 'none';
            qrLoading.style.display = 'block';
            
            qrImg.onerror = () => {
                console.warn('Primary QR failed, trying fallback...');
                if (qrImg.src !== fallbackUrl) {
                    qrImg.src = fallbackUrl;
                } else {
                    qrLoading.innerHTML = '<p style="color:#e74c3c">QR unavailable.</p><p>Use manual secret.</p>';
                }
            };
            
            qrImg.onload = () => {
                qrImg.style.display = 'block';
                qrLoading.style.display = 'none';
            };
            
            qrImg.src = qrUrl;
        }
    }
};

window.hide2FAModal = function() {
    const modal = document.getElementById('twoFactorModal');
    if (modal) modal.style.display = 'none';
    if (DOM.appContainer) DOM.appContainer.style.filter = 'none';
};

window.confirm2FASetup = async function() {
    const code = document.getElementById('field_2fa_setup_code').value.trim();
    const errorEl = document.getElementById('twoFactorSetupError');
    const secret = AppState.tempSecret;

    if (!window.api.verifyTOTP(secret, code)) {
        if (errorEl) errorEl.textContent = 'Invalid code. Check your app and try again.';
        return;
    }

    try {
        if (errorEl) errorEl.textContent = 'Saving configuration...';
        
        // Ensure we have a company ID
        const companyId = AppState.currentUser?.company_id || (AppState.allCompanies && AppState.allCompanies[0]?.id) || 1;

        // Fetch fresh list to be absolutely sure about existing ones
        const res = await window.api.getPersonalCredentials();
        const personalCreds = res.success ? (Array.isArray(res.data) ? res.data : (res.data?.items || [])) : [];
        
        // Find ALL _SYSTEM_2FA_ entries
        const existingEntries = personalCreds.filter(c => c.name === '_SYSTEM_2FA_');
        
        // Delete all existing ones to avoid duplicates
        for (const entry of existingEntries) {
            console.log('2FA Setup: Cleaning up old entry ID:', entry.id);
            await window.api.deleteCredential(companyId, entry.id, true);
        }

        const notes = `###SECRET###${secret}###SECRET###\nDo not delete this credential. It is used for 2FA verification.`;

        let result;
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Server timeout saving 2FA')), 15000));

        console.log('2FA Setup: Creating new fresh secret...');
        result = await Promise.race([
            window.api.createCredential(companyId, '_SYSTEM_2FA_', 'System', 'System', '127.0.0.1', 'System', notes, [], true),
            timeoutPromise
        ]);

        if (result && result.success) {
            // console.log('2FA Setup: SUCCESS!');
            Toast.success('2FA configured successfully!');
            AppState.is2FAVerified = true;
            
            // Reload credentials to update AppState and hide cards
            await loadPersonalCredentials();
            
            hide2FAModal();
            hideModal(); // Close profile modal too
        } else {
            const errorMsg = result ? (result.error || 'Unknown server error') : 'No response from server';
            throw new Error(errorMsg);
        }
    } catch (err) {
        console.error('2FA Setup failed:', err);
        if (errorEl) errorEl.textContent = 'Error: ' + err.message;
        Toast.error('2FA Setup failed: ' + err.message);
    }
};

function showLoading() {
    DOM.show(DOM.loadingState);
    DOM.hide(DOM.errorState);
    DOM.hide(DOM.emptyState);
    DOM.hide(DOM.credentialsList);
}

function showError(msg) {
    DOM.hide(DOM.loadingState);
    DOM.show(DOM.errorState);
    DOM.hide(DOM.emptyState);
    DOM.hide(DOM.credentialsList);
    DOM.errorMessage.textContent = msg || 'An unknown error occurred';
}

function showEmpty() {
    DOM.hide(DOM.loadingState);
    DOM.hide(DOM.errorState);
    DOM.show(DOM.emptyState);
    DOM.hide(DOM.credentialsList);
}

function hideStates() {
    DOM.hide(DOM.loadingState);
    DOM.hide(DOM.errorState);
    DOM.hide(DOM.emptyState);
}

function toggleCardExpand(card) {
    const expanded = card.dataset.expanded === 'true';
    const expandedSection = card.querySelector('.card-expanded');
    const expandIcon = card.querySelector('.card-expand-icon');
    
    if (expanded) {
        expandedSection.style.display = 'none';
        expandIcon.innerHTML = '&#9654;';
        card.dataset.expanded = 'false';
    } else {
        expandedSection.style.display = 'block';
        expandIcon.innerHTML = '&#9660;';
        card.dataset.expanded = 'true';
    }
}

// Admin Functions
async function loadPendingApprovals() {
    try {
        // console.log('Admin detected, loading user management...');
        const [usersRes, branchesRes] = await Promise.all([
            window.api.getAllUsers(),
            window.api.getAllBranches()
        ]);
        
        // console.log('Admin data loaded:', { users: usersRes.data?.length, branches: branchesRes.data?.length });
        
        if (branchesRes.success) AppState.allBranches = branchesRes.data;
        if (usersRes.success) {
            let allUsers = usersRes.data;
            // Robust extraction if nested
            if (allUsers && !Array.isArray(allUsers)) {
                allUsers = allUsers.items || allUsers.users || allUsers.data || [];
            }
            
            const active = allUsers.filter(u => u.status === 'active');
            const pending = allUsers.filter(u => u.status === 'pending');
            
            renderActiveUsers(active);
            renderPendingApprovals(pending);
            
            // Update the badge count
            if (DOM.pendingCount) {
                DOM.pendingCount.textContent = pending.length;
                DOM.pendingCount.style.display = pending.length > 0 ? 'inline-block' : 'none';
            }
        }
    } catch (error) {
        console.error('Load admin users error:', error);
    }
}

function renderActiveUsers(users) {
    DOM.activeUsersList.innerHTML = '';
    if (users.length === 0) {
        DOM.activeUsersList.innerHTML = '<div style="color:#bdc3c7;font-size:12px;padding:8px;">No active users</div>';
        return;
    }
    
    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'pending-item';
        item.innerHTML = `<div class="pending-email" title="${user.email}">${user.email}</div>
            <div class="pending-actions">
                <button class="btn-icon-small" title="Reset Password" data-action="reset-pass" style="color: #f39c12;">&#128273;</button>
                <button class="btn-icon-small" title="Edit User" data-action="edit-user">&#9998;</button>
                <button class="btn-icon-small" title="Delete User" data-action="delete-user" style="color: #e74c3c;">&times;</button>
            </div>
        `;
        
        item.querySelector('[data-action="reset-pass"]').addEventListener('click', () => openModal('reset-password', user));
        item.querySelector('[data-action="edit-user"]').addEventListener('click', () => openModal('admin-user', user));
        item.querySelector('[data-action="delete-user"]').addEventListener('click', () => handleDeleteUser(user));
        DOM.activeUsersList.appendChild(item);
    });
}

async function handleDeleteUser(user) {
    if (user.email === AppState.currentUser.email) {
        Toast.error('You cannot delete yourself');
        return;
    }
    if (!confirm(`Are you sure you want to delete user ${user.email}?`)) return;
    
    const result = await window.api.deleteUser(user.id);
    if (result.success) {
        Toast.success(`User ${user.email} deleted`);
        loadPendingApprovals();
    } else {
        Toast.error(result.error || 'Failed to delete user');
    }
}

function renderPendingApprovals(users) {
    DOM.pendingList.innerHTML = '';
    if (users.length === 0) {
        DOM.pendingList.innerHTML = '<div style="color:#bdc3c7;font-size:12px;padding:8px;">No pending users</div>';
        return;
    }
    
    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'pending-item';
        item.innerHTML = `<div class="pending-email" title="${user.email}">${user.email}</div>
            <div class="pending-actions">
                <button class="btn-approve" title="Approve"></button>
                <button class="btn-reject" title="Reject">&times;</button>
            </div>
        `;
        
        item.querySelector('.btn-approve').addEventListener('click', () => handleApproveUser(user));
        item.querySelector('.btn-reject').addEventListener('click', () => handleRejectUser(user));
        DOM.pendingList.appendChild(item);
    });
}

async function handleApproveUser(user) {
    if (!confirm(`Approve user ${user.email}?`)) return;
    const result = await window.api.approveUser(user.id);
    if (result.success) {
        Toast.success(`User ${user.email} approved`);
        loadPendingApprovals();
    } else {
        Toast.error(result.error || 'Failed to approve user');
    }
}

async function handleRejectUser(user) {
    if (!confirm(`Reject user ${user.email}?`)) return;
    const result = await window.api.rejectUser(user.id);
    if (result.success) {
        Toast.info(`User ${user.email} rejected`);
        loadPendingApprovals();
    } else {
        Toast.error(result.error || 'Failed to reject user');
    }
}


// ===== KeePass Import =====
function openImportModal() {
    let modal = document.getElementById('importModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'importModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-box" style="width:560px">
                <div class="modal-header">
                    <h3>Import Credentials</h3>
                    <button class="btn-close" onclick="document.getElementById('importModal').style.display='none'">&times;</button>
                </div>
                <div style="margin-bottom:14px;padding:10px 14px;background:#f0f7ff;border-radius:6px;font-size:13px;border-left:3px solid #3498db">
                    <strong>Supported formats:</strong><br>
                    <b>KeePass XML</b> (File > Export > KeePass XML 2.x)<br>
                    <b>KeePass CSV</b> (Account, Login Name, Password, Web Site, Comments)<br>
                    <b>Generic CSV</b> with headers: name, username, password, host, group, notes
                </div>
                <div class="form-group" style="margin-bottom:15px;">
                    <label>Target Vault *</label>
                    <div style="display:flex;gap:15px;margin-top:5px;background:#f8f9fa;padding:10px;border-radius:6px;">
                        <label style="display:flex;align-items:center;cursor:pointer;"><input type="radio" name="importTarget" value="company" checked onchange="document.getElementById('importCompanySelect').disabled=false" style="margin-right:6px;width:auto;"> Company Vault</label>
                        <label style="display:flex;align-items:center;cursor:pointer;"><input type="radio" name="importTarget" value="personal" onchange="document.getElementById('importCompanySelect').disabled=true" style="margin-right:6px;width:auto;"> Personal Vault</label>
                    </div>
                </div>
                <div class="form-group">
                    <label>Company (If Company Vault is selected)</label>
                    <select id="importCompanySelect">
                        <option value="">Select company...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Select file (XML or CSV)</label>
                    <input type="file" id="importFileInput" accept=".xml,.csv,.kdbx.xml" style="padding:6px;border:2px solid #e0e0e0;border-radius:6px;width:100%;box-sizing:border-box">
                </div>
                <div class="form-group">
                    <label>Default Group (Optional)</label>
                    <input type="text" id="importDefaultGroup" placeholder="e.g. Imported / KeePass" style="padding:10px;border:1px solid #ddd;border-radius:4px;width:100%;box-sizing:border-box">
                    <small style="color:#7f8c8d; font-size:11px;">If the file doesn't have folder information, they will be placed here.</small>
                </div>
                <div id="importPreview" style="display:none;margin:10px 0;padding:10px;background:#f8f9fa;border-radius:6px;font-size:12px;max-height:180px;overflow-y:auto"></div>
                <div id="importError" style="color:#e74c3c;font-size:13px;margin-bottom:8px"></div>
                <div class="modal-actions">
                    <button type="button" class="btn-secondary" onclick="document.getElementById('importModal').style.display='none'">Cancel</button>
                    <button type="button" id="btnDoImport" class="btn-primary" onclick="executeImport()" disabled>Import</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Populate company dropdown
        const sel = document.getElementById('importCompanySelect');
        (AppState.allCompanies || []).forEach(c => {
            const o = document.createElement('option');
            o.value = c.id;
            o.textContent = c.name;
            sel.appendChild(o);
        });
        // Pre-select current company
        if (AppState.selectedCompany) sel.value = AppState.selectedCompany.id;

        document.getElementById('importFileInput').addEventListener('change', handleImportFileChange);
    }
    modal.style.display = 'flex';
    document.getElementById('importError').textContent = '';
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('btnDoImport').disabled = true;
}

let _importParsedCredentials = [];

function handleImportFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const text = ev.target.result;
        try {
            let creds = [];
            if (file.name.endsWith('.xml')) {
                creds = parseKeePassXML(text);
            } else {
                creds = parseCredentialCSV(text);
            }
            _importParsedCredentials = creds;
            showImportPreview(creds);
        } catch(err) {
            document.getElementById('importError').textContent = 'Error parsing file: ' + err.message;
        }
    };
    reader.readAsText(file, 'UTF-8');
}

function parseKeePassXML(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const entries = doc.querySelectorAll('Entry');
    const creds = [];
    entries.forEach(entry => {
        const fields = {};
        entry.querySelectorAll('String').forEach(str => {
            const key = str.querySelector('Key')?.textContent || '';
            const val = str.querySelector('Value')?.textContent || '';
            fields[key] = val;
        });
        if (!fields['Title'] && !fields['Password']) return;
        
        // Get full group hierarchy path
        const pathParts = [];
        let curr = entry.parentElement;
        while (curr) {
            // Check for Group element (handle potential namespace prefixes)
            if (curr.nodeName.toLowerCase().endsWith('group')) {
                let gName = '';
                // Look for Name element among children
                for (let j=0; j<curr.childNodes.length; j++) {
                    const node = curr.childNodes[j];
                    if (node.nodeName.toLowerCase().endsWith('name')) {
                        gName = (node.textContent || '').trim();
                        break;
                    }
                }
                
                if (gName && gName.toLowerCase() !== 'root' && gName.toLowerCase() !== 'database') {
                    pathParts.unshift(gName);
                }
            }
            curr = curr.parentElement;
        }
        const groupName = pathParts.join('/');
        
        creds.push({
            name: fields['Title'] || 'Untitled',
            username: fields['UserName'] || 'N/A',
            password: fields['Password'] || 'N/A',
            host:     fields['URL'] || '',
            notes:    fields['Notes'] || '',
            group_name: groupName,
        });
    });
    return creds;
}

function parseCredentialCSV(csvText) {
    const lines = csvText.split(/\\r?\\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV file is empty or has no data rows');
    
    // Detect delimiter: Spanish Excel often uses ; instead of ,
    const headerRow = lines[0];
    const commaCount = (headerRow.match(/,/g) || []).length;
    const semiCount = (headerRow.match(/;/g) || []).length;
    const delim = semiCount > commaCount ? ';' : ',';
    
    // Better header split handling quotes and detected delimiter
    const delimRegex = new RegExp(`(".*?"|[^${delim}]+)(?=${delim}|$)`, 'g');
    const headers = (headerRow.match(delimRegex) || headerRow.split(delim))
        .map(h => h.trim().toLowerCase().replace(/['"]/g,''));
    
    // Map header names to expected fields
    const colMap = {
        name:     ['name','title','account','credential','nombre','titulo'],
        username: ['username','login name','login','user','email','usuario'],
        password: ['password','pass','contrasea','clave'],
        host:     ['host','url','website','web site','address','ip','sitio','direccion'],
        group:    ['group','folder','category','path','group path','grupo','carpeta'],
        notes:    ['notes','comment','comments','description','notas','comentarios'],
    };

    function findCol(headers, variants) {
        // 1. Try exact match first (highest priority)
        for (const v of variants) {
            const i = headers.indexOf(v);
            if (i >= 0) return i;
        }
        // 2. Try partial match
        for (const v of variants) {
            const i = headers.findIndex(h => {
                if (h === v) return true;
                if (h.length < 3) return h === v;
                const words = h.split(/[^a-z]/);
                return words.includes(v);
            });
            if (i >= 0) return i;
        }
        return -1;
    }

    const cols = {};
    for (const [field, variants] of Object.entries(colMap)) {
        cols[field] = findCol(headers, variants);
    }

    if (cols.name < 0 && cols.username < 0) throw new Error('Cannot find Name or Username column in CSV');

    const creds = [];
    const seen = new Set();
    const parseCSVLine = (text) => {
        const p = [];
        let cur = '', inQ = false;
        for (let i=0; i<text.length; i++) {
            const c = text[i], next = text[i+1];
            if (c === '"') {
                if (inQ && next === '"') { cur += '"'; i++; }
                else inQ = !inQ;
            } else if (c === delim && !inQ) { p.push(cur); cur = ''; }
            else cur += c;
        }
        p.push(cur);
        return p;
    };

    for (let i = 1; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]);
        const get = (col) => col >= 0 ? (parts[col] || '').trim() : '';
        const name = get(cols.name) || get(cols.username);
        if (!name) continue;
        
        const username = get(cols.username);
        const group = get(cols.group);
        const key = `${name}|${username}|${group}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        creds.push({
            name,
            username,
            password: get(cols.password),
            host:     get(cols.host),
            notes:    get(cols.notes),
            group_name: group,
        });
    }
    return creds;
}

function showImportPreview(creds) {
    const preview = document.getElementById('importPreview');
    const errEl = document.getElementById('importError');
    const btn = document.getElementById('btnDoImport');

    if (creds.length === 0) {
        errEl.textContent = 'No valid credentials found in file.';
        preview.style.display = 'none';
        btn.disabled = true;
        return;
    }

    errEl.textContent = '';
    btn.disabled = false;
    preview.style.display = 'block';
    preview.innerHTML = `<strong>${creds.length} credential(s) ready to import:</strong><br><br>` +
        creds.slice(0, 20).map((c, i) =>
            `<div style="padding:4px 0;border-bottom:1px solid #eee">
                <b>${i+1}. ${c.name}</b>
                ${c.host ? ` | host: ${c.host}` : ''}
                ${c.group_name ? ` <span style="color:#3498db">[${c.group_name}]</span>` : ''}
                ${c.username ? ` | user: ${c.username}` : ''}
            </div>`
        ).join('') +
        (creds.length > 20 ? `<div style="color:#7f8c8d;margin-top:6px">...and ${creds.length-20} more</div>` : '');
}

async function executeImport() {
    const targetVault = document.querySelector('input[name="importTarget"]:checked').value;
    let companyId = 1;
    let isPersonal = false;

    if (targetVault === 'company') {
        companyId = document.getElementById('importCompanySelect')?.value;
        if (!companyId) { document.getElementById('importError').textContent = 'Please select a company'; return; }
    } else {
        isPersonal = true;
        companyId = AppState.currentUser?.company_id || 1;
    }

    if (!_importParsedCredentials.length) return;

    const btn = document.getElementById('btnDoImport');
    const errEl = document.getElementById('importError');
    btn.disabled = true;
    btn.textContent = 'Importing...';
    errEl.textContent = '';

    let ok = 0, failed = 0, lastError = '';
    const total = _importParsedCredentials.length;
    const defaultGroup = (document.getElementById('importDefaultGroup')?.value || '').trim();
    
    for (let i = 0; i < total; i++) {
        const cred = _importParsedCredentials[i];
        btn.textContent = `Importing (${i+1}/${total})...`;
        try {
            const res = await window.api.createCredential(
                companyId,
                cred.name,
                cred.username || 'N/A',
                cred.password || 'N/A',
                cred.host || 'N/A',
                cred.group_name || defaultGroup,
                cred.notes,
                [],
                isPersonal
            );
            if (res.success) {
                ok++;
            } else {
                failed++;
                lastError = typeof res.error === 'object' ? JSON.stringify(res.error) : res.error;
            }
            await new Promise(r => setTimeout(r, 20));
        } catch(e) { 
            failed++; 
            lastError = e.message;
        }
    }

    btn.textContent = 'Import';
    btn.disabled = false;
    if (failed === 0) {
        Toast.success(`Imported ${ok} credential(s) successfully`);
        document.getElementById('importModal').style.display = 'none';
        if (isPersonal) loadPersonalCredentials(); else loadCredentials(companyId);
    } else {
        errEl.innerHTML = `Imported ${ok}, failed ${failed}.<br><small>Last error: ${lastError}</small>`;
    }
}

function downloadCredentialsCSV() {
    const creds = AppState.allCredentials;
    if (!creds || creds.length === 0) {
        Toast.error('No credentials to export');
        return;
    }

    const headers = ['Name', 'Username', 'Password', 'Host', 'Group', 'Notes'];
    const rows = creds.map(c => [
        c.name || '',
        c.username || '',
        c.password || '',
        c.host || '',
        c.group_name || '',
        c.notes || ''
    ].map(v => `"${(v + '').replace(/"/g, '""')}"`).join(','));

    const csvContent = [headers.join(','), ...rows].join('\\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = `credentials_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Start the app
// init(); (Now called from index.html)

let _logsAutoRefreshTimer = null;

async function loadLogs() {
    if (_logsAutoRefreshTimer) { clearInterval(_logsAutoRefreshTimer); _logsAutoRefreshTimer = null; }

    AppState.isPersonalView = false;
    AppState.selectedCompany = null;
    AppState.selectedBranch = null;
    AppState.selectedGroup = null;

    showLoading();
    DOM.panelTitle.textContent = 'Activity Logs';
    DOM.panelSubtitle.textContent = AppState.currentUser?.is_admin ? 'System-wide activity' : 'Your recent activity';
    DOM.breadcrumb.textContent = 'Activity / Logs';
    DOM.hide(DOM.addCredentialBtn);
    const _hidImpBtn = document.getElementById('importCredentialsBtn'); if (_hidImpBtn) _hidImpBtn.style.display = 'none';
    const _hidExpBtn = document.getElementById('exportCredentialsBtn'); if (_hidExpBtn) _hidExpBtn.style.display = 'none';

    async function _fetchAndRender() {
        try {
            const res = await window.api.getLogs();
            if (res.success) {
                renderLogs(res.data.items || []);
            } else {
                showError(res.error);
            }
        } catch (err) {
            showError('Failed to load logs');
        }
    }

    await _fetchAndRender();

    _logsAutoRefreshTimer = setInterval(async () => {
        if (DOM.logsList.style.display === 'none') {
            clearInterval(_logsAutoRefreshTimer);
            _logsAutoRefreshTimer = null;
            return;
        }
        await _fetchAndRender();
    }, 30000);
}


const EVENT_LABELS = {
    'login':             '[LOGIN]      Sign In',
    'logout':            '[LOGOUT]     Sign Out',
    'failed_login':      '[FAILED]     Failed Login',
    'access':            '[ACCESS]     Access',
    'create_user':       '[USER+]      User Created',
    'update_user':       '[USER~]      User Updated',
    'delete_user':       '[USER-]      User Deleted',
    'create_credential': '[CRED]       Credential / Share',
    'delete_credential': '[REVOKED]    Deleted / Expired',
    'credential_use':    '[USED]       Credential Used',
    'rotation':          '[ROTATION]   Password Updated',
    'rotation_failed':   '[ROTATION!]  Rotation Failed',
    'deploy':            '[DEPLOY]     SSH Key Deployed',
    'deploy_failed':     '[DEPLOY!]    Deployment Failed',
};

window.showLastRotationTrace = function() {
    const logs = window.api.getInternalLogs();
    const lastError = logs.find(l => l.type === 'ERROR' && l.url && l.url.includes('/rotate'));
    if (!lastError) {
        alert("No se encontró traza de error de rotación reciente.");
        return;
    }
    const trace = JSON.stringify(lastError, null, 2);
    const traceWindow = window.open("", "RotationTrace", "width=800,height=600");
    if (traceWindow) {
        traceWindow.document.write(`
            <html>
            <head><title>Rotation Trace Details</title></head>
            <body style="background:#1e272e; color:#0be881; padding:20px; font-family:monospace; margin:0;">
                <h3 style="color:#fff; border-bottom:1px solid #34495e; padding-bottom:10px;">Technical Diagnostic Trace</h3>
                <pre style="white-space:pre-wrap; word-break:break-all;">${trace.replace(/</g, '&lt;')}</pre>
            </body>
            </html>
        `);
    } else {
        // console.log('Technical Trace:', lastError);
        alert("No se pudo abrir la ventana de traza. Revisa la consola (F12).");
    }
};


function renderLogs(logs) {
    DOM.hide(DOM.credentialsList);
    DOM.show(DOM.logsList);
    DOM.logsList.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.className = 'logs-toolbar';
    toolbar.innerHTML = `<span class="logs-count">${logs.length} record${logs.length !== 1 ? 's' : ''}</span>
        <button id="btnDownloadLogs" class="btn-download-logs" title="Download logs as CSV">
            \uD83D\uDCE5  Download CSV
        </button>
    `;
    DOM.logsList.appendChild(toolbar);

    document.getElementById('btnDownloadLogs').addEventListener('click', () => downloadLogs());

    if (logs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = '<p>No activity recorded yet</p>';
        DOM.logsList.appendChild(empty);
        hideStates();
        DOM.show(DOM.logsList);
        return;
    }

    const table = document.createElement('table');
    table.className = 'logs-table';
    table.innerHTML = `<thead>
            <tr>
                <th>Date / Time</th>
                <th>Event</th>
                <th>Details</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    logs.forEach(log => {
        const row = document.createElement('tr');
        const date = new Date(log.created_at).toLocaleString();
        const statusClass = log.success ? 'status-success' : 'status-error';
        const statusText = log.success ? 'Success' : 'Failed';
        const label = EVENT_LABELS[log.event_type] || log.event_type;

        let logMessage = log.message || '-';
        
        // v=150: Localize dates inside the message (e.g., Exp: 2026-05-13 01:08)
        // Usually these are generated by the backend in UTC.
        logMessage = logMessage.replace(/Exp: (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/g, (match, p1) => {
            try {
                const utcDate = new Date(p1 + ' UTC');
                if (!isNaN(utcDate.getTime())) {
                    return `Exp: ${utcDate.toLocaleString()}`;
                }
            } catch(e) {}
            return match;
        });

        const msgCell = document.createElement('td');
        msgCell.className = 'log-msg';
        if (logMessage.includes('\\n')) {
            const pre = document.createElement('pre');
            pre.className = 'log-msg-pre';
            pre.textContent = logMessage;
            msgCell.appendChild(pre);
        } else {
            msgCell.textContent = logMessage;
        }

        row.innerHTML = `<td class="log-time">${date}</td>
            <td class="log-event"><span class="event-badge badge-${log.event_type}">${label}</span></td>
        `;
        row.appendChild(msgCell);
        const statusTd = document.createElement('td');
        statusTd.className = 'log-status';
        statusTd.innerHTML = `<span class="${statusClass}">${statusText}</span>`;
        row.appendChild(statusTd);

        tbody.appendChild(row);

        // Add trace inspection on click
        row.style.cursor = 'pointer';
        row.title = 'Click to view technical trace';
        row.onclick = () => {
            const traceWindow = window.open("", "LogTrace", "width=800,height=600");
            if (traceWindow) {
                const payloadStr = log.payload ? JSON.stringify(log.payload, null, 2) : 'No payload data';
                const responseStr = log.response ? JSON.stringify(log.response, null, 2) : 'No response data';
                const messageStr = log.message ? `Message: ${log.message.replace(/</g, '&lt;')}\n\n` : '';
                const traceData = log.details || `${messageStr}URL: ${log.url || 'N/A'}\nPayload: ${payloadStr}\nResponse: ${responseStr}`;
                traceWindow.document.write(`
                    <html>
                    <head><title>Technical Trace - ${log.event_type}</title></head>
                    <body style="background:#1e272e; color:#0be881; padding:20px; font-family:monospace; margin:0;">
                        <h3 style="color:#fff; border-bottom:1px solid #34495e; padding-bottom:10px;">Diagnostic Detail: ${label}</h3>
                        <div style="color:#bdc3c7; font-size:12px; margin-bottom:15px;">Timestamp: ${date} | Status: ${statusText}</div>
                        <pre style="white-space:pre-wrap; word-break:break-all; background:#2d3436; padding:15px; border-radius:4px; border:1px solid #34495e;">${traceData.replace(/</g, '&lt;')}</pre>
                        <div style="margin-top:20px; text-align:right;">
                            <button onclick="window.close()" style="background:#e74c3c; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;">Close Trace</button>
                        </div>
                    </body>
                    </html>
                `);
            } else {
                // console.log('Technical Trace:', log);
                alert("Please allow popups to view the diagnostic trace.");
            }
        };
    });

    DOM.logsList.appendChild(table);
    hideStates();
    DOM.show(DOM.logsList);
}


async function downloadLogs() {
    try {
        Toast.info('Preparing download...');
        const res = await window.api.downloadLogs();
        if (!res.success) {
            Toast.error(res.error || 'Download failed');
            return;
        }
        const blob = new Blob([res.data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const ts = now.getFullYear() + '-' +
            String(now.getMonth()+1).padStart(2,'0') + '-' +
            String(now.getDate()).padStart(2,'0') + '_' +
            String(now.getHours()).padStart(2,'0') + '-' +
            String(now.getMinutes()).padStart(2,'0');
        a.download = `activity_logs_${ts}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Toast.success('Logs downloaded successfully');
    } catch (err) {
        console.error('Download error:', err);
        Toast.error('Failed to download logs');
    }
}


// ===== Password Generator =====
let _genTargetInputId = null;

function openGeneratorModal(targetInputId = null) {
    _genTargetInputId = targetInputId;
    const modal = document.getElementById('generatorModal');
    if (modal) {
        modal.style.display = 'flex';
        const useBtn = document.getElementById('btnUseGenerated');
        if (useBtn) {
            useBtn.style.display = targetInputId ? 'inline-block' : 'none';
        }
        generatePassword();
    }
}

function closeGeneratorModal() {
    const modal = document.getElementById('generatorModal');
    if (modal) modal.style.display = 'none';
    _genTargetInputId = null;
    document.getElementById('gen_length_val').textContent = '24';
}

function generatePassword() {
    const lengthInput = document.getElementById('gen_length');
    const length = (lengthInput ? parseInt(lengthInput.value) : 24) || 24;
    
    // v2026: Remember user preference
    localStorage.setItem('kristoff_gen_length', length);
    document.getElementById('gen_length_val').textContent = length;

    const useUpper = document.getElementById('gen_upper').checked;
    const useLower = document.getElementById('gen_lower').checked;
    const useNum = document.getElementById('gen_num').checked;
    const useSym = document.getElementById('gen_sym').checked;

    let charset = '';
    if (useUpper) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (useLower) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (useNum) charset += '0123456789';
    // v2026: Strictly Ultra-Safe symbols (24 chars default)
    if (useSym) charset += '!@#$%&*-=_+';

    if (charset === '') {
        charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
    }

    let password = '';
    if (window.crypto && window.crypto.getRandomValues) {
        const array = new Uint32Array(length);
        window.crypto.getRandomValues(array);
        for (let i = 0; i < length; i++) {
            password += charset[array[i] % charset.length];
        }
    } else {
        for (let i = 0; i < length; i++) {
            password += charset.charAt(Math.floor(Math.random() * charset.length));
        }
    }

    document.getElementById('gen_result').value = password;
}

window.openGeneratorModal = function(targetId) {
    AppState.passwordGeneratorTargetId = targetId;
    const modal = document.getElementById('generatorModal');
    if (!modal) return;
    
    // v2026: Load user preference
    const savedLength = localStorage.getItem('kristoff_gen_length') || 24;
    const lengthInput = document.getElementById('gen_length');
    if (lengthInput) {
        lengthInput.value = savedLength;
        document.getElementById('gen_length_val').textContent = savedLength;
    }
    
    const useBtn = document.getElementById('btnUseGenerated');
    if (useBtn) useBtn.style.display = targetId ? 'block' : 'none';
    
    modal.style.display = 'flex';
    generatePassword();
};

function copyGeneratedPassword() {
    const pwd = document.getElementById('gen_result').value;
    if (pwd) {
        window.copyToClipboard(pwd);
    }
}

function useGeneratedPassword() {
    const pwd = document.getElementById('gen_result').value;
    if (pwd && _genTargetInputId) {
        const target = document.getElementById(_genTargetInputId);
        if (target) {
            target.value = pwd;
            target.focus();
        }
        closeGeneratorModal();
    }
}

// Sharing logic moved to modules/sharing.js

// ===== Delete Logic =====
async function handleDeleteCredential(manualCred = null) {
    const cred = manualCred || AppState.editingCredential;
    if (!cred) return;
    
    const isPersonal = cred.is_personal;
    const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
    
    if (!isPersonal && !isAdmin) {
        Toast.error("Only administrators can delete company credentials.");
        return;
    }
    
    if (!confirm(`Are you sure you want to permanently delete credential '${cred.name}'?`)) return;

    const companyId = cred.company_id || AppState.currentUser?.company_id || 1;
    const btn = document.getElementById('btnDeleteCredential');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Deleting...';
    }

    const res = await window.api.deleteCredential(companyId, cred.id, isPersonal);
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Delete';
    }

    if (res.success) {
        Toast.success("Credential deleted successfully");
        hideModal();
        if (isPersonal) loadPersonalCredentials(); else loadCredentials(companyId);
    } else {
        Toast.error("Failed to delete credential: " + res.error);
    }
}

async function handleDeleteGroup(e, groupName, isPersonal) {
    e.stopPropagation();
    const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
    
    if (!isPersonal && !isAdmin) {
        Toast.error("Only administrators can delete company groups.");
        return;
    }
    
    if (!confirm(`WARNING: Are you sure you want to delete the ENTIRE group '${groupName}'? This will permanently delete ALL credentials inside this group.`)) return;

    const companyId = AppState.currentUser?.company_id || 1;
    const res = await window.api.deleteGroup(companyId, groupName, isPersonal);

    if (res.success) {
        Toast.success("Group deleted successfully");
        if (AppState.selectedGroup === groupName) AppState.selectedGroup = null;
        if (isPersonal) loadPersonalCredentials(); else loadCredentials(companyId);
    } else {
        Toast.error("Failed to delete group: " + res.error);
    }
}

// ===== Centralized Auto-Refresh =====
let _globalAutoRefreshTimer = null;

function refreshCurrentView() {
    // console.log('Auto-refreshing current view...');
    
    // v=169: Auto-Expiration & Rotation Monitor
    checkAndRotateExpiredShares().catch(e => console.error('Monitor Error:', e));

    if (DOM.logsList.style.display !== 'none') {
        loadLogs();
        return;
    }
    if (AppState.isPersonalView) {
        loadPersonalCredentials();
        return;
    }
    if (AppState.selectedCompany) {
        loadCredentials(AppState.selectedCompany.id);
        return;
    }
}

async function checkAndRotateExpiredShares() {
    const now = new Date();
    // Only check if we have credentials loaded
    if (!AppState.allCredentials || AppState.allCredentials.length === 0) return;
    
    // To avoid overloading, we only check a few credentials each cycle or based on probability
    // For this implementation, we check all if they are less than 50
    const credsToCheck = AppState.allCredentials.slice(0, 50);
    
    for (const cred of credsToCheck) {
        // We need the shares list to check expirations
        try {
            const res = await window.api.getCredentialShares(cred.id);
            if (res.success && res.data) {
                const shares = res.data;
                for (const share of shares) {
                    if (share.expires_at && new Date(share.expires_at) < now) {
                        // console.log(`[Monitor] Share for ${share.email} on ${cred.name} expired. Revoking & Rotating...`);
                        
                        // Set current sharing credential context so revokeShare works
                        const prevSharing = AppState.currentSharingCredential;
                        AppState.currentSharingCredential = cred;
                        
                        // revokeShare(email) will trigger the automatic rotation we added to it
                        if (typeof window.revokeShare === 'function') {
                            // We use a mock confirm for the auto-revoke
                            const oldConfirm = window.confirm;
                            window.confirm = () => true;
                            await window.revokeShare(share.email);
                            window.confirm = oldConfirm;
                        }
                        
                        AppState.currentSharingCredential = prevSharing;
                    }
                }
            }
        } catch (e) {
            // Silently fail for individual credential checks
        }
    }
}

function startAutoRefresh() {
    if (_globalAutoRefreshTimer) clearInterval(_globalAutoRefreshTimer);
    _globalAutoRefreshTimer = setInterval(() => {
        const modals = document.querySelectorAll('.modal-overlay');
        const anyModalVisible = Array.from(modals).some(m => m.style.display === 'flex' || m.style.display === 'block');
        if (AppState.currentUser && !anyModalVisible) {
            refreshCurrentView();
        }
    }, 60000);
}

async function deleteAllInCurrentView() {
    const creds = AppState.allCredentials;
    if (!creds || creds.length === 0) {
        Toast.error('No credentials in current view to delete');
        return;
    }

    const count = creds.length;
    if (!confirm(`CRITICAL WARNING: You are about to PERMANENTLY DELETE ALL ${count} credentials in the current view.\n\nThis cannot be undone. Are you absolutely sure?`)) {
        return;
    }

    const password = prompt('SECURITY CHALLENGE: Please enter the ADMINISTRATOR login password to authorize this mass deletion:');
    if (!password) return;

    // Verify password by attempting a health check or a mini-login
    const verifyRes = await window.api.login(AppState.currentUser.email, password);
    if (!verifyRes.success) {
        Toast.error('Invalid password. Mass deletion aborted for security reasons.');
        return;
    }

    const btn = document.getElementById('btnDeleteAll');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Deleting...';
    }

    const isPersonal = AppState.isPersonalView;
    const companyId = isPersonal 
        ? (AppState.currentUser?.company_id || 1)
        : (AppState.selectedCompany?.id || AppState.currentUser?.company_id || 1);

    for (let i = 0; i < creds.length; i++) {
        const c = creds[i];
        if (btn) btn.textContent = `Deleting (${i+1}/${count})...`;
        await window.api.deleteCredential(companyId, c.id, isPersonal);
        await new Promise(r => setTimeout(r, 10));
    }

    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Delete All In View';
    }
    Toast.success(`Process completed for ${count} credentials.`);
    if (isPersonal) loadPersonalCredentials(); else loadCredentials(companyId);
}
async function loadPredefinedGroups() {
    try {
        const res = await window.api.getPredefinedGroups();
        if (res.success) {
            AppState.predefinedGroups = res.data;
            renderSidebarGroups();
        }
    } catch (err) {
        console.error('Error loading predefined groups:', err);
    }
}

window.openGroupManagementModal = async function() {
    const modal = document.getElementById('groupManagementModal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    await renderModalGroupsList();
};

window.closeGroupManagementModal = function() {
    const modal = document.getElementById('groupManagementModal');
    if (modal) modal.style.display = 'none';
};

async function renderModalGroupsList() {
    const list = document.getElementById('modalGroupsList');
    if (!list) return;
    
    await loadPredefinedGroups();
    const groups = AppState.predefinedGroups || [];
    
    list.innerHTML = '';
    if (groups.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#7f8c8d;">No hay grupos definidos.</div>';
        return;
    }
    
    groups.forEach(g => {
        const item = document.createElement('div');
        item.className = 'group-management-item';
        item.style = 'display:flex; justify-content:space-between; align-items:center; padding:10px 15px; border-bottom:1px solid #34495e;';
        item.innerHTML = `
            <span style="color:white; font-size:14px;">${g}</span>
            <button type="button" class="btn-remove-svc" style="background:#e74c3c; color:white; border:none; border-radius:3px; cursor:pointer; width:24px; height:24px;" onclick="window.handleDeletePredefinedGroup('${g}')">&times;</button>
        `;
        list.appendChild(item);
    });
}

window.handleCreatePredefinedGroup = async function() {
    const input = document.getElementById('newGroupNameInput');
    const name = input?.value?.trim();
    
    if (!name) {
        Toast.error("Por favor ingresa un nombre para el grupo.");
        return;
    }
    
    try {
        const res = await window.api.addPredefinedGroup(name);
        if (res.success) {
            Toast.success(`Grupo '${name}' creado exitosamente.`);
            if (input) input.value = '';
            await renderModalGroupsList();
            if (typeof renderSidebarGroups === 'function') renderSidebarGroups();
        } else {
            Toast.error("Error al crear grupo: " + res.error);
        }
    } catch (err) {
        Toast.error("Error de conexión al crear grupo.");
    }
};

window.handleDeletePredefinedGroup = async function(name) {
    if (!confirm(`¿Estás seguro de eliminar el grupo predefinido '${name}'?\nEsto no borrará las credenciales, pero quedarán sin grupo.`)) return;
    
    try {
        const res = await window.api.deletePredefinedGroup(name);
        if (res.success) {
            Toast.success(`Grupo '${name}' eliminado.`);
            await renderModalGroupsList();
            if (typeof renderSidebarGroups === 'function') renderSidebarGroups();
        } else {
            Toast.error("Error al eliminar grupo: " + res.error);
        }
    } catch (err) {
        Toast.error("Error de conexión.");
    }
};

// UI Helper Functions
window.togglePasswordVisibility = function(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
};

window.openGeneratorModal = function(targetId) {
    AppState.passwordGeneratorTargetId = targetId;
    const modal = document.getElementById('generatorModal');
    if (!modal) return;
    
    const useBtn = document.getElementById('btnUseGenerated');
    if (useBtn) useBtn.style.display = targetId ? 'block' : 'none';
    
    modal.style.display = 'flex';
    generatePassword();
};

window.closeGeneratorModal = function() {
    const modal = document.getElementById('generatorModal');
    if (modal) modal.style.display = 'none';
};

// window.generatePassword is now assigned above

window.copyGeneratedPassword = function() {
    const val = document.getElementById('gen_result').value;
    if (val) copyToClipboard(val);
};

// Generator logic unified above

window.useGeneratedPassword = function() {
    const val = document.getElementById('gen_result').value;
    const targetId = AppState.passwordGeneratorTargetId;
    if (val && targetId) {
        const target = document.getElementById(targetId);
        if (target) {
            target.value = val;
            target.type = 'text'; // Show it for confirmation
        }
    }
    closeGeneratorModal();
};

// UI Helper Functions

