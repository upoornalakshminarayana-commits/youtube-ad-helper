/**
 * YT Ad Helper - Preload Script
 * Secure contextBridge exposing controller APIs to renderer without nodeIntegration.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ytAdHelperAPI', {
  getState: () => ipcRenderer.invoke('get-state'),
  setEnabled: (enabled) => ipcRenderer.invoke('set-enabled', enabled),
  resetStats: () => ipcRenderer.invoke('reset-stats'),
  openYouTube: () => ipcRenderer.invoke('open-youtube'),
  openExtensionSetup: () => ipcRenderer.invoke('open-extension-setup'),
  registerNativeHost: () => ipcRenderer.invoke('register-native-host'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Event listeners
  onStateUpdate: (callback) => {
    if (typeof callback === 'function') {
      const subscription = (event, state) => callback(state);
      ipcRenderer.on('state-update', subscription);
      return () => ipcRenderer.removeListener('state-update', subscription);
    }
    return () => {};
  }
});
