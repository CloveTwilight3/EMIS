// preload.ts - Securely expose Electron APIs to renderer process

import { contextBridge, ipcRenderer } from 'electron';
import type {
  EmisConfig,
  CommandResult,
  TTSResult,
  TTSVoicesResult,
  SpeechRecognitionResult,
  SystemInfo,
  SaveRecordingResult,
  AudioDevicesResult,
  MockTranscriptionResult,
  DevToolsResult
} from './types';

// Define the ElectronAPI interface
export interface ElectronAPI {
  getConfig: () => Promise<EmisConfig>;
  updateConfig: (config: Partial<EmisConfig>) => Promise<EmisConfig>;
  executeCommand: (command: string) => Promise<CommandResult>;
  synthesizeSpeech: (text: string) => Promise<TTSResult>;
  getTtsVoices: () => Promise<TTSVoicesResult>;
  onAudioFileReady: (callback: (filePath: string) => void) => void;
  startListening: () => Promise<CommandResult>;
  stopListening: () => Promise<CommandResult>;
  getMockTranscription: () => Promise<MockTranscriptionResult>;
  convertSpeechToText: (audioBlob: Blob) => Promise<SpeechRecognitionResult>;
  getSystemInfo: () => Promise<SystemInfo>;
  saveRecording: (audioBlob: Blob, filename?: string) => Promise<SaveRecordingResult>;
  toggleDevTools: () => Promise<DevToolsResult>;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  getAudioDevices: () => Promise<AudioDevicesResult>;
  setDefaultAudioDevice: (deviceId: string) => Promise<void>;
}

// Expose selected APIs from Electron to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Get EMIS configuration
  getConfig: (): Promise<EmisConfig> => ipcRenderer.invoke('get-config'),

  // Update EMIS configuration
  updateConfig: (config: Partial<EmisConfig>): Promise<EmisConfig> => ipcRenderer.invoke('update-config', config),

  // Execute a command
  executeCommand: (command: string): Promise<CommandResult> => ipcRenderer.invoke('execute-command', command),

  // TTS functions for Google Cloud integration
  synthesizeSpeech: (text: string): Promise<TTSResult> => ipcRenderer.invoke('synthesize-speech', text),
  getTtsVoices: (): Promise<TTSVoicesResult> => ipcRenderer.invoke('get-tts-voices'),

  // Listen for audio file ready events
  onAudioFileReady: (callback: (filePath: string) => void): void => {
    ipcRenderer.on('audio-file-ready', (_event, filePath: string) => callback(filePath));
  },

  // Speech recognition controls
  startListening: (): Promise<CommandResult> => ipcRenderer.invoke('start-listening'),
  stopListening: (): Promise<CommandResult> => ipcRenderer.invoke('stop-listening'),
  getMockTranscription: (): Promise<MockTranscriptionResult> => ipcRenderer.invoke('get-mock-transcription'),

  // Speech-to-text conversion
  convertSpeechToText: (audioBlob: Blob): Promise<SpeechRecognitionResult> => {
    // Convert the blob to a buffer
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = Buffer.from(reader.result as ArrayBuffer);
        ipcRenderer.invoke('convert-speech-to-text', buffer)
          .then(resolve)
          .catch(reject);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(audioBlob);
    });
  },

  // System information
  getSystemInfo: (): Promise<SystemInfo> => ipcRenderer.invoke('get-system-info'),

  // File operations
  saveRecording: (audioBlob: Blob, filename?: string): Promise<SaveRecordingResult> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = Buffer.from(reader.result as ArrayBuffer);
        ipcRenderer.invoke('save-recording', buffer, filename)
          .then(resolve)
          .catch(reject);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(audioBlob);
    });
  },

  // Debug functionality
  toggleDevTools: (): Promise<DevToolsResult> => ipcRenderer.invoke('toggle-dev-tools'),

  // App control
  minimizeWindow: (): void => ipcRenderer.send('minimize-window'),
  maximizeWindow: (): void => ipcRenderer.send('maximize-window'),
  closeWindow: (): void => ipcRenderer.send('close-window'),

  // Audio device management
  getAudioDevices: (): Promise<AudioDevicesResult> => ipcRenderer.invoke('get-audio-devices'),
  setDefaultAudioDevice: (deviceId: string): Promise<void> => ipcRenderer.invoke('set-default-audio-device', deviceId)
} as ElectronAPI);

// Declare the window interface for TypeScript
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
