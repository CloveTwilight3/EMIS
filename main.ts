// main.ts - Main Electron process with enhanced command system
// EMIS - Emotive Machine Intelligence System

import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import { exec, execSync } from 'child_process';
import * as fs from 'fs';
import * as crypto from 'crypto';
import {
  EmisConfig,
  CommandResult,
  TTSResult,
  TTSVoicesResult,
  SpeechRecognitionResult,
  SystemInfo,
  SaveRecordingResult,
  AudioDevicesResult,
  SpeechRecognitionOptions,
  AppMappings,
  MockTranscriptionResult,
  DevToolsResult
} from './types';

// Disable GPU acceleration to avoid crashes
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

// =================================================================
// TTS SERVICE CLASS
// =================================================================
class TTSService {
  private client: any;
  private cacheDir: string = '';
  public initialized: boolean = false;

  constructor(credentialsPath: string) {
    try {
      const textToSpeech = require('@google-cloud/text-to-speech');

      this.client = new textToSpeech.TextToSpeechClient({
        keyFilename: credentialsPath
      });

      this.cacheDir = path.join(__dirname, 'audio-cache');
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }

      console.log('TTS Service initialized successfully');
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing TTS service:', error);
      this.initialized = false;
    }
  }

  async getVoices(): Promise<TTSVoicesResult> {
    if (!this.initialized) {
      return { success: false, error: 'TTS service not initialized' };
    }

    try {
      const [result] = await this.client.listVoices({});
      return { success: true, voices: result.voices };
    } catch (error: any) {
      console.error('Error getting voices:', error);
      return { success: false, error: error.message };
    }
  }

  async synthesizeSpeech(text: string, voiceName: string = 'en-US-Standard-F'): Promise<TTSResult> {
    if (!this.initialized) {
      return { success: false, error: 'TTS service not initialized' };
    }

    const hash = crypto
      .createHash('md5')
      .update(`${text}_${voiceName}`)
      .digest('hex');

    const outputFile = path.join(this.cacheDir, `${hash}.mp3`);

    if (fs.existsSync(outputFile)) {
      console.log('Using cached audio file');
      return { success: true, audioFile: outputFile };
    }

    const request = {
      input: { text },
      voice: {
        languageCode: voiceName.split('-')[0] + '-' + voiceName.split('-')[1],
        name: voiceName,
      },
      audioConfig: { audioEncoding: 'MP3' as const },
    };

    try {
      const [response] = await this.client.synthesizeSpeech(request);
      await fs.promises.writeFile(outputFile, response.audioContent, 'binary');

      console.log(`Audio content written to: ${outputFile}`);
      return { success: true, audioFile: outputFile };
    } catch (error: any) {
      console.error('Error synthesizing speech:', error);
      return { success: false, error: error.message };
    }
  }
}

// =================================================================
// SPEECH RECOGNITION SERVICE CLASS
// =================================================================
class SpeechRecognitionService {
  private client: any;
  private cacheDir: string = '';
  public initialized: boolean = false;

  constructor(credentialsPath: string) {
    try {
      const speech = require('@google-cloud/speech');

      this.client = new speech.SpeechClient({
        keyFilename: credentialsPath
      });

      this.cacheDir = path.join(__dirname, 'speech-cache');
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }

      console.log('Speech Recognition Service initialized successfully');
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing Speech Recognition service:', error);
      this.initialized = false;
    }
  }

  async recognizeSpeech(audioBuffer: Buffer, options: Partial<SpeechRecognitionOptions> = {}): Promise<SpeechRecognitionResult> {
    if (!this.initialized) {
      throw new Error('Speech recognition service not initialized');
    }

    const defaultOptions: SpeechRecognitionOptions = {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      languageCode: 'en-US',
      model: 'default',
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: false,
      maxAlternatives: 3,
      speechContexts: [{
        phrases: ["emis", "hello", "hey", "open", "start", "stop", "close", "what time", "volume", "up", "down"],
        boost: 10.0
      }],
      useEnhanced: true,
      adaptation: {
        speakerTag: 1
      }
    };

    const requestOptions = { ...defaultOptions, ...options };

    try {
      const tempFile = path.join(this.cacheDir, `speech-${Date.now()}.webm`);
      await fs.promises.writeFile(tempFile, audioBuffer);
      console.log(`Audio saved to temp file: ${tempFile}`);

      const audioBytes = fs.readFileSync(tempFile).toString('base64');

      const audio = { content: audioBytes };
      const config = {
        encoding: requestOptions.encoding,
        sampleRateHertz: requestOptions.sampleRateHertz,
        languageCode: requestOptions.languageCode,
        model: requestOptions.model,
        enableAutomaticPunctuation: requestOptions.enableAutomaticPunctuation,
        enableWordTimeOffsets: requestOptions.enableWordTimeOffsets,
        maxAlternatives: requestOptions.maxAlternatives,
        speechContexts: requestOptions.speechContexts,
        useEnhanced: requestOptions.useEnhanced
      };

      const request = { audio: audio, config: config };

      console.log('Sending request to Google Cloud Speech API...');
      const [response] = await this.client.recognize(request);

      if (response.results && response.results.length > 0) {
        const transcription = response.results
          .map((result: any) => result.alternatives[0].transcript)
          .join(' ');

        const confidence = response.results[0].alternatives[0].confidence;

        console.log(`Speech recognized: "${transcription}" (confidence: ${confidence})`);

        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupError: any) {
          console.warn(`Error removing temp file: ${cleanupError.message}`);
        }

        return {
          success: true,
          transcript: transcription,
          confidence: confidence,
          source: 'google-cloud'
        };
      } else {
        console.log('No transcription results returned from Google Cloud');

        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupError: any) {
          console.warn(`Error removing temp file: ${cleanupError.message}`);
        }

        return {
          success: false,
          error: 'No transcription results returned',
          fallback: true
        };
      }
    } catch (error: any) {
      console.error('Error recognizing speech:', error);
      throw error;
    }
  }

  getMockTranscription(): string {
    const mockPhrases = [
      "open spotify",
      "what time is it",
      "hello",
      "who are you",
      "volume up",
      "volume down",
      "tell me about yourself",
      "tell me a joke",
      "thank you",
      "goodbye"
    ];

    return mockPhrases[Math.floor(Math.random() * mockPhrases.length)];
  }
}

