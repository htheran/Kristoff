/**
 * Sharing module for Kristoff v200
 */
console.log('Sharing Module v200 loaded');

window.openShareModal = async function(credentialOrGroup, isGroup = false) {
    try {
        // console.log('openShareModal called', { isGroup, data: credentialOrGroup });
        if (isGroup) {
            // v=180: Robust check for "All" group
            if (credentialOrGroup === 'All' || credentialOrGroup === null || credentialOrGroup === 'null') {
                AppState.currentSharingGroup = 'All';
            } else {
                AppState.currentSharingGroup = credentialOrGroup;
            }
            AppState.currentSharingCredential = null;
            if (DOM.shareTitle) DOM.shareTitle.textContent = 'Share Folder: ' + AppState.currentSharingGroup;
            DOM.hide(DOM.modularPermissionsContainer);
        } else {
            AppState.currentSharingCredential = credentialOrGroup;
            AppState.currentSharingGroup = null;
            if (DOM.shareTitle) DOM.shareTitle.textContent = 'Share ' + credentialOrGroup.name;
            
            // Show modular permissions for single credentials
            DOM.show(DOM.modularPermissionsContainer);
            if (DOM.modularPermissionsList) {
                DOM.modularPermissionsList.style.maxHeight = '150px';
                DOM.modularPermissionsList.style.overflowY = 'auto';
                DOM.modularPermissionsList.style.paddingRight = '5px';
            }
            window.renderModularPermissions(credentialOrGroup);
        }

        // v=180: Update buttons state (revoke button visibility)
        if (typeof window.updateShareModalButtons === 'function') {
            window.updateShareModalButtons(isGroup);
        }
        
        if (DOM.shareError) DOM.shareError.textContent = '';
        if (DOM.shareForm) DOM.shareForm.reset();
        DOM.flex(DOM.shareModal);
        
        // 1. Force Refresh of approved users
        await window.loadApprovedUsers();
        
        // 2. Initialize Manual Entry Toggle with robust checks
        const selectCont = document.getElementById('shareEmailSelectContainer');
        const inputCont = document.getElementById('shareEmailInputContainer');
        const toggleBtn = document.getElementById('toggleManualEmail');
        const manualInput = document.getElementById('share_email_manual');
        const selectEl = document.getElementById('share_email');

        if (toggleBtn && selectCont && inputCont) {
            toggleBtn.onclick = (e) => {
                e.preventDefault();
                const isManual = inputCont.style.display === 'block';
                // console.log('Toggling manual share mode. Current isManual:', isManual);
                
                if (isManual) {
                    inputCont.style.display = 'none';
                    selectCont.style.display = 'block';
                    toggleBtn.textContent = 'Ingresar manualmente';
                    if (manualInput) manualInput.required = false;
                    if (selectEl) selectEl.required = true;
                } else {
                    inputCont.style.display = 'block';
                    selectCont.style.display = 'none';
                    toggleBtn.textContent = 'Usar lista del directorio';
                    if (manualInput) {
                        manualInput.required = true;
                        manualInput.focus();
                    }
                    if (selectEl) selectEl.required = false;
                }
            };
        }

        if (DOM.shareExpiresAt) DOM.shareExpiresAt.value = '';
        window.loadActiveShares();
        
        setTimeout(() => {
            if (selectEl && selectCont.style.display !== 'none') {
                selectEl.focus();
                selectEl.onchange = () => {
                    window.updateModularCheckboxesForUser(selectEl.value);
                };
            }
        }, 150);
    } catch (err) {
        console.error('Error in openShareModal:', err);
        alert('Error al abrir modal de compartir: ' + err.message);
    }
};

window.renderModularPermissions = function(cred) {
    if (!DOM.modularPermissionsList) return;
    DOM.modularPermissionsList.innerHTML = '';

    // OS Credentials option
    const osCard = document.createElement('div');
    osCard.className = 'modular-perm-card';
    osCard.style.cssText = 'display:flex; align-items:center; padding:12px; background:white; border:1px solid #eee; border-radius:10px; margin-bottom:10px; transition:all 0.2s; cursor:pointer;';
    osCard.onmouseover = () => { osCard.style.borderColor = '#3498db'; osCard.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)'; };
    osCard.onmouseout = () => { osCard.style.borderColor = '#eee'; osCard.style.boxShadow = 'none'; };
    osCard.innerHTML = `
        <div style="width:36px; height:36px; background:#f1f2f6; border-radius:8px; display:flex; align-items:center; justify-content:center; margin-right:12px; font-size:18px;">💻</div>
        <div style="flex:1;">
            <div style="font-size:13px; font-weight:700; color:#2d3436;">Credenciales OS</div>
            <div style="font-size:11px; color:#636e72;">Usuario principal (${cred.username || 'N/A'})</div>
        </div>
        <input type="checkbox" name="modular_perm" value="os" checked style="width:20px; height:20px; cursor:pointer;">
    `;
    osCard.onclick = (e) => { if(e.target.tagName !== 'INPUT') { const cb=osCard.querySelector('input'); cb.checked=!cb.checked; } };
    DOM.modularPermissionsList.appendChild(osCard);
    
    // Deployment / Rotation permission (Special) - ONLY ADMINS can grant this
    const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
    if (isAdmin) {
        const deployCard = document.createElement('div');
        deployCard.className = 'modular-perm-card';
        deployCard.style.cssText = 'display:flex; align-items:center; padding:12px; background:#f0f7ff; border:1px solid #c2e0ff; border-radius:10px; margin-bottom:10px; transition:all 0.2s; cursor:pointer;';
        deployCard.onmouseover = () => { deployCard.style.borderColor = '#3498db'; deployCard.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)'; };
        deployCard.onmouseout = () => { deployCard.style.borderColor = '#c2e0ff'; deployCard.style.boxShadow = 'none'; };
        deployCard.innerHTML = `
            <div style="width:36px; height:36px; background:#fff; border-radius:8px; display:flex; align-items:center; justify-content:center; margin-right:12px; font-size:18px;">🚀</div>
            <div style="flex:1;">
                <div style="font-size:13px; font-weight:700; color:#0056b3;">Despliegue y Rotación</div>
                <div style="font-size:11px; color:#5a91cc;">Permite usar el cohete y cambiar claves</div>
            </div>
            <input type="checkbox" name="modular_perm" value="deploy" style="width:20px; height:20px; cursor:pointer;">
        `;
        deployCard.onclick = (e) => { if(e.target.tagName !== 'INPUT') { const cb=deployCard.querySelector('input'); cb.checked=!cb.checked; } };
        DOM.modularPermissionsList.appendChild(deployCard);
    }
    
    // Services options
    let services = [];
    if (Array.isArray(cred.services)) {
        services = cred.services;
    } else if (typeof cred.services === 'string' && cred.services.length > 2) {
        try { services = JSON.parse(cred.services); } catch(e) {}
    }

    if (services.length > 0) {
        services.forEach((svc, index) => {
            const svcCard = document.createElement('div');
            svcCard.className = 'modular-perm-card';
            svcCard.style.cssText = 'display:flex; align-items:center; padding:12px; background:white; border:1px solid #eee; border-radius:10px; margin-bottom:10px; transition:all 0.2s; cursor:pointer;';
            svcCard.onmouseover = () => { svcCard.style.borderColor = '#3498db'; svcCard.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)'; };
            svcCard.onmouseout = () => { svcCard.style.borderColor = '#eee'; svcCard.style.boxShadow = 'none'; };
            svcCard.innerHTML = `
                <div style="width:36px; height:36px; background:#f1f2f6; border-radius:8px; display:flex; align-items:center; justify-content:center; margin-right:12px; font-size:18px;">🌐</div>
                <div style="flex:1;">
                    <div style="font-size:13px; font-weight:700; color:#2d3436;">${svc.name || 'Servicio'}</div>
                    <div style="font-size:11px; color:#636e72;">${svc.type || 'Svc'} | User: ${svc.username || 'N/A'}</div>
                </div>
                <input type="checkbox" name="modular_perm" value="svc:${index}" checked style="width:20px; height:20px; cursor:pointer;">
            `;
            svcCard.onclick = (e) => { if(e.target.tagName !== 'INPUT') { const cb=svcCard.querySelector('input'); cb.checked=!cb.checked; } };
            DOM.modularPermissionsList.appendChild(svcCard);
        });
    }
};

