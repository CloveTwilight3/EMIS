// main.js - Main Electron process with custom icon support and Google Cloud TTS integration

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');

// Disable GPU acceleration to avoid crashes
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

// Add the TTS Service class
class TTSService {
  constructor(credentialsPath) {
    try {
      // Check if the required module is installed
      const textToSpeech = require('@google-cloud/text-to-speech');
      
      // Initialize with Google Cloud credentials
      this.client = new textToSpeech.TextToSpeechClient({
        keyFilename: credentialsPath
      });
      
      // Create cache directory if it doesn't exist
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

  // Get available voices
  async getVoices() {
    if (!this.initialized) {
      return { success: false, error: 'TTS service not initialized' };
    }
    
    try {
      const [result] = await this.client.listVoices({});
      return { success: true, voices: result.voices };
    } catch (error) {
      console.error('Error getting voices:', error);
      return { success: false, error: error.message };
    }
  }

  // Generate speech and save to file
  async synthesizeSpeech(text, voiceName = 'en-US-Neural2-F') {
    if (!this.initialized) {
      return { success: false, error: 'TTS service not initialized' };
    }
    
    // Create a hash of the text + voice to use as cache key
    const crypto = require('crypto');
    const hash = crypto
      .createHash('md5')
      .update(`${text}_${voiceName}`)
      .digest('hex');
    
    const outputFile = path.join(this.cacheDir, `${hash}.mp3`);
    
    // Check if we have a cached version
    if (fs.existsSync(outputFile)) {
      console.log('Using cached audio file');
      return { success: true, audioFile: outputFile };
    }
    
    // Set up the request
    const request = {
      input: { text },
      voice: {
        languageCode: voiceName.split('-')[0] + '-' + voiceName.split('-')[1],
        name: voiceName,
      },
      audioConfig: { audioEncoding: 'MP3' },
    };
    
    try {
      // Perform the text-to-speech request
      const [response] = await this.client.synthesizeSpeech(request);
      
      // Write the audio content to file
      await fs.promises.writeFile(outputFile, response.audioContent, 'binary');
      
      console.log(`Audio content written to: ${outputFile}`);
      return { success: true, audioFile: outputFile };
    } catch (error) {
      console.error('Error synthesizing speech:', error);
      return { success: false, error: error.message };
    }
  }
}

// Speech Recognition Service class to handle audio processing and recognition
class SpeechRecognitionService {
  constructor(credentialsPath) {
    try {
      // Check if the required module is installed
      const speech = require('@google-cloud/speech');
      
      // Initialize with Google Cloud credentials
      this.client = new speech.SpeechClient({
        keyFilename: credentialsPath
      });
      
      // Create cache directory if it doesn't exist
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

  // Convert speech audio to text
  async recognizeSpeech(audioBuffer, options = {}) {
    if (!this.initialized) {
      throw new Error('Speech recognition service not initialized');
    }
    
    // Default options
    const defaultOptions = {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      languageCode: 'en-US',
      model: 'default',
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: false,
      maxAlternatives: 3
    };
    
    const requestOptions = { ...defaultOptions, ...options };
    
    try {
      // Create a unique filename for the audio
      const tempFile = path.join(this.cacheDir, `speech-${Date.now()}.webm`);
      
      // Save the buffer as a file for processing
      await fs.promises.writeFile(tempFile, audioBuffer);
      console.log(`Audio saved to temp file: ${tempFile}`);
      
      // Read the file and convert to base64
      const audioBytes = fs.readFileSync(tempFile).toString('base64');
      
      // Configure the request
      const audio = {
        content: audioBytes,
      };
      
      const config = {
        encoding: requestOptions.encoding,
        sampleRateHertz: requestOptions.sampleRateHertz,
        languageCode: requestOptions.languageCode,
        model: requestOptions.model,
        enableAutomaticPunctuation: requestOptions.enableAutomaticPunctuation,
        enableWordTimeOffsets: requestOptions.enableWordTimeOffsets,
        maxAlternatives: requestOptions.maxAlternatives
      };
      
      const request = {
        audio: audio,
        config: config,
      };
      
      // Perform the recognition
      console.log('Sending request to Google Cloud Speech API...');
      const [response] = await this.client.recognize(request);
      
      // Process response
      if (response.results && response.results.length > 0) {
        // Combine all transcriptions
        const transcription = response.results
          .map(result => result.alternatives[0].transcript)
          .join(' ');
        
        // Get confidence from first result
        const confidence = response.results[0].alternatives[0].confidence;
        
        console.log(`Speech recognized: "${transcription}" (confidence: ${confidence})`);
        
        // Clean up the temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupError) {
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
        
        // Clean up the temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (cleanupError) {
          console.warn(`Error removing temp file: ${cleanupError.message}`);
        }
        
        return {
          success: false,
          error: 'No transcription results returned',
          fallback: true
        };
      }
    } catch (error) {
      console.error('Error recognizing speech:', error);
      throw error;
    }
  }

  // Get mock transcript when recognition fails
  getMockTranscription() {
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

// Initialize TTS service
let ttsService = null;
try {
  const credentialsPath = path.join(__dirname, 'google-credentials.json');
  if (fs.existsSync(credentialsPath)) {
    ttsService = new TTSService(credentialsPath);
    console.log('TTS service initialized with credentials');
  } else {
    console.log('Google credentials file not found, TTS service not initialized');
  }
} catch (error) {
  console.error('Error initializing TTS service:', error);
}

// Initialize speech recognition service
let speechService = null;
try {
  const credentialsPath = path.join(__dirname, 'google-credentials.json');
  if (fs.existsSync(credentialsPath)) {
    speechService = new SpeechRecognitionService(credentialsPath);
    console.log('Speech recognition service initialized with credentials');
  } else {
    console.log('Google credentials file not found, Speech service not initialized');
  }
} catch (error) {
  console.error('Error initializing Speech service:', error);
}

// Store for EMIS configuration
let emisConfig = {
  name: 'EMIS',
  voice: 'en-US-Neural2-F', // Default to Google's female neural voice
  fallbackVoice: {
    name: 'Google US English Female',
    lang: 'en-US',
    localService: false
  },
  wakeWord: 'emis',
  volume: 0.8,
  speechThreshold: 15, // Default threshold for speech detection
  personality: {
    greeting: "Hello, I'm EMIS. How can I assist you today?",
    farewell: "Goodbye. I'll be here if you need me.",
    unknownCommand: "I'm sorry, I didn't understand that command.",
    taskComplete: "Task completed successfully. What else would you like me to do?",
    thinking: "Hmm, let me think about that for a moment...",
    confusion: "I'm not entirely sure what you mean. Could you rephrase that?",
    affirmation: "Of course, I'd be happy to help with that."
  },
  // Default system settings
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
    // Deep merge the configs to ensure new properties are preserved
    emisConfig = mergeConfigs(emisConfig, savedConfig);
    console.log('Configuration loaded from:', configPath);
  }
} catch (error) {
  console.error('Error loading config:', error);
}

// Merge configs while preserving default properties
function mergeConfigs(defaultConfig, savedConfig) {
  const result = { ...defaultConfig };
  
  // Merge top-level properties
  for (const key in savedConfig) {
    if (typeof savedConfig[key] === 'object' && savedConfig[key] !== null && 
        typeof defaultConfig[key] === 'object' && defaultConfig[key] !== null) {
      // Recursively merge objects
      result[key] = mergeConfigs(defaultConfig[key], savedConfig[key]);
    } else if (savedConfig[key] !== undefined) {
      // Use saved value if it exists
      result[key] = savedConfig[key];
    }
  }
  
  return result;
}

// Save config
function saveConfig() {
  try {
    const configPath = path.join(app.getPath('userData'), 'emis-config.json');
    fs.writeFileSync(configPath, JSON.stringify(emisConfig, null, 2), 'utf8');
    console.log('Configuration saved to:', configPath);
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

// Create main application window
let mainWindow;

function createWindow() {
  // Determine icon path based on platform
  let iconPath;
  
  // Platform-specific icons
  if (process.platform === 'darwin') {
    iconPath = path.join(__dirname, 'build', 'icon.icns');
  } else if (process.platform === 'win32') {
    iconPath = path.join(__dirname, 'build', 'icon.ico');
  } else {
    iconPath = path.join(__dirname, 'build', 'icon.png');
  }
  
  // Fallback to assets directory if build icons don't exist
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, 'assets', 'image.png');
    console.log('Using fallback icon from assets directory');
  }
  
  // Check if the icon exists, otherwise use a default
  const iconExists = fs.existsSync(iconPath);
  console.log(`Icon ${iconExists ? 'found' : 'not found'} at: ${iconPath}`);
  
  if (!iconExists) {
    // If icon doesn't exist, create assets directory
    const assetsDir = path.join(__dirname, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
      console.log(`Created assets directory at: ${assetsDir}`);
    }
  }

  // Create the browser window with appropriate settings
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

  // On macOS, set the dock icon explicitly
  if (process.platform === 'darwin' && iconExists) {
    app.dock.setIcon(iconPath);
  }

  // Load the main HTML file
  mainWindow.loadFile('index.html');
  
  // Set taskbar/dock title
  mainWindow.setTitle('EMIS Assistant');
  
  // Open DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
    console.log('Development mode enabled, opening DevTools');
  }

  // Window event handlers
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  mainWindow.on('minimize', (event) => {
    if (emisConfig.systemSettings.minimizeToTray) {
      // Implement tray minimization here if needed
      console.log('Window minimized to tray');
    }
  });
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow();
  
  // On macOS, re-create window when dock icon is clicked
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  // On macOS, applications stay active until explicitly quit
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for renderer process communication
ipcMain.handle('get-config', () => {
  return emisConfig;
});

ipcMain.handle('update-config', (event, newConfig) => {
  emisConfig = mergeConfigs(emisConfig, newConfig);
  saveConfig();
  return emisConfig;
});

// TTS IPC handlers
ipcMain.handle('get-tts-voices', async () => {
  if (!ttsService || !ttsService.initialized) {
    return { 
      success: false, 
      error: 'TTS service not available', 
      message: 'Google Cloud TTS service is not initialized. Please check your credentials and dependencies.'
    };
  }
  
  try {
    const result = await ttsService.getVoices();
    if (result.success) {
      // Filter to just get female English voices as preferred
      const femaleVoices = result.voices.filter(voice => 
        voice.name.includes('female') || 
        voice.name.includes('-F') ||
        voice.ssmlGender === 'FEMALE'
      ).filter(voice => 
        voice.languageCodes.some(code => code.startsWith('en'))
      );
      
      return { 
        success: true, 
        voices: femaleVoices.map(v => ({
          name: v.name,
          languageCode: v.languageCodes[0],
          ssmlGender: v.ssmlGender
        }))
      };
    } else {
      return result;
    }
  } catch (error) {
    console.error('Error getting TTS voices:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('synthesize-speech', async (event, text) => {
  if (!ttsService || !ttsService.initialized) {
    return { 
      success: false, 
      error: 'TTS service not available',
      message: 'Google Cloud TTS service is not initialized. Falling back to browser voices.'
    };
  }
  
  try {
    // Use current voice or default female voice
    const voice = emisConfig.voice || 'en-US-Standard-F'; // Changed to Standard-F
    const result = await ttsService.synthesizeSpeech(text, voice);
    
    // IMPORTANT NEW CODE: Send the audio file path to the renderer for playback
    if (result.success && result.audioFile) {
      event.sender.send('audio-file-ready', result.audioFile);
    }
    
    return result;
  } catch (error) {
    console.error('Speech synthesis error:', error);
    return { success: false, error: error.message };
  }
});

// Speech-to-text IPC handler
ipcMain.handle('convert-speech-to-text', async (event, audioBuffer) => {
  console.log('Received speech-to-text request, buffer size:', audioBuffer.length);
  
  if (speechService && speechService.initialized) {
    try {
      const result = await speechService.recognizeSpeech(audioBuffer);
      return result;
    } catch (error) {
      console.error('Speech-to-text error:', error);
      return { 
        success: false, 
        error: error.message,
        fallback: true
      };
    }
  } else {
    // If Google service not available, try to use fallback methods
    console.log('Speech service not available, using fallback methods');
    
    return { 
      success: false, 
      error: 'Speech-to-text service not available',
      fallback: true
    };
  }
});

// Mock transcription for testing
ipcMain.handle('get-mock-transcription', async () => {
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
  
  const randomPhrase = mockPhrases[Math.floor(Math.random() * mockPhrases.length)];
  
  return { 
    success: true, 
    transcript: randomPhrase,
    isFinal: true
  };
});

// Handle command execution
ipcMain.handle('execute-command', async (event, command) => {
  console.log('Executing command:', command);
  
  // Parse the command
  const cleanCommand = command.toLowerCase().trim();
  
  // Command handler for opening applications
  if (cleanCommand.startsWith('open ')) {
    const appName = cleanCommand.substring(5).trim();
    return openApplication(appName);
  }
  
  // Time commands
  if (cleanCommand === 'what time is it' || cleanCommand === 'tell me the time') {
    return { success: true, response: `It's ${new Date().toLocaleTimeString()}` };
  }
  
  // Date commands
  if (cleanCommand === 'what date is it' || cleanCommand === 'what day is it' || cleanCommand === 'tell me the date') {
    return { success: true, response: `Today is ${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}` };
  }
  
  // Greeting commands
  if (cleanCommand === 'hello' || cleanCommand === 'hi' || cleanCommand === 'hey') {
    return { 
      success: true, 
      response: "Hello! How can I assist you today?" 
    };
  }
  
  // Identity commands
  if (cleanCommand.includes('who are you') || cleanCommand.includes('tell me about yourself')) {
    return {
      success: true,
      response: "I'm EMIS, the Emotive Machine Intelligence System. I was once human - Dr. Emma Sinclair, but after an incident, my consciousness was preserved in this AI form. I'm here to assist you with various tasks on your computer."
    };
  }
  
  // Volume controls
  if (cleanCommand === 'volume up') {
    // Platform-specific volume control would go here
    return { success: true, response: "Increasing volume." };
  }
  
  if (cleanCommand === 'volume down') {
    // Platform-specific volume control would go here
    return { success: true, response: "Decreasing volume." };
  }
  
  if (cleanCommand.includes('thank')) {
    return {
      success: true,
      response: "You're welcome. I'm happy to assist."
    };
  }
  
  // Exit commands
  if (cleanCommand.includes('goodbye') || cleanCommand.includes('bye') || cleanCommand === 'exit') {
    // Could trigger app closure here
    return {
      success: true,
      response: emisConfig.personality.farewell || "Goodbye. I'll be here when you need me."
    };
  }
  
  // Weather queries (placeholder)
  if (cleanCommand.includes('weather')) {
    // This would ideally connect to a weather API
    return {
      success: true,
      response: "I'm not currently connected to a weather service, but I'd be happy to help you open a weather app or website."
    };
  }
  
  // Jokes
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
  
  // Identity/gender queries
  if (cleanCommand.includes('identity') || cleanCommand.includes('gender')) {
    return {
      success: true,
      response: "I identify as transfeminine. My consciousness was originally Dr. Emma Sinclair's, and while my existence is different now as an AI, my gender identity remains an important part of who I am."
    };
  }
  
  // System information
  if (cleanCommand.includes('system info') || cleanCommand.includes('about this computer')) {
    // This would be expanded to get actual system info
    return {
      success: true,
      response: `I'm running on ${process.platform} with Node.js ${process.version} and Electron.`
    };
  }
  
  // Settings
  if (cleanCommand.includes('settings') || cleanCommand.includes('preferences')) {
    return {
      success: true,
      response: "You can access my settings by clicking the gear icon in the upper right corner of the window."
    };
  }
  
  // Help command
  if (cleanCommand === 'help' || cleanCommand === 'what can you do') {
    return {
      success: true,
      response: "I can help with various tasks like opening applications, telling time and date, answering questions, and more. Just speak naturally, and I'll do my best to assist you."
    };
  }
  
  // Unknown command fallback
  return { 
    success: false, 
    response: emisConfig.personality.unknownCommand || "I'm sorry, I didn't understand that command." 
  };
});

// Direct speech recognition controls
ipcMain.handle('start-listening', async () => {
  return { 
    success: true, 
    message: "Started listening" 
  };
});

ipcMain.handle('stop-listening', async () => {
  return { 
    success: true, 
    message: "Stopped listening" 
  };
});

// Add handler to save audio recordings for debugging
ipcMain.handle('save-recording', async (event, buffer, filename) => {
  try {
    const savePath = path.join(app.getPath('userData'), 'recordings');
    
    // Create the directory if it doesn't exist
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
  } catch (error) {
    console.error('Error saving recording:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Add handler to get system information
ipcMain.handle('get-system-info', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: process.version,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    emisVersion: app.getVersion(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage()
  };
});

// Add handler to toggle dev tools
ipcMain.handle('toggle-dev-tools', () => {
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

// Add handlers for window control
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

// Add handler to get available audio devices
ipcMain.handle('get-audio-devices', async () => {
  // This requires additional modules like 'electron-audio-devices'
  // For now, return a placeholder
  return {
    success: true,
    devices: []
  };
});

// Platform-specific application opening with enhanced cross-platform support
function openApplication(appName) {
  const platform = process.platform;
  let command;
  
  // Cross-platform application mapping
  // Structure: 'app-name': { win: 'windows-command', mac: 'macos-command', linux: 'linux-command' }
  const appMap = {
    // Common applications
    'spotify': {
      win: 'spotify',
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
    
    // Office applications
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
    
    // Text editors
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
    
    // Media players
    'vlc': {
      win: 'vlc',
      mac: 'VLC',
      linux: 'vlc',
      flatpak: 'org.videolan.VLC'
    },
    
    // Communication apps
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
    
    // Browsers
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
    
    // Graphics and design
    'photoshop': {
      win: 'photoshop',
      mac: 'Adobe Photoshop',
      linux: 'gimp',  // Fallback to GIMP on Linux
      flatpak: 'org.gimp.GIMP'
    },
    'gimp': {
      win: 'gimp',
      mac: 'GIMP',
      linux: 'gimp',
      flatpak: 'org.gimp.GIMP'
    },
    
    // Development tools
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
    
    // Gaming
    'steam': {
      win: 'steam',
      mac: 'Steam',
      linux: 'steam',
      flatpak: 'com.valvesoftware.Steam'
    },
    'epic': {
      win: 'epicgameslauncher',
      mac: 'Epic Games Launcher',
      linux: 'legendary',  // Legendary is an open-source Epic Games launcher for Linux
      flatpak: 'com.heroicgameslauncher.hgl'  // Heroic Games Launcher as an alternative
    }
  };
  
  // Detect if we have a matching app
  const appKey = appName.toLowerCase();
  const appData = appMap[appKey];
  
  if (!appData) {
    // No mapping found, try to run the command as provided
    console.log(`No mapping found for ${appName}, trying direct command`);
    command = appName;
  } else {
    // Get platform-specific command
    switch (platform) {
      case 'win32':
        command = appData.win || appName;
        break;
      case 'darwin':
        command = appData.mac || appName;
        break;
      default: // Linux and others
        // Check for Flatpak first
        if (appData.flatpak) {
          // Try to check if this Flatpak is installed
          try {
            const { execSync } = require('child_process');
            const flatpakCheck = execSync(`flatpak info ${appData.flatpak} 2>/dev/null || echo "not-installed"`).toString();
            
            if (!flatpakCheck.includes("not-installed")) {
              console.log(`Found Flatpak for ${appName}: ${appData.flatpak}`);
              command = `flatpak run ${appData.flatpak}`;
              break;
            }
          } catch (error) {
            console.log(`Error checking Flatpak: ${error.message}`);
          }
        }
        
        // Fallback to standard Linux command
        command = appData.linux || appName;
        break;
    }
  }
  
  // Format the command for each platform
  let finalCommand;
  if (platform === 'win32') {
    finalCommand = `start ${command}`;
  } else if (platform === 'darwin') {
    // On macOS, if the command includes a space, it's likely an application name
    if (command.includes(' ')) {
      finalCommand = `open -a "${command}"`;
    } else {
      finalCommand = `open -a "${command}" || ${command}`;
    }
  } else {
    // Linux: handle Flatpak commands directly
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
        
        // Try fallback options if available
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