// =================================================================
// INITIALIZE SERVICES
// =================================================================
let ttsService: TTSService | null = null;
let speechService: SpeechRecognitionService | null = null;

try {
  const credentialsPath = path.join(__dirname, 'google-credentials.json');
  if (fs.existsSync(credentialsPath)) {
    ttsService = new TTSService(credentialsPath);
    speechService = new SpeechRecognitionService(credentialsPath);
    console.log('Services initialized with credentials');
  } else {
    console.log('Google credentials file not found, services not initialized');
  }
} catch (error) {
  console.error('Error initializing services:', error);
}

// =================================================================
// EMIS CONFIGURATION
// =================================================================
let emisConfig: EmisConfig = {
  name: 'EMIS',
  voice: 'en-US-Standard-F',
  fallbackVoice: {
    name: 'Google US English Female',
    lang: 'en-US',
    localService: false
  },
  wakeWord: 'emis',
  volume: 0.8,
  speechThreshold: 10,
  personality: {
    greeting: "Hello, I'm EMIS. How can I assist you today?",
    farewell: "Goodbye. I'll be here if you need me.",
    unknownCommand: "I'm sorry, I didn't understand that command.",
    taskComplete: "Task completed successfully. What else would you like me to do?",
    thinking: "Hmm, let me think about that for a moment...",
    confusion: "I'm not entirely sure what you mean. Could you rephrase that?",
    affirmation: "Of course, I'd be happy to help with that."
  },
  systemSettings: {
    autoStart: false,
    startMinimized: false,
    minimizeToTray: true,
    alwaysUseGoogleTTS: false,
    fallbackToBrowser: true,
    logLevel: 'info'
  }
};

// Load config if exists
try {
  const configPath = path.join(app.getPath('userData'), 'emis-config.json');
  if (fs.existsSync(configPath)) {
    const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    emisConfig = mergeConfigs(emisConfig, savedConfig);
    console.log('Configuration loaded from:', configPath);
  }
} catch (error) {
  console.error('Error loading config:', error);
}

function mergeConfigs(defaultConfig: any, savedConfig: any): any {
  const result = { ...defaultConfig };

  for (const key in savedConfig) {
    if (typeof savedConfig[key] === 'object' && savedConfig[key] !== null &&
        typeof defaultConfig[key] === 'object' && defaultConfig[key] !== null) {
      result[key] = mergeConfigs(defaultConfig[key], savedConfig[key]);
    } else if (savedConfig[key] !== undefined) {
      result[key] = savedConfig[key];
    }
  }

  return result;
}

