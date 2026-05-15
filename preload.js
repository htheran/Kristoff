const { contextBridge, ipcRenderer } = require("electron");
const api = require(__dirname + "/src/api/client");

contextBridge.exposeInMainWorld("api", {
    ...api,
    // v=183: Single-object signature to ensure payload integrity
    rotatePassword: (args) => api.rotatePassword(args),
    saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
    getSettings: () => ipcRenderer.invoke("get-settings"),
    clearClipboard: () => ipcRenderer.invoke("clear-clipboard")
});
