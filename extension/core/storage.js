/**
 * YouTube Ad Helper - Storage Module
 * Manages configuration, user settings, and counters with Chrome Storage.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.YTHelperStorage = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    enabled: true,
    autoSkip: true,
    fastForward: true,
    hideOverlayAds: true,
    showBadge: true,
    debug: false,
    detectedCount: 0,
    handledCount: 0
  });

  const STORAGE_KEYS = Object.keys(DEFAULTS);

  /**
   * Safe check for chrome.storage availability
   */
  function isStorageAvailable() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  /**
   * Retrieves current settings merged with default values.
   * @returns {Promise<Object>}
   */
  async function getSettings() {
    if (!isStorageAvailable()) {
      return { ...DEFAULTS };
    }
    try {
      const data = await chrome.storage.local.get(DEFAULTS);
      return { ...DEFAULTS, ...data };
    } catch (err) {
      console.error('[YT-HELPER] Storage read failed:', err);
      return { ...DEFAULTS };
    }
  }

  /**
   * Sets one or more settings in local storage.
   * @param {Object} partialSettings
   * @returns {Promise<void>}
   */
  async function setSettings(partialSettings) {
    if (!isStorageAvailable() || !partialSettings) return;
    try {
      // Filter out any unexpected non-whitelisted keys
      const sanitized = {};
      for (const [key, value] of Object.entries(partialSettings)) {
        if (key in DEFAULTS) {
          sanitized[key] = value;
        }
      }
      await chrome.storage.local.set(sanitized);
    } catch (err) {
      console.error('[YT-HELPER] Storage write failed:', err);
    }
  }

  /**
   * Increment statistics counters safely.
   * @param {number} detectedDelta
   * @param {number} handledDelta
   * @returns {Promise<{detectedCount: number, handledCount: number}>}
   */
  async function incrementCounters(detectedDelta = 0, handledDelta = 0) {
    if (!isStorageAvailable()) return { detectedCount: 0, handledCount: 0 };
    try {
      const data = await chrome.storage.local.get(['detectedCount', 'handledCount']);
      const updated = {
        detectedCount: Math.max(0, (data.detectedCount || 0) + detectedDelta),
        handledCount: Math.max(0, (data.handledCount || 0) + handledDelta)
      };
      await chrome.storage.local.set(updated);
      return updated;
    } catch (err) {
      console.error('[YT-HELPER] Counter update failed:', err);
      return { detectedCount: 0, handledCount: 0 };
    }
  }

  /**
   * Resets all statistics counters back to 0.
   * @returns {Promise<void>}
   */
  async function resetCounters() {
    if (!isStorageAvailable()) return;
    try {
      await chrome.storage.local.set({
        detectedCount: 0,
        handledCount: 0
      });
    } catch (err) {
      console.error('[YT-HELPER] Counter reset failed:', err);
    }
  }

  /**
   * Registers a listener for storage changes.
   * @param {Function} callback (changes, areaName) => void
   */
  function addChangeListener(callback) {
    if (!isStorageAvailable() || typeof callback !== 'function') return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        callback(changes);
      }
    });
  }

  return {
    DEFAULTS,
    STORAGE_KEYS,
    getSettings,
    setSettings,
    incrementCounters,
    resetCounters,
    addChangeListener
  };
});