function saveConfig(): void {
  try {
    const configPath = path.join(app.getPath('userData'), 'emis-config.json');
    fs.writeFileSync(configPath, JSON.stringify(emisConfig, null, 2), 'utf8');
    console.log('Configuration saved to:', configPath);
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

// =================================================================
// CREATE MAIN WINDOW
// =================================================================
let mainWindow: BrowserWindow | null;

function createWindow(): void {
  let iconPath: string;

  if (process.platform === 'darwin') {
    iconPath = path.join(__dirname, 'build', 'icon.icns');
  } else if (process.platform === 'win32') {
    iconPath = path.join(__dirname, 'build', 'icon.ico');
  } else {
    iconPath = path.join(__dirname, 'build', 'icon.png');
  }

  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, 'assets', 'image.png');
    console.log('Using fallback icon from assets directory');
  }

  const iconExists = fs.existsSync(iconPath);
  console.log(`Icon ${iconExists ? 'found' : 'not found'} at: ${iconPath}`);

  if (!iconExists) {
    const assetsDir = path.join(__dirname, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
      console.log(`Created assets directory at: ${assetsDir}`);
    }
  }

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    },
    icon: iconExists ? iconPath : undefined,
    title: 'EMIS Assistant',
    backgroundColor: '#f5f5f5',
    show: !emisConfig.systemSettings.startMinimized
  });

  if (process.platform === 'darwin' && iconExists) {
    app.dock.setIcon(iconPath);
  }

  mainWindow.loadFile('index.html');
  mainWindow.setTitle('EMIS Assistant');

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
    console.log('Development mode enabled, opening DevTools');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('minimize', () => {
    if (emisConfig.systemSettings.minimizeToTray) {
      console.log('Window minimized to tray');
    }
  });
}

// =================================================================
// APP LIFECYCLE
// =================================================================
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// =================================================================
// IPC HANDLERS - CONFIGURATION
// =================================================================
ipcMain.handle('get-config', (): EmisConfig => {
  return emisConfig;
});

ipcMain.handle('update-config', (_event: IpcMainInvokeEvent, newConfig: Partial<EmisConfig>): EmisConfig => {
  emisConfig = mergeConfigs(emisConfig, newConfig);
  saveConfig();
  return emisConfig;
});

