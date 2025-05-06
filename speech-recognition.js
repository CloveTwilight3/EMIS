// speech-recognition.js - Enhanced speech recognition module for EMIS

const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');

class SpeechRecognitionService {
  constructor(options = {}) {
    this.initialized = false;
    this.options = {
      // Default configuration
      language: 'en-US',
      interimResults: true,
      continuous: false,
      maxAlternatives: 3,
      fallbackToCloud: true,
      logLevel: 'info',
      ...options
    };
    
    this.speechClient = null;
    this.vadDetector = null;
    this.cacheDir = path.join(__dirname, 'speech-cache');
    
    // Create cache directory if it doesn't exist
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    
    this.log('Speech Recognition Service initializing');
    this.setupServiceClients();
  }
  
  log(message, level = 'info') {
    const levels = {
      'debug': 0,
      'info': 1,
      'warn': 2,
      'error': 3
    };
    
    if (levels[level] >= levels[this.options.logLevel]) {
      console.log(`[SpeechRecognition-${level}] ${message}`);
    }
  }
  
  async setupServiceClients() {
    // Try to initialize Google Cloud Speech if credentials exist
    try {
      const credentialsPath = path.join(__dirname, 'google-credentials.json');
      if (fs.existsSync(credentialsPath)) {
        const { SpeechClient } = require('@google-cloud/speech');
        this.speechClient = new SpeechClient({
          keyFilename: credentialsPath
        });
        this.log('Google Cloud Speech client initialized');
      } else {
        this.log('Google credentials not found, cloud speech unavailable', 'warn');
      }
    } catch (error) {
      this.log(`Failed to initialize Google Cloud Speech: ${error.message}`, 'error');
    }
    
    // Try to initialize Voice Activity Detection
    try {
      const Vad = require('node-vad');
      this.vadDetector = new Vad(Vad.Mode.VERY_AGGRESSIVE);
      this.log('Voice Activity Detection initialized');
    } catch (error) {
      this.log(`Failed to initialize VAD: ${error.message}`, 'warn');
    }
    
    this.initialized = true;
    this.log('Speech Recognition Service initialized successfully');
  }
  
  // Process audio buffer for speech recognition
  async recognizeSpeech(audioBuffer, options = {}) {
    if (!this.initialized) {
      throw new Error('Speech recognition service not initialized');
    }
    
    const requestOptions = {
      ...this.options,
      ...options
    };
    
    this.log(`Processing speech with options: ${JSON.stringify(requestOptions)}`);
    
    // Create a unique filename for the audio
    const timestamp = Date.now();
    const tempFile = path.join(this.cacheDir, `speech-${timestamp}.webm`);
    
    // Save the buffer as a file for processing
    await fs.promises.writeFile(tempFile, audioBuffer);
    this.log(`Audio saved to temp file: ${tempFile}`);
    
    // Strategy 1: Try Google Cloud Speech if available
    if (this.speechClient && requestOptions.fallbackToCloud) {
      try {
        this.log('Attempting Google Cloud Speech recognition');
        const result = await this.processWithGoogleCloudSpeech(tempFile);
        if (result && result.transcript) {
          this.log(`Google Cloud Speech successful: "${result.transcript}"`);
          return {
            success: true,
            transcript: result.transcript,
            confidence: result.confidence,
            source: 'google-cloud'
          };
        }
      } catch (error) {
        this.log(`Google Cloud Speech error: ${error.message}`, 'error');
      }
    }
    
    // Strategy 2: Try local offline recognition if available
    try {
      if (this.vadDetector) {
        this.log('Attempting local VAD-based recognition');
        const vadResult = await this.processWithVAD(tempFile);
        if (vadResult && vadResult.hasVoice) {
          // This just tells us if speech is present, not what was said
          this.log('Voice activity detected in audio');
          
          // Here we'd need to implement a local speech-to-text solution
          // For now, we'll return a placeholder result
          return {
            success: true,
            transcript: null,
            confidence: 0,
            hasVoice: true,
            source: 'local-vad'
          };
        }
      }
    } catch (error) {
      this.log(`Local VAD processing error: ${error.message}`, 'error');
    }
    
    // Clean up the temp file
    try {
      fs.unlinkSync(tempFile);
      this.log('Temporary audio file removed');
    } catch (cleanupError) {
      this.log(`Error removing temp file: ${cleanupError.message}`, 'warn');
    }
    
    // Return failure if no methods worked
    return {
      success: false,
      error: 'Could not recognize speech with any available method',
      fallback: true
    };
  }
  
  async processWithGoogleCloudSpeech(audioFile) {
    if (!this.speechClient) {
      throw new Error('Google Cloud Speech client not initialized');
    }
    
    // Read the file and convert to base64
    const audioBytes = fs.readFileSync(audioFile).toString('base64');
    
    // Configure the request
    const config = {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      languageCode: this.options.language,
      model: 'default',
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: false,
      maxAlternatives: this.options.maxAlternatives
    };
    
    const audio = {
      content: audioBytes
    };
    
    const request = {
      config,
      audio
    };
    
    // Perform the recognition
    const [response] = await this.speechClient.recognize(request);
    
    // Process response
    if (response.results && response.results.length > 0) {
      const result = response.results[0];
      if (result.alternatives && result.alternatives.length > 0) {
        const alternative = result.alternatives[0];
        return {
          transcript: alternative.transcript,
          confidence: alternative.confidence
        };
      }
    }
    
    return null;
  }
  
  async processWithVAD(audioFile) {
    if (!this.vadDetector) {
      throw new Error('VAD detector not initialized');
    }
    
    // For VAD, we need raw PCM data
    // This is a simplified implementation that assumes the file can be processed directly
    // In a real implementation, you would need to convert from WebM to PCM
    
    // Read file
    const buffer = fs.readFileSync(audioFile);
    
    // Process with VAD
    const result = await this.vadDetector.processAudio(buffer, 16000);
    
    return {
      hasVoice: result === this.vadDetector.EVENT_VOICE,
      result: result
    };
  }
  
  // Setup IPC handlers for communication with renderer process
  setupIPCHandlers() {
    ipcMain.handle('recognize-speech', async (event, audioBuffer) => {
      try {
        return await this.recognizeSpeech(audioBuffer);
      } catch (error) {
        console.error('Error in IPC recognize-speech handler:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });
  }
}

module.exports = SpeechRecognitionService;