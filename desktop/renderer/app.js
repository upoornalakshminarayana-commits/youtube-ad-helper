/**
 * YT Ad Helper - Desktop Controller Renderer Logic
 * Reactive UI state management, IPC synchronization, and tab navigation.
 */

(function () {
  'use strict';

  const api = window.ytAdHelperAPI;

  // DOM Elements - Header & Titlebar
  const winMin = document.getElementById('win-min');
  const winMax = document.getElementById('win-max');
  const winClose = document.getElementById('win-close');
  const globalStatusPill = document.getElementById('global-status-pill');
  const globalStatusDot = document.getElementById('global-status-dot');
  const globalStatusText = document.getElementById('global-status-text');

  // DOM Elements - Dashboard
  const bannerWarning = document.getElementById('banner-extension-warning');
  const btnInstallExtBanner = document.getElementById('btn-install-ext-banner');
  const masterToggle = document.getElementById('master-toggle');
  const masterSwitchText = document.getElementById('master-switch-text');
  const heroPulse = document.getElementById('hero-pulse');
  const heroStatusLabel = document.getElementById('hero-status-label');
  const heroDesc = document.getElementById('hero-desc');
  const metaExtStatus = document.getElementById('meta-ext-status');

  const statDetected = document.getElementById('stat-detected');
  const statHandled = document.getElementById('stat-handled');
  const statEfficiency = document.getElementById('stat-efficiency');

  const btnOpenYtDash = document.getElementById('btn-open-youtube-dash');
  const btnOpenYtSidebar = document.getElementById('btn-open-youtube-sidebar');
  const btnResetStatsDash = document.getElementById('btn-reset-stats-dash');
  const btnResetStatsTab = document.getElementById('btn-reset-stats-tab');

  const statusHostReg = document.getElementById('status-host-reg');
  const statusExtConn = document.getElementById('status-ext-conn');

  // DOM Elements - Stats Tab
  const statsTabDetected = document.getElementById('stats-tab-detected');
  const statsTabHandled = document.getElementById('stats-tab-handled');
  const statsTabSaved = document.getElementById('stats-tab-saved');

  // DOM Elements - Setup Tab
  const extPathBox = document.getElementById('ext-path-box');
  const btnOpenExtSetup = document.getElementById('btn-open-ext-setup');
  const btnReRegisterHost = document.getElementById('btn-re-register-host');

  // DOM Elements - Settings Tab
  const toggleAutostart = document.getElementById('toggle-autostart');
  const toggleMinimizeTray = document.getElementById('toggle-minimize-tray');

  let currentState = {
    enabled: true,
    extensionConnected: false,
    detectedCount: 0,
    handledCount: 0,
    autoStartWithWindows: false,
    minimizeToTray: true,
    extensionPath: ''
  };

  /**
   * Updates the UI to reflect current state
   */
  function renderState(state) {
    currentState = { ...currentState, ...state };

    const isConnected = Boolean(currentState.extensionConnected);
    const isEnabled = Boolean(currentState.enabled);

    // 1. Titlebar status pill
    if (isConnected && isEnabled) {
      globalStatusDot.className = 'status-dot active';
      globalStatusText.textContent = 'ACTIVE';
      globalStatusText.style.color = '#00e676';
    } else if (!isEnabled) {
      globalStatusDot.className = 'status-dot paused';
      globalStatusText.textContent = 'PAUSED';
      globalStatusText.style.color = '#ffab00';
    } else {
      globalStatusDot.className = 'status-dot disconnected';
      globalStatusText.textContent = 'WAITING';
      globalStatusText.style.color = '#ff5252';
    }

    // 2. Master toggle switch
    masterToggle.checked = isEnabled;
    masterSwitchText.textContent = isEnabled ? 'ON' : 'OFF';

    // 3. Hero card status
    if (isConnected && isEnabled) {
      heroPulse.style.display = 'block';
      heroPulse.className = 'live-pulse';
      heroStatusLabel.textContent = 'YOUTUBE PROTECTION ACTIVE';
      heroStatusLabel.style.color = '#00e676';
      heroDesc.textContent = 'Automated high-speed ad skip, direct seek, and audio muting are actively protecting YouTube playback.';
    } else if (!isEnabled) {
      heroPulse.style.display = 'none';
      heroStatusLabel.textContent = 'PROTECTION PAUSED';
      heroStatusLabel.style.color = '#ffab00';
      heroDesc.textContent = 'Protection is paused. Normal YouTube ads will play until re-enabled.';
    } else {
      heroPulse.style.display = 'none';
      heroStatusLabel.textContent = 'CHROME EXTENSION REQUIRED';
      heroStatusLabel.style.color = '#ff5252';
      heroDesc.textContent = 'The desktop controller is active, waiting for the Chrome extension to connect.';
    }

    // 4. Warning banner
    if (!isConnected) {
      bannerWarning.style.display = 'flex';
      metaExtStatus.innerHTML = `
        <svg viewBox="0 0 16 16" width="12" height="12" fill="#ff5252"><circle cx="8" cy="8" r="7"/></svg>
        Extension Waiting
      `;
      metaExtStatus.style.color = '#ff5252';
      statusExtConn.textContent = 'Waiting for connection...';
      statusExtConn.className = 'text-red';
    } else {
      bannerWarning.style.display = 'none';
      metaExtStatus.innerHTML = `
        <svg class="check-icon" viewBox="0 0 16 16"><path d="M13.485 1.431a1.002 1.002 0 0 1 .323 1.378l-7.25 11.5a1.002 1.002 0 0 1-1.637.072l-3.5-4.5a1 1 0 0 1 1.576-1.228l2.646 3.402 6.464-10.299a1.002 1.002 0 0 1 1.378-.325z" fill="currentColor"/></svg>
        Chrome Extension Connected
      `;
      metaExtStatus.style.color = '#aaaaaa';
      statusExtConn.textContent = 'Connected (Host Pipe Active)';
      statusExtConn.className = 'text-green';
    }

    // 5. Statistics Counters
    const detected = currentState.detectedCount || 0;
    const handled = currentState.handledCount || 0;
    statDetected.textContent = detected.toLocaleString();
    statHandled.textContent = handled.toLocaleString();
    statsTabDetected.textContent = detected.toLocaleString();
    statsTabHandled.textContent = handled.toLocaleString();

    let eff = '--%';
    if (detected > 0) {
      const pct = Math.min(100, Math.round((handled / detected) * 100));
      eff = `${pct}%`;
    }
    statEfficiency.textContent = eff;

    // Time saved calculation (average 15s ad)
    const savedSeconds = handled * 15;
    const savedMinutes = Math.round(savedSeconds / 60);
    statsTabSaved.textContent = savedMinutes > 60 ? `${(savedMinutes / 60).toFixed(1)} hrs` : `${savedMinutes} min`;

    // 6. Settings toggles
    toggleAutostart.checked = Boolean(currentState.autoStartWithWindows);
    toggleMinimizeTray.checked = currentState.minimizeToTray !== false;

    // 7. Extension directory path box
    if (currentState.extensionPath) {
      extPathBox.textContent = currentState.extensionPath;
    }
  }

  /**
   * Tab Navigation Setup
   */
  function setupTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const panes = document.querySelectorAll('.tab-pane');

    navItems.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-tab');
        navItems.forEach((n) => n.classList.remove('active'));
        panes.forEach((p) => p.classList.remove('active'));

        btn.classList.add('active');
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
      });
    });
  }

  /**
   * Event Listeners Setup
   */
  function setupEventListeners() {
    // Window Controls
    winMin.addEventListener('click', () => api && api.minimize());
    winMax.addEventListener('click', () => api && api.maximize());
    winClose.addEventListener('click', () => api && api.close());

    // Master Protection Toggle
    masterToggle.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      renderState({ enabled });
      if (api) {
        await api.setEnabled(enabled);
      }
    });

    // Launch YouTube
    const handleOpenYt = () => {
      if (api) api.openYouTube();
    };
    btnOpenYtDash.addEventListener('click', handleOpenYt);
    btnOpenYtSidebar.addEventListener('click', handleOpenYt);

    // Reset Stats
    const handleResetStats = async () => {
      if (confirm('Reset lifetime detected and handled ad counters back to 0?')) {
        renderState({ detectedCount: 0, handledCount: 0 });
        if (api) await api.resetStats();
      }
    };
    btnResetStatsDash.addEventListener('click', handleResetStats);
    btnResetStatsTab.addEventListener('click', handleResetStats);

    // Extension Setup Actions
    const handleOpenExtSetup = () => {
      if (api) api.openExtensionSetup();
    };
    btnInstallExtBanner.addEventListener('click', handleOpenExtSetup);
    btnOpenExtSetup.addEventListener('click', handleOpenExtSetup);

    btnReRegisterHost.addEventListener('click', async () => {
      if (api) {
        btnReRegisterHost.textContent = 'Registering in Registry...';
        const res = await api.registerNativeHost();
        if (res && res.success) {
          btnReRegisterHost.textContent = '✓ Successfully Registered!';
          statusHostReg.textContent = 'Registered (HKCU)';
          statusHostReg.className = 'text-green';
        } else {
          btnReRegisterHost.textContent = 'Registration Finished';
        }
        setTimeout(() => {
          btnReRegisterHost.textContent = 'Re-register Native Host (Windows Registry)';
        }, 2000);
      }
    });

    // Settings Toggles
    toggleAutostart.addEventListener('change', (e) => {
      const autoStartWithWindows = e.target.checked;
      if (api) api.saveSettings({ autoStartWithWindows });
    });

    toggleMinimizeTray.addEventListener('change', (e) => {
      const minimizeToTray = e.target.checked;
      if (api) api.saveSettings({ minimizeToTray });
    });
  }

  /**
   * Initialize Controller
   */
  async function init() {
    setupTabs();
    setupEventListeners();

    if (api) {
      // 1. Fetch initial state
      const initial = await api.getState();
      renderState(initial);

      // 2. Subscribe to live real-time updates from native messaging
      api.onStateUpdate((updatedState) => {
        renderState(updatedState);
      });
    } else {
      // Browser preview mode fallback
      extPathBox.textContent = 'extension/';
      renderState({
        enabled: true,
        extensionConnected: true,
        detectedCount: 24,
        handledCount: 21,
        extensionPath: 'extension/'
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