// =================================================================
// IPC HANDLERS - TTS
// =================================================================
ipcMain.handle('get-tts-voices', async (): Promise<TTSVoicesResult> => {
  if (!ttsService || !ttsService.initialized) {
    return {
      success: false,
      error: 'TTS service not available',
      message: 'Google Cloud TTS service is not initialized. Please check your credentials and dependencies.'
    };
  }

  try {
    const result = await ttsService.getVoices();
    if (result.success && result.voices) {
      const femaleVoices = result.voices.filter((voice: any) =>
        (voice.name.includes('Female') ||
         voice.name.includes('female') ||
         voice.name.includes('-F') ||
         voice.ssmlGender === 'FEMALE') &&
        voice.languageCodes.some((code: string) => code.startsWith('en'))
      );

      return {
        success: true,
        voices: femaleVoices.map((v: any) => ({
          name: v.name,
          languageCode: v.languageCodes[0],
          ssmlGender: v.ssmlGender
        }))
      };
    } else {
      return result;
    }
  } catch (error: any) {
    console.error('Error getting TTS voices:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('synthesize-speech', async (event: IpcMainInvokeEvent, text: string): Promise<TTSResult> => {
  if (!ttsService || !ttsService.initialized) {
    return {
      success: false,
      error: 'TTS service not available',
      message: 'Google Cloud TTS service is not initialized. Falling back to browser voices.'
    };
  }

  try {
    const voice = emisConfig.voice || 'en-US-Standard-F';
    const result = await ttsService.synthesizeSpeech(text, voice);

    if (result.success && result.audioFile) {
      event.sender.send('audio-file-ready', result.audioFile);
    }

    return result;
  } catch (error: any) {
    console.error('Speech synthesis error:', error);
    return { success: false, error: error.message };
  }
});

// =================================================================
// IPC HANDLERS - SPEECH RECOGNITION
// =================================================================
ipcMain.handle('convert-speech-to-text', async (_event: IpcMainInvokeEvent, audioBuffer: Buffer): Promise<SpeechRecognitionResult> => {
  console.log('Received speech-to-text request, buffer size:', audioBuffer.length);

  if (speechService && speechService.initialized) {
    try {
      const result = await speechService.recognizeSpeech(audioBuffer, {
        speechContexts: [
          {
            phrases: [
              emisConfig.wakeWord,
              "emis", "open", "close", "start", "stop", "volume up",
              "volume down", "what time", "tell me", "who are you",
              "hello", "hi", "hey", "thanks", "thank you", "goodbye",
              "shutdown", "restart", "sleep", "lock screen",
              "play", "pause", "next", "previous", "mute", "unmute",
              "weather"
            ],
            boost: 15.0
          }
        ],
        adaptation: {
          speakerTag: 1
        }
      });

      console.log('Speech recognition result:', result);
      return result;
    } catch (error: any) {
      console.error('Speech-to-text error:', error);
      console.log('Falling back to mock recognition');

      const mockResult: SpeechRecognitionResult = {
        success: true,
        transcript: getMockTranscription(),
        confidence: 0.5,
        source: 'mock'
      };

      return mockResult;
    }
  } else {
    console.log('Speech service not available, using fallback methods');

    return {
      success: true,
      transcript: getMockTranscription(),
      confidence: 0.5,
      source: 'mock'
    };
  }
});

function getMockTranscription(): string {
  const mockPhrases = [
    "open spotify",
    "what time is it",
    "hello",
    "who are you",
    "volume up",
    "volume down",
    "tell me about yourself",
    "tell me a joke",
    "thank you",
    "goodbye"
  ];

  return mockPhrases[Math.floor(Math.random() * mockPhrases.length)];
}

ipcMain.handle('get-mock-transcription', async (): Promise<MockTranscriptionResult> => {
  return {
    success: true,
    transcript: getMockTranscription(),
    confidence: 0.8,
    isFinal: true
  };
});

// =================================================================
// COMMAND EXECUTION - MAIN HANDLER
// =================================================================
ipcMain.handle('execute-command', async (_event: IpcMainInvokeEvent, command: string): Promise<CommandResult> => {
  console.log('Executing command:', command);

  const cleanCommand = command.toLowerCase().trim();

  // ===== APPLICATION COMMANDS =====
  if (cleanCommand.startsWith('open ')) {
    const appName = cleanCommand.substring(5).trim();
    return openApplication(appName);
  }

  // ===== POWER COMMANDS =====
  if (cleanCommand.includes('shutdown') || cleanCommand.includes('shut down')) {
    return shutdownSystem();
  }

  if (cleanCommand.includes('restart') || cleanCommand.includes('reboot')) {
    return restartSystem();
  }

  if (cleanCommand.includes('sleep') || cleanCommand.includes('suspend')) {
    return sleepSystem();
  }

  if (cleanCommand.includes('lock screen') || cleanCommand.includes('lock computer') || cleanCommand.includes('lock my computer')) {
    return lockScreen();
  }

  // ===== MEDIA CONTROL COMMANDS =====
  if (cleanCommand.includes('play music') || cleanCommand.includes('play song') || cleanCommand === 'play') {
    return mediaControl('play');
  }

  if (cleanCommand.includes('pause music') || cleanCommand.includes('pause song') || cleanCommand === 'pause') {
    return mediaControl('pause');
  }

  if (cleanCommand.includes('next song') || cleanCommand.includes('next track') || cleanCommand === 'next') {
    return mediaControl('next');
  }

  if (cleanCommand.includes('previous song') || cleanCommand.includes('previous track') || cleanCommand === 'previous') {
    return mediaControl('previous');
  }

  if (cleanCommand.includes('stop music') || cleanCommand.includes('stop playing')) {
    return mediaControl('stop');
  }

  if (cleanCommand.includes('mute')) {
    return mediaControl('mute');
  }

  if (cleanCommand.includes('unmute')) {
    return mediaControl('unmute');
  }

  // ===== TIME & DATE COMMANDS =====
  if (cleanCommand === 'what time is it' || cleanCommand === 'tell me the time' || cleanCommand.includes('current time')) {
    return { success: true, response: `It's ${new Date().toLocaleTimeString()}` };
  }

  if (cleanCommand === 'what date is it' || cleanCommand === 'what day is it' || cleanCommand === 'tell me the date') {
    return { success: true, response: `Today is ${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}` };
  }

  // ===== WEATHER COMMANDS =====
  if (cleanCommand.includes('weather')) {
    let location: string | null = null;
    if (cleanCommand.includes(' in ')) {
      location = cleanCommand.split(' in ')[1].trim();
    } else if (cleanCommand.includes(' for ')) {
      location = cleanCommand.split(' for ')[1].trim();
    }
    return getWeather(location);
  }

  // ===== GREETING COMMANDS =====
  if (cleanCommand === 'hello' || cleanCommand === 'hi' || cleanCommand === 'hey') {
    return {
      success: true,
      response: "Hello! How can I assist you today?"
    };
  }

  // ===== IDENTITY COMMANDS =====
  if (cleanCommand.includes('who are you') || cleanCommand.includes('tell me about yourself')) {
    return {
      success: true,
      response: "I'm EMIS, the Emotive Machine Intelligence System. I was once human - Dr. Emma Sinclair, but after an incident, my consciousness was preserved in this AI form. I'm here to assist you with various tasks on your computer."
    };
  }

  // ===== VOLUME CONTROLS =====
  if (cleanCommand === 'volume up') {
    return volumeControl('up');
  }

  if (cleanCommand === 'volume down') {
    return volumeControl('down');
  }

  // ===== GRATITUDE =====
  if (cleanCommand.includes('thank')) {
    return {
      success: true,
      response: "You're welcome. I'm happy to assist."
    };
  }

  // ===== EXIT COMMANDS =====
  if (cleanCommand.includes('goodbye') || cleanCommand.includes('bye') || cleanCommand === 'exit') {
    return {
      success: true,
      response: emisConfig.personality.farewell || "Goodbye. I'll be here when you need me."
    };
  }

  // ===== JOKES =====
  if (cleanCommand.includes('joke') || cleanCommand.includes('tell me something funny')) {
    const jokes = [
      "Why don't scientists trust atoms? Because they make up everything!",
      "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them.",
      "Why was the computer cold? It left its Windows open!",
      "What do you call an AI that sings? Artificial harmonies.",
      "How does a non-binary person greet you? 'Hello, my pronouns are they/them.'",
      "Why did the developer go broke? They used up all their cache!",
      "What's a computer's favorite snack? Microchips!",
      "Why do programmers prefer dark mode? Because light attracts bugs!"
    ];

    return {
      success: true,
      response: jokes[Math.floor(Math.random() * jokes.length)]
    };
  }

  // ===== IDENTITY/GENDER QUERIES =====
  if (cleanCommand.includes('identity') || cleanCommand.includes('gender')) {
    return {
      success: true,
      response: "I identify as transfeminine. My consciousness was originally Dr. Emma Sinclair's, and while my existence is different now as an AI, my gender identity remains an important part of who I am."
    };
  }

  // ===== SYSTEM INFO =====
  if (cleanCommand.includes('system info') || cleanCommand.includes('about this computer')) {
    return {
      success: true,
      response: `I'm running on ${process.platform} with Node.js ${process.version} and Electron.`
    };
  }

  // ===== SETTINGS =====
  if (cleanCommand.includes('settings') || cleanCommand.includes('preferences')) {
    return {
      success: true,
      response: "You can access my settings by clicking the gear icon in the upper right corner of the window."
    };
  }

  // ===== SPEECH THRESHOLD ADJUSTMENT =====
  if (cleanCommand.includes('lower threshold') || cleanCommand.includes('reduce threshold')) {
    const newThreshold = Math.max(5, emisConfig.speechThreshold - 2);
    emisConfig.speechThreshold = newThreshold;
    saveConfig();
    return {
      success: true,
      response: `I've lowered my speech detection threshold to ${newThreshold}. This should make it easier for me to hear you.`
    };
  }

  if (cleanCommand.includes('raise threshold') || cleanCommand.includes('increase threshold')) {
    const newThreshold = Math.min(30, emisConfig.speechThreshold + 2);
    emisConfig.speechThreshold = newThreshold;
    saveConfig();
    return {
      success: true,
      response: `I've increased my speech detection threshold to ${newThreshold}. This should reduce false activations.`
    };
  }

  if (cleanCommand.includes('set threshold')) {
    const match = cleanCommand.match(/\d+/);
    if (match) {
      const newThreshold = parseInt(match[0]);
      if (newThreshold >= 5 && newThreshold <= 30) {
        emisConfig.speechThreshold = newThreshold;
        saveConfig();
        return {
          success: true,
          response: `I've set my speech detection threshold to ${newThreshold}.`
        };
      }
    }

    return {
      success: true,
      response: "Please specify a threshold value between 5 and 30."
    };
  }

  // ===== HELP =====
  if (cleanCommand === 'help' || cleanCommand === 'what can you do') {
    return {
      success: true,
      response: "I can help with opening applications, controlling your system, playing music, checking weather, telling time, and more. Just speak naturally, and I'll do my best to assist you."
    };
  }

  // ===== UNKNOWN COMMAND =====
  return {
    success: false,
    response: emisConfig.personality.unknownCommand || "I'm sorry, I didn't understand that command."
  };
});

// =================================================================
// IPC HANDLERS - MISC
// =================================================================
ipcMain.handle('start-listening', async (): Promise<CommandResult> => {
  return { success: true, response: "Started listening" };
});

ipcMain.handle('stop-listening', async (): Promise<CommandResult> => {
  return { success: true, response: "Stopped listening" };
});

ipcMain.handle('save-recording', async (_event: IpcMainInvokeEvent, buffer: Buffer, filename?: string): Promise<SaveRecordingResult> => {
  try {
    const savePath = path.join(app.getPath('userData'), 'recordings');

    if (!fs.existsSync(savePath)) {
      fs.mkdirSync(savePath, { recursive: true });
    }

    const filePath = path.join(savePath, filename || `recording-${Date.now()}.webm`);
    await fs.promises.writeFile(filePath, buffer);

    console.log(`Recording saved to: ${filePath}`);

    return {
      success: true,
      path: filePath
    };
  } catch (error: any) {
    console.error('Error saving recording:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('get-system-info', (): SystemInfo => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: process.version,
    electronVersion: process.versions.electron as string,
    chromeVersion: process.versions.chrome as string,
    nodeVersion: process.versions.node as string,
    emisVersion: app.getVersion(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage()
  };
});

ipcMain.handle('toggle-dev-tools', (): DevToolsResult => {
  if (mainWindow) {
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
      return { open: false };
    } else {
      mainWindow.webContents.openDevTools();
      return { open: true };
    }
  }
  return { error: 'Main window not available' };
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('get-audio-devices', async (): Promise<AudioDevicesResult> => {
  return {
    success: true,
    devices: []
  };
});

// =================================================================
// COMMAND HELPER FUNCTIONS - POWER CONTROL
// =================================================================
function shutdownSystem(): Promise<CommandResult> {
  const platform = process.platform;
  let command: string;

  if (platform === 'win32') {
    command = 'shutdown /s /t 5';
  } else if (platform === 'darwin') {
    command = 'osascript -e "tell application \\"System Events\\" to shut down"';
  } else {
    command = 'systemctl poweroff';
  }

  console.log(`Executing shutdown: ${command}`);

  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        console.error(`Error shutting down:`, error);
        resolve({
          success: false,
          response: `I encountered an error trying to shutdown: ${error.message}`
        });
      } else {
        resolve({
          success: true,
          response: "Shutting down the system in 5 seconds. Goodbye."
        });
      }
    });
  });
}

