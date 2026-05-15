const { app, BrowserWindow, session, clipboard } = require("electron");
app.commandLine.appendSwitch('ignore-certificate-errors');
const path = require("path");
const fs = require("fs");

// Simple .env loader since we can't install dotenv
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    envContent.split("\n").forEach(line => {
        const [key, ...valueParts] = line.split("=");
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join("=").trim();
        }
    });
}

// Config file path in user data
const userDataPath = app.getPath("userData");
const configPath = path.join(userDataPath, "config.json");

function getPersistedSettings() {
    if (fs.existsSync(configPath)) {
        try {
            return JSON.parse(fs.readFileSync(configPath, "utf8"));
        } catch (e) {
            console.error("Error reading config:", e);
        }
    }
    return {};
}

function savePersistedSettings(settings) {
    try {
        const current = getPersistedSettings();
        const updated = { ...current, ...settings };
        fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
        return true;
    } catch (e) {
        console.error("Error saving config:", e);
        return false;
    }
}

const { ipcMain } = require("electron");
ipcMain.handle("save-settings", (event, settings) => {
    return savePersistedSettings(settings);
});

ipcMain.handle("get-settings", () => {
    return getPersistedSettings();
});

ipcMain.handle("clear-clipboard", () => {
    try {
        clipboard.clear();
        return true;
    } catch (e) {
        console.error("Error clearing clipboard:", e);
        return false;
    }
});

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1300,
        height: 850,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        },
        title: "Kristoff"
    });

    mainWindow.loadFile(path.join(__dirname, "src/ui/index.html"));
    // mainWindow.webContents.openDevTools();
    // mainWindow.webContents.openDevTools(); // Optional: close for production

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    // Intentar limpiar caché pero no bloquear el inicio
    if (session.defaultSession) {
        session.defaultSession.clearCache();
    }
    createWindow();
});

app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
    // Check both .env and persisted settings
    const settings = getPersistedSettings();
    const envBackend = process.env.BACKEND_URL || "https://10.100.18.136";
    const persistedBackend = settings.backendUrl || "";
    
    // Only ignore errors for our specific backend IP/URL
    if (url.startsWith(envBackend) || (persistedBackend && url.startsWith(persistedBackend))) {
        event.preventDefault();
        callback(true);
    } else {
        callback(false);
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
