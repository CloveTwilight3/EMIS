// preload.js - Securely expose Electron APIs to renderer process

const { contextBridge, ipcRenderer } = require('electron');

// Expose selected APIs from Electron to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Get EMIS configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // Update EMIS configuration
  updateConfig: (config) => ipcRenderer.invoke('update-config', config),
  
  // Execute a command
  executeCommand: (command) => ipcRenderer.invoke('execute-command', command)
});