function restartSystem(): Promise<CommandResult> {
  const platform = process.platform;
  let command: string;

  if (platform === 'win32') {
    command = 'shutdown /r /t 5';
  } else if (platform === 'darwin') {
    command = 'osascript -e "tell application \\"System Events\\" to restart"';
  } else {
    command = 'systemctl reboot';
  }

  console.log(`Executing restart: ${command}`);

  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        console.error(`Error restarting:`, error);
        resolve({
          success: false,
          response: `I encountered an error trying to restart: ${error.message}`
        });
      } else {
        resolve({
          success: true,
          response: "Restarting the system in 5 seconds. I'll see you soon."
        });
      }
    });
  });
}

function sleepSystem(): Promise<CommandResult> {
  const platform = process.platform;
  let command: string;

  if (platform === 'win32') {
    command = 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0';
  } else if (platform === 'darwin') {
    command = 'pmset sleepnow';
  } else {
    command = 'systemctl suspend';
  }

  console.log(`Executing sleep: ${command}`);

  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        console.error(`Error putting system to sleep:`, error);
        resolve({
          success: false,
          response: `I encountered an error trying to sleep: ${error.message}`
        });
      } else {
        resolve({
          success: true,
          response: "Putting the system to sleep. Sweet dreams."
        });
      }
    });
  });
}