window.updateModularCheckboxesForUser = function(email) {
    if (!DOM.modularPermissionsList) return;
    const cred = AppState.currentSharingCredential;
    if (!cred || !email) {
        // Uncheck all if no user selected
        DOM.modularPermissionsList.querySelectorAll('input[name="modular_perm"]').forEach(cb => cb.checked = false);
        return;
    }

    const notes = cred.notes || '';
    const match = notes.match(/###MODULAR_PERMS###([\s\S]*?)###MODULAR_PERMS###/);
    let existingPerms = [];
    if (match) {
        try {
            const permsMap = JSON.parse(match[1]);
            const permsData = permsMap[email];
            if (Array.isArray(permsData)) existingPerms = permsData;
            else if (permsData && permsData.perms) existingPerms = permsData.perms;
        } catch(e) {}
    }

    DOM.modularPermissionsList.querySelectorAll('input[name="modular_perm"]').forEach(cb => {
        cb.checked = existingPerms.includes(cb.value);
    });
};

window.loadApprovedUsers = async function() {
    try {
        const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
        const companyId = AppState.currentUser?.company_id;
        let res = { success: false };

        // console.log('Agresivo: Loading users. Company:', companyId, 'isAdmin:', isAdmin);

        // Tiered Fetch with URL variation support
        if (isAdmin) {
            res = await window.api.getAllUsers();
        }
        
        if (!res.success && companyId) {
            // Try both string and number
            res = await window.api.getCompanyUsers(companyId);
            if (!res.success) res = await window.api.getCompanyUsers(Number(companyId));
        }
        
        // Final fallback: try getAllUsers anyway, backend might allow it for same company
        if (!res.success) {
            res = await window.api.getAllUsers();
        }

        let discoveredUsers = [];

        if (res && res.success) {
            let rawData = res.data;
            let allUsers = [];
            
            if (Array.isArray(rawData)) {
                allUsers = rawData;
            } else if (rawData && typeof rawData === 'object') {
                allUsers = rawData.users || rawData.items || rawData.data || rawData.users_list || [];
                if (!Array.isArray(allUsers)) {
                    allUsers = Object.values(rawData).find(v => Array.isArray(v)) || [];
                }
            }

            discoveredUsers = allUsers.filter(u => {
                if (!u || !u.email) return false;
                const status = (u.status || '').toLowerCase();
                const isApproved = (u.is_approved === true || u.is_approved === 1 || u.is_approved === 'true' || 
                                    status === 'approved' || status === 'active' || u.is_active === true);
                return isApproved && u.email.toLowerCase() !== AppState.currentUser?.email?.toLowerCase();
            });
        }

        // Deep Discovery from all local credentials
        if (AppState.allCredentials) {
            AppState.allCredentials.forEach(c => {
                // 1. Check notes
                const notes = c.notes || '';
                const mMatch = notes.match(/###MODULAR_PERMS###([\s\S]*?)###MODULAR_PERMS###/);
                if (mMatch) {
                    try {
                        const perms = JSON.parse(mMatch[1]);
                        Object.keys(perms).forEach(email => {
                            if (email.includes('@') && email.toLowerCase() !== AppState.currentUser?.email?.toLowerCase() && 
                                !discoveredUsers.some(u => u.email.toLowerCase() === email.toLowerCase())) {
                                discoveredUsers.push({ email, status: 'discovered' });
                            }
                        });
                    } catch(e) {}
                }

                // 2. NEW: Check metadata and permission_metadata for shared users
                const metaSources = [c.metadata, c.permission_metadata];
                metaSources.forEach(src => {
                    if (!src) return;
                    try {
                        const meta = typeof src === 'string' ? JSON.parse(src) : src;
                        // If it's a map of emails (like the notes workaround format but in metadata)
                        Object.keys(meta).forEach(key => {
                            if (key.includes('@') && key.toLowerCase() !== AppState.currentUser?.email?.toLowerCase()) {
                                if (!discoveredUsers.some(u => u.email.toLowerCase() === key.toLowerCase())) {
                                    discoveredUsers.push({ email: key, status: 'discovered' });
                                }
                            }
                        });
                    } catch(e) {}
                });

                // 3. Emails in notes (Simple Regex)
                const emailsInNotes = notes.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                if (emailsInNotes) {
                    emailsInNotes.forEach(email => {
                        if (email.toLowerCase() !== AppState.currentUser?.email?.toLowerCase() && 
                            !discoveredUsers.some(u => u.email.toLowerCase() === email.toLowerCase())) {
                            discoveredUsers.push({ email, status: 'discovered' });
                        }
                    });
                }
            });
        }
        
        // console.log('Discovery result:', discoveredUsers.length);
        AppState.approvedUsers = discoveredUsers;
        window.renderUserSelect();
    } catch (err) {
        console.error('Error in loadApprovedUsers:', err);
        window.renderUserSelect();
    }
};

window.renderUserSelect = function() {
    if (!DOM.shareEmail) return;
    
    const users = AppState.approvedUsers || [];
    let html = '<option value="">Selecciona un usuario...</option>';
    
    if (users.length > 0) {
        // Group by status
        const fromDirectory = users.filter(u => u.status !== 'discovered');
        const discovered = users.filter(u => u.status === 'discovered');
        
        if (fromDirectory.length > 0) {
            html += '<optgroup label="Directorio de Empresa">';
            fromDirectory.forEach(u => {
                html += `<option value="${u.email}">${u.email}</option>`;
            });
            html += '</optgroup>';
        }
        
        if (discovered.length > 0) {
            html += '<optgroup label="Contactos Frecuentes">';
            discovered.forEach(u => {
                html += `<option value="${u.email}">${u.email}</option>`;
            });
            html += '</optgroup>';
        }
    } else {
        html = '<option value="">No se encontraron usuarios automáticamente</option>';
    }
    
    DOM.shareEmail.innerHTML = html;
};

window.closeShareModal = function() {
    DOM.hide(DOM.shareModal);
};

window.prepareModularPermissions = function(cred, selectedPerms, recoveredServices = null) {
    const serviceDefs = {};
    selectedPerms.forEach(p => {
        if (p.startsWith('svc:')) {
            const idx = parseInt(p.split(':')[1]);
            let services = [];
            try {
                if (Array.isArray(recoveredServices) && recoveredServices.length > 0) services = recoveredServices;
                else if (Array.isArray(cred.services)) services = cred.services;
                else if (typeof cred.services === 'string') services = JSON.parse(cred.services);
            } catch(e) {}
            
            if (services && services[idx] !== undefined && services[idx] !== null) {
                // v=175: Deep copy and sanitize to prevent null-field collapse
                const rawSvc = services[idx];
                serviceDefs[p] = {
                    name: rawSvc.name || rawSvc.service_name || 'Service',
                    service_type: rawSvc.service_type || rawSvc.type || 'mysql',
                    host: rawSvc.host || cred.host || '',
                    port: rawSvc.port || '',
                    username: rawSvc.username || '',
                    ...rawSvc
                };
            } else {
                // AGGRESSIVE RECOVERY: If services are empty (re-sharing case), look in metadata defs
                const metaSource = cred.permission_metadata || cred.metadata;
                if (metaSource) {
                    try {
                        const meta = typeof metaSource === 'string' ? JSON.parse(metaSource) : metaSource;
                        if (meta.defs && meta.defs[p]) {
                            serviceDefs[p] = meta.defs[p];
                        }
                    } catch(e) {}
                }
            }
        }
    });

    const finalModularPerms = [...selectedPerms];
    let encodedDefs = null;
    if (Object.keys(serviceDefs).length > 0) {
        try {
            const fullJson = JSON.stringify(serviceDefs);
            encodedDefs = fullJson;
            
            // Legacy Hack: Add as a single string if not too large (backup)
            if (fullJson.length < 500) {
                finalModularPerms.push(`__DEFS__:${fullJson}`);
            }

            // Fragmented Hack: URL-safe Base64 chunks (v169: increased chunkSize to 200)
            const b64 = btoa(unescape(encodeURIComponent(fullJson))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            const chunkSize = 200; 
            for (let i = 0; i < b64.length; i += chunkSize) {
                finalModularPerms.push(`_M${Math.floor(i/chunkSize)}${b64.substring(i, i + chunkSize)}`);
            }
        } catch(e) { console.error('Encoding error:', e); }
    }
    return { finalModularPerms, serviceDefs };
};

window.persistModularPermsInNotes = async function(cred, email, perms, defs, recoveredServices = null) {
    if (!cred || !email) return;
    const isAdmin = AppState.currentUser && (AppState.currentUser.is_admin || AppState.currentUser.email === 'admin@admin.com');
    const isOwner = !cred.permission_level;
    
    if (isOwner || isAdmin) {
        try {
            let currentNotes = cred.notes || '';
            const match = currentNotes.match(/###MODULAR_PERMS###([\s\S]*?)###MODULAR_PERMS###/);
            let permsMap = {};
            if (match) {
                try { permsMap = JSON.parse(match[1]); } catch(e) {}
            }
            
            permsMap[email] = { perms, defs, sharer: AppState.currentUser?.email };
            
            const newTag = `###MODULAR_PERMS###${JSON.stringify(permsMap)}###MODULAR_PERMS###`;
            const cleanNotes = currentNotes.replace(/###MODULAR_PERMS###[\s\S]*?###MODULAR_PERMS###/g, '').trim();
            const updatedNotes = (cleanNotes + ' ' + newTag).trim();
            
            // v=178: SAFETY LOCK - Never send an empty services array during sharing sync 
            // if we have recovered them or if the current object has them.
            const servicesToPreserve = (Array.isArray(recoveredServices) && recoveredServices.length > 0) ? 
                                        recoveredServices : 
                                        (Array.isArray(cred.services) && cred.services.length > 0 ? cred.services : []);

            await window.api.updateCredential(
                AppState.selectedCompany?.id || cred.company_id || 1,
                cred.id,
                cred.name, cred.username, cred.password, cred.host, cred.group_name || null, 
                updatedNotes, servicesToPreserve,
                !!cred.is_personal, cred.environment || null, 
                cred.ssh_key || null, cred.ssh_pass || null, 
                cred.root_pass || null, cred.ssh_user || null
            );
            cred.notes = updatedNotes;
        } catch(e) { 
            console.error('Persist notes failed for', cred.id, e);
            Toast.error(`Fallo al sincronizar notas de ${cred.name}: ${e.message || 'Error desconocido'}`);
        }
    }
};

window.groupShareStorageKey = function() {
    const userEmail = AppState.currentUser?.email?.toLowerCase().trim() || 'guest';
    return `credentialclient_group_share_rules_${userEmail}`;
};

window.loadPersistedGroupShareRules = function() {
    try {
        const raw = localStorage.getItem(window.groupShareStorageKey());
        const parsed = raw ? JSON.parse(raw) : [];
        const now = Date.now();
        AppState.groupShareRules = Array.isArray(parsed) ? parsed.filter(rule => {
            return !rule.expiresAt || new Date(rule.expiresAt).getTime() > now;
        }) : [];
        console.log(`[Group Share] Loaded ${AppState.groupShareRules.length} persisted group share rule(s)`);
        window.saveGroupShareRules();
    } catch (err) {
        console.warn('Could not load persisted group share rules:', err);
        AppState.groupShareRules = [];
    }
};

window.saveGroupShareRules = function() {
    try {
        localStorage.setItem(window.groupShareStorageKey(), JSON.stringify(AppState.groupShareRules || []));
    } catch (err) {
        console.warn('Could not save group share rules:', err);
    }
};

window.normalizePermission = function(permission) {
    if (!permission) return 'read';
    const perm = permission.toString().toLowerCase();
    if (perm === 'all' || perm === 'edit' || perm === 'read') return perm;
    return 'read';
};

window.comparePermission = function(a, b) {
    const weights = { read: 0, edit: 1, all: 2 };
    return (weights[a] || 0) - (weights[b] || 0);
};

window.ruleMatchesGroup = function(ruleGroup, credentialGroup) {
    if (!ruleGroup || ruleGroup === 'All') return true;
    const group = credentialGroup || 'General';
    return group === ruleGroup || group.startsWith(ruleGroup + '/');
};

window.addOrUpgradeRecipient = function(map, email, permission, expiresAt) {
    if (!email) return;
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail || normalizedEmail === AppState.currentUser?.email?.toLowerCase().trim()) return;
    const normalizedPerm = window.normalizePermission(permission);
    const existing = map.get(normalizedEmail);
    if (!existing || window.comparePermission(normalizedPerm, existing.permission) > 0) {
        map.set(normalizedEmail, { permission: normalizedPerm, expires_at: expiresAt || existing?.expires_at || null });
    }
};

window.addGroupShareRule = function(groupName, email, permission, expiresAt) {
    if (!groupName || !email) return;
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPermission = window.normalizePermission(permission);
    const now = Date.now();
    AppState.groupShareRules = AppState.groupShareRules || [];
    AppState.groupShareRules = AppState.groupShareRules.filter(rule => {
        return !rule.expiresAt || new Date(rule.expiresAt).getTime() > now;
    });

    const existingIndex = AppState.groupShareRules.findIndex(rule => rule.groupName === groupName && rule.email === normalizedEmail);
    if (existingIndex >= 0) {
        const existing = AppState.groupShareRules[existingIndex];
        if (window.comparePermission(normalizedPermission, existing.permission) >= 0) {
            existing.permission = normalizedPermission;
        }
        existing.expiresAt = expiresAt || existing.expiresAt;
    } else {
        AppState.groupShareRules.push({ groupName, email: normalizedEmail, permission: normalizedPermission, expiresAt });
    }
    window.saveGroupShareRules();
    console.log(`[Group Share] Persisted rule: group='${groupName}', email='${normalizedEmail}', perm='${normalizedPermission}', expiresAt='${expiresAt}'`);
};

window.shareGroupByItems = async function(targetGroup, email, permission, expiresAt) {
    let creds = AppState.allCredentials || [];
    if (!creds.length && AppState.selectedCompany?.id) {
        const reloadRes = await window.api.getCredentials(AppState.selectedCompany.id);
        if (reloadRes.success) {
            creds = Array.isArray(reloadRes.data) ? reloadRes.data : (reloadRes.data?.items || []);
        }
    }

    const filtered = creds.filter(item => {
        const groupName = item.group_name || 'General';
        if (targetGroup === 'All') return true;
        return groupName === targetGroup || groupName.startsWith(targetGroup + '/');
    });
    if (!filtered.length) {
        return { success: false, error: 'No credentials found in the selected folder.' };
    }

    console.log(`[Group Share Fallback] Sharing ${filtered.length} credentials from group '${targetGroup}' to ${email}`);
    let successCount = 0;
    const errors = [];
    for (const cred of filtered) {
        const res = await window.api.shareCredential(cred.id, email, permission, expiresAt, null);
        if (res && res.success) {
            successCount += 1;
        } else {
            errors.push(res?.error || `Failed sharing ${cred.name}`);
        }
    }

    return { success: successCount > 0, successCount, error: errors.length ? errors.join('; ') : null };
};

window.handleShareSubmit = async function(e) {
    if (e) e.preventDefault();
    
    const isManual = DOM.shareEmailInputContainer && DOM.shareEmailInputContainer.style.display === 'block';
    const emailSelect = DOM.shareEmail.value.trim();
    const emailManual = DOM.shareEmailManual ? DOM.shareEmailManual.value.trim() : '';
    const email = isManual ? emailManual : emailSelect;
    
    const permission = DOM.sharePermission.value;
    const expiresAtRaw = DOM.shareExpiresAt.value;
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null;
    const expiryMsg = expiresAtRaw ? ` Expires: ${new Date(expiresAtRaw).toLocaleString()}` : '';
    if (!email) {
        Toast.error('Debes seleccionar o escribir un email válido.');
        return;
    }

    DOM.shareError.textContent = 'Sharing...';
    try {
        if (AppState.currentSharingGroup) {
            const targetGroup = AppState.currentSharingGroup;
            const cid = AppState.selectedCompany?.id || AppState.currentUser?.company_id || 1;
            const normalizedEmail = email.toLowerCase();

            DOM.shareError.textContent = `Sharing folder "${targetGroup}"...`;
            let res;
            try {
                res = await window.api.shareGroup(targetGroup, cid, normalizedEmail, permission, expiresAt);
            } catch (err) {
                console.warn('shareGroup API failed, falling back to item sharing:', err);
                res = { success: false, error: err.message || 'Group share API failed' };
            }

            if (res.success) {
                window.addGroupShareRule(targetGroup, normalizedEmail, permission, expiresAt);
                const fallbackRes = await window.shareGroupByItems(targetGroup, normalizedEmail, permission, expiresAt);
                if (!fallbackRes.success) {
                    console.warn(`Folder share API succeeded but per-item share fallback failed:`, fallbackRes.error);
                }
                Toast.success(`Folder "${targetGroup}" shared with ${normalizedEmail}${expiryMsg}`);
                window.closeShareModal();
                return;
            }

            const fallbackRes = await window.shareGroupByItems(targetGroup, normalizedEmail, permission, expiresAt);
            if (fallbackRes.success) {
                window.addGroupShareRule(targetGroup, normalizedEmail, permission, expiresAt);
                Toast.success(`Folder "${targetGroup}" shared with ${normalizedEmail}${expiryMsg}`);
                window.closeShareModal();
            } else {
                DOM.shareError.textContent = fallbackRes.error || res.error || `Failed to share folder "${targetGroup}"`;
            }
            return;
        } else {
            const cred = AppState.currentSharingCredential;
            const selectedPerms = [];
            const checkboxes = DOM.modularPermissionsList.querySelectorAll('input[name="modular_perm"]:checked');
            checkboxes.forEach(cb => selectedPerms.push(cb.value));

            if (selectedPerms.length === 0) {
                DOM.shareError.textContent = 'Debes seleccionar al menos un elemento para compartir.';
                return;
            }

            const recoveredServices = window.recoverServices(cred);
            const { finalModularPerms, serviceDefs } = window.prepareModularPermissions(cred, selectedPerms, recoveredServices);

            const res = await window.api.shareCredential(cred.id, email, permission, expiresAt, finalModularPerms);
            if (res.success) {
                // v=172: CENTRALIZED PERSISTENCE IN NOTES
                await window.persistModularPermsInNotes(cred, email, finalModularPerms, serviceDefs, recoveredServices);
                
                Toast.success(`Shared with ${email}`);
                window.closeShareModal();
                if (typeof window.loadActiveShares === 'function') {
                    window.loadActiveShares(cred.id);
                }
            } else {
                DOM.shareError.textContent = res.error || 'Failed to share';
            }
            return;
        }
    } catch (err) {
        console.error('Share error:', err);
        if (DOM.shareError) DOM.shareError.textContent = err.message || 'Connection error';
    }
};



window.loadActiveShares = async function() {
    const container = document.getElementById('activeSharesContainer');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center; color:#7f8c8d; font-size:12px; padding:10px;">Loading shares...</div>';
    
    let isGroup = !!AppState.currentSharingGroup;
    if (isGroup) {
        const targetGroup = AppState.currentSharingGroup;
        container.innerHTML = '<div style="text-align:center; color:#7f8c8d; font-size:11px; padding:10px;">To revoke a group: Enter the email above and click "Revoke Group Access" below.</div>';
        updateShareModalButtons(true);
        return;
    }

    if (!AppState.currentSharingCredential || !AppState.currentSharingCredential.id) {
        container.innerHTML = '<div style="text-align:center; color:#7f8c8d; font-size:12px; padding:10px;">No credential selected.</div>';
        return;
    }

    updateShareModalButtons(false);
    const cred = AppState.currentSharingCredential;
    const credId = cred.id;
    const isOwner = !cred.permission_level;
    const canManageShares = isOwner || 
                           cred.permission_level === 'share' || 
                           cred.permission_level === 'all' ||
                           (AppState.currentUser && (AppState.currentUser.is_admin || AppState.currentUser.email === 'admin@admin.com'));

    try {
        // console.log('Fetching shares for cred:', credId);
        const res = await window.api.getCredentialShares(credId);
        
        let shares = [];
        if (res.success) {
            shares = res.data || [];
        }

        // Combine with emails found in notes tag for full visibility
        const noteEmails = [];
        const permsMatch = (cred.notes || '').match(/###MODULAR_PERMS###([\s\S]*?)###MODULAR_PERMS###/);
        if (permsMatch) {
            try {
                const permsMap = JSON.parse(permsMatch[1]);
                Object.keys(permsMap).forEach(email => {
                    if (!shares.some(s => (s.user_email || s.email || s.to_email) === email)) {
                        noteEmails.push({ email, user_email: email, permission: 'modular', expires_at: null });
                    }
                });
            } catch(e) {}
        }
        
        AppState.currentCredentialShares = [...shares, ...noteEmails];
        
        // v=157: CRITICAL - Call the centralized recovery function
        if (typeof window.recoverGranularMetadata === 'function') {
            await window.recoverGranularMetadata(cred, shares);
        }

        // Refresh the user select to highlight those who have access
        renderUserSelect();

        let html = '';
        if (shares.length > 0) {
            const isAdmin = AppState.currentUser?.is_admin || AppState.currentUser?.email === 'admin@admin.com';
            const currentUserEmail = AppState.currentUser?.email;

            // Resolve modular sharers for filtering
            const sharerMap = {};
            const permsMatchAll = (cred.notes || '').match(/###MODULAR_PERMS###([\s\S]*?)###MODULAR_PERMS###/);
            if (permsMatchAll) {
                try {
                    const pMap = JSON.parse(permsMatchAll[1]);
                    Object.entries(pMap).forEach(([email, data]) => {
                        if (data && typeof data === 'object' && data.sharer) {
                            sharerMap[email] = data.sharer;
                        }
                    });
                } catch(e) {}
            }

            shares.forEach(s => {
                const sEmail = (s.user_email || s.email || s.to_email || '').toLowerCase().trim();
                if (!sEmail) return;

                let sharerOfThisUser = sharerMap[sEmail];
                
                // Fallback: Check share's own metadata if available
                if (!sharerOfThisUser && s.metadata) {
                    try {
                        const meta = typeof s.metadata === 'string' ? JSON.parse(s.metadata) : s.metadata;
                        if (meta.sharer) sharerOfThisUser = meta.sharer;
                    } catch(e) {}
                }

                const wasSharedByMe = sharerOfThisUser === currentUserEmail;
                const isMe = sEmail === currentUserEmail?.toLowerCase().trim();
                
                if (!isAdmin && !isOwner && !wasSharedByMe) {
                    return; // Skip this share in the list
                }
                
                if (isMe) return; // Never show self in revocation list

                const expText = s.expires_at ? new Date(s.expires_at).toLocaleString() : 'Never';
                html += `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#f8f9fa; padding:8px 12px; margin-bottom:5px; border-radius:4px; font-size:13px; border:1px solid #eee;">
                        <div>
                            <strong>${sEmail}</strong>
                            <div style="color:#7f8c8d; font-size:11px;">Permiso: ${s.permission || s.permission_level} | Exp: ${expText} ${sharerOfThisUser ? `| Shared by: ${sharerOfThisUser}` : ''}</div>
                        </div>
                        <button type="button" onclick="revokeShare('${sEmail}')" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:600;">Revoke</button>
                    </div>
                `;
            });
        } else {
            html = `<div style="text-align:center; color:#95a5a6; font-size:11px; padding:12px; background:#f9f9f9; border-radius:4px; border:1px dashed #ddd; margin-bottom:10px;">
                No hay compartidos activos.
            </div>`;
        }

        // Add manual revoke section with input + datalist for flexibility
        // Combine users from API shares AND users found in modular perms tag AND discovered from logs
        const manualNoteEmails = [];
        const permsMatchNote = (cred.notes || '').match(/###MODULAR_PERMS###([\s\S]*?)###MODULAR_PERMS###/);
        if (permsMatchNote) {
            try {
                const permsMap = JSON.parse(permsMatchNote[1]);
                Object.keys(permsMap).forEach(email => {
                    if (!shares.some(s => (s.user_email || s.email || s.to_email) === email)) {
                        manualNoteEmails.push(email);
                    }
                });
            } catch(e) {}
        }

        // Try to discover from logs for audit/history (v=155)
        const logDiscoveredEmails = [];
        try {
            const logsRes = await window.api.getLogs(AppState.selectedCompany?.id || cred.company_id || null, 200);
            if (logsRes.success) {
                const logItems = logsRes.data?.items || logsRes.data || [];
                logItems.forEach(log => {
                    // Look for share events for THIS credential
                    if (log.message && (log.message.includes('shared') || log.message.includes('comparti')) && 
                        log.metadata && (log.metadata.credential_id == cred.id || log.metadata.id == cred.id)) {
                        const targetEmail = log.metadata.to_email || log.metadata.email || log.metadata.user;
                        if (targetEmail && targetEmail.includes('@') && !logDiscoveredEmails.includes(targetEmail)) {
                            logDiscoveredEmails.push(targetEmail);
                        }
                    }
                });
            }
        } catch(e) { console.warn('Audit discovery failed:', e); }

        // Filter out empty or invalid emails, ensure uniqueness, and EXCLUDE current user
        const currentUserEmailTrimmed = AppState.currentUser?.email?.toLowerCase().trim();
        const allRevocableEmails = Array.from(new Set([
            ...shares.map(s => s.user_email || s.email || s.to_email),
            ...manualNoteEmails,
            ...logDiscoveredEmails
        ])).filter(email => {
            if (!email || !email.includes('@')) return false;
            return email.toLowerCase().trim() !== currentUserEmailTrimmed;
        });

        const activeUserOptions = allRevocableEmails.map(email => `<option value="${email}">${email}</option>`).join('');
        html += `
            <div style="margin-top:10px; padding-top:10px; border-top:1px solid #eee;">
                <label style="font-size:10px; font-weight:bold; color:#7f8c8d; display:block; margin-bottom:5px; text-transform:uppercase;">Revocación por Auditoría / Manual</label>
                <div style="display:flex; gap:8px;">
                    <input type="email" id="manualRevokeEmail" list="revocableEmailsList" placeholder="usuario@empresa.com" style="flex:1; padding:8px; border:1px solid #dcdde1; border-radius:4px; font-size:12px;">
                    <datalist id="revocableEmailsList">
                        ${activeUserOptions}
                    </datalist>
                    <button type="button" onclick="handleManualRevoke()" style="background:#2c3e50; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer; font-size:12px; font-weight:600;">Revocar</button>
                </div>
                <div style="font-size:9px; color:#95a5a6; margin-top:4px;">Tip: Puedes escribir cualquier email para forzar la revocación.</div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Add global handler for manual revoke if it doesn't exist
        if (!window.handleManualRevoke) {
            window.handleManualRevoke = async function() {
                const emailInput = document.getElementById('manualRevokeEmail');
                const email = emailInput?.value.trim();
                if (!email) {
                    alert('Por favor, ingresa un email.');
                    return;
                }
                if (confirm(`¿Estás seguro de que deseas forzar la revocación para ${email}?`)) {
                    await window.revokeShare(email);
                    emailInput.value = '';
                }
            };
        }
    } catch (err) {
        console.error('Error loading active shares:', err);
        container.innerHTML = '<div style="text-align:center; color:#e74c3c; font-size:12px; padding:10px;">Error de conexión al cargar compartidos</div>';
    }
};

window.recoverGranularMetadata = async function(cred, shares = null) {
    if (!cred) return;
    
    // 1. If shares not provided, fetch them
    if (!shares) {
        try {
            const res = await window.api.getCredentialShares(cred.id);
            if (res.success) shares = res.data || [];
        } catch(e) { return; }
    }
    if (!shares || !Array.isArray(shares)) return;

    // 2. Find OUR OWN share record
    const myEmail = AppState.currentUser?.email?.toLowerCase().trim();
    const myShare = shares.find(s => (s.user_email || s.email || s.to_email || '').toLowerCase().trim() === myEmail);
    
    if (myShare) {
        // console.log('--- RECOVERY START (v167) ---');
        // console.log('Share Record:', myShare);
        
        cred.modular_permissions = myShare.modular_permissions || myShare.perms;
        cred.permission_metadata = myShare.metadata || myShare.permission_metadata;
        
        // v167: Ultra-Resilient Fragmented Recovery
        let mList = [];
        try {
            const raw = cred.modular_permissions;
            mList = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
        } catch(e) { console.error('Parse error in mList:', e); }

        // console.log('Current Modular Perms List:', mList);

        if (mList.length > 0) {
            const chunks = mList.filter(p => typeof p === 'string' && p.startsWith('_M')).sort((a,b) => {
                const numA = parseInt(a.substring(2).match(/^\d+/)?.[0] || '0');
                const numB = parseInt(b.substring(2).match(/^\d+/)?.[0] || '0');
                return numA - numB;
            });
            
            // console.log('Found chunks:', chunks.length);

            if (chunks.length > 0) {
                try {
                    let b64 = chunks.map(c => c.substring(2).replace(/^\d+/, '')).join('');
                    // console.log('Reassembled Base64 (raw):', b64);
                    b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
                    while (b64.length % 4) b64 += '=';
                    const fullJson = decodeURIComponent(escape(atob(b64)));
                    // console.log('Decoded JSON String:', fullJson);
                    const decoded = JSON.parse(fullJson);
                    cred.metadata = cred.metadata || {};
                    cred.metadata.defs = decoded;
                    // console.log('--- RECOVERY SUCCESS! ---', decoded);
                } catch(e) { console.error('DECODING ERROR (v167):', e); }
            } else {
                // console.warn('No _M chunks found in modular_permissions');
            }
        }

        // Also check for the __DEFS__ hack in my own share
        let mPerms = [];
        try {
            mPerms = typeof cred.modular_permissions === 'string' ? JSON.parse(cred.modular_permissions) : (Array.isArray(cred.modular_permissions) ? cred.modular_permissions : []);
        } catch(e) {}

        const defsHack = mPerms.find(p => typeof p === 'string' && p.startsWith('__DEFS__:'));
        if (defsHack) {
            try {
                const decoded = JSON.parse(defsHack.substring(9));
                cred.metadata = cred.metadata || {};
                cred.metadata.defs = decoded;
                // console.log('Recovered __DEFS__ from share:', decoded);
            } catch(e) {}
        }
    }
};

window.updateShareModalButtons = function(isGroup) {
    const modalActions = DOM.shareModal.querySelector('.modal-actions');
    if (!modalActions) return;

    let revokeBtn = document.getElementById('btnRevokeGroup');
    if (isGroup) {
        if (!revokeBtn) {
            revokeBtn = document.createElement('button');
            revokeBtn.id = 'btnRevokeGroup';
            revokeBtn.type = 'button';
            revokeBtn.className = 'btn-secondary';
            revokeBtn.style.background = '#e74c3c';
            revokeBtn.style.color = 'white';
            revokeBtn.style.border = 'none';
            revokeBtn.textContent = 'Revoke Group Access';
            revokeBtn.onclick = handleRevokeGroupSubmit;
            modalActions.prepend(revokeBtn);
        }
        revokeBtn.style.display = 'inline-block';
    } else if (revokeBtn) {
        revokeBtn.style.display = 'none';
    }
};

window.cleanupCredentialNotesAfterRevoke = async function(cred, email) {
    if (!cred || !email) return;
    let currentNotes = cred.notes || '';
    const match = currentNotes.match(/###MODULAR_PERMS###([\s\S]*?)###MODULAR_PERMS###/);
    if (!match) return;

    try {
        let permsMap = JSON.parse(match[1]);
        const targetEmail = email.toLowerCase();
        let found = false;
        
        // Case-insensitive cleanup
        Object.keys(permsMap).forEach(key => {
            if (key.toLowerCase() === targetEmail) {
                delete permsMap[key];
                found = true;
            }
        });

        if (found) {
            const hasRemaining = Object.keys(permsMap).length > 0;
            const newTag = hasRemaining ? `###MODULAR_PERMS###${JSON.stringify(permsMap)}###MODULAR_PERMS###` : '';
            const cleanNotes = currentNotes.replace(/###MODULAR_PERMS###[\s\S]*?###MODULAR_PERMS###/g, '').trim();
            const updatedNotes = (cleanNotes + ' ' + newTag).trim();
            
            await window.api.updateCredential(
                AppState.selectedCompany?.id || cred.company_id || 1,
                cred.id,
                cred.name, cred.username, cred.password, cred.host, cred.group_name || null, 
                updatedNotes, cred.services || [],
                !!cred.is_personal, cred.environment || null, 
                cred.ssh_key || null, cred.ssh_pass || null, 
                cred.root_pass || null, cred.ssh_user || null
            );
            cred.notes = updatedNotes;
        }
    } catch(e) {
        console.error('Error cleaning notes for', email, e);
    }
};

window.handleRevokeGroupSubmit = async function() {
    const email = DOM.shareEmail.value.trim();
    if (!email) {
        DOM.shareError.textContent = 'Enter email to revoke';
        return;
    }
    const targetGroup = AppState.currentSharingGroup || 'All';
    
    // v=170: Robust filtering for revocation
    const itemsToRevoke = AppState.allCredentials.filter(c => {
        if (targetGroup === 'All' || targetGroup === 'null' || targetGroup === null) return true;
        const g = c.group_name || 'General';
        return g === targetGroup || g.startsWith(targetGroup + '/');
    });

    if (itemsToRevoke.length === 0) {
        DOM.shareError.textContent = `No items found in folder "${targetGroup}"`;
        return;
    }

    if (!confirm(`Revoke ALL access for ${email} in folder "${targetGroup}" (${itemsToRevoke.length} items)?`)) return;

    DOM.shareError.textContent = 'Revoking group access...';
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < itemsToRevoke.length; i++) {
        const item = itemsToRevoke[i];
        DOM.shareError.innerHTML = `Revoking...<br>${i+1} / ${itemsToRevoke.length}<br><small>${item.name}</small>`;
        
        try {
            const res = await window.api.shareCredential(item.id, email, 'revoke', null);
            if (res.success) {
                // v=172: CENTRALIZED NOTES CLEANUP FOR GROUPS
                await window.cleanupCredentialNotesAfterRevoke(item, email);
                successCount++;
            } else {
                failCount++;
            }
        } catch(e) {
            failCount++;
        }
        
        await new Promise(r => setTimeout(r, 20));
    }

    if (successCount > 0) {
        Toast.success(`Revoked access for ${email} on ${successCount} items.`);
    } else if (failCount > 0) {
        Toast.error(`Failed to revoke access on ${failCount} items. Check if they were already revoked.`);
    } else {
        Toast.info(`No active shares found for ${email} in this folder.`);
    }
    
    window.closeShareModal();
};

window.revokeShare = async function(email) {
    if (!AppState.currentSharingCredential) return;
    if (!confirm(`Revoke access for ${email}?`)) return;

    const res = await window.api.shareCredential(AppState.currentSharingCredential.id, email, 'revoke', null);
    if (res.success) {
        // v=169: AUTOMATIC ROTATION ON REVOCATION
        try {
            const cred = AppState.currentSharingCredential;
            let revokedPerms = ['os']; // Default fallback
            
            // Try to find the exact perms this user had before revoking
            const permsMatch = (cred.notes || '').match(/###MODULAR_PERMS###([\s\S]*?)###MODULAR_PERMS###/);
            if (permsMatch) {
                const permsMap = JSON.parse(permsMatch[1]);
                if (permsMap[email]) {
                    revokedPerms = permsMap[email].perms || [];
                }
            }

            // v=172: CENTRALIZED NOTES CLEANUP
            await window.cleanupCredentialNotesAfterRevoke(cred, email);

            // TRIGGER ROTATIONS
            Toast.info(`Auto-rotando accesos revocados para ${email}...`);
            if (revokedPerms.includes('os')) {
                // console.log('Revocation: Rotating OS password');
                handleRotatePassword(cred).catch(e => console.error('Auto-rotation OS failed:', e));
            }
            
            revokedPerms.filter(p => p.startsWith('svc:')).forEach(p => {
                const idx = parseInt(p.split(':')[1]);
                // console.log(`Revocation: Rotating service ${idx}`);
                handleRotateServicePassword(cred, idx).catch(e => console.error(`Auto-rotation svc:${idx} failed:`, e));
            });

        } catch (revError) {
            console.error('Error during automatic rotation flow:', revError);
        }

        Toast.success(`Access revoked for ${email}`);
        if (typeof window.loadActiveShares === 'function') {
            window.loadActiveShares(AppState.currentSharingCredential.id);
        }
    } else {
        Toast.error('Failed to revoke: ' + res.error);
    }
};



window.syncServicePasswordToNotes = async function(credential, serviceIndex, newPassword) {
    if (!credential || !credential.notes) return;
    const currentNotes = credential.notes;
    const match = currentNotes.match(/###MODULAR_PERMS###([\s\S]*?)###MODULAR_PERMS###/);
    if (!match) return;

    try {
        let permsMap = JSON.parse(match[1]);
        let changed = false;
        const svcKey = `svc:${serviceIndex}`;

        // Update in ALL user definitions stored in the tag
        Object.values(permsMap).forEach(userPerms => {
            if (userPerms.defs && userPerms.defs[svcKey]) {
                userPerms.defs[svcKey].password = newPassword;
                changed = true;
            }
        });

        if (changed) {
            const newTag = "###MODULAR_PERMS###" + JSON.stringify(permsMap) + "###MODULAR_PERMS###";
            const cleanNotes = currentNotes.replace(/###MODULAR_PERMS###[\s\S]*?###MODULAR_PERMS###/g, '').trim();
            const updatedNotes = (cleanNotes + ' ' + newTag).trim();
            
            await window.api.updateCredential(
                AppState.selectedCompany?.id || credential.company_id || 1,
                credential.id,
                credential.name, credential.username, credential.password, credential.host, credential.group_name || null, 
                updatedNotes, credential.services || [],
                !!credential.is_personal, credential.environment || null, 
                credential.ssh_key || null, credential.ssh_pass || null, 
                credential.root_pass || null, credential.ssh_user || null
            );
            credential.notes = updatedNotes;
        }
    } catch(e) {
        console.error('Error syncing service password to notes:', e);
    }
};

window.propagateGroupShares = async function(newCredId, groupName) {
    if (!newCredId) return;
    try {
        const cid = AppState.selectedCompany?.id || AppState.currentUser?.company_id || 1;
        const currentUserEmail = AppState.currentUser?.email?.toLowerCase().trim();
        console.log(`🚀 [Inheritance] Starting for ID ${newCredId} (Group: ${groupName}) in Company ${cid}`);
        
        const freshRes = await window.api.getCredential(newCredId, cid);
        if (!freshRes.success || !freshRes.data) {
            console.error('[Inheritance] Could not fetch new credential data');
            return;
        }
        const newCred = freshRes.data;
        const services = window.recoverServices(newCred);

        const listRes = await window.api.getCredentials(cid);
        if (!listRes.success) return;
        const allItems = Array.isArray(listRes.data) ? listRes.data : (listRes.data?.items || []);

        const recipientMap = new Map();
        const setRecipient = (email, permission, expiresAt) => {
            if (!email) return;
            const normalizedEmail = email.toLowerCase().trim();
            if (!normalizedEmail || normalizedEmail === currentUserEmail) return;
            const normalizedPerm = window.normalizePermission(permission);
            const existing = recipientMap.get(normalizedEmail);
            if (!existing || window.comparePermission(normalizedPerm, existing.permission) > 0) {
                recipientMap.set(normalizedEmail, { permission: normalizedPerm, expires_at: expiresAt || existing?.expires_at || null });
            }
        };

        const discoveryLimit = Math.min(allItems.length, 300);
        const chunkSize = 15;
        const discoveryChunks = [];
        for (let i = 0; i < discoveryLimit; i += chunkSize) {
            discoveryChunks.push(allItems.slice(i, i + chunkSize));
        }

        console.log(`[Inheritance] Analyzing up to ${discoveryLimit} items for share patterns...`);
        
        // v=200: Also include CURRENT recipients of THIS credential to ensure they get service updates
        try {
            const currentSharesRes = await window.api.getCredentialShares(newCredId);
            if (currentSharesRes.success && Array.isArray(currentSharesRes.data)) {
                console.log(`[Inheritance] Including ${currentSharesRes.data.length} current recipients in the sync pass.`);
                currentSharesRes.data.forEach(share => {
                    const email = (share.user_email || share.email || share.to_email || '').toLowerCase().trim();
                    const permission = share.permission || share.permission_level;
                    if (email && email.includes('@')) {
                        setRecipient(email, permission, share.expires_at);
                    }
                });
            }
        } catch (e) {
            console.warn('[Inheritance] Failed to fetch current shares for sync:', e);
        }

        for (const chunk of discoveryChunks) {
            if (recipientMap.size > 100) break;
            await Promise.all(chunk.map(async (item) => {
                if (item.id == newCredId) return;
                const sRes = await window.api.getCredentialShares(item.id);
                if (sRes.success && Array.isArray(sRes.data)) {
                    sRes.data.forEach(share => {
                        const email = (share.user_email || share.email || share.to_email || '').toLowerCase().trim();
                        const permission = share.permission || share.permission_level;
                        if (email && email.includes('@')) {
                            setRecipient(email, permission, share.expires_at);
                        }
                    });
                }
            }));
        }

        (AppState.groupShareRules || []).forEach(rule => {
            if (window.ruleMatchesGroup(rule.groupName, groupName)) {
                setRecipient(rule.email, rule.permission, rule.expiresAt);
            }
        });

        if (recipientMap.size < 5) {
            console.log("[Inheritance] Map small, checking approved users directory...");
            const approved = AppState.approvedUsers || [];
            approved.forEach(u => {
                const email = (u.email || '').toLowerCase().trim();
                if (email && !recipientMap.has(email) && email !== currentUserEmail) {
                    setRecipient(email, 'read', null);
                }
            });
        }

        if (recipientMap.size === 0) {
            console.log("[Inheritance] No active shares or group rules found to inherit.");
            if (typeof Toast !== 'undefined') {
                Toast.warning('Herencia no aplicada: no se encontraron destinatarios activos para este grupo.');
            }
            return;
        }

        console.log(`[Inheritance] Found ${recipientMap.size} recipients to propagate to.`);
        console.log('[Inheritance] Recipients:', Array.from(recipientMap.entries()).map(([email, data]) => ({ email, permission: data.permission, expires_at: data.expires_at })));
        console.log('[Inheritance] Recipients:', Array.from(recipientMap.entries()).map(([email, data]) => ({ email, permission: data.permission, expires_at: data.expires_at })));

        let successCount = 0;
        for (const [email, data] of recipientMap.entries()) {
            console.log(`[Inheritance] Propagating to ${email} with perm: ${data.permission}`);
            const perms = ['os'];
            if (data.permission === 'all') {
                perms.push('share', 'deploy');
            } else if (data.permission === 'edit') {
                perms.push('deploy');
            }
            services.forEach((s, idx) => perms.push(`svc:${idx}`));
            const { finalModularPerms, serviceDefs } = window.prepareModularPermissions(newCred, perms, services);
            const res = await window.api.shareCredential(newCredId, email, data.permission, data.expires_at, finalModularPerms);
            if (res.success) {
                if (typeof window.persistModularPermsInNotes === 'function') {
                    await window.persistModularPermsInNotes(newCred, email, finalModularPerms, serviceDefs, services);
                }
                successCount++;
            } else {
                console.warn(`[Inheritance] Failed to share with ${email}:`, res.error);
            }
        }

        if (successCount > 0) {
            console.log(`✅ [Inheritance] Successfully propagated to ${successCount} users.`);
            if (typeof Toast !== 'undefined') Toast.success(`Herencia aplicada a ${successCount} usuarios.`);
        } else {
            console.warn(`❌ [Inheritance] Failed to propagate to any users.`);
        }
    } catch (e) {
        console.error("[Inheritance] Critical Error:", e);
    }
};
