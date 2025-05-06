// tts-service.js
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const util = require('util');
const path = require('path');
const crypto = require('crypto');

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
  async synthesizeSpeech(text, voiceName = 'en-US-Standard-F') {
    if (!this.initialized) {
      return { success: false, error: 'TTS service not initialized' };
    }
    
    // Create a hash of the text + voice to use as cache key
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

module.exports = TTSService;