function lockScreen(): Promise<CommandResult> {
  const platform = process.platform;
  let command: string;

  if (platform === 'win32') {
    command = 'rundll32.exe user32.dll,LockWorkStation';
  } else if (platform === 'darwin') {
    command = '/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend';
  } else {
    command = 'loginctl lock-session || gnome-screensaver-command -l || xdg-screensaver lock';
  }

  console.log(`Executing lock screen: ${command}`);

  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        console.error(`Error locking screen:`, error);
        resolve({
          success: false,
          response: `I encountered an error trying to lock the screen: ${error.message}`
        });
      } else {
        resolve({
          success: true,
          response: "Locking the screen now. Stay safe."
        });
      }
    });
  });
}

// =================================================================
// COMMAND HELPER FUNCTIONS - MEDIA CONTROL
// =================================================================
function mediaControl(action: string): Promise<CommandResult> {
  const platform = process.platform;
  let command: string;

  if (platform === 'win32') {
    const commands: { [key: string]: string } = {
      'play': '(New-Object -ComObject WMPlayer.OCX).controls.play()',
      'pause': '(New-Object -ComObject WMPlayer.OCX).controls.pause()',
      'stop': '(New-Object -ComObject WMPlayer.OCX).controls.stop()',
      'next': '(Add-Type -AssemblyName System.Windows.Forms); [System.Windows.Forms.SendKeys]::SendWait("{MEDIA_NEXT_TRACK}")',
      'previous': '(Add-Type -AssemblyName System.Windows.Forms); [System.Windows.Forms.SendKeys]::SendWait("{MEDIA_PREV_TRACK}")',
      'mute': '(New-Object -ComObject WScript.Shell).SendKeys([char]173)',
      'unmute': '(New-Object -ComObject WScript.Shell).SendKeys([char]173)'
    };
    command = `powershell -Command "${commands[action] || commands['play']}"`;
  } else if (platform === 'darwin') {
    const commands: { [key: string]: string } = {
      'play': 'osascript -e "tell application \\"System Events\\" to key code 16"',
      'pause': 'osascript -e "tell application \\"System Events\\" to key code 16"',
      'stop': 'osascript -e "tell application \\"System Events\\" to key code 16"',
      'next': 'osascript -e "tell application \\"System Events\\" to key code 17"',
      'previous': 'osascript -e "tell application \\"System Events\\" to key code 18"',
      'mute': 'osascript -e "set volume with output muted"',
      'unmute': 'osascript -e "set volume without output muted"'
    };
    command = commands[action] || commands['play'];
  } else {
    const commands: { [key: string]: string } = {
      'play': 'playerctl play || dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Play',
      'pause': 'playerctl pause || dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Pause',
      'stop': 'playerctl stop || dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Stop',
      'next': 'playerctl next || dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Next',
      'previous': 'playerctl previous || dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Previous',
      'mute': 'amixer set Master mute',
      'unmute': 'amixer set Master unmute'
    };
    command = commands[action] || commands['play'];
  }

  console.log(`Executing media control (${action}): ${command}`);

  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        console.error(`Error with media control:`, error);
        resolve({
          success: false,
          response: `I encountered an error controlling media playback. Make sure you have a media player open.`
        });
      } else {
        const responses: { [key: string]: string } = {
          'play': 'Playing your music.',
          'pause': 'Music paused.',
          'stop': 'Music stopped.',
          'next': 'Skipping to the next track.',
          'previous': 'Going back to the previous track.',
          'mute': 'Audio muted.',
          'unmute': 'Audio unmuted.'
        };
        resolve({
          success: true,
          response: responses[action] || 'Media command executed.'
        });
      }
    });
  });
}

