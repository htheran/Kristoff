/**
 * Credentials module for Kristoff
 */

window.hasPermission = function(cred, perm) {
    const isAdmin = AppState.currentUser && (AppState.currentUser.is_admin || AppState.currentUser.email === 'admin@admin.com');
    const userEmail = AppState.currentUser?.email;
    if (!userEmail) return false;

    // Admin always has full access
    if (isAdmin) return true;

    // Pre-check for Owners (permission_level null)
    // Owners have 'os' and 'svc:*' and 'share' by default, but NOT 'deploy'
    const isOwner = !cred.permission_level;

    const notes = cred.notes || '';
    let foundUserEntry = false;
    let hasPermInModular = false;

    // 1. Check NEW format (Delimited)
    const newPermsMatch = notes.match(/###MODULAR_PERMS###([\s\S]*?)###MODULAR_PERMS###/);
    if (newPermsMatch) {
        try {
            const permsMap = JSON.parse(newPermsMatch[1]);
            const permsData = permsMap[userEmail];
            if (permsData) {
                foundUserEntry = true;
                const permsList = Array.isArray(permsData) ? permsData : (permsData.perms || []);
                hasPermInModular = permsList.includes(perm);
            }
        } catch(e) {}
    }

    // 2. Check OLD format (Brackets) - FALLBACK
    if (!foundUserEntry) {
        const oldPermsMatch = notes.match(/\[MODULAR_PERMS:([\s\S]*?)\]/);
        if (oldPermsMatch) {
            try {
                const permsMap = JSON.parse(oldPermsMatch[1]);
                const permsData = permsMap[userEmail];
                if (permsData) {
                    foundUserEntry = true;
                    const permsList = Array.isArray(permsData) ? permsData : (permsData.perms || []);
                    hasPermInModular = permsList.includes(perm);
                }
            } catch(e) {}
        }
    }

    // 3. Check permission_metadata (v=152) - Crucial for user-to-user sharing
    if (!foundUserEntry && cred.permission_metadata) {
        try {
            const meta = typeof cred.permission_metadata === 'string' ? JSON.parse(cred.permission_metadata) : cred.permission_metadata;
            // Check both 'modular_permissions' (old/array) and 'perms' (new/object)
            const permsList = meta.perms || meta.modular_permissions || (Array.isArray(meta) ? meta : []);
            if (Array.isArray(permsList) && permsList.length > 0) {
                foundUserEntry = true;
                hasPermInModular = permsList.includes(perm);
            }
        } catch(e) {}
    }

    // 4. NEW: Check metadata (v=154) - Fallback for re-shares where notes update failed
    if (!foundUserEntry && cred.metadata) {
        try {
            const meta = typeof cred.metadata === 'string' ? JSON.parse(cred.metadata) : cred.metadata;
            const permsList = meta.perms || meta.modular_permissions || (Array.isArray(meta) ? meta : []);
            if (Array.isArray(permsList) && permsList.length > 0) {
                foundUserEntry = true;
                hasPermInModular = permsList.includes(perm);
            }
        } catch(e) {}
    }

    // 5. NEW: Check direct modular_permissions array (v=156) - Most likely field for re-shares
    if (!foundUserEntry && cred.modular_permissions) {
        try {
            const mList = typeof cred.modular_permissions === 'string' ? JSON.parse(cred.modular_permissions) : cred.modular_permissions;
            if (Array.isArray(mList)) {
                foundUserEntry = true;
                hasPermInModular = mList.includes(perm);
            }
        } catch(e) {}
    }

    // RESOLUTION LOGIC
    if (foundUserEntry) return hasPermInModular;

    // If no explicit entry for this user, use defaults
    if (perm === 'edit') {
        if (isOwner || isAdmin) return true;
        return (cred.permission_level === 'all' || cred.permission_level === 'share' || cred.permission_level === 'edit');
    }

    if (perm === 'deploy' || perm === 'rotate') {
        if (isAdmin || isOwner) return true;
        return cred.permission_level === 'all';
    }
    if (perm === 'share') {
        if (isOwner || isAdmin) return true; 
        return (cred.permission_level === 'all' || cred.permission_level === 'share');
    }
    
    // For os / svc permissions
    if (isOwner) return true; // Owners have full access to view/copy
    
    // v=153: If it's a shared item (permission_level set), and we haven't found a modular entry,
    // we should STILL be restrictive if the credential has ANY modular info.
    const notesHasModularTag = (cred.notes || '').includes('###MODULAR_PERMS###');
    if (cred.permission_level && (cred.permission_metadata || cred.metadata || cred.modular_permissions || notesHasModularTag)) {
        if (!foundUserEntry || !hasPermInModular) {
            // Special case: if perm is 'os', we definitely want to block it if it's not explicitly granted
            if (perm === 'os') return false;
        }
    }

    // Legacy fallback (v=156): If permission_level is set but absolutely no modular info is found,
    // we default to TRUE for OS for compatibility with old shares.
    return true;
};
                
window.getDetailedPerms = function(cred) {
    const userEmail = AppState.currentUser?.email;
    if (!userEmail) return "No User";

    // 1. Check permission_metadata (v=151) - Most reliable for shared-of-shared
    if (cred.permission_metadata) {
        try {
            const meta = typeof cred.permission_metadata === 'string' ? JSON.parse(cred.permission_metadata) : cred.permission_metadata;
            if (Array.isArray(meta.modular_permissions)) {
                return meta.modular_permissions;
            }
            if (Array.isArray(meta)) return meta;
        } catch(e) {}
    }

    // 1b. NEW: Check metadata
    if (cred.metadata) {
        try {
            const meta = typeof cred.metadata === 'string' ? JSON.parse(cred.metadata) : cred.metadata;
            if (meta.perms) return meta.perms;
            if (Array.isArray(meta.modular_permissions)) return meta.modular_permissions;
        } catch(e) {}
    }

    const notes = cred.notes || '';
    // 2. Check NEW format in notes
    const newMatch = notes.match(/###MODULAR_PERMS###([\s\S]*?)###MODULAR_PERMS###/);
    if (newMatch) {
        try {
            const permsMap = JSON.parse(newMatch[1]);
            const permsData = permsMap[userEmail];
            if (Array.isArray(permsData)) return permsData;
            if (permsData && typeof permsData === 'object' && Array.isArray(permsData.perms)) {
                return permsData.perms;
            }
        } catch(e) {}
    }

    // 3. Check OLD format in notes
    const oldMatch = notes.match(/\[MODULAR_PERMS:([\s\S]*?)\]/);
    if (oldMatch) {
        try {
            const permsMap = JSON.parse(oldMatch[1]);
            if (permsMap[userEmail]) return permsMap[userEmail];
        } catch(e) {}
    }
    
    return "Legacy/All";
};

/**
 * Robust services extraction for a credential.
 * Uses multiple fallback strategies to find services even if the primary field is empty.
 * Returns the services array and also updates cred.services in-place.
 */
window.recoverServices = function(cred) {
    if (!cred) return [];
    let services = [];
    try {
        // 1. Primary field (array or JSON string)
        if (Array.isArray(cred.services)) {
            services = cred.services;
        } else if (typeof cred.services === 'string' && cred.services.trim().length > 2) {
            try { services = JSON.parse(cred.services); } catch(e) {}
        }
        
        // 2. Critical Recovery: If services are empty (common for shared items), look for embedded defs in notes
        if (!services || services.length === 0 || services.every(s => !s)) {
            const userEmail = AppState.currentUser?.email;
            const match = (cred.notes || '').match(/###MODULAR_PERMS###([\s\S]*?)###MODULAR_PERMS###/);
            if (match) {
                try {
                    const permsMap = JSON.parse(match[1]);
                    // Check our own entry first, then harvest from others (Hunter-Gatherer)
                    const permsData = permsMap[userEmail];
                    let defs = permsData?.defs;
                    
                    if (!defs) {
                        // Harvest from ANY user if ours is missing defs
                        for (const userData of Object.values(permsMap)) {
                            if (userData && userData.defs) { defs = userData.defs; break; }
                        }
                    }

                    if (defs) {
                        const indices = Object.keys(defs).map(k => parseInt(k.split(':')[1]));
                        if (indices.length > 0) {
                            const maxIdx = Math.max(...indices);
                            services = new Array(maxIdx + 1).fill(null);
                            Object.entries(defs).forEach(([k, v]) => {
                                services[parseInt(k.split(':')[1])] = v;
                            });
                        }
                    }
                } catch(e) {}
            }
        }

        // 3. Ultra-Resilient Recovery: Fragments and Metadata
        if (!services || services.length === 0 || services.every(s => !s)) {
            const metaSource = cred.permission_metadata || cred.metadata;
            let directModular = cred.modular_permissions || [];
            if (typeof directModular === 'string') {
                try { directModular = JSON.parse(directModular); } catch(e) { directModular = []; }
            }
            if (!Array.isArray(directModular)) directModular = [];
            
            // Fragmented Base64 Recovery (v=166 logic)
            const chunks = directModular.filter(p => typeof p === 'string' && p.startsWith('_M')).sort((a,b) => {
                const numA = parseInt(a.substring(2).match(/^\d+/)?.[0] || '0');
                const numB = parseInt(b.substring(2).match(/^\d+/)?.[0] || '0');
                return numA - numB;
            });

            if (chunks.length > 0) {
                try {
                    let b64 = chunks.map(c => c.substring(2).replace(/^\d+/, '')).join('');
                    b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
                    while (b64.length % 4) b64 += '=';
                    const fullJson = decodeURIComponent(escape(atob(b64)));
                    const decoded = JSON.parse(fullJson);
                    Object.entries(decoded).forEach(([k, v]) => {
                        const idx = parseInt(k.split(':')[1]);
                        if (services.length <= idx) {
                            const newArr = new Array(idx + 1).fill(null);
                            services.forEach((s, i) => newArr[i] = s);
                            services = newArr;
                        }
                        services[idx] = v;
                    });
                } catch(e) { console.error('recoverServices fragmented error:', e); }
            }

            // Legacy __DEFS__ hack
            const defsHack = directModular.find(p => typeof p === 'string' && p.startsWith('__DEFS__:'));
            if (defsHack) {
                try {
                    const decoded = JSON.parse(defsHack.substring(9));
                    Object.entries(decoded).forEach(([k, v]) => {
                        const idx = parseInt(k.split(':')[1]);
                        if (services.length <= idx) {
                             const newArr = new Array(idx + 1).fill(null);
                             services.forEach((s, i) => newArr[i] = s);
                             services = newArr;
                        }
                        services[idx] = v;
                    });
                } catch(e) {}
            }

            // Metadata source (permission_metadata)
            if ((!services || services.length === 0 || services.every(s => !s)) && metaSource) {
                try {
                    const meta = typeof metaSource === 'string' ? JSON.parse(metaSource) : metaSource;
                    if (meta.defs) {
                        const indices = Object.keys(meta.defs).map(k => parseInt(k.split(':')[1]));
                        if (indices.length > 0) {
                            const maxIdx = Math.max(...indices);
                            if (services.length <= maxIdx) services = new Array(maxIdx + 1).fill(null);
                            Object.entries(meta.defs).forEach(([k, v]) => {
                                services[parseInt(k.split(':')[1])] = v;
                            });
                        }
                    } else if (meta.services) {
                        services = Array.isArray(meta.services) ? meta.services : [];
                    }
                } catch(e) {}
            }
        }
    } catch (e) {
        console.error('recoverServices critical failure:', e);
    }
    
    cred.services = services || [];
    return cred.services;
};

window.renderCredentials = function(credentials) {
    if (typeof hideStates === 'function') hideStates();
    DOM.show(DOM.credentialsList);
    DOM.credentialsList.innerHTML = '';

    // Filter out system credentials from view (v=147)
    const displayList = (credentials || []).filter(c => c.name !== '_SYSTEM_2FA_');

    if (displayList.length === 0) {
        DOM.credentialsList.innerHTML = '<div style="text-align:center;padding:30px;color:#7f8c8d">No credentials found matching your criteria.</div>';
        return;
    }

    const isAdmin = AppState.currentUser && (AppState.currentUser.is_admin || AppState.currentUser.email === 'admin@admin.com');

    displayList.forEach(cred => {
        const services = window.recoverServices(cred);

        const item = document.createElement('div');
        item.className = 'credential-card';
        if (cred.permission_level) {
            item.style.borderLeft = '3px solid #9b59b6';
        }

        const canShare = window.hasPermission(cred, 'share');
        
        const safeName = (cred.name || '').replace(/</g, '&lt;');
        const sharedWithYouBadge = cred.permission_level ? `<span style="font-size:10px; background:#9b59b6; color:white; padding:1px 4px; border-radius:3px; margin-left:5px; vertical-align:middle;">SHARED WITH YOU</span>` : '';
        const safeUser = (cred.username || '').replace(/</g, '&lt;');
        const groupLabel = cred.group_name ? `<span class="card-meta-group" style="font-size:11px;background:#eef2f5;padding:2px 6px;border-radius:10px;margin-left:8px">${cred.group_name}</span>` : '';
        const servicesLabel = (services.length > 0) ? `<span style="font-size:11px;background:#e8f4fd;color:#2980b9;padding:2px 6px;border-radius:10px;margin-left:8px">${services.length} services</span>` : '';

        const isOwner = cred.is_personal || isAdmin || AppState.currentView === 'personal';
        const deleteBtnHtml = isOwner ? `<span class="icon btn-delete-cred" data-id="${cred.id}" style="color:#e74c3c; cursor:pointer; font-size:14px; margin-left:10px;" title="Delete Credential">\uD83D\uDDD1\uFE0F</span>` : '';

        const isSelected = AppState.selectedCredentialId == cred.id;
        if (isSelected) item.classList.add('active');

        // Clean up notes for display - handle both formats and corrupted leftovers
        let displayNotes = (cred.notes || '').trim();
        // Clean new format
        displayNotes = displayNotes.replace(/###MODULAR_PERMS###[\s\S]*?###MODULAR_PERMS###/g, '');
        // Clean old format and potential corrupted leftovers (like }}] or }} ]] )
        displayNotes = displayNotes.replace(/\[MODULAR_PERMS:[\s\S]*?\](\s*\}\}\s*\]+)?/g, '');
        // Final pass for any hanging }} ]]
        displayNotes = displayNotes.replace(/\s*\}\}\s*\]+\s*/g, '').trim();

        item.innerHTML = `
            <div class="card-compact">
                <div class="card-header" style="display:flex; align-items:center;">
                    <div class="card-expand-icon" data-action="toggle-expand" style="width:20px; font-size:10px;">${isSelected ? '&#9660;' : '\u25B6'}</div>
                    <div class="card-name" style="font-weight:600; font-size:15px;">${safeName}${sharedWithYouBadge}</div>
                    <div style="display:flex; gap:5px; margin-left:8px;">${groupLabel}${servicesLabel}</div>
                    <div style="margin-left:auto;">
                        ${deleteBtnHtml}
                    </div>
                </div>
                <div class="card-host" style="display:flex; align-items:center; gap:8px; margin-left:20px; margin-top:2px;">
                    <span style="color:#636e72; font-size:12px;">Host:</span> <span style="font-weight:500; font-size:12px;">${cred.host || 'N/A'}</span>
                    ${cred.host ? `<button class="btn-icon-small btn-copy-host" title="Copy Host/IP" style="background:none; border:none; color:#3498db; cursor:pointer;">\uD83D\uDCCB</button>` : ''}
                </div>
                <div style="margin-left:20px; margin-top:5px;">
                    ${cred.environment ? `<span style="display:inline-block; padding:2px 6px; font-size:9px; font-weight:bold; border-radius:3px; background:${cred.environment === 'Production' ? '#e74c3c' : '#2ecc71'}; color:white;">${cred.environment.toUpperCase()}</span>` : ''}
                </div>
                
                <div class="card-expanded" style="display: ${isSelected ? 'flex' : 'none'}; flex-direction:row; justify-content:space-between; align-items:flex-start; margin-top:12px; border-top:1px solid #eee; padding-top:12px;">
                    <div class="card-info" style="flex:1;">
                        ${window.hasPermission(cred, 'os') ? `<div class="card-username" style="font-family:monospace; font-size:14px; margin-bottom:8px;">User: <strong style="color:#2d3436;">${safeUser}</strong></div>` : `<div style="color:#7f8c8d; font-size:12px; margin-bottom:8px;"><i>OS Credentials not shared</i></div>`}
                        <div class="card-notes" style="font-size:12px; color:#636e72; background:#f8f9fa; padding:10px; border-radius:6px; border:1px solid #eee; line-height:1.4;">${displayNotes || '<i>Sin notas adicionales</i>'}</div>
                    </div>
                    <div class="card-actions" style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; min-width:180px; margin-left:20px; align-items:center;">
                        ${window.hasPermission(cred, 'os') ? `
                            <button class="btn-action-new btn-copy-user" style="padding:6px 12px; border:1px solid #dcdde1; background:#fff; border-radius:4px; font-size:12px; font-weight:600; cursor:pointer;">Copy User</button>
                            <button class="btn-action-new btn-copy-pass" style="padding:6px 12px; border:none; background:#3498db; color:#fff; border-radius:4px; font-size:12px; font-weight:600; cursor:pointer;">Copy Pass</button>
                        ` : ''}
                        <button class="btn-action-new btn-details" style="padding:6px 12px; border:1px solid #dcdde1; background:#fff; border-radius:4px; font-size:12px; font-weight:600; cursor:pointer;">Details</button>
                        ${window.hasPermission(cred, 'deploy') ? `
                            <button class="btn-action-new btn-rotate" style="width:32px; height:32px; border:none; background:#2ecc71; color:#fff; border-radius:4px; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center;" title="Rotate Password">\u21BB</button>
                            <button class="btn-action-new btn-deploy-key" style="width:32px; height:32px; border:none; background:#2980b9; color:#fff; border-radius:4px; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center;" title="Deploy SSH Key">\uD83D\uDD11</button>
                        ` : ''}
                        ${canShare ? `<button class="btn-action-new btn-share" style="padding:6px 12px; border:1px solid #dcdde1; background:#fff; border-radius:4px; font-size:12px; font-weight:600; cursor:pointer;">Share</button>` : ''}
                        ${(isOwner || window.hasPermission(cred, 'edit')) ? `<button class="btn-action-new btn-edit" style="width:32px; height:32px; border:none; background:#f39c12; color:#fff; border-radius:4px; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center;" title="Edit">\u270E</button>` : ''}
                    </div>
                </div>
            </div>
        `;

        // Click handlers
        item.querySelector('.card-header').addEventListener('click', () => toggleExpand(item, cred));
        item.querySelector('.btn-copy-host')?.addEventListener('click', (e) => { e.stopPropagation(); copyToClipboard(cred.host); });
        item.querySelector('.btn-copy-user')?.addEventListener('click', (e) => { e.stopPropagation(); copyToClipboard(cred.username); });
        item.querySelector('.btn-copy-pass')?.addEventListener('click', (e) => { e.stopPropagation(); copyToClipboard(cred.password); });
        
        item.querySelectorAll('.btn-copy-mini').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyToClipboard(btn.dataset.copy);
            });
        });

        item.querySelector('.btn-details')?.addEventListener('click', (e) => { e.stopPropagation(); window.showDetailsPanel(cred); });
        item.querySelector('.btn-share')?.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            console.log('Share button clicked for cred:', cred.id);
            window.openShareModal(cred); 
        });
        item.querySelector('.btn-rotate')?.addEventListener('click', (e) => { e.stopPropagation(); if (typeof handleRotatePassword === 'function') handleRotatePassword(cred); });
        item.querySelector('.btn-deploy-key')?.addEventListener('click', (e) => { e.stopPropagation(); if (typeof handleDeployKey === 'function') handleDeployKey(cred); });
        item.querySelector('.btn-edit')?.addEventListener('click', (e) => { e.stopPropagation(); AppState.editingCredential = cred; if (typeof openModal === 'function') openModal('credential', cred); });
        item.querySelector('.btn-delete-cred')?.addEventListener('click', (e) => { e.stopPropagation(); if (typeof handleDeleteCredential === 'function') handleDeleteCredential(cred); });

        DOM.credentialsList.appendChild(item);
    });
};

