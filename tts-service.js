// tts-service.js
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs');
const util = require('util');
const path = require('path');

class TTSService {
  constructor(credentialsPath) {
    // Initialize with Google Cloud credentials
    this.client = new textToSpeech.TextToSpeechClient({
      keyFilename: credentialsPath
    });
    
    // Create cache directory if it doesn't exist
    this.cacheDir = path.join(__dirname, 'audio-cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  // Get available voices
  async getVoices() {
    try {
      const [result] = await this.client.listVoices({});
      return result.voices;
    } catch (error) {
      console.error('Error getting voices:', error);
      return [];
    }
  }

  // Generate speech and save to file
  async synthesizeSpeech(text, voiceName = 'en-US-Neural2-F') {
    // Create a hash of the text + voice to use as cache key
    const hash = require('crypto')
      .createHash('md5')
      .update(`${text}_${voiceName}`)
      .digest('hex');
    
    const outputFile = path.join(this.cacheDir, `${hash}.mp3`);
    
    // Check if we have a cached version
    if (fs.existsSync(outputFile)) {
      console.log('Using cached audio file');
      return outputFile;
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
      const writeFile = util.promisify(fs.writeFile);
      await writeFile(outputFile, response.audioContent, 'binary');
      
      console.log(`Audio content written to: ${outputFile}`);
      return outputFile;
    } catch (error) {
      console.error('Error synthesizing speech:', error);
      throw error;
    }
  }
}

module.exports = TTSService;