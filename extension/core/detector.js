/**
 * YouTube Ad Helper - Detector Module
 * Centralized, multi-signal ad detection engine with resilient fallback selectors.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./logger'));
  } else {
    root.YTHelperDetector = factory(root.YTHelperLogger);
  }
})(typeof self !== 'undefined' ? self : this, function (Logger) {
  'use strict';

  const logger = Logger || {
    TAGS: { AD_DETECT: '[AD-DETECT]' },
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  };

  /**
   * Centralized Selector Registry
   * Easy to update, maintain, and test without touching operational logic.
   */
  const SELECTORS = Object.freeze({
    // Primary video player containers
    playerContainers: [
      '#movie_player',
      '.html5-video-player',
      'ytd-player #container',
      '#ytd-player'
    ],

    // Active HTML5 video elements
    videos: [
      '#movie_player video.html5-main-video',
      '.html5-video-player video.html5-main-video',
      'video.html5-main-video',
      'video'
    ],

    // Player classes indicating an active video ad stream
    adPlayerClasses: [
      'ad-showing',
      'ad-interrupting'
    ],

    // Official YouTube Skip buttons across various UI experiments & layouts
    skipButtons: [
      '.ytp-skip-ad-button',
      '.ytp-ad-skip-button',
      '.ytp-ad-skip-button-modern',
      'button.ytp-ad-skip-button-modern',
      'button.ytp-ad-skip-button-single',
      'button.ytp-skip-ad-button',
      '.ytp-ad-skip-button-slot button',
      '.ytp-ad-skip-button-container button',
      '.ytp-ad-skip-slot button',
      'button[id^="skip-button"]',
      '.ytp-ad-preview-slot + .ytp-ad-skip-slot button',
      'button[aria-label*="Skip ad" i]',
      'button[aria-label*="Skip ads" i]',
      'button[aria-label*="Skip" i]'
    ],

    // Overlay close buttons for popups / banners inside the player
    overlayCloseButtons: [
      '.ytp-ad-overlay-close-button',
      '.ytp-ad-overlay-close-container',
      'button.ytp-ad-overlay-close-button'
    ],

    // In-player Sponsored and Ad indicators
    adBadges: [
      '.ytp-ad-badge',
      '.ytp-ad-simple-ad-badge',
      '.ytp-ad-preview-text',
      '.ytp-ad-duration-remaining',
      '[class*="ytp-ad-badge"]',
      '.ytp-ad-text',
      '.badge-shape-wiz--thumbnail-badge'
    ],

    // Ad UI overlays & metadata wrappers inside player
    adOverlays: [
      '.ytp-ad-player-overlay',
      '.ytp-ad-player-overlay-layout',
      '.ytp-ad-player-overlay-flyout-cta',
      '.ytp-ad-action-interstitial',
      '.ytp-ad-overlay-container',
      '.ytp-ad-button-vm',
      '.ytp-ad-text',
      '.ytp-ad-preview-text',
      '.ytp-ad-duration-remaining'
    ],

    // Banner / companion ad slots on the page (static, non-video)
    bannerAdSlots: [
      'ytd-action-companion-ad-renderer',
      'ytd-display-ad-renderer',
      'ytd-banner-promo-renderer',
      'ytd-promoted-sparkles-web-renderer',
      'ytd-in-feed-ad-layout-renderer',
      'ytd-ad-slot-renderer',
      '#player-ads'
    ]
  });

  /**
   * Locates the active YouTube player element.
   * @param {Document|Element} context
   * @returns {Element|null}
   */
  function getPlayerElement(context = document) {
    for (const selector of SELECTORS.playerContainers) {
      const el = context.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  /**
   * Locates the active main HTML5 video element.
   * @param {Element} [playerEl]
   * @returns {HTMLVideoElement|null}
   */
  function getVideoElement(playerEl) {
    const root = playerEl || document;
    for (const selector of SELECTORS.videos) {
      const video = root.querySelector(selector);
      if (video && video.tagName === 'VIDEO') return video;
    }
    return null;
  }

  /**
   * Checks if the player DOM container explicitly indicates an active ad.
   * Checks player element classes as well as any active ad player wrappers.
   * @param {Element} playerEl
   * @returns {boolean}
   */
  function isPlayerShowingAd(playerEl) {
    if (playerEl && playerEl.classList) {
      for (const cls of SELECTORS.adPlayerClasses) {
        if (playerEl.classList.contains(cls)) {
          return true;
        }
      }
    }
    // Also check if any active player container in the DOM has ad classes or main-world tag
    if (playerEl && playerEl.getAttribute && playerEl.getAttribute('data-yt-helper-ad') === 'true') {
      return true;
    }
    return Boolean(
      document.querySelector('.ad-showing, .ad-interrupting, [data-yt-helper-ad="true"]') ||
      (playerEl && playerEl.querySelector && playerEl.querySelector('.ad-showing, .ad-interrupting, [data-yt-helper-ad="true"]'))
    );
  }

  /**
   * Checks if in-player Sponsored badges or ad countdown indicators are visible.
   * @param {Element} [playerEl]
   * @returns {boolean}
   */
  function hasSponsoredBadge(playerEl) {
    const root = playerEl || document;
    for (const selector of SELECTORS.adBadges) {
      try {
        const elements = root.querySelectorAll(selector);
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          if (isElementVisible(el)) {
            const text = (el.textContent || '').trim().toLowerCase();
            if (text.includes('sponsored') || text.includes('ad') || text.length > 0) {
              return true;
            }
          }
        }
      } catch (e) {}
    }
    return false;
  }

  /**
   * Checks if the YouTube ad container (.video-ads / .ytp-ad-module) has active ad elements.
   * On normal videos, this container is completely empty.
   * @param {Element} [playerEl]
   * @returns {boolean}
   */
  function hasVideoAdsModule(playerEl) {
    const root = playerEl || document;
    const adModule = root.querySelector('.video-ads, .ytp-ad-module');
    if (adModule && adModule.children && adModule.children.length > 0) {
      for (let i = 0; i < adModule.children.length; i++) {
        const child = adModule.children[i];
        if (child.children.length > 0 || isElementVisible(child) || child.classList.contains('ytp-ad-player-overlay')) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Searches for a visible, interactable official YouTube Skip Button.
   * @param {Element} [playerEl]
   * @returns {HTMLElement|null}
   */
  function findSkipButton(playerEl) {
    const root = playerEl || document;
    for (const selector of SELECTORS.skipButtons) {
      try {
        const btn = root.querySelector(selector);
        if (btn && isElementInteractable(btn)) {
          return btn;
        }
      } catch (e) {
        // Guard against any unusual selector engine issue
      }
    }
    return null;
  }

  /**
   * Searches for a visible overlay close button (for non-linear banner ads on top of video).
   * @param {Element} [playerEl]
   * @returns {HTMLElement|null}
   */
  function findOverlayCloseButton(playerEl) {
    const root = playerEl || document;
    for (const selector of SELECTORS.overlayCloseButtons) {
      try {
        const btn = root.querySelector(selector);
        if (btn && isElementInteractable(btn)) {
          return btn;
        }
      } catch (e) {}
    }
    return null;
  }

  /**
   * Checks if an ad overlay layout is currently rendered in the DOM.
   * @param {Element} [playerEl]
   * @returns {boolean}
   */
  function hasAdOverlay(playerEl) {
    const root = playerEl || document;
    for (const selector of SELECTORS.adOverlays) {
      const el = root.querySelector(selector);
      if (el && isElementVisible(el)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Defensive check to confirm an element is genuinely in the DOM and visible.
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return (rect.width > 0 && rect.height > 0) || (el.offsetWidth > 0 && el.offsetHeight > 0) || el.getClientRects().length > 0;
  }

  /**
   * Check if an element is interactable (clickable).
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  function isElementInteractable(el) {
    if (!isElementVisible(el)) return false;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
      return false;
    }
    return true;
  }

  /**
   * Comprehensive Multi-Signal Ad State Assessment.
   * Evaluates independent detection signals:
   * 1. Player ad classes (.ad-showing / .ad-interrupting / data-yt-helper-ad)
   * 2. Official skip button presence
   * 3. Ad player overlay layout
   * 4. Populated .video-ads / .ytp-ad-module container
   * 5. In-player Sponsored badge indicators
   *
   * @param {Element} [customPlayerEl]
   * @returns {{
   *   isAd: boolean,
   *   confidence: number,
   *   signals: {
   *     playerClass: boolean,
   *     skipButton: boolean,
   *     adOverlay: boolean,
   *     sponsoredBadge: boolean,
   *     videoAdsModule: boolean,
   *     videoPresent: boolean
   *   },
   *   player: Element|null,
   *   video: HTMLVideoElement|null,
   *   skipBtn: HTMLElement|null,
   *   overlayCloseBtn: HTMLElement|null
   * }}
   */
  function detectAdState(customPlayerEl) {
    try {
      const player = customPlayerEl || getPlayerElement();
      const video = getVideoElement(player);
      const skipBtn = findSkipButton(player);
      const overlayCloseBtn = findOverlayCloseButton(player);

      const playerClassSignal = isPlayerShowingAd(player);
      const skipButtonSignal = Boolean(skipBtn);
      const overlaySignal = hasAdOverlay(player);
      const sponsoredSignal = hasSponsoredBadge(player);
      const videoAdsSignal = hasVideoAdsModule(player);
      const videoSignal = Boolean(video);

      // Check main-world attributes on player element
      const mainWorldAdShowing = player ? player.getAttribute('data-yt-helper-ad-showing') === 'true' : false;
      const mainWorldAdState = player ? player.getAttribute('data-yt-helper-ad-state') : null;

      // Classify ad type accurately:
      // A genuine VIDEO AD is interrupting video playback (skippable or unskippable video ad)
      const isVideoAd = playerClassSignal || skipButtonSignal || mainWorldAdShowing || (mainWorldAdState === '1');

      // An OVERLAY AD is a sponsored banner, card, or interstitial overlay that does NOT interrupt video playback
      const isOverlayAd = !isVideoAd && (overlaySignal || sponsoredSignal || videoAdsSignal || Boolean(overlayCloseBtn));

      // Calculate confidence score (0 to 100)
      let confidence = 0;
      if (playerClassSignal) confidence += 40;
      if (skipButtonSignal) confidence += 35;
      if (mainWorldAdShowing) confidence += 40;
      if (overlaySignal) confidence += 20;
      if (sponsoredSignal) confidence += 20;
      if (videoAdsSignal) confidence += 20;

      // An ad is active if either a video ad or an overlay ad is present
      const isAd = isVideoAd || isOverlayAd;

      let adCategory = 'NONE';
      if (isVideoAd) {
        adCategory = skipButtonSignal ? 'SKIPPABLE_VIDEO_AD' : 'NON_SKIPPABLE_VIDEO_AD';
      } else if (isOverlayAd) {
        adCategory = overlayCloseBtn ? 'SPONSORED_OVERLAY' : 'SPONSORED_CARD';
      }

      if (isAd) {
        logger.debug(
          logger.TAGS.AD_DETECT,
          `Ad detected [${adCategory}] (Confidence: ${Math.min(100, confidence)}%): isVideoAd=${isVideoAd}, isOverlayAd=${isOverlayAd}, playerClass=${playerClassSignal}, skipBtn=${skipButtonSignal}, overlay=${overlaySignal}, sponsored=${sponsoredSignal}`
        );
      }

      return {
        isAd,
        isVideoAd,
        isOverlayAd,
        adCategory,
        confidence: Math.min(100, confidence),
        signals: {
          playerClass: playerClassSignal,
          skipButton: skipButtonSignal,
          adOverlay: overlaySignal,
          sponsoredBadge: sponsoredSignal,
          videoAdsModule: videoAdsSignal,
          videoPresent: videoSignal
        },
        player,
        video,
        skipBtn,
        overlayCloseBtn
      };
    } catch (err) {
      logger.debug(logger.TAGS.AD_DETECT, 'Error evaluating player ad state, failing safely:', err);
      return {
        isAd: false,
        isVideoAd: false,
        isOverlayAd: false,
        adCategory: 'NONE',
        confidence: 0,
        signals: {
          playerClass: false,
          skipButton: false,
          adOverlay: false,
          sponsoredBadge: false,
          videoAdsModule: false,
          videoPresent: false
        },
        player: null,
        video: null,
        skipBtn: null,
        overlayCloseBtn: null
      };
    }
  }

  return {
    SELECTORS,
    getPlayerElement,
    getVideoElement,
    isPlayerShowingAd,
    findSkipButton,
    findOverlayCloseButton,
    hasAdOverlay,
    hasSponsoredBadge,
    isElementVisible,
    isElementInteractable,
    detectAdState
  };
});
