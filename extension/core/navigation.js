/**
 * YouTube Ad Helper - Navigation Module
 * Single Page Application (SPA) navigation lifecycle coordinator.
 * Detects URL transitions, video-to-video navigation, and YouTube Shorts changes.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./logger'));
  } else {
    root.YTHelperNavigation = factory(root.YTHelperLogger);
  }
})(typeof self !== 'undefined' ? self : this, function (Logger) {
  'use strict';

  const logger = Logger || {
    TAGS: { NAVIGATION: '[NAVIGATION]' },
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  };

  const listeners = new Set();
  let lastUrl = window.location.href;
  let lastVideoId = extractVideoId(lastUrl);

  /**
   * Extracts YouTube Video or Short ID from a URL.
   * @param {string} urlStr
   * @returns {string|null}
   */
  function extractVideoId(urlStr) {
    try {
      const url = new URL(urlStr, window.location.origin);
      if (url.pathname.startsWith('/shorts/')) {
        return url.pathname.split('/')[2] || null;
      }
      return url.searchParams.get('v') || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Checks if current page is an active video or shorts playback page.
   * @returns {boolean}
   */
  function isWatchPage() {
    const path = window.location.pathname;
    return path === '/watch' || path.startsWith('/shorts/');
  }

  /**
   * Dispatches navigation event to all registered listeners.
   */
  function notifyNavigation(eventType) {
    const currentUrl = window.location.href;
    const currentVideoId = extractVideoId(currentUrl);
    const isNewVideo = currentVideoId !== lastVideoId;

    logger.debug(
      logger.TAGS.NAVIGATION,
      `Navigation detected (${eventType}): isWatchPage=${isWatchPage()}, newVideo=${isNewVideo}, ID=${currentVideoId}`
    );

    lastUrl = currentUrl;
    lastVideoId = currentVideoId;

    for (const callback of listeners) {
      try {
        callback({
          url: currentUrl,
          videoId: currentVideoId,
          isNewVideo,
          isWatchPage: isWatchPage(),
          eventType
        });
      } catch (err) {
        logger.error(logger.TAGS.NAVIGATION, 'Error in navigation listener:', err);
      }
    }
  }

  let isInitialized = false;

  /**
   * Setup YouTube-specific DOM & History event listeners.
   */
  function init() {
    if (isInitialized) return;
    isInitialized = true;

    // 1. YouTube official SPA custom events
    window.addEventListener('yt-navigate-start', () => {
      notifyNavigation('yt-navigate-start');
    });

    window.addEventListener('yt-navigate-finish', () => {
      notifyNavigation('yt-navigate-finish');
    });

    window.addEventListener('yt-page-data-updated', () => {
      notifyNavigation('yt-page-data-updated');
    });

    // 2. Standard browser navigation events
    window.addEventListener('popstate', () => {
      notifyNavigation('popstate');
    });

    // 3. Intercept history pushState/replaceState for resilient fallback
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      const res = originalPushState.apply(this, args);
      setTimeout(() => notifyNavigation('pushState'), 0);
      return res;
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const res = originalReplaceState.apply(this, args);
      setTimeout(() => notifyNavigation('replaceState'), 0);
      return res;
    };

    logger.debug(logger.TAGS.NAVIGATION, 'Navigation listeners initialized.');
  }

  /**
   * Registers a callback for YouTube SPA navigation changes.
   * @param {Function} callback
   */
  function onNavigation(callback) {
    if (typeof callback === 'function') {
      listeners.add(callback);
    }
  }

  /**
   * Removes a registered navigation callback.
   * @param {Function} callback
   */
  function offNavigation(callback) {
    listeners.delete(callback);
  }

  return {
    init,
    onNavigation,
    offNavigation,
    extractVideoId,
    isWatchPage
  };
});
