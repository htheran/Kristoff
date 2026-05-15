// Global Application State
window.AppState = {
    selectedCompany: null,
    selectedBranch: null,
    selectedGroup: null,
    allCredentials: [],
    isPersonalView: false,
    currentUser: null,
    userCompany: null,
    userBranch: null,
    predefinedGroups: [],
    currentSharingCredential: null,
    currentModalType: null,
    companies: [],
    branches: [],
    allBranches: [],
    approvedUsers: [],
    groups: [],
    selectedCredentialId: null,
    is2FAVerified: false,
    debugMode: true,
    groupShareRules: [],

    // State helper methods
    reset() {
        this.selectedCompany = null;
        this.selectedBranch = null;
        this.selectedGroup = null;
        this.allCredentials = [];
        this.currentUser = null;
        this.userCompany = null;
        this.userBranch = null;
        this.currentModalType = null;
        this.approvedUsers = [];
        this.groupShareRules = [];
    }
};
