// test-microphone.js - Simple utility to test microphone access

const recorder = require('node-record-lpcm16');
const fs = require('fs');
const path = require('path');

console.log('EMIS Microphone Test Utility');
console.log('---------------------------');
console.log('This will test if your microphone is accessible');
console.log('Recording will last for 5 seconds...');

// Create tools directory if it doesn't exist
const toolsDir = path.join(__dirname);
if (!fs.existsSync(toolsDir)) {
  fs.mkdirSync(toolsDir, { recursive: true });
}

const outputFile = path.join(toolsDir, 'test-recording.raw');

// Start recording
console.log('Recording started...');

const recording = recorder.record({
  sampleRate: 16000,
  channels: 1,
  audioType: 'raw'
});

// Write to file
const file = fs.createWriteStream(outputFile, { encoding: 'binary' });
recording.stream().pipe(file);

// Record for 5 seconds
setTimeout(() => {
  recording.stop();
  console.log('Recording stopped');
  console.log(`Saved test recording to: ${outputFile}`);
  console.log('\nResults:');
  
  // Check if file was created and has content
  try {
    const stats = fs.statSync(outputFile);
    if (stats.size > 0) {
      console.log('✅ SUCCESS: Microphone is working properly');
      console.log(`   Recorded ${stats.size} bytes of audio data`);
    } else {
      console.log('❌ WARNING: File was created but contains no data');
      console.log('   This might indicate a microphone permission issue or hardware problem');
    }
  } catch (error) {
    console.log('❌ ERROR: Failed to create recording file');
    console.log(`   Error: ${error.message}`);
  }
  
  console.log('\nNext steps:');
  console.log('1. If the test failed, check your microphone connections');
  console.log('2. Ensure your system has given permission to access the microphone');
  console.log('3. Try running EMIS with elevated permissions');
}, 5000);
