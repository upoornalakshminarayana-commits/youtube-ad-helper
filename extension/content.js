/**
 * YouTube Ad Helper - Content Script Coordinator
 * Integrates Detector, Player, Navigation, Observer, and Storage modules.
 */

(function () {
  'use strict';

  // Domain guard: Ensure we are strictly on youtube.com
  if (!window.location.hostname.endsWith('youtube.com')) {
    return;
  }

  const logger = window.YTHelperLogger;
  const storage = window.YTHelperStorage;
  const detector = window.YTHelperDetector;
  const player = window.YTHelperPlayer;
  const navigation = window.YTHelperNavigation;
  const observer = window.YTHelperObserver;

  let currentSettings = {
    enabled: true,
    autoSkip: true,
    fastForward: true,
    hideOverlayAds: true,
    showBadge: true,
    debug: false
  };

  let isCurrentlyInAdBreak = false;
  let hasHandledCurrentAdBreak = false;
  let isInitialized = false;
  let activeAdLoopTimer = null;

  function startAdEnforcementLoop() {
    if (activeAdLoopTimer) return;
    activeAdLoopTimer = setInterval(() => {
      evaluateAndProcess();
    }, 50);
  }

  function stopAdEnforcementLoop() {
    if (activeAdLoopTimer) {
      clearInterval(activeAdLoopTimer);
      activeAdLoopTimer = null;
    }
  }

  /**
   * Evaluates ad status and handles detectable states safely.
   */
  function evaluateAndProcess() {
    if (!currentSettings.enabled) {
      stopAdEnforcementLoop();
      return;
    }

    try {
      const result = player.handleAd(currentSettings);

      // Accurate detection tracking: register ad break only for genuine video ads
      if (result.isVideoAd) {
        startAdEnforcementLoop();
        if (!isCurrentlyInAdBreak) {
          isCurrentlyInAdBreak = true;
          hasHandledCurrentAdBreak = false;
          storage.incrementCounters(1, 0);

          const playerEl = detector.getPlayerElement();
          const video = detector.getVideoElement(playerEl);

          console.log('[REAL-AD-DEBUG] [CONTENT-SCRIPT-DETECTED]', {
            timestamp: new Date().toISOString(),
            url: window.location.href,
            moviePlayerExists: Boolean(playerEl),
            moviePlayerClassName: playerEl ? playerEl.className : null,
            hasAdShowingClass: playerEl ? playerEl.classList.contains('ad-showing') : false,
            hasAdInterruptingClass: playerEl ? playerEl.classList.contains('ad-interrupting') : false,
            moviePlayerIsAdShowing: playerEl ? playerEl.getAttribute('data-yt-helper-ad-showing') : null,
            moviePlayerGetAdState: playerEl ? playerEl.getAttribute('data-yt-helper-ad-state') : null,
            videoElement: Boolean(video),
            currentTime: video ? video.currentTime : null,
            duration: video ? video.duration : null,
            playbackRate: video ? video.playbackRate : null,
            muted: video ? video.muted : null,
            detectorResult: result.isAd,
            detectorIsVideoAd: result.isVideoAd,
            detectorIsOverlayAd: result.isOverlayAd,
            adCategory: result.adCategory,
            detectorSignals: result.state ? result.state.signals : null,
            mainWorldResult: playerEl ? playerEl.getAttribute('data-yt-helper-ad') : null,
            contentScriptResult: {
              handled: result.handled,
              skipped: result.skipped,
              fastForwarded: result.fastForwarded,
              closedOverlay: result.closedOverlay
            }
          });
        }
      } else {
        stopAdEnforcementLoop();
        if (isCurrentlyInAdBreak) {
          isCurrentlyInAdBreak = false;
          hasHandledCurrentAdBreak = false;

          const playerEl = detector.getPlayerElement();
          const video = detector.getVideoElement(playerEl);

          console.log('[AD-DEBUG] AD TRUE → FALSE', {
            timestamp: new Date().toISOString(),
            url: window.location.href,
            playerClassList: playerEl ? Array.from(playerEl.classList) : [],
            currentTime: video ? video.currentTime : null,
            playbackRate: video ? video.playbackRate : null,
            muted: video ? video.muted : null
          });
        }
      }

      // Accurate handled tracking: count once per ad break, preventing repeated increments
      if (result.handled && !hasHandledCurrentAdBreak) {
        hasHandledCurrentAdBreak = true;
        storage.incrementCounters(0, 1);
        try {
          chrome.runtime.sendMessage({
            action: 'AD_HANDLED',
            details: {
              skipped: result.skipped,
              fastForwarded: result.fastForwarded,
              closedOverlay: result.closedOverlay,
              url: window.location.href
            }
          });
        } catch (e) {
          // Ignore context invalidated or background sleeping
        }
      }
    } catch (err) {
      logger.error(logger.TAGS.ERROR, 'Error during ad evaluation:', err);
    }
  }

  /**
   * Handle SPA navigation events.
   */
  function handleNavigation(navEvent) {
    logger.info(logger.TAGS.NAVIGATION, `Navigated to ${navEvent.url}`);
    stopAdEnforcementLoop();
    const video = detector.getVideoElement();
    player.reset(video);
    isCurrentlyInAdBreak = false;
    hasHandledCurrentAdBreak = false;

    if (navEvent.isWatchPage) {
      observer.reconnect();
    } else {
      // Suspend active observer on non-watch pages to achieve near-zero idle CPU usage
      observer.stop();
    }
  }

  /**
   * Listen for window messages from main-world.js
   */
  function handleMainWorldMessage(event) {
    if (event.source !== window || !event.data || event.data.source !== 'yt-helper-main-world') {
      return;
    }

    logger.debug(logger.TAGS.GENERAL, 'Signal received from main-world:', event.data.type);
    if (event.data.type === 'PLAYER_AD_STATE_CHANGE') {
      if (event.data.payload && event.data.payload.isAd) {
        startAdEnforcementLoop();
        evaluateAndProcess();
      } else {
        stopAdEnforcementLoop();
        evaluateAndProcess();
      }
    }
  }

  /**
   * Initialize extension runtime on page.
   */
  async function init() {
    if (isInitialized) return;
    isInitialized = true;

    // 1. Fetch initial configuration
    currentSettings = await storage.getSettings();
    logger.setDebug(currentSettings.debug);
    logger.info(logger.TAGS.GENERAL, 'YouTube Ad Helper initialized. Enabled:', currentSettings.enabled);

    // 2. React to configuration updates from popup or background
    storage.addChangeListener((changes) => {
      let debugChanged = false;
      for (const [key, change] of Object.entries(changes)) {
        if (key in currentSettings) {
          currentSettings[key] = change.newValue;
          if (key === 'debug') debugChanged = true;
        }
      }

      if (debugChanged) {
        logger.setDebug(currentSettings.debug);
      }

      logger.debug(logger.TAGS.STORAGE, 'Settings updated dynamically:', currentSettings);

      // If re-enabled, trigger immediate scan
      if (currentSettings.enabled) {
        observer.scheduleProcessing();
      } else {
        stopAdEnforcementLoop();
        // Disabled: ensure any modified video states are restored
        const video = detector.getVideoElement();
        if (video) {
          player.restoreVideoState(video);
        }
      }
    });

    // 3. Initialize SPA navigation listeners
    navigation.init();
    navigation.onNavigation(handleNavigation);

    // 4. Start low-overhead DOM observation
    observer.start(evaluateAndProcess);

    // 5. Connect main-world messaging
    window.addEventListener('message', handleMainWorldMessage);

    // 6. Listen for runtime messages (e.g. from popup for manual ping or status check)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request && request.action === 'GET_PAGE_STATUS') {
          const adState = detector.detectAdState();
          sendResponse({
            isYouTube: true,
            isWatchPage: navigation.isWatchPage(),
            isAd: adState.isAd,
            confidence: adState.confidence,
            hasSkipButton: Boolean(adState.skipBtn)
          });
        }
        return true;
      });
    }
  }

  // Start initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
