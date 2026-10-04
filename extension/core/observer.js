/**
 * YouTube Ad Helper - Observer Module
 * Intelligent, low-overhead DOM observer.
 * Targets the player node, debounces mutations, and prevents observer loops.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./logger'), require('./detector'));
  } else {
    root.YTHelperObserver = factory(root.YTHelperLogger, root.YTHelperDetector);
  }
})(typeof self !== 'undefined' ? self : this, function (Logger, Detector) {
  'use strict';

  const logger = Logger || {
    TAGS: { OBSERVER: '[OBSERVER]' },
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  };

  const detector = Detector || (typeof YTHelperDetector !== 'undefined' ? YTHelperDetector : null);

  let playerObserver = null;
  let bodyObserver = null;
  let observedPlayerNode = null;
  let pendingTimeoutId = null;
  let isThrottled = false;
  let hasTrailingCall = false;
  let isRunning = false;
  let onMutationCallback = null;
  let observedVideo = null;

  const THROTTLE_INTERVAL_MS = 60; // 60ms debounce window prevents CPU spikes

  /**
   * Safe debounced dispatcher for mutation events.
   * Guarantees trailing calls so rapid mutations are never dropped.
   */
  function scheduleProcessing() {
    if (isThrottled) {
      hasTrailingCall = true;
      return;
    }
    isThrottled = true;
    hasTrailingCall = false;

    if (pendingTimeoutId) {
      clearTimeout(pendingTimeoutId);
    }

    pendingTimeoutId = setTimeout(() => {
      isThrottled = false;
      pendingTimeoutId = null;
      if (isRunning && typeof onMutationCallback === 'function') {
        try {
          onMutationCallback();
        } catch (err) {
          logger.error(logger.TAGS.OBSERVER, 'Error executing mutation callback:', err);
        }
      }
      if (hasTrailingCall) {
        scheduleProcessing();
      }
    }, THROTTLE_INTERVAL_MS);
  }

  function onVideoMediaEvent() {
    if (isRunning) {
      scheduleProcessing();
    }
  }

  function bindVideoEvents(playerEl) {
    const video = detector ? detector.getVideoElement(playerEl) : (playerEl ? playerEl.querySelector('video') : null);
    if (video && video !== observedVideo) {
      unbindVideoEvents();
      observedVideo = video;
      video.addEventListener('timeupdate', onVideoMediaEvent, { passive: true });
      video.addEventListener('ratechange', onVideoMediaEvent, { passive: true });
      video.addEventListener('play', onVideoMediaEvent, { passive: true });
      video.addEventListener('loadedmetadata', onVideoMediaEvent, { passive: true });
    }
  }

  function unbindVideoEvents() {
    if (observedVideo) {
      observedVideo.removeEventListener('timeupdate', onVideoMediaEvent);
      observedVideo.removeEventListener('ratechange', onVideoMediaEvent);
      observedVideo.removeEventListener('play', onVideoMediaEvent);
      observedVideo.removeEventListener('loadedmetadata', onVideoMediaEvent);
      observedVideo = null;
    }
  }

  /**
   * Initializes player-specific observer when player element is located.
   */
  function attachPlayerObserver() {
    const playerEl = detector ? detector.getPlayerElement() : document.querySelector('#movie_player, .html5-video-player');

    if (!playerEl) {
      logger.debug(logger.TAGS.OBSERVER, 'Player element not found yet, listening via root observer.');
      return false;
    }

    bindVideoEvents(playerEl);

    if (observedPlayerNode === playerEl && playerObserver) {
      return true; // Already attached to this instance
    }

    // Disconnect old player observer if player DOM was replaced
    if (playerObserver) {
      playerObserver.disconnect();
    }

    // Performance optimization: disconnect bodyObserver once player is located
    if (bodyObserver) {
      bodyObserver.disconnect();
      bodyObserver = null;
      logger.debug(logger.TAGS.OBSERVER, 'Disconnected discovery bodyObserver; player observer is now active.');
    }

    observedPlayerNode = playerEl;

    playerObserver = new MutationObserver((mutations) => {
      // Filter for meaningful mutations: class changes, ad attributes, or child button additions
      let isRelevant = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'data-yt-helper-ad')) {
          isRelevant = true;
          break;
        }
        if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
          isRelevant = true;
          break;
        }
      }

      if (isRelevant) {
        bindVideoEvents(playerEl);
        const isImmediateAd = playerEl.classList.contains('ad-showing') ||
                              playerEl.classList.contains('ad-interrupting') ||
                              playerEl.getAttribute('data-yt-helper-ad') === 'true';
        if (isImmediateAd) {
          if (pendingTimeoutId) {
            clearTimeout(pendingTimeoutId);
            pendingTimeoutId = null;
          }
          isThrottled = false;
          hasTrailingCall = false;
          if (isRunning && typeof onMutationCallback === 'function') {
            try {
              onMutationCallback();
            } catch (err) {
              logger.error(logger.TAGS.OBSERVER, 'Error executing immediate callback:', err);
            }
          }
        } else {
          scheduleProcessing();
        }
      }
    });

    // Watch class/ad attribute mutations and child node additions/removals
    playerObserver.observe(playerEl, {
      attributes: true,
      attributeFilter: ['class', 'data-yt-helper-ad'],
      childList: true,
      subtree: true
    });

    logger.debug(logger.TAGS.OBSERVER, 'Targeted player observer attached successfully.');
    return true;
  }

  /**
   * Lightweight body observer used only to discover player insertion if not present initially.
   */
  function attachBodyObserver() {
    if (bodyObserver) return;

    bodyObserver = new MutationObserver((mutations) => {
      // Check if player container was added
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          if (attachPlayerObserver()) {
            // Once player observer is attached, body observer can run with minimal overhead
            scheduleProcessing();
            break;
          }
        }
      }
    });

    const targetNode = document.getElementById('content') || document.body || document.documentElement;
    if (targetNode) {
      bodyObserver.observe(targetNode, {
        childList: true,
        subtree: true
      });
      logger.debug(logger.TAGS.OBSERVER, 'Body discovery observer attached.');
    }
  }

  /**
   * Starts observation.
   * @param {Function} callback Function invoked when potential ad state changes occur.
   */
  function start(callback) {
    if (isRunning) return;
    isRunning = true;
    onMutationCallback = callback;

    const playerFound = attachPlayerObserver();
    if (!playerFound) {
      attachBodyObserver();
    }

    // Run initial evaluation
    scheduleProcessing();
    logger.info(logger.TAGS.OBSERVER, 'DOM observation started.');
  }

  /**
   * Stops all active observers and clears timeouts.
   */
  function stop() {
    isRunning = false;
    if (pendingTimeoutId) {
      clearTimeout(pendingTimeoutId);
      pendingTimeoutId = null;
    }
    if (playerObserver) {
      playerObserver.disconnect();
      playerObserver = null;
    }
    if (bodyObserver) {
      bodyObserver.disconnect();
      bodyObserver = null;
    }
    observedPlayerNode = null;
    isThrottled = false;
    hasTrailingCall = false;
    unbindVideoEvents();
    logger.debug(logger.TAGS.OBSERVER, 'DOM observation stopped and disconnected.');
  }

  /**
   * Reconnects player observer (e.g. after SPA video navigation).
   */
  function reconnect() {
    if (!isRunning) return;
    logger.debug(logger.TAGS.OBSERVER, 'Reconnecting observer after navigation...');
    if (!attachPlayerObserver()) {
      attachBodyObserver();
    }
    scheduleProcessing();
  }

  return {
    start,
    stop,
    reconnect,
    scheduleProcessing
  };
});
