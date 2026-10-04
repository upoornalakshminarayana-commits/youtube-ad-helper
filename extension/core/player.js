/**
 * YouTube Ad Helper - Player Module
 * Safe, defensive player interaction engine.
 * Never performs destructive manipulation. Restores video state cleanly when ads end.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./logger'), require('./detector'));
  } else {
    root.YTHelperPlayer = factory(root.YTHelperLogger, root.YTHelperDetector);
  }
})(typeof self !== 'undefined' ? self : this, function (Logger, Detector) {
  'use strict';

  const logger = Logger || {
    TAGS: { PLAYER: '[PLAYER]', SKIP: '[SKIP]' },
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  };

  const detector = Detector || (typeof YTHelperDetector !== 'undefined' ? YTHelperDetector : null);

  // Track original player state before ad manipulation to guarantee clean restoration
  let originalPlaybackRate = 1.0;
  let wasMutedByExtension = false;
  let isAdCurrentlyHandled = false;
  let lastSkipTime = 0;
  const SKIP_COOLDOWN_MS = 500; // Debounce rapid click attempts
  const clickedButtons = new WeakSet();
  let activeEnforcedVideo = null;

  /**
   * Listener to prevent YouTube's internal player code from resetting ad playbackRate or unmuting.
   */
  function onVideoAdEnforce() {
    if (isAdCurrentlyHandled && activeEnforcedVideo && activeEnforcedVideo instanceof HTMLVideoElement) {
      if (activeEnforcedVideo.playbackRate < 16) {
        try {
          activeEnforcedVideo.playbackRate = 16;
        } catch (e) {}
      }
      if (wasMutedByExtension && !activeEnforcedVideo.muted) {
        try {
          activeEnforcedVideo.muted = true;
        } catch (e) {}
      }
    }
  }

  const ENFORCE_EVENTS = ['ratechange', 'timeupdate', 'playing'];

  function attachVideoEnforcement(video) {
    if (activeEnforcedVideo !== video) {
      detachVideoEnforcement(activeEnforcedVideo);
      activeEnforcedVideo = video;
      if (video && typeof video.addEventListener === 'function') {
        for (const evt of ENFORCE_EVENTS) {
          video.addEventListener(evt, onVideoAdEnforce, { passive: true });
        }
      }
    }
  }

  function detachVideoEnforcement(video) {
    if (video && typeof video.removeEventListener === 'function') {
      for (const evt of ENFORCE_EVENTS) {
        video.removeEventListener(evt, onVideoAdEnforce);
      }
    }
  }

  /**
   * Safely clicks an official skip button.
   * @param {HTMLElement} btn
   * @returns {boolean} true if clicked successfully
   */
  function clickSkipButton(btn) {
    if (!btn) return false;

    // Duplicate protection: never click the exact same button DOM instance twice
    if (clickedButtons.has(btn)) {
      return false;
    }

    const now = Date.now();
    if (now - lastSkipTime < SKIP_COOLDOWN_MS) {
      return false;
    }

    try {
      clickedButtons.add(btn);
      lastSkipTime = now;
      logger.info(logger.TAGS.SKIP, 'Official skip button found. Triggering safe click.');

      // Dispatch full mouse event sequence followed by .click() for maximum YouTube compatibility
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      if (typeof btn.click === 'function') {
        btn.click();
      }
      return true;
    } catch (err) {
      clickedButtons.delete(btn);
      logger.error(logger.TAGS.SKIP, 'Failed to click skip button:', err);
      return false;
    }
  }

  /**
   * Safely dismisses in-player overlay banners/popups.
   * @param {HTMLElement} closeBtn
   * @returns {boolean}
   */
  function dismissOverlay(closeBtn) {
    if (!closeBtn) return false;
    if (clickedButtons.has(closeBtn)) return false;

    try {
      clickedButtons.add(closeBtn);
      logger.debug(logger.TAGS.SKIP, 'In-player ad overlay close button clicked.');
      if (typeof closeBtn.click === 'function') {
        closeBtn.click();
      }
      return true;
    } catch (err) {
      clickedButtons.delete(closeBtn);
      logger.debug(logger.TAGS.SKIP, 'Failed to click overlay close button:', err);
      return false;
    }
  }

  /**
   * Fast-forwards an ad video safely when confirmed to be an ad.
   * Mutes audio during fast-forward and skips to the end of the ad stream.
   * @param {HTMLVideoElement} video
   * @returns {boolean}
   */
  function fastForwardAdVideo(video) {
    if (!video || !(video instanceof HTMLVideoElement)) return false;

    try {
      // Record normal playback rate and mute state when ad segment first begins
      if (!isAdCurrentlyHandled) {
        originalPlaybackRate = (video.playbackRate >= 0.25 && video.playbackRate <= 4.0)
          ? video.playbackRate
          : 1.0;

        // Remember whether the extension initiated the mute
        wasMutedByExtension = !video.muted;
        if (!video.muted) {
          video.muted = true;
        }
        isAdCurrentlyHandled = true;

        attachVideoEnforcement(video);
      } else {
        // Ongoing ad break: keep muted only if the extension was responsible for muting
        if (!video.muted && wasMutedByExtension) {
          video.muted = true;
        }
        attachVideoEnforcement(video);
      }

      // Accelerate playback speed safely
      try {
        if (video.playbackRate < 16) {
          video.playbackRate = 16;
        }
      } catch (rateErr) {
        // Fallback for user agents that clamp max playback rate
        video.playbackRate = Math.min(video.playbackRate, 4.0);
      }

      // CRITICAL FIX: NEVER seek to video.duration!
      // video.currentTime = video.duration was skipping the actual YouTube video!
      // Acceleration and muting safely handle the ad without touching content currentTime.

      return true;
    } catch (err) {
      logger.error(logger.TAGS.PLAYER, 'Failed to fast forward ad video:', err);
      return false;
    }
  }

  /**
   * Restores normal video state (playback speed and mute) when an ad finishes.
   * @param {HTMLVideoElement} video
   */
  function restoreVideoState(video) {
    if (!isAdCurrentlyHandled) return;

    try {
      if (video && video instanceof HTMLVideoElement) {
        detachVideoEnforcement(video);

        // Restore playback rate
        if (video.playbackRate !== originalPlaybackRate) {
          video.playbackRate = originalPlaybackRate;
          logger.debug(logger.TAGS.PLAYER, `Restored playback rate to ${originalPlaybackRate}x`);
        }

        // Restore mute state if we muted it
        if (wasMutedByExtension && video.muted) {
          video.muted = false;
          logger.debug(logger.TAGS.PLAYER, 'Restored audio volume (unmuted).');
        }
      }
    } catch (err) {
      logger.error(logger.TAGS.PLAYER, 'Error restoring video state:', err);
    } finally {
      if (activeEnforcedVideo) {
        detachVideoEnforcement(activeEnforcedVideo);
        activeEnforcedVideo = null;
      }
      isAdCurrentlyHandled = false;
      wasMutedByExtension = false;
      originalPlaybackRate = 1.0;
    }
  }

  let debugMeasurementActive = false;

  /**
   * Main Handler Execution
   * Evaluates ad detection signals and applies configured actions safely.
   *
   * @param {Object} options Configuration flags
   * @param {boolean} options.enabled
   * @param {boolean} options.autoSkip
   * @param {boolean} options.fastForward
   * @param {boolean} options.hideOverlayAds
   * @returns {{
   *   handled: boolean,
   *   skipped: boolean,
   *   fastForwarded: boolean,
   *   closedOverlay: boolean,
   *   isAd: boolean,
   *   state: Object
   * }}
   */
  function handleAd(options = {}) {
    const {
      enabled = true,
      autoSkip = true,
      fastForward = true,
      hideOverlayAds = true
    } = options;

    if (!enabled) {
      return { handled: false, skipped: false, fastForwarded: false, closedOverlay: false, isAd: false, state: null };
    }

    const state = detector.detectAdState();

    // If no video ad is present, ensure video playback state is restored immediately
    if (!state.isVideoAd) {
      debugMeasurementActive = false;
      if (isAdCurrentlyHandled && state.video) {
        restoreVideoState(state.video);
      } else if (state.video && state.video.playbackRate > 4) {
        // FAIL-SAFE WATCHDOG: Ensure normal videos are never stuck at abnormal speed
        try {
          state.video.playbackRate = 1.0;
          logger.warn(logger.TAGS.PLAYER, 'Watchdog detected non-ad video at abnormal speed. Reset to 1.0x.');
        } catch (e) {}
      }
    }

    // If no ad (neither video ad nor overlay ad), exit early
    if (!state.isAd) {
      return { handled: false, skipped: false, fastForwarded: false, closedOverlay: false, isAd: false, isVideoAd: false, isOverlayAd: false, state };
    }

    const video = state.video;
    const beforeState = video ? {
      currentTime: video.currentTime,
      duration: video.duration,
      playbackRate: video.playbackRate,
      muted: video.muted
    } : null;

    let skipped = false;
    let closedOverlay = false;
    let fastForwarded = false;

    const attemptedActions = {
      seek: false,
      acceleration: Boolean(fastForward && state.isVideoAd && video),
      skip: Boolean(autoSkip && state.isVideoAd && state.skipBtn),
      overlayDismissal: Boolean(hideOverlayAds && state.overlayCloseBtn)
    };

    // 1. PRIMARY STRATEGY FOR VIDEO ADS: Official Skip Control
    // If an official skip button is available for a video ad, click it immediately
    if (state.isVideoAd && autoSkip && state.skipBtn) {
      skipped = clickSkipButton(state.skipBtn);
    }

    // 2. SECONDARY FALLBACK FOR VIDEO ADS: Safe 16x Acceleration & Audio Muting (NO SEEK)
    // Only accelerate if this is an actual VIDEO AD interrupting playback!
    // NEVER accelerate or mute for static sponsored overlays or cards.
    if (state.isVideoAd && fastForward && video) {
      fastForwarded = fastForwardAdVideo(video);
      // Dispatch in-page ad skip event to main-world (hooks movie_player.skipAd if available)
      try {
        window.postMessage({ source: 'yt-helper-content', type: 'SKIP_OR_ACCELERATE_AD' }, '*');
      } catch (e) {}
    }

    // 3. ACTION FOR OVERLAYS: Dismiss In-Player Banner Overlays (Closeable only)
    // Does NOT alter video speed or mute state
    if (hideOverlayAds && state.overlayCloseBtn) {
      closedOverlay = dismissOverlay(state.overlayCloseBtn);
    }

    const duringState = video ? {
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      muted: video.muted
    } : null;

    console.log('[AD-DEBUG] handleAd invoked', {
      timestamp: new Date().toISOString(),
      attemptedActions,
      before: beforeState,
      during: duringState,
      confidence: state.confidence,
      signals: state.signals
    });

    // Schedule 500ms and 1s measurements once per ad episode
    if (!debugMeasurementActive && video) {
      debugMeasurementActive = true;
      const v = video;
      setTimeout(() => {
        console.log('[AD-DEBUG] Player Action After 500ms:', {
          timestamp: new Date().toISOString(),
          currentTime: v.currentTime,
          duration: v.duration,
          playbackRate: v.playbackRate,
          muted: v.muted
        });
      }, 500);

      setTimeout(() => {
        console.log('[AD-DEBUG] Player Action After 1 second:', {
          timestamp: new Date().toISOString(),
          currentTime: v.currentTime,
          duration: v.duration,
          playbackRate: v.playbackRate,
          muted: v.muted
        });
      }, 1000);
    }

    const handled = fastForwarded || skipped || closedOverlay;

    return {
      handled,
      skipped,
      fastForwarded,
      closedOverlay,
      isAd: true,
      state
    };
  }

  /**
   * Resets internal player tracking states on page navigation.
   * @param {HTMLVideoElement} [video]
   */
  function reset(video) {
    if (isAdCurrentlyHandled && video) {
      restoreVideoState(video);
    }
    isAdCurrentlyHandled = false;
    wasMutedByExtension = false;
    originalPlaybackRate = 1.0;
    lastSkipTime = 0;
  }

  return {
    clickSkipButton,
    dismissOverlay,
    fastForwardAdVideo,
    restoreVideoState,
    handleAd,
    reset
  };
});
