// types.ts - TypeScript type definitions for EMIS

export interface EmisPersonality {
  greeting: string;
  farewell: string;
  unknownCommand: string;
  taskComplete: string;
  thinking: string;
  confusion: string;
  affirmation: string;
}

export interface SystemSettings {
  autoStart: boolean;
  startMinimized: boolean;
  minimizeToTray: boolean;
  alwaysUseGoogleTTS: boolean;
  fallbackToBrowser: boolean;
  logLevel: 'info' | 'warn' | 'error' | 'debug';
}

export interface FallbackVoice {
  name: string;
  lang: string;
  localService: boolean;
}

export interface EmisConfig {
  name: string;
  voice: string;
  fallbackVoice: FallbackVoice;
  wakeWord: string;
  volume: number;
  speechThreshold: number;
  personality: EmisPersonality;
  systemSettings: SystemSettings;
}

export interface CommandResult {
  success: boolean;
  response: string;
  error?: string;
}

export interface TTSResult {
  success: boolean;
  audioFile?: string;
  error?: string;
  message?: string;
}

export interface VoiceInfo {
  name: string;
  languageCode: string;
  ssmlGender: string;
}

export interface TTSVoicesResult {
  success: boolean;
  voices?: VoiceInfo[];
  error?: string;
  message?: string;
}

export interface SpeechRecognitionResult {
  success: boolean;
  transcript?: string;
  confidence?: number;
  source?: 'google-cloud' | 'browser' | 'mock';
  error?: string;
  fallback?: boolean;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  version: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  emisVersion: string;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
}

export interface SaveRecordingResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface AudioDevicesResult {
  success: boolean;
  devices: MediaDeviceInfo[];
}

export interface AppMapping {
  win?: string;
  mac?: string;
  linux?: string;
  flatpak?: string;
}

export interface AppMappings {
  [key: string]: AppMapping;
}

export interface SpeechRecognitionOptions {
  encoding?: string;
  sampleRateHertz?: number;
  languageCode?: string;
  model?: string;
  enableAutomaticPunctuation?: boolean;
  enableWordTimeOffsets?: boolean;
  maxAlternatives?: number;
  speechContexts?: Array<{
    phrases: string[];
    boost: number;
  }>;
  useEnhanced?: boolean;
  adaptation?: {
    speakerTag: number;
  };
}

export interface MockTranscriptionResult {
  success: boolean;
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export interface DevToolsResult {
  open?: boolean;
  error?: string;
}
