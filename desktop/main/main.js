/**
 * YT Ad Helper - Electron Main Process
 * Desktop Controller for YouTube Ad Skip & Protection Engine.
 * Manages Windows Named Pipe IPC, System Tray, Window Lifecycle, and Native Messaging Host Bridge.
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { execSync } = require('child_process');

const PIPE_NAME = '\\\\.\\pipe\\yt_ad_helper_pipe';
const APP_TITLE = 'YT Ad Helper';
const EXTENSION_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'extension')
  : (fs.existsSync(path.resolve(__dirname, '../../extension')) ? path.resolve(__dirname, '../../extension') : path.resolve(__dirname, '../../'));
const NATIVE_HOST_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'native-host')
  : path.resolve(__dirname, '../../native-host');
const CONFIG_FILE = path.join(app.getPath('userData'), 'app-config.json');

// Ensure icon assets are generated
try {
  const iconPath = path.join(__dirname, '../assets/icon.png');
  if (!fs.existsSync(iconPath)) {
    require('../assets/generate-icons.js');
  }
} catch (e) {}

let mainWindow = null;
let tray = null;
let isQuitting = false;
let pipeServer = null;
let activeHostSocket = null;
let shownTrayNotice = false;

// Controller State
let appState = {
  enabled: true,
  extensionConnected: false,
  detectedCount: 0,
  handledCount: 0,
  autoSkip: true,
  fastForward: true,
  hideOverlayAds: true,
  autoStartWithWindows: false,
  minimizeToTray: true,
  lastSyncTime: Date.now()
};

// Load saved config
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      appState = { ...appState, ...data };
    }
  } catch (e) {}
}

function saveConfig() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(appState, null, 2), 'utf8');
  } catch (e) {}
}

loadConfig();

// ==========================================
// Windows Named Pipe IPC Server (Native Host)
// ==========================================
function startNamedPipeServer() {
  if (pipeServer) return;

  pipeServer = net.createServer((socket) => {
    activeHostSocket = socket;
    appState.extensionConnected = true;
    broadcastState();
    updateTrayMenu();

    let pipeBuffer = '';
    socket.on('data', (chunk) => {
      pipeBuffer += chunk.toString('utf8');
      const lines = pipeBuffer.split('\n');
      pipeBuffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          handleHostMessage(msg);
        } catch (e) {}
      }
    });

    socket.on('close', () => {
      if (activeHostSocket === socket) {
        activeHostSocket = null;
        appState.extensionConnected = false;
        broadcastState();
        updateTrayMenu();
      }
    });

    socket.on('error', () => {
      if (activeHostSocket === socket) {
        activeHostSocket = null;
        appState.extensionConnected = false;
        broadcastState();
        updateTrayMenu();
      }
    });

    // Send initial configuration to connected native host
    sendCommandToHost({ type: 'SET_ENABLED', enabled: appState.enabled });
    sendCommandToHost({ type: 'GET_STATS' });
  });

  pipeServer.on('error', (err) => {
    console.error('[YT Ad Helper] Pipe server error:', err.message);
  });

  try {
    pipeServer.listen(PIPE_NAME);
  } catch (e) {}
}

function sendCommandToHost(command) {
  if (activeHostSocket && !activeHostSocket.destroyed) {
    try {
      activeHostSocket.write(JSON.stringify(command) + '\n');
    } catch (e) {}
  }
}

function handleHostMessage(msg) {
  if (!msg || !msg.type) return;

  if (msg.type === 'STATUS') {
    appState.enabled = msg.enabled !== false;
    appState.extensionConnected = true;
    broadcastState();
    updateTrayMenu();
  } else if (msg.type === 'STATS') {
    appState.detectedCount = msg.detected || appState.detectedCount;
    appState.handledCount = msg.handled || appState.handledCount;
    appState.extensionConnected = true;
    broadcastState();
  }
}

function broadcastState() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('state-update', appState);
  }
}

// ==========================================
// Windows Registry Host Registration Helper
// ==========================================
function registerNativeHostInRegistry() {
  try {
    const bridgeScript = path.join(NATIVE_HOST_DIR, 'setup-bridge.js');
    if (fs.existsSync(bridgeScript)) {
      require(bridgeScript);
      return { success: true };
    }
  } catch (err) {
    try {
      const regScript = path.join(NATIVE_HOST_DIR, 'register-host.js');
      if (fs.existsSync(regScript)) {
        require(regScript);
        return { success: true };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'Registration script not found' };
}

// ==========================================
// Local Sync Server (127.0.0.1:49271)
// ==========================================
let localSyncServer = null;

function startLocalSyncServer() {
  if (localSyncServer) return;

  localSyncServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === '/status' || req.url === '/') {
      appState.extensionConnected = true;
      broadcastState();
      updateTrayMenu();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        type: 'STATUS',
        enabled: appState.enabled,
        connected: true,
        detected: appState.detectedCount,
        handled: appState.handledCount
      }));
      return;
    }

    if (req.url === '/stats' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (typeof data.detected === 'number') appState.detectedCount = data.detected;
          if (typeof data.handled === 'number') appState.handledCount = data.handled;
          if (typeof data.enabled === 'boolean') appState.enabled = data.enabled;
          appState.extensionConnected = true;
          broadcastState();
          updateTrayMenu();
        } catch (e) {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, enabled: appState.enabled }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  localSyncServer.listen(49271, '127.0.0.1', () => {
    console.log('[YT Ad Helper] Local sync bridge listening on http://127.0.0.1:49271');
  });

  localSyncServer.on('error', (err) => {
    console.log('[YT Ad Helper] Local sync bridge port notice:', err.message);
  });
}

// ==========================================
// Main Window Creation
// ==========================================
function createMainWindow() {
  const iconPath = path.join(__dirname, '../assets/icon.png');

  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 840,
    minHeight: 580,
    frame: false,
    backgroundColor: '#0f0f0f',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('close', (event) => {
    if (!isQuitting && appState.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();

      if (!shownTrayNotice && tray) {
        shownTrayNotice = true;
        try {
          tray.displayBalloon({
            title: 'YT Ad Helper',
            content: 'Protection continues running in the system tray.'
          });
        } catch (e) {}
      }
    }
  });
}

// ==========================================
// System Tray Setup
// ==========================================
function createSystemTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  const fallbackIcon = path.join(__dirname, '../assets/icon.png');
  const chosenIcon = fs.existsSync(iconPath) ? iconPath : (fs.existsSync(fallbackIcon) ? fallbackIcon : undefined);

  if (!chosenIcon) return;

  tray = new Tray(chosenIcon);
  tray.setToolTip(`${APP_TITLE} - ${appState.enabled ? 'Protection Active' : 'Protection Paused'}`);

  updateTrayMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const isEnabled = appState.enabled && appState.extensionConnected;
  const statusLabel = isEnabled ? '● Protection: ACTIVE' : (appState.enabled ? '⚠ Extension: WAITING' : '○ Protection: OFF');

  const contextMenu = Menu.buildFromTemplate([
    { label: APP_TITLE, enabled: false },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: 'Enable Protection',
      enabled: !appState.enabled,
      click: () => {
        appState.enabled = true;
        saveConfig();
        sendCommandToHost({ type: 'SET_ENABLED', enabled: true });
        broadcastState();
        updateTrayMenu();
      }
    },
    {
      label: 'Disable Protection',
      enabled: appState.enabled,
      click: () => {
        appState.enabled = false;
        saveConfig();
        sendCommandToHost({ type: 'SET_ENABLED', enabled: false });
        broadcastState();
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Open YouTube',
      click: () => {
        shell.openExternal('https://www.youtube.com');
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`${APP_TITLE} - ${appState.enabled ? 'Active' : 'Paused'}`);
}

// ==========================================
// IPC Handlers (Renderer -> Main)
// ==========================================
function setupIpcHandlers() {
  ipcMain.handle('get-state', () => {
    return { ...appState, extensionPath: EXTENSION_DIR };
  });

  ipcMain.handle('set-enabled', (event, enabled) => {
    appState.enabled = Boolean(enabled);
    saveConfig();
    sendCommandToHost({ type: 'SET_ENABLED', enabled: appState.enabled });
    broadcastState();
    updateTrayMenu();
    return { success: true, enabled: appState.enabled };
  });

  ipcMain.handle('reset-stats', () => {
    appState.detectedCount = 0;
    appState.handledCount = 0;
    saveConfig();
    sendCommandToHost({ type: 'RESET_STATS' });
    broadcastState();
    return { success: true };
  });

  ipcMain.handle('open-youtube', () => {
    shell.openExternal('https://www.youtube.com');
    return { success: true };
  });

  ipcMain.handle('open-extension-setup', () => {
    // Open Chrome Extensions management page and highlight extension directory
    shell.openExternal('chrome://extensions');
    shell.openPath(EXTENSION_DIR);
    return { success: true };
  });

  ipcMain.handle('register-native-host', () => {
    return registerNativeHostInRegistry();
  });

  ipcMain.handle('save-settings', (event, newSettings) => {
    appState = { ...appState, ...newSettings };
    saveConfig();

    if ('autoStartWithWindows' in newSettings) {
      app.setLoginItemSettings({
        openAtLogin: Boolean(appState.autoStartWithWindows)
      });
    }

    broadcastState();
    return { success: true };
  });

  // Window Controls
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });
}

// ==========================================
// Application Lifecycle
// ==========================================
app.whenReady().then(() => {
  // Ensure native host registry configuration is active
  registerNativeHostInRegistry();

  startNamedPipeServer();
  startLocalSyncServer();
  setupIpcHandlers();
  createMainWindow();
  createSystemTray();

  // Apply auto-start setting
  if (appState.autoStartWithWindows) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (pipeServer) {
    try { pipeServer.close(); } catch (e) {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && (!appState.minimizeToTray || isQuitting)) {
    app.quit();
  }
});
