/**
 * YouTube Ad Helper - Popup Controller
 * Manages user interface, live settings synchronization, tab status, and stats reset.
 */

(function () {
  'use strict';

  // DOM Elements
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const toggleEnabled = document.getElementById('toggle-enabled');
  const toggleAutoSkip = document.getElementById('toggle-autoskip');
  const toggleFastForward = document.getElementById('toggle-fastforward');
  const toggleHideOverlays = document.getElementById('toggle-hideoverlays');
  const toggleDebug = document.getElementById('toggle-debug');
  const countDetected = document.getElementById('count-detected');
  const countHandled = document.getElementById('count-handled');
  const pageBadge = document.getElementById('page-badge');
  const pageBadgeText = document.getElementById('page-badge-text');
  const btnReset = document.getElementById('btn-reset');
  const extVersion = document.getElementById('ext-version');

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
   * Updates visual status indicators for enabled/disabled state.
   */
  function updateStatusDisplay(isEnabled) {
    if (isEnabled) {
      statusDot.classList.remove('disabled');
      statusText.classList.remove('disabled');
      statusText.textContent = 'Active';
    } else {
      statusDot.classList.add('disabled');
      statusText.classList.add('disabled');
      statusText.textContent = 'Disabled';
    }
  }

  /**
   * Renders settings into the popup DOM.
   */
  function renderSettings(settings) {
    toggleEnabled.checked = Boolean(settings.enabled);
    toggleAutoSkip.checked = Boolean(settings.autoSkip);
    toggleFastForward.checked = Boolean(settings.fastForward);
    toggleHideOverlays.checked = Boolean(settings.hideOverlayAds);
    toggleDebug.checked = Boolean(settings.debug);

    countDetected.textContent = (settings.detectedCount || 0).toLocaleString();
    countHandled.textContent = (settings.handledCount || 0).toLocaleString();

    updateStatusDisplay(settings.enabled);
  }

  /**
   * Checks current active tab to verify if user is on YouTube.
   */
  async function checkActiveTab() {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) {
      pageBadgeText.textContent = 'Local';
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        const url = new URL(tab.url);
        if (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')) {
          pageBadge.classList.add('active');
          if (url.pathname === '/watch') {
            pageBadgeText.textContent = 'YouTube (Watch) ✓';
          } else if (url.pathname.startsWith('/shorts/')) {
            pageBadgeText.textContent = 'YouTube (Shorts) ✓';
          } else {
            pageBadgeText.textContent = 'YouTube ✓';
          }
        } else {
          pageBadge.classList.remove('active');
          pageBadgeText.textContent = 'Not YouTube';
        }
      } else {
        pageBadgeText.textContent = 'Unknown Page';
      }
    } catch (err) {
      pageBadgeText.textContent = 'Offline';
    }
  }

  /**
   * Save setting update to chrome.storage.local
   */
  async function saveSetting(key, value) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [key]: value });
    }
  }

  /**
   * Initialize popup controller
   */
  async function init() {
    // Set version from manifest
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
      const manifest = chrome.runtime.getManifest();
      if (manifest && manifest.version && extVersion) {
        extVersion.textContent = `v${manifest.version}`;
      }
    }

    // Load initial settings
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(DEFAULTS);
      renderSettings({ ...DEFAULTS, ...data });

      // Listen for dynamic updates while popup is open
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        if (changes.enabled) {
          toggleEnabled.checked = Boolean(changes.enabled.newValue);
          updateStatusDisplay(changes.enabled.newValue);
        }
        if (changes.detectedCount) {
          countDetected.textContent = (changes.detectedCount.newValue || 0).toLocaleString();
        }
        if (changes.handledCount) {
          countHandled.textContent = (changes.handledCount.newValue || 0).toLocaleString();
        }
        if (changes.autoSkip) toggleAutoSkip.checked = Boolean(changes.autoSkip.newValue);
        if (changes.fastForward) toggleFastForward.checked = Boolean(changes.fastForward.newValue);
        if (changes.hideOverlayAds) toggleHideOverlays.checked = Boolean(changes.hideOverlayAds.newValue);
        if (changes.debug) toggleDebug.checked = Boolean(changes.debug.newValue);
      });
    }

    // Bind Event Listeners
    toggleEnabled.addEventListener('change', (e) => {
      const val = e.target.checked;
      updateStatusDisplay(val);
      saveSetting('enabled', val);
    });

    toggleAutoSkip.addEventListener('change', (e) => {
      saveSetting('autoSkip', e.target.checked);
    });

    toggleFastForward.addEventListener('change', (e) => {
      saveSetting('fastForward', e.target.checked);
    });

    toggleHideOverlays.addEventListener('change', (e) => {
      saveSetting('hideOverlayAds', e.target.checked);
    });

    toggleDebug.addEventListener('change', (e) => {
      saveSetting('debug', e.target.checked);
    });

    btnReset.addEventListener('click', async () => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ detectedCount: 0, handledCount: 0 });
        countDetected.textContent = '0';
        countHandled.textContent = '0';
        btnReset.textContent = 'Reset Done!';
        setTimeout(() => {
          btnReset.innerHTML = `
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
            </svg> Reset Stats
          `;
        }, 1200);
      }
    });

    // Check current active tab
    await checkActiveTab();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