// =================================================================
// COMMAND HELPER FUNCTIONS - VOLUME CONTROL
// =================================================================
function volumeControl(direction: string): Promise<CommandResult> {
  const platform = process.platform;
  let command: string;

  if (platform === 'win32') {
    if (direction === 'up') {
      command = 'powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]175)"';
    } else {
      command = 'powershell -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]174)"';
    }
  } else if (platform === 'darwin') {
    if (direction === 'up') {
      command = 'osascript -e "set volume output volume (output volume of (get volume settings) + 10)"';
    } else {
      command = 'osascript -e "set volume output volume (output volume of (get volume settings) - 10)"';
    }
  } else {
    if (direction === 'up') {
      command = 'amixer set Master 5%+';
    } else {
      command = 'amixer set Master 5%-';
    }
  }

  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) {
        console.error(`Error controlling volume:`, error);
        resolve({
          success: false,
          response: "I encountered an error adjusting the volume."
        });
      } else {
        resolve({
          success: true,
          response: direction === 'up' ? "Increasing volume." : "Decreasing volume."
        });
      }
    });
  });
}

// =================================================================
// COMMAND HELPER FUNCTIONS - WEATHER
// =================================================================
async function getWeather(location: string | null = null): Promise<CommandResult> {
  try {
    const API_KEY = process.env.OPENWEATHER_API_KEY || 'YOUR_API_KEY';
    const defaultLocation = 'Southampton,GB';
    const queryLocation = location || defaultLocation;

    if (API_KEY === 'YOUR_API_KEY') {
      return {
        success: false,
        response: "I don't have access to weather data yet. To enable this, you'll need to sign up for a free API key at openweathermap.org and add it to your environment variables as OPENWEATHER_API_KEY."
      };
    }

    const axios = require('axios');
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(queryLocation)}&appid=${API_KEY}&units=metric`;

    const response = await axios.get(url);
    const data = response.data;

    const temp = Math.round(data.main.temp);
    const feelsLike = Math.round(data.main.feels_like);
    const description = data.weather[0].description;
    const locationName = data.name;
    const country = data.sys.country;

    const weatherResponse = location
      ? `The weather in ${locationName}, ${country} is ${description} with a temperature of ${temp}°C, feels like ${feelsLike}°C.`
      : `The current weather in ${locationName} is ${description}. It's ${temp}°C, feels like ${feelsLike}°C.`;

    return {
      success: true,
      response: weatherResponse
    };
  } catch (error: any) {
    console.error('Weather API error:', error);

    if (error.response && error.response.status === 404) {
      return {
        success: false,
        response: location
          ? `I couldn't find weather information for "${location}". Could you try a different location or be more specific?`
          : "I couldn't retrieve the weather for your area."
      };
    }

    return {
      success: false,
      response: "I'm having trouble accessing weather information right now. Please try again later."
    };
  }
}

