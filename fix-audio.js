// fix-audio.js - Add to your project root directory
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Listen for synthesize-speech response from main process
ipcRenderer.on('audio-file-ready', (event, audioFilePath) => {
  console.log('Audio file ready to play:', audioFilePath);
  playAudioFile(audioFilePath);
});

// Function to play audio file
function playAudioFile(filePath) {
  const audio = new Audio(filePath);
  audio.volume = 1.0; // Set to maximum volume
  
  audio.onplay = () => {
    console.log('Audio playback started');
  };
  
  audio.onended = () => {
    console.log('Audio playback completed');
  };
  
  audio.onerror = (error) => {
    console.error('Audio playback error:', error);
  };
  
  // Try to play the audio
  audio.play().catch(error => {
    console.error('Failed to play audio:', error);
  });
}

// Export function for direct use
module.exports = { playAudioFile };