/**
 * YouTube Ad Helper - Main World Script
 * Injected into the page's execution context ("world": "MAIN").
 * Hooks into YouTube player custom events, internal API, and HTML5 video state.
 */

(function () {
  'use strict';

  // Guard: Run only on youtube.com pages
  if (!window.location.hostname.endsWith('youtube.com')) {
    return;
  }

  // STEP 3 REQUIREMENT: Startup Marker
  console.log('[YT-HELPER-MAIN] MAIN WORLD SCRIPT ACTIVE', {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    readyState: document.readyState
  });

  const MESSAGE_SOURCE = 'yt-helper-main-world';

  function notifyContentScript(type, payload = {}) {
    try {
      window.postMessage({
        source: MESSAGE_SOURCE,
        type,
        payload
      }, '*');
    } catch (e) {
      // Ignore if disconnected
    }
  }

  let wasMainWorldAd = false;
  let mainWorldOriginalRate = 1.0;
  let mainWorldWasMuted = false;
  let adDetectedTimestamp = 0;
  let mainWorldPlayerObserver = null;
  let mainWorldDocObserver = null;
  let adRetryInterval = null;
  let lastAdEpisodeId = 0;

  /**
   * Helper to inspect the player element
   */
  function getPlayer() {
    return document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  }

  /**
   * Evaluates whether an ad is currently active based on player API and DOM signals
   */
  function evaluateAdState(player) {
    if (!player) return { isAd: false, isAdShowing: false, adState: -1, hasAdShowingClass: false, hasAdInterruptingClass: false };

    let isAdShowing = false;
    let adState = -1;

    try {
      if (typeof player.isAdShowing === 'function') {
        isAdShowing = Boolean(player.isAdShowing());
      }
    } catch (e) {}

    try {
      if (typeof player.getAdState === 'function') {
        adState = player.getAdState();
      }
    } catch (e) {}

    const hasAdShowingClass = player.classList.contains('ad-showing');
    const hasAdInterruptingClass = player.classList.contains('ad-interrupting');

    // Confirmed ad if player reports ad OR DOM indicates ad
    const isAd = isAdShowing || adState === 1 || hasAdShowingClass || hasAdInterruptingClass;

    return {
      isAd,
      isAdShowing,
      adState,
      hasAdShowingClass,
      hasAdInterruptingClass
    };
  }

  /**
   * STEP 2, 4, 5, 6: Log comprehensive player API & ad diagnosis
   */
  function logRealAdDiagnosis(stage, player, video, extra = {}) {
    const p = player || getPlayer();
    const v = video || document.querySelector('video');
    const evaluated = evaluateAdState(p);

    const skipBtn = p ? p.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, button.ytp-ad-skip-button-modern, button.ytp-ad-skip-button-single, .ytp-skip-ad-button') : null;

    console.log(`[REAL-AD-DEBUG] [${stage}]`, {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      moviePlayerExists: Boolean(p),
      moviePlayerClassName: p ? p.className : null,
      hasAdShowingClass: evaluated.hasAdShowingClass,
      hasAdInterruptingClass: evaluated.hasAdInterruptingClass,
      isAdShowingResult: evaluated.isAdShowing,
      getAdStateResult: evaluated.adState,
      isAdEvaluated: evaluated.isAd,
      playerApiTypes: {
        typeofMoviePlayer: typeof p,
        typeofIsAdShowing: p ? typeof p.isAdShowing : 'undefined',
        typeofGetAdState: p ? typeof p.getAdState : 'undefined',
        typeofSkipAd: p ? typeof p.skipAd : 'undefined',
        typeofSeekTo: p ? typeof p.seekTo : 'undefined'
      },
      videoElement: Boolean(v),
      currentTime: v ? v.currentTime : null,
      duration: v ? v.duration : null,
      playbackRate: v ? v.playbackRate : null,
      muted: v ? v.muted : null,
      skipButton: {
        exists: Boolean(skipBtn),
        visible: skipBtn ? (skipBtn.offsetWidth > 0 && skipBtn.offsetHeight > 0) : false,
        disabled: skipBtn ? Boolean(skipBtn.disabled || skipBtn.getAttribute('aria-disabled') === 'true') : null,
        text: skipBtn ? (skipBtn.textContent || '').trim() : null
      },
      ...extra
    });
  }

  /**
   * Controlled execution of skipAd and safe fallback acceleration.
   * NEVER blindly seeks to video.duration or movie_player.seekTo.
   */
  function performImmediateAdHandling(player, video) {
    if (!player) return false;
    const v = video || (player.querySelector ? player.querySelector('video') : null) || document.querySelector('video');
    const episodeId = ++lastAdEpisodeId;

    let skipAdAttempted = false;
    let skipAdError = null;

    // PRIMARY FIX: For a SKIPPABLE YouTube ad, use movie_player.skipAd()
    if (typeof player.skipAd === 'function') {
      skipAdAttempted = true;
      console.log('[AD-SAFETY] skipAd() CALLED');
      try {
        player.skipAd();
      } catch (err) {
        skipAdError = err ? err.message : String(err);
      }
    }

    // Verify whether the ad is still showing after skipAd()
    let adShowingImmediately = false;
    try {
      if (typeof player.isAdShowing === 'function') {
        adShowingImmediately = Boolean(player.isAdShowing());
      }
    } catch (e) {}

    // Checkpoint after 50ms as required by runtime debugging specs
    setTimeout(() => {
      const p = getPlayer() || player;
      const vid = p ? (p.querySelector ? p.querySelector('video') : null) : (v || document.querySelector('video'));
      let curAdShowing = false;
      try {
        if (p && typeof p.isAdShowing === 'function') {
          curAdShowing = Boolean(p.isAdShowing());
        }
      } catch (e) {}

      const curTime = vid ? vid.currentTime : null;
      const curDuration = vid ? vid.duration : null;
      const curRate = vid ? vid.playbackRate : null;

      console.log('[AD-SAFETY] AFTER SKIP', {
        adShowing: curAdShowing,
        currentTime: curTime,
        duration: curDuration,
        playbackRate: curRate
      });

      console.log('[AD-SAFETY] TIMELINE', {
        currentTime: curTime,
        duration: curDuration,
        isAdShowing: curAdShowing,
        adState: (p && typeof p.getAdState === 'function') ? p.getAdState() : -1
      });

      // Detect whether currentTime suddenly becomes duration (regression detection)
      if (vid && Number.isFinite(curDuration) && curDuration > 5 && curTime !== null) {
        if (Math.abs(curDuration - curTime) < 1.0) {
          console.warn('[AD-SAFETY] POSSIBLE CONTENT SEEK REGRESSION', {
            currentTime: curTime,
            duration: curDuration
          });
        }
      }

      // If ad is STILL active after 50ms, enforce safe fallback acceleration (NO SEEK)
      if (curAdShowing && vid) {
        enforceFallbackFastForward(p, vid);
      }
    }, 50);

    // CRITICAL RULE:
    // If movie_player.skipAd() successfully terminates the ad:
    // DO NOT execute video.currentTime = video.duration
    // DO NOT execute movie_player.seekTo(video.duration, true)
    // DO NOT modify currentTime.
    // Let YouTube's player return to the original content position naturally.
    if (skipAdAttempted && !adShowingImmediately) {
      return true;
    }

    // Secondary & Fallback Action: 16x acceleration & mute (NO SEEK)
    // Only applied while confirmed ad state is active
    const curState = evaluateAdState(player);
    if (curState.isAd && v) {
      enforceFallbackFastForward(player, v);
    }

    return true;
  }

  /**
   * Enforces 16x playback speed, mute, and click skip button when an ad is playing.
   * DEFAULT BEHAVIOR: NO SEEK.
   * Never sets video.currentTime = video.duration or calls movie_player.seekTo.
   */
  function enforceFallbackFastForward(player, video) {
    if (!video) return;

    // 1. Mute audio during ad acceleration ONLY if extension caused the mute
    if (mainWorldWasMuted && !video.muted) {
      try { video.muted = true; } catch (e) {}
    }

    // 2. Accelerate ad stream to maximum speed (16x) ONLY while ad is active
    if (video.playbackRate < 16) {
      try {
        video.playbackRate = 16;
      } catch (e) {
        try { video.playbackRate = 4.0; } catch (e2) {}
      }
    }

    // 3. Click skip button if available
    if (player) {
      const skipBtn = player.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, button.ytp-ad-skip-button-modern, button.ytp-ad-skip-button-single, .ytp-skip-ad-button');
      if (skipBtn && typeof skipBtn.click === 'function') {
        try { skipBtn.click(); } catch (e) {}
      }
    }
  }

  function startAdRetryLoop(player, video) {
    if (adRetryInterval) return;
    adRetryInterval = setInterval(() => {
      const p = getPlayer() || player;
      const v = p ? p.querySelector('video') : (video || document.querySelector('video'));
      if (!p) return;

      const evaluated = evaluateAdState(p);
      if (evaluated.isAd) {
        enforceFallbackFastForward(p, v);
      } else {
        stopAdRetryLoop();
        checkAndSyncAdState();
      }
    }, 50);
  }

  function stopAdRetryLoop() {
    if (adRetryInterval) {
      clearInterval(adRetryInterval);
      adRetryInterval = null;
    }
  }

  /**
   * Main evaluation loop: detects state transitions and synchronizes tags
   */
  function checkAndSyncAdState() {
    const player = getPlayer();
    if (!player) return;

    // Evaluate ad status from player API and DOM classes
    const evaluated = evaluateAdState(player);
    const video = (player.querySelector ? player.querySelector('video') : null) || document.querySelector('video');

    if (evaluated.isAd) {
      player.setAttribute('data-yt-helper-ad-showing', String(evaluated.isAdShowing));
      player.setAttribute('data-yt-helper-ad-state', String(evaluated.adState));
      player.setAttribute('data-yt-helper-ad', 'true');

      if (!wasMainWorldAd) {
        wasMainWorldAd = true;
        adDetectedTimestamp = performance.now();

        // STATE PRESERVATION: Record original state before handling ad
        const diagCurrentTime = video ? video.currentTime : 0;
        const diagDuration = video ? video.duration : 0;
        const diagRate = (video && video.playbackRate >= 0.25 && video.playbackRate <= 4.0) ? video.playbackRate : 1.0;
        const diagMuted = video ? video.muted : false;

        mainWorldOriginalRate = diagRate;
        mainWorldWasMuted = !diagMuted;

        console.log('[AD-SAFETY] AD START', {
          contentCurrentTime: diagCurrentTime,
          videoDuration: diagDuration,
          playbackRate: diagRate,
          muted: diagMuted,
          adShowing: evaluated.isAdShowing
        });

        const hasBadge = Boolean(player.querySelector('.ytp-ad-badge, .ytp-ad-simple-ad-badge, [class*="ytp-ad-badge"]'));
        const hasInterstitial = Boolean(player.querySelector('.ytp-ad-action-interstitial'));
        const hasVideoAds = Boolean(player.querySelector('.video-ads, .ytp-ad-module'));
        const skipBtn = player.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, button.ytp-ad-skip-button-modern, button.ytp-ad-skip-button-single, .ytp-skip-ad-button');

        console.log('[AD-SAFETY] MIDROLL SPONSORED DETECTED', {
          contentTime: diagCurrentTime,
          duration: diagDuration,
          isAdShowing: evaluated.isAdShowing,
          adState: evaluated.adState,
          sponsoredBadge: hasBadge,
          videoAdsModule: hasVideoAds,
          skipButton: Boolean(skipBtn)
        });

        console.log('[AD-SAFETY] TIMELINE', {
          currentTime: diagCurrentTime,
          duration: diagDuration,
          isAdShowing: evaluated.isAdShowing,
          adState: evaluated.adState
        });

        if (video && !diagMuted) {
          try { video.muted = true; } catch (e) {}
        }

        notifyContentScript('PLAYER_AD_STATE_CHANGE', { isAd: true, isAdShowing: evaluated.isAdShowing, adState: evaluated.adState });

        // Trigger safe ad handling
        performImmediateAdHandling(player, video);
        startAdRetryLoop(player, video);
      } else {
        // AD POD SAFETY: Ad 1 -> Ad 2 -> normal video
        // Keep ad handling active while isAd is true. Do NOT restore normal state between ads.
        enforceFallbackFastForward(player, video);
      }

    } else if (wasMainWorldAd) {
      // Ad has legitimately terminated
      wasMainWorldAd = false;
      stopAdRetryLoop();
      adDetectedTimestamp = 0;

      player.removeAttribute('data-yt-helper-ad');
      player.setAttribute('data-yt-helper-ad-showing', 'false');
      player.setAttribute('data-yt-helper-ad-state', '-1');

      if (video) {
        // Restore ONLY playbackRate and muted (Do NOT restore currentTime by default)
        if (video.playbackRate !== mainWorldOriginalRate) {
          try { video.playbackRate = mainWorldOriginalRate; } catch (e) {}
        }
        if (mainWorldWasMuted && video.muted) {
          try { video.muted = false; } catch (e) {}
        }

        console.log('[AD-SAFETY] AD END', {
          currentTime: video.currentTime,
          duration: video.duration,
          playbackRate: video.playbackRate
        });

        // Detect whether currentTime suddenly becomes duration
        if (Number.isFinite(video.duration) && video.duration > 5) {
          if (Math.abs(video.duration - video.currentTime) < 1.0) {
            console.warn('[AD-SAFETY] POSSIBLE CONTENT SEEK REGRESSION', {
              currentTime: video.currentTime,
              duration: video.duration
            });
          }
        }
      }

      notifyContentScript('PLAYER_AD_STATE_CHANGE', { isAd: false, isAdShowing: false, adState: -1 });
    }
  }

  /**
   * Resilient observer attachment: attaches to #movie_player as soon as it enters DOM
   */
  function attachMainWorldPlayerObserver() {
    const player = getPlayer();

    if (player) {
      if (mainWorldDocObserver) {
        mainWorldDocObserver.disconnect();
        mainWorldDocObserver = null;
      }

      if (!mainWorldPlayerObserver) {
        mainWorldPlayerObserver = new MutationObserver((mutations) => {
          for (let i = 0; i < mutations.length; i++) {
            const m = mutations[i];
            if (m.type === 'attributes' && m.attributeName === 'class') {
              checkAndSyncAdState();
              break;
            }
            if (m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
              checkAndSyncAdState();
              break;
            }
          }
        });

        mainWorldPlayerObserver.observe(player, {
          attributes: true,
          attributeFilter: ['class'],
          childList: true,
          subtree: true
        });

        console.log('[YT-HELPER-MAIN] Target player observer attached successfully.');
      }
      return true;
    }

    // If player not present yet, observe document to catch its insertion
    if (!mainWorldDocObserver) {
      mainWorldDocObserver = new MutationObserver(() => {
        if (getPlayer()) {
          attachMainWorldPlayerObserver();
          checkAndSyncAdState();
        }
      });

      const rootNode = document.documentElement || document.body;
      if (rootNode) {
        mainWorldDocObserver.observe(rootNode, { childList: true, subtree: true });
      }
    }

    return false;
  }

  /**
   * Video media event listeners (ratechange, timeupdate, playing)
   */
  function setupVideoMediaListeners() {
    const mediaEvents = ['play', 'playing', 'timeupdate', 'loadedmetadata', 'ratechange', 'durationchange'];
    for (const evt of mediaEvents) {
      document.addEventListener(evt, (e) => {
        if (e.target && e.target.tagName === 'VIDEO') {
          // If in active ad break, maintain acceleration
          if (wasMainWorldAd) {
            const player = getPlayer();
            enforceFallbackFastForward(player, e.target);
          }
          checkAndSyncAdState();
        }
      }, true);
    }
  }

  // Initialize
  setupVideoMediaListeners();
  attachMainWorldPlayerObserver();
  checkAndSyncAdState();

  // Listen for actions requested by the content script
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'yt-helper-content') {
      return;
    }

    if (event.data.type === 'SEEK_AD_END' || event.data.type === 'SKIP_OR_ACCELERATE_AD') {
      const player = getPlayer();
      const video = player ? player.querySelector('video') : document.querySelector('video');
      enforceFallbackFastForward(player, video);
    }
  });

  window.addEventListener('yt-navigate-finish', () => {
    attachMainWorldPlayerObserver();
    setTimeout(checkAndSyncAdState, 100);
  });

  document.addEventListener('DOMContentLoaded', () => {
    attachMainWorldPlayerObserver();
    checkAndSyncAdState();
  });
})();
