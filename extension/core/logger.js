/**
 * YouTube Ad Helper - Logger Module
 * Provides structured, tagged debugging without console spam.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.YTHelperLogger = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let isDebugEnabled = false;

  const PREFIX = '[YT-HELPER]';

  const TAGS = {
    GENERAL: '[YT-HELPER]',
    PLAYER: '[PLAYER]',
    AD_DETECT: '[AD-DETECT]',
    SKIP: '[SKIP]',
    NAVIGATION: '[NAVIGATION]',
    OBSERVER: '[OBSERVER]',
    STORAGE: '[STORAGE]',
    ERROR: '[ERROR]'
  };

  const getTimestamp = () => new Date().toISOString().substring(11, 19);

  function log(tag, ...args) {
    if (!isDebugEnabled) return;
    console.log(`%c${PREFIX}%c${tag}%c[${getTimestamp()}]`, 'color: #ff0000; font-weight: bold;', 'color: #3ea6ff; font-weight: bold; margin-left: 4px;', 'color: #888; margin-left: 4px;', ...args);
  }

  function info(tag, ...args) {
    if (!isDebugEnabled) return;
    console.info(`%c${PREFIX}%c${tag}%c[${getTimestamp()}]`, 'color: #ff0000; font-weight: bold;', 'color: #2ba640; font-weight: bold; margin-left: 4px;', 'color: #888; margin-left: 4px;', ...args);
  }

  function warn(tag, ...args) {
    if (!isDebugEnabled) return;
    console.warn(`%c${PREFIX}%c${tag}%c[${getTimestamp()}]`, 'color: #ff0000; font-weight: bold;', 'color: #ffaa00; font-weight: bold; margin-left: 4px;', 'color: #888; margin-left: 4px;', ...args);
  }

  function error(tag, ...args) {
    // Errors are always logged if critical, but formatted cleanly
    console.error(`%c${PREFIX}%c${tag}%c[${getTimestamp()}]`, 'color: #ff0000; font-weight: bold;', 'color: #ff4444; font-weight: bold; margin-left: 4px;', 'color: #888; margin-left: 4px;', ...args);
  }

  return {
    TAGS,
    setDebug: function (val) {
      isDebugEnabled = Boolean(val);
    },
    isDebug: function () {
      return isDebugEnabled;
    },
    debug: function (tag, ...args) {
      log(tag || TAGS.GENERAL, ...args);
    },
    info: function (tag, ...args) {
      info(tag || TAGS.GENERAL, ...args);
    },
    warn: function (tag, ...args) {
      warn(tag || TAGS.GENERAL, ...args);
    },
    error: function (tag, ...args) {
      error(tag || TAGS.ERROR, ...args);
    }
  };
});
