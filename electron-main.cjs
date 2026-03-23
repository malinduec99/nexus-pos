const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Basic auto-updater config
// --- 🚀 NEW PERMANENT FIX FOR UPDATES 🚀 ---
autoUpdater.autoDownload = true;
autoUpdater.allowPrerelease = false;

// Function to notify renderer
function sendStatusToWindow(text, type = "info") {
    if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`if(window.showToast) window.showToast("${text}", "${type}"); else console.log("Update: ${text}");`);
    }
}

autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
    sendStatusToWindow(`New update v${info.version} available. Downloading...`, "info");
});

autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available.');
});

autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
    // Silent fail for updates to not annoy users
});

autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percentage + '%';
    console.log(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow(`Update v${info.version} downloaded and ready. It will install on next relaunch.`, "success");
    // Optionally ask to restart
    mainWindow.webContents.executeJavaScript(`
        if(confirm("New Update (v${info.version}) is ready to install. Restart now?")) {
            // We tell main to quit and install
            window.location.href = "mec-pos://update-and-restart";
        }
    `);
});

// Handle custom protocol or deep link for restart
app.on('open-url', (event, url) => {
    if (url.includes('update-and-restart')) {
        autoUpdater.quitAndInstall();
    }
});

function createWindow() {
    const isMaster = process.env.APP_TYPE === 'master';
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "NEXUS ERP",
        icon: path.join(__dirname, 'public/logo.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs') // We'll create this
        },
    });

    if (isMaster) {
        mainWindow.setFullScreen(true);
    } else {
        mainWindow.maximize();
    }

    // --- REQUIREMENT: Don't save login details (Clear session on launch) ---
    mainWindow.webContents.session.clearStorageData();
    mainWindow.webContents.session.clearCache();

    // To make it feel like a POS, we hide the menu bar completely
    Menu.setApplicationMenu(null);
    mainWindow.setMenuBarVisibility(false);

    // Check if we are in development mode
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
        // Load Vite dev server URL
        mainWindow.loadURL('http://localhost:5173/admin.html');
    } else {
        // PREFER ONLINE: Load the live hosted URL for automatic updates
        // Add cache-buster timestamp to ensure fresh load
        const liveUrl = `https://mec-nexus.web.app/admin?v=${Date.now()}`;
        mainWindow.loadURL(liveUrl).catch(() => {
            console.log("Offline: Loading local fallback...");
            mainWindow.loadFile(path.join(__dirname, 'dist/admin.html'));
        });
    }

    // Handle common external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://wa.me/') || url.startsWith('tel:')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}


app.on('ready', () => {
    createWindow();
    // Start update check after 10 seconds to ensure app is stable
    setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 10000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

