/**
 * YT Ad Helper - Native Messaging Host
 * Connects Google Chrome / Edge with the Electron Desktop Application.
 * Communicates via 4-byte framed stdio with Chrome and Windows Named Pipe with Electron.
 */

const fs = require('fs');
const path = require('path');
const net = require('net');

const PIPE_NAME = '\\\\.\\pipe\\yt_ad_helper_pipe';
const STATE_FILE = path.join(__dirname, 'state.json');

// Strict command allowlist per security specification
const ALLOWED_APP_COMMANDS = new Set(['SET_ENABLED', 'GET_STATUS', 'GET_STATS', 'RESET_STATS']);
const ALLOWED_EXT_MESSAGES = new Set(['STATUS', 'STATS', 'AD_HANDLED']);

// Fallback state if Electron app is not running
let localState = {
  enabled: true,
  connected: false,
  detectedCount: 0,
  handledCount: 0,
  lastUpdated: Date.now()
};

// Load cached state if exists
try {
  if (fs.existsSync(STATE_FILE)) {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    localState = { ...localState, ...JSON.parse(raw) };
  }
} catch (e) {}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(localState, null, 2), 'utf8');
  } catch (e) {}
}

let pipeClient = null;
let isConnectedToApp = false;

// Connect to Electron Desktop App via Windows Named Pipe
function connectToDesktopApp() {
  if (pipeClient) return;

  pipeClient = net.connect(PIPE_NAME, () => {
    isConnectedToApp = true;
    localState.connected = true;
    // Request current settings from app
    sendToApp({ type: 'HOST_CONNECTED' });
  });

  let pipeBuffer = '';
  pipeClient.on('data', (chunk) => {
    pipeBuffer += chunk.toString('utf8');
    const lines = pipeBuffer.split('\n');
    pipeBuffer = lines.pop(); // Keep incomplete trailing fragment

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        handleAppMessage(msg);
      } catch (err) {}
    }
  });

  pipeClient.on('error', () => {
    isConnectedToApp = false;
    localState.connected = false;
  });

  pipeClient.on('close', () => {
    isConnectedToApp = false;
    localState.connected = false;
    pipeClient = null;
    // Attempt reconnect after 2 seconds
    setTimeout(connectToDesktopApp, 2000);
  });
}

function sendToApp(message) {
  if (pipeClient && isConnectedToApp) {
    try {
      pipeClient.write(JSON.stringify(message) + '\n');
    } catch (e) {}
  }
}

// Handle message coming from Electron Desktop App -> Forward to Chrome Extension
function handleAppMessage(message) {
  if (!message || !message.type || !ALLOWED_APP_COMMANDS.has(message.type)) {
    return;
  }

  if (message.type === 'SET_ENABLED') {
    localState.enabled = Boolean(message.enabled);
    saveState();
  }

  // Forward to Chrome Extension via stdout (4-byte framed)
  sendNativeMessage(message);
}

// Handle message coming from Chrome Extension -> Forward to Electron Desktop App
function handleExtensionMessage(message) {
  if (!message || !message.type || !ALLOWED_EXT_MESSAGES.has(message.type)) {
    return;
  }

  if (message.type === 'STATUS') {
    localState.enabled = message.enabled !== false;
    localState.lastUpdated = Date.now();
    saveState();
  } else if (message.type === 'STATS') {
    localState.detectedCount = message.detected || localState.detectedCount;
    localState.handledCount = message.handled || localState.handledCount;
    localState.lastUpdated = Date.now();
    saveState();
  }

  // Forward to desktop app
  sendToApp(message);
}

/**
 * Sends a length-prefixed JSON message to Chrome Extension via stdout.
 * Native Messaging protocol: 4-byte UInt32LE length prefix + UTF-8 payload.
 */
function sendNativeMessage(msg) {
  try {
    const jsonStr = JSON.stringify(msg);
    const byteLen = Buffer.byteLength(jsonStr, 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(byteLen, 0);

    process.stdout.write(header);
    process.stdout.write(jsonStr);
  } catch (err) {}
}

/**
 * Reads length-prefixed JSON messages from Chrome Extension via stdin.
 * Uses robust stream chunk buffering to handle segmented data without loss.
 */
function listenToChromeExtension() {
  let inputBuffer = Buffer.alloc(0);

  process.stdin.on('data', (chunk) => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);

    while (inputBuffer.length >= 4) {
      const messageLength = inputBuffer.readUInt32LE(0);
      if (messageLength <= 0 || messageLength > 10 * 1024 * 1024) {
        // Discard invalid header
        inputBuffer = Buffer.alloc(0);
        break;
      }

      if (inputBuffer.length < 4 + messageLength) {
        // Full message has not arrived yet, wait for more data
        break;
      }

      const payloadBuffer = inputBuffer.slice(4, 4 + messageLength);
      inputBuffer = inputBuffer.slice(4 + messageLength);

      try {
        const parsed = JSON.parse(payloadBuffer.toString('utf8'));
        handleExtensionMessage(parsed);
      } catch (err) {}
    }
  });

  process.stdin.on('end', () => {
    process.exit(0);
  });
}

// Start listener and connect to desktop app
connectToDesktopApp();
listenToChromeExtension();

// Initial handshake with extension
sendNativeMessage({ type: 'STATUS', enabled: localState.enabled, connected: isConnectedToApp });
sendNativeMessage({ type: 'STATS', detected: localState.detectedCount, handled: localState.handledCount });
