// Centralized DOM Element Selection
window.DOM = {
    // Screen containers
    loginScreen: document.getElementById('loginScreen'),
    appContainer: document.getElementById('appContainer'),
    
    // Login form
    loginForm: document.getElementById('loginForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    loginError: document.getElementById('loginError'),
    loginSubmit: document.getElementById('loginSubmit'),
    loginBtnText: document.querySelector('#loginSubmit .btn-text'),
    loginBtnLoading: document.querySelector('#loginSubmit .btn-loading'),
    
    // Server status
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    testConnectionBtn: document.getElementById('testConnectionBtn'),
    toggleServerConfigBtn: document.getElementById('toggleServerConfigBtn'),
    serverConfigBox: document.getElementById('serverConfigBox'),
    backendUrlInput: document.getElementById('backendUrlInput'),
    saveBackendUrlBtn: document.getElementById('saveBackendUrlBtn'),
    currentBackendDisplay: document.getElementById('currentBackendDisplay'),
    
    // Register form
    registerBox: document.getElementById('registerBox'),
    loginBox: document.querySelector('.login-box:not(#registerBox)'),
    registerForm: document.getElementById('registerForm'),
    registerEmail: document.getElementById('registerEmail'),
    registerPassword: document.getElementById('registerPassword'),
    registerPasswordConfirm: document.getElementById('registerPasswordConfirm'),
    registerCompany: document.getElementById('registerCompany'),
    registerBranch: document.getElementById('registerBranch'),
    registerError: document.getElementById('registerError'),
    registerSubmit: document.getElementById('registerSubmit'),
    registerBtnText: document.querySelector('#registerSubmit .btn-text'),
    registerBtnLoading: document.querySelector('#registerSubmit .btn-loading'),
    showRegisterBtn: document.getElementById('showRegisterBtn'),
    showLoginBtn: document.getElementById('showLoginBtn'),
    
    // Main App Lists
    companiesList: document.getElementById('companiesList'),
    personalList: document.getElementById('personalList'),
    branchesSection: document.getElementById('branchesSection'),
    branchesList: document.getElementById('branchesList'),
    groupsSection: document.getElementById('sidebarGroupsList') ? document.getElementById('sidebarGroupsList').parentElement : null,
    groupsList: document.getElementById('sidebarGroupsList'),
    credentialsList: document.getElementById('credentialsList'),
    logsList: document.getElementById('logsList'),
    btnShowLogs: document.getElementById('btnShowLogs'),
    
    // App States
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    emptyState: document.getElementById('emptyState'),
    retryBtn: document.getElementById('retryBtn'),
    
    // App Header/Controls
    searchInput: document.getElementById('searchInput'),
    logoutBtn: document.getElementById('logoutBtn'),
    addCompanyBtn: document.getElementById('addCompanyBtn'),
    addBranchBtn: document.getElementById('addBranchBtn'),
    addPersonalBtn: document.getElementById('addPersonalBtn'),
    addCredentialBtn: document.getElementById('addCredentialBtn'),
    panelTitle: document.getElementById('panelTitle'),
    panelSubtitle: document.getElementById('panelSubtitle'),
    breadcrumb: document.getElementById('breadcrumb'),
    
    // Admin
    pendingApprovalsSection: document.getElementById('pendingApprovalsSection'),
    pendingCount: document.getElementById('pendingCount'),
    pendingList: document.getElementById('pendingList'),
    
    // Modal
    createModal: document.getElementById('createModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalFields: document.getElementById('modalFields'),
    modalError: document.getElementById('modalError'),
    createForm: document.getElementById('createForm'),
    closeModal: document.getElementById('closeModal'),
    cancelModal: document.getElementById('cancelModal'),
    submitModal: document.getElementById('submitModal'),
    
    // Share Modal
    shareModal: document.getElementById('shareModal'),
    shareForm: document.getElementById('shareForm'),
    shareEmail: document.getElementById('share_email'),
    shareEmailManual: document.getElementById('share_email_manual'),
    shareEmailSelectContainer: document.getElementById('shareEmailSelectContainer'),
    shareEmailInputContainer: document.getElementById('shareEmailInputContainer'),
    toggleManualEmail: document.getElementById('toggleManualEmail'),
    sharePermission: document.getElementById('share_permission'),
    shareExpiresAt: document.getElementById('share_expires_at'),
    modularPermissionsContainer: document.getElementById('modularPermissionsContainer'),
    modularPermissionsList: document.getElementById('modularPermissionsList'),
    shareError: document.getElementById('shareError'),
    closeShareModal: document.getElementById('closeShareModal'),
    cancelShareModal: document.getElementById('cancelShareModal'),
    shareTitle: document.querySelector('#shareModal h3'),
    
    // User Profile
    userEmail: document.getElementById('userEmail'),
    userRole: document.getElementById('userRole'),
    userAvatar: document.getElementById('userAvatar'),
    userCompanyName: document.getElementById('userCompanyName'),
    userBranchName: document.getElementById('userBranchName'),
    
    // Active Users List
    activeUsersList: document.getElementById('activeUsersList'),

    // Helper functions
    show(el) { if (el) el.style.display = 'block'; },
    hide(el) { if (el) el.style.display = 'none'; },
    flex(el) { if (el) el.style.display = 'flex'; },
    
    setLoading(btn, textEl, loadingEl, isLoading) {
        if (!btn) return;
        btn.disabled = isLoading;
        if (textEl) textEl.style.display = isLoading ? 'none' : 'inline';
        if (loadingEl) loadingEl.style.display = isLoading ? 'inline' : 'none';
    }
};