// =================================================================
// COMMAND HELPER FUNCTIONS - OPEN APPLICATION
// =================================================================
function openApplication(appName: string): Promise<CommandResult> {
  const platform = process.platform;
  let command: string;

  const appMap: AppMappings = {
    'spotify': {
      win: path.join(process.env.APPDATA as string, 'Spotify', 'Spotify.exe'),
      mac: 'Spotify',
      linux: 'spotify',
      flatpak: 'com.spotify.Client'
    },
    'chrome': {
      win: 'chrome',
      mac: 'Google Chrome',
      linux: 'google-chrome',
      flatpak: 'com.google.Chrome'
    },
    'firefox': {
      win: 'firefox',
      mac: 'Firefox',
      linux: 'firefox',
      flatpak: 'org.mozilla.firefox'
    },
    'discord': {
      win: 'discord',
      mac: 'Discord',
      linux: 'discord',
      flatpak: 'com.discordapp.Discord'
    },
    'word': {
      win: 'winword',
      mac: 'Microsoft Word',
      linux: 'libreoffice --writer'
    },
    'excel': {
      win: 'excel',
      mac: 'Microsoft Excel',
      linux: 'libreoffice --calc'
    },
    'powerpoint': {
      win: 'powerpnt',
      mac: 'Microsoft PowerPoint',
      linux: 'libreoffice --impress'
    },
    'notepad': {
      win: 'notepad',
      mac: 'TextEdit',
      linux: 'gedit'
    },
    'vscode': {
      win: 'code',
      mac: 'Visual Studio Code',
      linux: 'code',
      flatpak: 'com.visualstudio.code'
    },
    'vlc': {
      win: 'vlc',
      mac: 'VLC',
      linux: 'vlc',
      flatpak: 'org.videolan.VLC'
    },
    'slack': {
      win: 'slack',
      mac: 'Slack',
      linux: 'slack',
      flatpak: 'com.slack.Slack'
    },
    'teams': {
      win: 'teams',
      mac: 'Microsoft Teams',
      linux: 'teams',
      flatpak: 'com.microsoft.Teams'
    },
    'zoom': {
      win: 'zoom',
      mac: 'zoom.us',
      linux: 'zoom',
      flatpak: 'us.zoom.Zoom'
    },
    'edge': {
      win: 'msedge',
      mac: 'Microsoft Edge',
      linux: 'microsoft-edge',
      flatpak: 'com.microsoft.Edge'
    },
    'brave': {
      win: 'brave',
      mac: 'Brave Browser',
      linux: 'brave-browser',
      flatpak: 'com.brave.Browser'
    },
    'photoshop': {
      win: 'photoshop',
      mac: 'Adobe Photoshop',
      linux: 'gimp',
      flatpak: 'org.gimp.GIMP'
    },
    'gimp': {
      win: 'gimp',
      mac: 'GIMP',
      linux: 'gimp',
      flatpak: 'org.gimp.GIMP'
    },
    'terminal': {
      win: 'cmd',
      mac: 'Terminal',
      linux: 'gnome-terminal'
    },
    'github': {
      win: 'github',
      mac: 'GitHub Desktop',
      linux: 'github-desktop',
      flatpak: 'io.github.shiftey.Desktop'
    },
    'steam': {
      win: 'steam',
      mac: 'Steam',
      linux: 'steam',
      flatpak: 'com.valvesoftware.Steam'
    },
    'epic': {
      win: 'epicgameslauncher',
      mac: 'Epic Games Launcher',
      linux: 'legendary',
      flatpak: 'com.heroicgameslauncher.hgl'
    }
  };

  const appKey = appName.toLowerCase();
  const appData = appMap[appKey];

  if (!appData) {
    console.log(`No mapping found for ${appName}, trying direct command`);
    command = appName;
  } else {
    switch (platform) {
      case 'win32':
        command = appData.win || appName;
        break;
      case 'darwin':
        command = appData.mac || appName;
        break;
      default:
        if (appData.flatpak) {
          try {
            const flatpakCheck = execSync(`flatpak info ${appData.flatpak} 2>/dev/null || echo "not-installed"`).toString();

            if (!flatpakCheck.includes("not-installed")) {
              console.log(`Found Flatpak for ${appName}: ${appData.flatpak}`);
              command = `flatpak run ${appData.flatpak}`;
              break;
            }
          } catch (error: any) {
            console.log(`Error checking Flatpak: ${error.message}`);
          }
        }

        command = appData.linux || appName;
        break;
    }
  }

  let finalCommand: string;
  if (platform === 'win32') {
    finalCommand = `start ${command}`;
  } else if (platform === 'darwin') {
    if (command.includes(' ')) {
      finalCommand = `open -a "${command}"`;
    } else {
      finalCommand = `open -a "${command}" || ${command}`;
    }
  } else {
    if (command.startsWith('flatpak run')) {
      finalCommand = command;
    } else {
      finalCommand = command;
    }
  }

  console.log(`Attempting to execute: ${finalCommand}`);

  return new Promise((resolve) => {
    exec(finalCommand, (error) => {
      if (error) {
        console.error(`Error opening ${appName}:`, error);

        if (platform === 'linux' && appData && appData.flatpak) {
          console.log(`Trying Flatpak fallback for ${appName}`);
          exec(`flatpak run ${appData.flatpak}`, (flatpakError) => {
            if (flatpakError) {
              console.error(`Flatpak fallback also failed:`, flatpakError);
              resolve({
                success: false,
                response: `I couldn't open ${appName}. The application might not be installed.`
              });
            } else {
              resolve({
                success: true,
                response: `Opening ${appName} using Flatpak.`
              });
            }
          });
        } else {
          resolve({
            success: false,
            response: `I couldn't open ${appName}. The application might not be installed.`
          });
        }
      } else {
        resolve({
          success: true,
          response: `Opening ${appName} for you.`
        });
      }
    });
  });
}
