// preload.js - Securely expose Electron APIs to renderer process

const { contextBridge, ipcRenderer } = require('electron');

// Expose selected APIs from Electron to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Get EMIS configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // Update EMIS configuration
  updateConfig: (config) => ipcRenderer.invoke('update-config', config),
  
  // Execute a command
  executeCommand: (command) => ipcRenderer.invoke('execute-command', command),
  
  // TTS functions for Google Cloud integration
  synthesizeSpeech: (text) => ipcRenderer.invoke('synthesize-speech', text),
  getTtsVoices: () => ipcRenderer.invoke('get-tts-voices'),
  
  // Speech recognition controls
  startListening: () => ipcRenderer.invoke('start-listening'),
  stopListening: () => ipcRenderer.invoke('stop-listening'),
  getMockTranscription: () => ipcRenderer.invoke('get-mock-transcription')
});