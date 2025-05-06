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
  
  // NEW: Listen for audio file ready events
  onAudioFileReady: (callback) => {
    ipcRenderer.on('audio-file-ready', (event, filePath) => callback(filePath));
  },
  
  // Speech recognition controls
  startListening: () => ipcRenderer.invoke('start-listening'),
  stopListening: () => ipcRenderer.invoke('stop-listening'),
  getMockTranscription: () => ipcRenderer.invoke('get-mock-transcription'),
  
  // Speech-to-text conversion
  convertSpeechToText: (audioBlob) => {
    // Convert the blob to a buffer
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = Buffer.from(reader.result);
        ipcRenderer.invoke('convert-speech-to-text', buffer)
          .then(resolve)
          .catch(reject);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(audioBlob);
    });
  },
  
  // System information
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  
  // File operations
  saveRecording: (audioBlob, filename) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = Buffer.from(reader.result);
        ipcRenderer.invoke('save-recording', buffer, filename)
          .then(resolve)
          .catch(reject);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(audioBlob);
    });
  },
  
  // Debug functionality
  toggleDevTools: () => ipcRenderer.invoke('toggle-dev-tools'),
  
  // App control
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  // Audio device management
  getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
  setDefaultAudioDevice: (deviceId) => ipcRenderer.invoke('set-default-audio-device', deviceId)
});