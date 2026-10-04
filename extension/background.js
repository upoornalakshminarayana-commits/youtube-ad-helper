/**
 * YouTube Ad Helper - Background Service Worker (Manifest V3)
 * Manages default extension state, action badges, and lifecycle events.
 */

const DEFAULTS = {
  enabled: true,
  autoSkip: true,
  fastForward: true,
  hideOverlayAds: true,
  showBadge: true,
  debug: false,
  detectedCount: 0,
  handledCount: 0
};

/**
 * Updates the action badge on the toolbar icon.
 */
async function updateBadge(showBadge, count, isEnabled) {
  try {
    if (!showBadge) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }

    if (!isEnabled) {
      await chrome.action.setBadgeText({ text: 'OFF' });
      await chrome.action.setBadgeBackgroundColor({ color: '#606060' });
      return;
    }

    if (count > 0) {
      const text = count > 999 ? '999+' : String(count);
      await chrome.action.setBadgeText({ text });
      await chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }
  } catch (err) {
    // Action might not be ready or badge update failed
  }
}

// Lifecycle: Install & Update
chrome.runtime.onInstalled.addListener(async (details) => {
  const current = await chrome.storage.local.get(null);
  const initialized = { ...DEFAULTS, ...current };
  await chrome.storage.local.set(initialized);
  await updateBadge(initialized.showBadge, initialized.handledCount, initialized.enabled);
});

// ==========================================
// Native Messaging Host Bridge (Desktop App)
// ==========================================
const NATIVE_HOST_NAME = 'com.ytadhelper.nativehost';
let nativePort = null;
let nativeReconnectTimer = null;

function sendToNativeHost(message) {
  if (nativePort) {
    try {
      nativePort.postMessage(message);
    } catch (e) {
      nativePort = null;
    }
  }
}

const LOCAL_SYNC_URL = 'http://127.0.0.1:49271';

async function sendLocalStats() {
  try {
    const data = await chrome.storage.local.get(['detectedCount', 'handledCount', 'enabled']);
    await fetch(`${LOCAL_SYNC_URL}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        detected: data.detectedCount || 0,
        handled: data.handledCount || 0,
        enabled: data.enabled !== false
      })
    });
  } catch (e) {}
}

async function syncWithDesktopApp() {
  try {
    const res = await fetch(`${LOCAL_SYNC_URL}/status`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.enabled === 'boolean') {
        await chrome.storage.local.set({ enabled: data.enabled });
      }
    }
  } catch (e) {}
}

async function sendNativeStatus() {
  try {
    const data = await chrome.storage.local.get(['enabled']);
    sendToNativeHost({
      type: 'STATUS',
      enabled: data.enabled !== false,
      connected: true
    });
    sendLocalStats();
  } catch (e) {}
}

async function sendNativeStats() {
  try {
    const data = await chrome.storage.local.get(['detectedCount', 'handledCount', 'enabled']);
    sendToNativeHost({
      type: 'STATS',
      detected: data.detectedCount || 0,
      handled: data.handledCount || 0,
      enabled: data.enabled !== false
    });
    sendLocalStats();
  } catch (e) {}
}

function connectNativeHost() {
  // Always trigger parallel local bridge sync for immediate response
  syncWithDesktopApp();

  if (nativePort) return;
  if (!chrome.runtime.connectNative) return;

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener(async (msg) => {
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'SET_ENABLED':
          await chrome.storage.local.set({ enabled: Boolean(msg.enabled) });
          sendNativeStatus();
          sendNativeStats();
          break;

        case 'GET_STATUS':
          sendNativeStatus();
          break;

        case 'GET_STATS':
          sendNativeStats();
          break;

        case 'RESET_STATS':
          await chrome.storage.local.set({ detectedCount: 0, handledCount: 0 });
          sendNativeStats();
          break;

        case 'HOST_CONNECTED':
          sendNativeStatus();
          sendNativeStats();
          break;
      }
    });

    nativePort.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Disconnected';
      console.warn('[YT-HELPER] Native Host Disconnect:', err);
      nativePort = null;
      if (nativeReconnectTimer) clearTimeout(nativeReconnectTimer);
      nativeReconnectTimer = setTimeout(connectNativeHost, 4000);
      syncWithDesktopApp();
    });

    sendNativeStatus();
    sendNativeStats();
  } catch (err) {
    nativePort = null;
    if (nativeReconnectTimer) clearTimeout(nativeReconnectTimer);
    nativeReconnectTimer = setTimeout(connectNativeHost, 6000);
    syncWithDesktopApp();
  }
}

// Storage changes: Keep badge & native host synced
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  chrome.storage.local.get(['showBadge', 'handledCount', 'enabled']).then((data) => {
    updateBadge(data.showBadge, data.handledCount || 0, data.enabled);
    sendNativeStats();
    if (changes.enabled) {
      sendNativeStatus();
    }
  });
});

// Runtime messaging
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  if (message.action === 'AD_HANDLED') {
    chrome.storage.local.get(['showBadge', 'handledCount', 'enabled']).then((data) => {
      updateBadge(data.showBadge, (data.handledCount || 0), data.enabled);
      sendNativeStats();
    });
    sendResponse({ received: true });
    return true;
  }

  if (message.action === 'PING') {
    sendResponse({ status: 'PONG', version: '2.0.0' });
    return true;
  }

  return false;
});

// Connect native host on service worker start
connectNativeHost();