window.toggleExpand = function(item, cred) {
    const expandedSection = item.querySelector('.card-expanded');
    const expandIcon = item.querySelector('.card-expand-icon');
    const isExpanded = item.dataset.expanded === 'true';

    if (isExpanded) {
        expandedSection.style.display = 'none';
        expandIcon.innerHTML = '\u25B6';
        item.dataset.expanded = 'false';
        item.classList.remove('active');
        if (AppState.selectedCredentialId == cred.id) AppState.selectedCredentialId = null;
    } else {
        document.querySelectorAll('.credential-card[data-expanded="true"]').forEach(card => {
            card.querySelector('.card-expanded').style.display = 'none';
            card.querySelector('.card-expand-icon').innerHTML = '\u25B6';
            card.dataset.expanded = 'false';
            card.classList.remove('active');
        });

        expandedSection.style.display = 'flex';
        expandIcon.innerHTML = '&#9660;';
        item.dataset.expanded = 'true';
        item.classList.add('active');
        AppState.selectedCredentialId = cred.id;
    }
};

window.showDetailsPanel = async function(credential) {
    const panel = document.getElementById('detailsPanel');
    if (!panel) return;

    // v=158: RECOVERY - Force recovery of granular metadata before showing panel
    if (typeof window.recoverGranularMetadata === 'function') {
        await window.recoverGranularMetadata(credential);
    }

    // Robust services extraction for details panel using centralized logic
    const services = window.recoverServices(credential);
    

    document.getElementById('detailName').textContent = credential.name;
    const hostEl = document.getElementById('detailHost');
    if (hostEl) hostEl.textContent = credential.host || '-';
    document.getElementById('detailUsername').textContent = credential.username || '-';
    
    const passEl = document.getElementById('detailPassword');
    if (passEl) {
        passEl.textContent = '******';
        passEl.dataset.password = credential.password || '';
        passEl.dataset.visible = 'false';
    }

    const copyPassBtn = document.getElementById('copyPassword');
    if (copyPassBtn) {
        if (!window.hasPermission(credential, 'os')) {
            copyPassBtn.style.display = 'none';
        } else {
            copyPassBtn.style.display = 'inline-block';
            copyPassBtn.onclick = () => copyToClipboard(credential.password || '');
        }
        
        // Add a show/hide button if not already there
        let toggleBtn = document.getElementById('btnToggleDetailPass');
        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'btnToggleDetailPass';
            toggleBtn.className = 'btn-copy';
            toggleBtn.style.marginLeft = '5px';
            toggleBtn.style.background = '#7f8c8d';
            toggleBtn.textContent = 'Ver';
            copyPassBtn.parentNode.appendChild(toggleBtn);
        }
        
        if (!window.hasPermission(credential, 'os')) {
            toggleBtn.style.display = 'none';
            if (passEl) passEl.textContent = 'No compartido';
        } else {
            toggleBtn.style.display = 'inline-block';
            toggleBtn.onclick = () => {
                const isVisible = passEl.dataset.visible === 'true';
                passEl.textContent = isVisible ? '******' : passEl.dataset.password;
                passEl.dataset.visible = isVisible ? 'false' : 'true';
                toggleBtn.textContent = isVisible ? 'Ver' : 'Ocultar';
            };
        }
    }
    
    const copyUserBtn = document.getElementById('copyUsername');
    if (copyUserBtn) {
        if (!window.hasPermission(credential, 'os')) {
            copyUserBtn.style.display = 'none';
            if (document.getElementById('detailUsername')) document.getElementById('detailUsername').textContent = 'No compartido';
        } else {
            copyUserBtn.style.display = 'inline-block';
            copyUserBtn.onclick = () => copyToClipboard(credential.username || '');
        }
    }
    const copyHostBtn = document.getElementById('copyHost');
    if (copyHostBtn) copyHostBtn.onclick = () => copyToClipboard(credential.host || '');

    // Clean up notes for display - handle both formats and corrupted leftovers
    let displayNotes = (credential.notes || '').trim();
    // Clean new format
    displayNotes = displayNotes.replace(/###MODULAR_PERMS###[\s\S]*?###MODULAR_PERMS###/g, '');
    // Clean old format and potential corrupted leftovers (like }}] )
    displayNotes = displayNotes.replace(/\[MODULAR_PERMS:[\s\S]*?\](\s*\}\}\])?/g, '');
    displayNotes = displayNotes.trim();
    document.getElementById('detailNotes').textContent = displayNotes || 'No notes';
    
    const servicesContainer = document.getElementById('detailServices');
    if (servicesContainer) {
        if (services.length > 0) {
            servicesContainer.innerHTML = `<h4 style="color:#bdc3c7; border-bottom:1px solid #34495e; padding-bottom:5px; margin-bottom:15px; font-size:12px; text-transform:uppercase; letter-spacing:1px;">Additional Services</h4>`;
            services.forEach((svc, index) => {
                if (!window.hasPermission(credential, `svc:${index}`)) return;

                const svcDiv = document.createElement('div');
                svcDiv.className = 'service-detail-block';
                svcDiv.style.marginBottom = '20px';
                svcDiv.style.padding = '10px';
                svcDiv.style.background = '#2c3e50';
                svcDiv.style.borderRadius = '4px';
                svcDiv.style.border = '1px solid #34495e';
                
                svcDiv.innerHTML = `
                    <div style="font-weight:bold; color:#3498db; margin-bottom:10px; font-size:13px; display:flex; justify-content:space-between;">
                        <span>${svc.name} (${svc.type.toUpperCase()})</span>
                        <span style="color:#7f8c8d; font-size:11px;">${svc.host}</span>
                    </div>
                    <div class="detail-row" style="margin-bottom:8px;">
                        <label style="font-size:11px;">Username</label>
                        <div class="detail-value-box">
                            <span style="font-size:13px;">${svc.username || '-'}</span>
                            <button class="btn-copy" onclick="copyToClipboard('${svc.username || ''}')">Copy</button>
                        </div>
                    </div>
                    <div class="detail-row">
                        <label style="font-size:11px;">Password</label>
                        <div class="detail-value-box">
                            <span style="font-size:13px;">******</span>
                            <button class="btn-copy" onclick="copyToClipboard('${svc.password || ''}')">Copy</button>
                            ${['mysql', 'mariadb', 'postgresql', 'postgres', 'sqlserver', 'sql', 'oracle', 'mongodb', 'database', 'db'].includes((svc.type || '').toLowerCase()) ? '' : `
                            <button class="btn-copy" style="background:#e67e22; margin-left:5px;" title="Rotate Service Password" 
                                    onclick="if(confirm('¿Rotar contraseña de ${svc.name}?')) handleRotateServicePassword(AppState.currentDetailedCredential, ${index})">
                                🔄
                            </button>
                            `}
                        </div>
                    </div>
                `;
                servicesContainer.appendChild(svcDiv);
            });
        } else {
            servicesContainer.innerHTML = '';
        }
    }
    
    panel.style.display = 'flex';
    
    
    const rotateBtn = document.getElementById('btnDetailRotate');
    if (rotateBtn) {
        rotateBtn.onclick = () => { if (typeof handleRotatePassword === 'function') handleRotatePassword(credential); };
    }

    // v=173: DEBUG INFO FOR USER
    const debugInfo = `ID: ${credential.id} | Perm: ${credential.permission_level || 'OWNER'} | Meta: ${!!credential.permission_metadata || !!credential.metadata}`;
    const debugEl = document.getElementById('detailDebugInfo') || document.createElement('div');
    debugEl.id = 'detailDebugInfo';
    debugEl.style.fontSize = '9px';
    debugEl.style.color = '#7f8c8d';
    debugEl.style.marginTop = '10px';
    debugEl.style.padding = '5px';
    debugEl.style.borderTop = '1px dashed #eee';
    debugEl.textContent = debugInfo;
    panel.querySelector('.panel-content')?.appendChild(debugEl);

    AppState.currentDetailedCredential = credential;
};

window.closeDetailsPanel = function() {
    const panel = document.getElementById('detailsPanel');
    if (panel) panel.style.display = 'none';
};


