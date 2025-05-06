// renderer.js - Enhanced with WebRTC Audio Capture and Speech-to-Text

// Elements
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const transcriptText = document.getElementById('transcript-text');
const responseText = document.getElementById('response-text');
const statusElement = document.querySelector('.status');
const visualizer = document.querySelector('.emis-visualizer');
const settingsBtn = document.querySelector('.settings-button');
const settingsPanel = document.querySelector('.settings-panel');
const wakeWordInput = document.getElementById('wake-word');
const voiceSelect = document.getElementById('voice-select');
const volumeInput = document.getElementById('volume');
const saveSettingsBtn = document.getElementById('save-settings');

// Create a manual command input element as fallback
const manualCommandContainer = document.createElement('div');
manualCommandContainer.className = 'manual-command-container';
manualCommandContainer.innerHTML = `
  <h3>Alternate Text Input</h3>
  <div style="display: flex; margin-bottom: 10px;">
    <input type="text" id="manual-command-input" placeholder="Type a command..." style="flex: 1; padding: 8px; margin-right: 5px;">
    <button id="manual-command-btn">Send</button>
  </div>
`;

// Create audio capture notification
const audioStatusContainer = document.createElement('div');
audioStatusContainer.style.padding = '10px';
audioStatusContainer.style.marginBottom = '10px';
audioStatusContainer.style.backgroundColor = '#eefaee';
audioStatusContainer.style.border = '1px solid #cceecc';
audioStatusContainer.style.borderRadius = '4px';
audioStatusContainer.style.display = 'none';
audioStatusContainer.innerHTML = `
  <p style="margin: 0; color: #006600;">
    <strong>Audio Status:</strong> 
    <span id="audio-status-message">Audio capture ready</span>
  </p>
`;

// Create voice synthesis fallback message
const voiceSynthesisErrorContainer = document.createElement('div');
voiceSynthesisErrorContainer.style.display = 'none';
voiceSynthesisErrorContainer.style.padding = '10px';
voiceSynthesisErrorContainer.style.marginBottom = '10px';
voiceSynthesisErrorContainer.style.backgroundColor = '#ffffee';
voiceSynthesisErrorContainer.style.border = '1px solid #eeeebb';
voiceSynthesisErrorContainer.style.borderRadius = '4px';
voiceSynthesisErrorContainer.innerHTML = `
  <p style="margin: 0; color: #776600;">
    <strong>Voice Synthesis Issue:</strong> 
    EMIS might not be able to speak responses aloud.
    Responses will still be displayed as text.
  </p>
`;

// Create audio visualizer canvas
const visualizerCanvas = document.createElement('canvas');
visualizerCanvas.style.position = 'absolute';
visualizerCanvas.style.top = '0';
visualizerCanvas.style.left = '0';
visualizerCanvas.style.width = '100%';
visualizerCanvas.style.height = '100%';
visualizerCanvas.style.borderRadius = '50%';
visualizerCanvas.style.pointerEvents = 'none';
visualizerCanvas.style.opacity = '0.7';

// Add canvas to visualizer
visualizer.appendChild(visualizerCanvas);

// State
let isListening = false;
let audioContext = null;
let audioStream = null;
let audioProcessor = null;
let audioAnalyser = null;
let audioData = null;
let animationFrame = null;
let synth = window.speechSynthesis;
let recognition = null;
let emisConfig = {
  wakeWord: 'emis',
  voice: 'default',
  fallbackVoice: {
    name: 'Google US English Female',
    lang: 'en-US',
    localService: false
  },
  volume: 0.8
};
let usingFallbackMode = false;
let voiceSynthesisErrorCount = 0;
let voicesLoaded = false;
let availableVoices = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('EMIS initializing...');
  updateStatus('Initializing...');
  
  // Add text input as an alternative option
  const controlsDiv = document.querySelector('.controls');
  controlsDiv.appendChild(manualCommandContainer);
  
  // Add status containers
  controlsDiv.insertBefore(audioStatusContainer, controlsDiv.firstChild);
  controlsDiv.insertBefore(voiceSynthesisErrorContainer, controlsDiv.firstChild);
  
  // Set up manual command input
  const manualCommandBtn = document.getElementById('manual-command-btn');
  const manualCommandInput = document.getElementById('manual-command-input');
  
  manualCommandBtn.addEventListener('click', () => {
    const command = manualCommandInput.value.trim();
    if (command) {
      transcriptText.textContent = command;
      processCommand(command);
      manualCommandInput.value = '';
    }
  });
  
  manualCommandInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      manualCommandBtn.click();
    }
  });
  
  // Load available voices with better handling
  loadVoices();
  
  // Ensure voices get loaded with a fallback
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = loadVoices;
  }
  
  setTimeout(() => {
    if (!voicesLoaded) {
      console.log('Voices still not loaded after timeout, trying again...');
      loadVoices();
      
      // Show voice synthesis warning if still no voices
      if (synth.getVoices().length === 0) {
        handleVoiceSynthesisError({type: 'no-voices-available'});
      }
    }
  }, 3000);
  
  // Get config from main process
  try {
    emisConfig = await window.electronAPI.getConfig();
    console.log('Config loaded:', emisConfig);
    updateUIFromConfig();
    
    // Try to get cloud TTS voices from Google if available
    try {
      const voiceResult = await window.electronAPI.getTtsVoices();
      if (voiceResult.success && voiceResult.voices && voiceResult.voices.length > 0) {
        console.log('Cloud TTS voices available:', voiceResult.voices.length);
        
        // Add cloud voices to the dropdown with a special prefix
        voiceResult.voices.forEach(voice => {
          const option = document.createElement('option');
          option.value = voice.name;
          option.textContent = `☁️ ${voice.name}`;
          option.dataset.isCloud = 'true';
          voiceSelect.appendChild(option);
        });
      }
    } catch (error) {
      console.log('Cloud TTS not available:', error);
    }
  } catch (error) {
    console.error('Error getting config:', error);
    updateStatus('Error loading config');
  }
  
  // Initialize WebRTC audio support
  checkAudioSupport();
  
  // Initialize speech recognition
  initSpeechRecognition();
  
  // Initial greeting - with text fallback if speech fails
  const greeting = emisConfig.personality?.greeting || "Hello, I'm EMIS. How can I assist you today?";
  responseText.textContent = greeting;
  
  try {
    speak(greeting);
  } catch (error) {
    console.error('Error with initial greeting speech:', error);
    handleVoiceSynthesisError(error);
  }
});

// Speech recognition with Web Speech API
function initSpeechRecognition() {
  // Check browser support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error('Speech Recognition API not supported');
    return false;
  }
  
  try {
    // Create a new instance
    recognition = new SpeechRecognition();
    
    // Configure recognition
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
      console.log('Speech recognition started');
    };
    
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      
      transcriptText.textContent = transcript;
      
      // Update UI for possible command
      if (event.results[0].isFinal) {
        processCommand(transcript);
      }
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        document.getElementById('audio-status-message').textContent = 
          'Microphone access denied. Please check permissions.';
      } else if (event.error === 'network') {
        document.getElementById('audio-status-message').textContent = 
          'Network error. Using audio sensing instead.';
      }
    };
    
    recognition.onend = () => {
      console.log('Speech recognition ended');
    };
    
    return true;
  } catch (error) {
    console.error('Error setting up speech recognition:', error);
    return false;
  }
}

// Check if WebRTC audio is supported
function checkAudioSupport() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error('WebRTC is not supported in this browser');
    audioStatusContainer.style.display = 'block';
    document.getElementById('audio-status-message').textContent = 
      'Audio capture not supported in this browser';
    audioStatusContainer.style.backgroundColor = '#ffeeee';
    audioStatusContainer.style.border = '1px solid #ffcccc';
    document.getElementById('audio-status-message').style.color = '#cc0000';
    usingFallbackMode = true;
    return false;
  }
  
  // Audio seems to be supported
  audioStatusContainer.style.display = 'block';
  document.getElementById('audio-status-message').textContent = 
    'Audio capture ready - click Start Listening to begin';
  return true;
}

// Start audio capture with WebRTC
async function startAudioCapture() {
  if (audioStream) {
    console.log('Audio already capturing');
    return;
  }
  
  try {
    // Request microphone access
    audioStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    
    // Set up audio processing
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(audioStream);
    
    // Create analyser for visualization
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 256;
    audioData = new Uint8Array(audioAnalyser.frequencyBinCount);
    source.connect(audioAnalyser);
    
    // Start visualization
    drawVisualization();
    
    // Set up basic activity detection
    setupActivityDetection(source);
    
    // Update status
    isListening = true;
    visualizer.classList.add('listening');
    startBtn.disabled = true;
    stopBtn.disabled = false;
    updateStatus('Listening...');
    
    audioStatusContainer.style.display = 'block';
    document.getElementById('audio-status-message').textContent = 'Audio capture active';
    
    return true;
  } catch (error) {
    console.error('Error accessing microphone:', error);
    
    audioStatusContainer.style.display = 'block';
    document.getElementById('audio-status-message').textContent = 
      'Error accessing microphone: ' + (error.message || 'Permission denied');
    audioStatusContainer.style.backgroundColor = '#ffeeee';
    audioStatusContainer.style.border = '1px solid #ffcccc';
    document.getElementById('audio-status-message').style.color = '#cc0000';
    
    updateStatus('Microphone error');
    usingFallbackMode = true;
    return false;
  }
}

// Set up activity detection for audio
function setupActivityDetection(source) {
  // Initialize speech recognition if available
  const speechRecognitionAvailable = initSpeechRecognition();
  
  // Create script processor for audio analysis
  // NOTE: ScriptProcessorNode is deprecated but widely supported
  // Use AudioWorklet in production for better performance
  audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  
  // Variables for voice activity detection
  let isSpeaking = false;
  let silenceStart = null;
  let recordingStartTime = null;
  let silenceThreshold = 15; // Silence in milliseconds
  let volumeThreshold = 15; // Volume level to consider as speech
  let recordedChunks = [];
  let mediaRecorder = null;
  
  // Create MediaRecorder for capturing audio for offline processing
  try {
    mediaRecorder = new MediaRecorder(audioStream, {
      mimeType: 'audio/webm'
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      if (recordedChunks.length === 0) return;
      
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      
      // Try to use speech recognition if available
      if (speechRecognitionAvailable && recognition) {
        try {
          recognition.start();
        } catch (error) {
          console.error('Could not start speech recognition:', error);
          // Fall back to manual input
          fallbackToManualInput();
        }
      } else {
        // Try to use WebSocket based recognition or local library
        tryLocalSpeechToText(blob);
      }
      
      // Reset recording buffer
      recordedChunks = [];
    };
  } catch (error) {
    console.error('MediaRecorder not supported:', error);
  }
  
  // Connect the processor
  source.connect(audioProcessor);
  audioProcessor.connect(audioContext.destination);
  
  // Process audio
  audioProcessor.onaudioprocess = function(event) {
    // Get input data
    const input = event.inputBuffer.getChannelData(0);
    
    // Calculate volume
    let sum = 0;
    for (let i = 0; i < input.length; i++) {
      sum += Math.abs(input[i]);
    }
    const volume = Math.round((sum / input.length) * 100);
    
    // Detect speech based on volume
    if (volume > volumeThreshold) {
      if (!isSpeaking) {
        isSpeaking = true;
        silenceStart = null;
        recordingStartTime = Date.now();
        
        // Visual feedback that we detected speech
        visualizer.style.borderColor = '#6a0dad';
        
        // Start recording
        if (mediaRecorder && mediaRecorder.state === 'inactive') {
          try {
            mediaRecorder.start();
            console.log('Started recording audio');
          } catch (error) {
            console.error('Error starting MediaRecorder:', error);
          }
        }
      }
    } else {
      if (isSpeaking) {
        if (silenceStart === null) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > silenceThreshold * 100) {
          // Silence long enough - end of speech
          isSpeaking = false;
          visualizer.style.borderColor = '';
          
          // Stop recording if it's been going on for at least 1 second
          // This prevents stopping on short pauses
          if (recordingStartTime && Date.now() - recordingStartTime > 1000) {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
              try {
                mediaRecorder.stop();
                console.log('Stopped recording audio, processing speech');
                updateStatus('Processing speech...');
              } catch (error) {
                console.error('Error stopping MediaRecorder:', error);
                fallbackToManualInput();
              }
            } else {
              // If we couldn't record for some reason, fall back to manual input
              fallbackToManualInput();
            }
          }
        }
      }
    }
  };
}

// Attempt local speech-to-text conversion with options
async function tryLocalSpeechToText(audioBlob) {
  console.log('Trying local speech-to-text options');
  
  // Option 1: Use browser's native Speech Recognition API (if available)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition && !usingFallbackMode) {
    try {
      // We would need to play the audio and have the recognition listen
      // This is complex and unreliable, so we'll skip to option 2
      console.log('Native speech recognition not practical for recorded audio');
    } catch (error) {
      console.error('Native speech recognition failed:', error);
    }
  }
  
  // Option 2: Send to main process for server-based conversion
  try {
    // Send to main process for Google Cloud processing
    const result = await window.electronAPI.convertSpeechToText(audioBlob);
    if (result && result.success && result.transcript) {
      console.log('Server speech-to-text successful');
      transcriptText.textContent = result.transcript;
      processCommand(result.transcript);
      return;
    } else {
      console.log('Server speech-to-text failed or not available');
    }
  } catch (error) {
    console.error('Server speech-to-text failed:', error);
  }
  
  // Option 3: Fall back to manual input
  fallbackToManualInput();
}

// Fall back to manual text input
function fallbackToManualInput() {
  console.log('Falling back to manual input');
  updateStatus('Please type your command');
  
  // Show the manual input with prompt
  const manualInput = document.getElementById('manual-command-input');
  manualInput.placeholder = "I heard something. What did you say?";
  manualInput.focus();
}

// Draw audio visualization
function drawVisualization() {
  // Set up canvas
  const canvas = visualizerCanvas;
  const canvasCtx = canvas.getContext('2d');
  const width = canvas.width = visualizer.clientWidth;
  const height = canvas.height = visualizer.clientHeight;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 10;
  
  // Animation loop
  function draw() {
    animationFrame = requestAnimationFrame(draw);
    
    // Clear canvas
    canvasCtx.clearRect(0, 0, width, height);
    
    // Get audio data if available
    if (audioAnalyser) {
      audioAnalyser.getByteFrequencyData(audioData);
      
      // Draw circular visualizer
      const barCount = audioData.length;
      const barWidth = (2 * Math.PI) / barCount;
      
      for (let i = 0; i < barCount; i++) {
        const barHeight = audioData[i] ? (audioData[i] / 255) * radius / 2 : 1;
        const angle = i * barWidth;
        
        // Calculate positions
        const x1 = centerX + Math.cos(angle) * (radius - barHeight);
        const y1 = centerY + Math.sin(angle) * (radius - barHeight);
        const x2 = centerX + Math.cos(angle) * radius;
        const y2 = centerY + Math.sin(angle) * radius;
        
        // Draw line
        canvasCtx.beginPath();
        canvasCtx.moveTo(x1, y1);
        canvasCtx.lineTo(x2, y2);
        canvasCtx.strokeStyle = `rgba(255, 105, 180, ${audioData[i] / 255})`;
        canvasCtx.lineWidth = 2;
        canvasCtx.stroke();
      }
    } else {
      // Draw simple pulsing circle when not listening
      const time = Date.now() / 1000;
      const size = radius * (0.8 + Math.sin(time * 2) * 0.1);
      
      canvasCtx.beginPath();
      canvasCtx.arc(centerX, centerY, size, 0, 2 * Math.PI);
      canvasCtx.strokeStyle = 'rgba(255, 105, 180, 0.5)';
      canvasCtx.lineWidth = 2;
      canvasCtx.stroke();
    }
  }
  
  // Start animation
  draw();
}

// Stop audio capture
function stopAudioCapture() {
  if (audioStream) {
    // Stop all tracks
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
    
    // Clean up audio context
    if (audioProcessor) {
      audioProcessor.disconnect();
      audioProcessor = null;
    }
    
    if (audioAnalyser) {
      audioAnalyser.disconnect();
    }
    
    if (audioContext && audioContext.state !== 'closed') {
      // Don't close the context, just suspend it
      audioContext.suspend();
    }
    
    // Stop visualization animation
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    
    // Update status
    isListening = false;
    visualizer.classList.remove('listening');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus('Idle');
    
    audioStatusContainer.style.display = 'block';
    document.getElementById('audio-status-message').textContent = 
      'Audio capture stopped';
  }
}

// Process commands
async function processCommand(command) {
  if (!command) return;
  
  const cleanCommand = command.toLowerCase().trim();
  console.log('Processing command:', cleanCommand);
  
  // Skip wake word check for manual input
  const skipWakeWordCheck = !isListening;
  
  if (isListening && 
      !cleanCommand.startsWith(emisConfig.wakeWord.toLowerCase()) && 
      statusElement.textContent !== 'Processing...') {
    console.log('Wake word not detected, ignoring command');
    return;
  }
  
  // Remove wake word from command if present
  const commandWithoutWake = cleanCommand.startsWith(emisConfig.wakeWord.toLowerCase()) 
    ? cleanCommand.substring(emisConfig.wakeWord.length).trim() 
    : cleanCommand;
  
  if (!commandWithoutWake) {
    return;
  }
  
  updateStatus('Processing...');
  visualizer.classList.remove('listening');
  visualizer.classList.add('processing');
  
  try {
    // Send command to main process
    console.log('Sending command to main process:', commandWithoutWake);
    const result = await window.electronAPI.executeCommand(commandWithoutWake);
    
    visualizer.classList.remove('processing');
    
    if (result.success) {
      updateStatus('Command executed');
      
      // Always update text response
      responseText.textContent = result.response;
      
      // Try to speak, but continue regardless of success
      try {
        await speakWithPromise(result.response);
      } catch (error) {
        console.error('Speech error, continuing with text only:', error);
      }
    } else {
      updateStatus('Command failed');
      
      // Always update text response
      responseText.textContent = result.response || "I couldn't process that command.";
      
      // Try to speak, but continue regardless of success
      try {
        await speakWithPromise(result.response || "I couldn't process that command.");
      } catch (error) {
        console.error('Speech error, continuing with text only:', error);
      }
    }
  } catch (error) {
    console.error('Error executing command:', error);
    updateStatus('Error');
    visualizer.classList.remove('processing');
    
    const errorMessage = "I'm sorry, I encountered an error while processing your request.";
    responseText.textContent = errorMessage;
    
    // Try to speak, but continue regardless of success
    try {
      await speakWithPromise(errorMessage);
    } catch (error) {
      console.error('Speech error, continuing with text only:', error);
    }
  }
}

// Promise-based speech synthesis
function speakWithPromise(text) {
  return new Promise((resolve, reject) => {
    if (!text) {
      resolve();
      return;
    }
    
    try {
      // Cancel any ongoing speech
      synth.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = emisConfig.volume;
      
      // Enhanced voice selection logic
      const voices = synth.getVoices();
      let voiceFound = false;
      
      // First try the specified voice
      if (emisConfig.voice !== 'default') {
        // Check if this is a cloud voice (starts with 'en-US' or similar pattern)
        if (emisConfig.voice.match(/^[a-z]{2}-[A-Z]{2}/)) {
          // This is likely a cloud voice, try Google Cloud TTS
          window.electronAPI.synthesizeSpeech(text)
            .then(result => {
              if (result.success) {
                // Cloud TTS successful, resolve the promise
                console.log('Used cloud TTS successfully');
                visualizer.classList.remove('speaking');
                if (isListening) visualizer.classList.add('listening');
                resolve();
              } else {
                // Fall back to browser TTS
                console.log('Cloud TTS failed, falling back to browser TTS');
                continueWithBrowserTTS();
              }
            })
            .catch(error => {
              console.error('Cloud TTS error, falling back to browser TTS:', error);
              continueWithBrowserTTS();
            });
          
          // Add speaking visual indication
          visualizer.classList.add('speaking');
          visualizer.classList.remove('listening');
          
          // Don't continue with browser TTS yet, wait for cloud TTS result
          return;
        } else {
          // Try to find the specified voice in browser voices
          const selectedVoice = voices.find(voice => voice.name === emisConfig.voice);
          if (selectedVoice) {
            utterance.voice = selectedVoice;
            voiceFound = true;
          }
        }
      }
      
      // Continue with browser TTS
      continueWithBrowserTTS();
      
      function continueWithBrowserTTS() {
        // If specified voice not found, try to find a voice matching the fallback criteria
        if (!voiceFound && emisConfig.fallbackVoice) {
          const fallbackVoice = voices.find(voice => 
            (voice.name.includes('Female') || 
             voice.name.includes('female') || 
             voice.name.includes('-F')) && 
            voice.lang.startsWith('en') &&
            !voice.localService // Prefer cloud/neural voices
          );
          
          if (fallbackVoice) {
            utterance.voice = fallbackVoice;
            voiceFound = true;
            console.log('Using fallback voice:', fallbackVoice.name);
          }
        }
        
        // If still no voice found, use the first available female English voice
        if (!voiceFound) {
          const anyFemaleVoice = voices.find(voice => 
            (voice.name.includes('Female') || 
             voice.name.includes('female') || 
             voice.name.includes('-F') ||
             voice.name.includes('f')) && 
            voice.lang.startsWith('en')
          );
          
          if (anyFemaleVoice) {
            utterance.voice = anyFemaleVoice;
            console.log('Using backup female voice:', anyFemaleVoice.name);
          } else if (voices.length > 0) {
            // Last resort: use any English voice
            const anyEnglishVoice = voices.find(voice => voice.lang.startsWith('en'));
            if (anyEnglishVoice) {
              utterance.voice = anyEnglishVoice;
              console.log('Using any English voice:', anyEnglishVoice.name);
            } else {
              // Very last resort: use the first available voice
              utterance.voice = voices[0];
              console.log('Using first available voice:', voices[0].name);
            }
          }
        }
        
        utterance.onstart = () => {
          console.log('Speech started');
          visualizer.classList.add('speaking');
          visualizer.classList.remove('listening');
        };
        
        utterance.onend = () => {
          console.log('Speech ended');
          visualizer.classList.remove('speaking');
          if (isListening) visualizer.classList.add('listening');
          resolve();
        };
        
        utterance.onerror = (event) => {
          console.error('Speech synthesis error:', event);
          handleVoiceSynthesisError(event);
          visualizer.classList.remove('speaking');
          if (isListening) visualizer.classList.add('listening');
          // Still resolve since we want to continue execution
          resolve();
        };
        
        synth.speak(utterance);
        
        // Safety fallback - resolve after max speech time if speech fails to trigger onend
        setTimeout(() => {
          if (synth.speaking) {
            console.warn('Speech did not complete in expected time, forcing continue');
            resolve();
          }
        }, 10000); // 10 second max speech time
      }
    } catch (error) {
      console.error('Error with speech synthesis:', error);
      handleVoiceSynthesisError(error);
      resolve(); // Still resolve to continue execution
    }
  });
}

// Legacy speak function for backward compatibility
function speak(text, callback) {
  if (!text) {
    if (callback) callback();
    return;
  }
  
  responseText.textContent = text;
  console.log('EMIS response:', text);
  
  try {
    // Cancel any ongoing speech
    synth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = emisConfig.volume;
    
    // Enhanced voice selection logic
    const voices = synth.getVoices();
    let voiceFound = false;
    
    // First try the specified voice
    if (emisConfig.voice !== 'default') {
      // Check if this is a cloud voice (starts with 'en-US' or similar pattern)
      if (emisConfig.voice.match(/^[a-z]{2}-[A-Z]{2}/)) {
        // This is likely a cloud voice, try Google Cloud TTS
        window.electronAPI.synthesizeSpeech(text)
          .then(result => {
            if (result.success) {
              // Cloud TTS successful
              console.log('Used cloud TTS successfully');
              if (callback) callback();
            } else {
              // Fall back to browser TTS
              console.log('Cloud TTS failed, falling back to browser TTS');
              continueBrowserTTS();
            }
          })
          .catch(error => {
            console.error('Cloud TTS error, falling back to browser TTS:', error);
            continueBrowserTTS();
          });
        
        return;
      } else {
        // Try to find the specified voice in browser voices
        const selectedVoice = voices.find(voice => voice.name === emisConfig.voice);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          voiceFound = true;
        }
      }
    }
    
    continueBrowserTTS();
    
    function continueBrowserTTS() {
      // If specified voice not found, try to find a voice matching the fallback criteria
      if (!voiceFound && emisConfig.fallbackVoice) {
        const fallbackVoice = voices.find(voice => 
          (voice.name.includes('Female') || 
           voice.name.includes('female') || 
           voice.name.includes('-F')) && 
          voice.lang.startsWith('en') &&
          !voice.localService // Prefer cloud/neural voices
        );
        
        if (fallbackVoice) {
          utterance.voice = fallbackVoice;
          voiceFound = true;
          console.log('Using fallback voice:', fallbackVoice.name);
        }
      }
      
      // If still no voice found, use the first available female English voice
      if (!voiceFound) {
        const anyFemaleVoice = voices.find(voice => 
          (voice.name.includes('Female') || 
           voice.name.includes('female') || 
           voice.name.includes('-F') ||
           voice.name.includes('f')) && 
          voice.lang.startsWith('en')
        );
        
        if (anyFemaleVoice) {
          utterance.voice = anyFemaleVoice;
          console.log('Using backup female voice:', anyFemaleVoice.name);
        } else if (voices.length > 0) {
          // Last resort: use any English voice
          const anyEnglishVoice = voices.find(voice => voice.lang.startsWith('en'));
          if (anyEnglishVoice) {
            utterance.voice = anyEnglishVoice;
            console.log('Using any English voice:', anyEnglishVoice.name);
          } else {
            // Very last resort: use the first available voice
            utterance.voice = voices[0];
            console.log('Using first available voice:', voices[0].name);
          }
        }
      }
      
      utterance.onstart = () => {
        console.log('Speech started');
        visualizer.classList.add('speaking');
        visualizer.classList.remove('listening');
      };
      
      utterance.onend = () => {
        console.log('Speech ended');
        visualizer.classList.remove('speaking');
        if (isListening) visualizer.classList.add('listening');
        
        if (callback) callback();
      };
      
      utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        handleVoiceSynthesisError(event);
        visualizer.classList.remove('speaking');
        if (isListening) visualizer.classList.add('listening');
        
        if (callback) callback();
      };
      
      synth.speak(utterance);
      
      // Safety fallback
      setTimeout(() => {
        if (synth.speaking && callback) {
          console.warn('Speech taking too long, calling callback anyway');
          callback();
        }
      }, 10000);
    }
  } catch (error) {
    console.error('Error with speech synthesis:', error);
    handleVoiceSynthesisError(error);
    if (callback) callback();
  }
}

// Handle voice synthesis errors
function handleVoiceSynthesisError(error) {
  voiceSynthesisErrorCount++;
  
  if (voiceSynthesisErrorCount === 1) {
    // First error - show the warning
    voiceSynthesisErrorContainer.style.display = 'block';
  }
  
  // Retry loading voices
  if (voiceSynthesisErrorCount <= 2) {
    setTimeout(() => {
      loadVoices();
    }, 2000);
  }
}

// Update status display
function updateStatus(status) {
  statusElement.textContent = status;
  console.log('Status updated:', status);
}

// Load available voices
function loadVoices() {
  console.log('Loading voices...');
  
  // Clear existing options except the first default option
  while (voiceSelect.options.length > 1) {
    voiceSelect.options.remove(1);
  }
  
  // Get and add browser voices
  const voices = synth.getVoices();
  console.log('Available browser voices:', voices.length);
  
  // Store voices for later use
  availableVoices = voices;
  
  if (voices.length > 0) {
    // First add female English voices (preferred)
    const femaleEnglishVoices = voices.filter(voice => 
      (voice.name.includes('Female') || 
       voice.name.includes('female') || 
       voice.name.includes('-F') ||
       voice.name.includes('f')) && 
      voice.lang.startsWith('en')
    );
    
    femaleEnglishVoices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      if (!voice.localService) {
        option.textContent = '☁️ ' + option.textContent; // Mark cloud voices
      }
      voiceSelect.appendChild(option);
    });
    
    // Then add other English voices
    const otherEnglishVoices = voices.filter(voice => 
      voice.lang.startsWith('en') && 
      !femaleEnglishVoices.includes(voice)
    );
    
    if (otherEnglishVoices.length > 0) {
      // Add a separator
      const separator = document.createElement('option');
      separator.disabled = true;
      separator.textContent = '──────────────';
      voiceSelect.appendChild(separator);
      
      // Add the other English voices
      otherEnglishVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        if (!voice.localService) {
          option.textContent = '☁️ ' + option.textContent; // Mark cloud voices
        }
        voiceSelect.appendChild(option);
      });
    }
    
    // Finally add all other voices if any
    const otherVoices = voices.filter(voice => 
      !voice.lang.startsWith('en')
    );
    
    if (otherVoices.length > 0) {
      // Add a separator
      const separator = document.createElement('option');
      separator.disabled = true;
      separator.textContent = '──────────────';
      voiceSelect.appendChild(separator);
      
      // Add the other voices
      otherVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.lang})`;
        if (!voice.localService) {
          option.textContent = '☁️ ' + option.textContent; // Mark cloud voices
        }
        voiceSelect.appendChild(option);
      });
    }
    
    voicesLoaded = true;
  } else {
    // Add at least one dummy option
    const option = document.createElement('option');
    option.value = "default";
    option.textContent = "Default Voice";
    voiceSelect.appendChild(option);
  }
}

// Update UI from config
function updateUIFromConfig() {
  wakeWordInput.value = emisConfig.wakeWord || 'emis';
  volumeInput.value = emisConfig.volume || 0.8;
  
  if (emisConfig.voice && emisConfig.voice !== 'default') {
    // Find and select the voice in dropdown
    for (let i = 0; i < voiceSelect.options.length; i++) {
      if (voiceSelect.options[i].value === emisConfig.voice) {
        voiceSelect.selectedIndex = i;
        break;
      }
    }
  }
}

// Add CSS for processing animation
const styleElement = document.createElement('style');
styleElement.textContent = `
  @keyframes processing {
    0% { transform: scale(1); background: linear-gradient(135deg, var(--secondary-color), var(--accent-color)); }
    50% { transform: scale(1.03); background: linear-gradient(135deg, var(--accent-color), var(--primary-color)); }
    100% { transform: scale(1); background: linear-gradient(135deg, var(--secondary-color), var(--accent-color)); }
  }
  
  .emis-visualizer.processing {
    animation: processing 1.2s infinite;
  }
`;
document.head.appendChild(styleElement);

// Event listeners
startBtn.addEventListener('click', () => {
  console.log('Start button clicked');
  startAudioCapture();
});

stopBtn.addEventListener('click', () => {
  console.log('Stop button clicked');
  stopAudioCapture();
});

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('active');
});

saveSettingsBtn.addEventListener('click', async () => {
  // Update config
  const newConfig = {
    wakeWord: wakeWordInput.value,
    voice: voiceSelect.value,
    volume: parseFloat(volumeInput.value)
  };
  
  try {
    // Save to main process
    emisConfig = await window.electronAPI.updateConfig(newConfig);
    updateStatus('Settings saved');
    
    // Confirm with voice
    speak('Settings updated successfully.');
    
    // Close panel
    settingsPanel.classList.remove('active');
  } catch (error) {
    console.error('Error saving settings:', error);
    updateStatus('Error saving settings');
  }
});

// Handle visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Stop listening if page is hidden
    if (isListening) {
      stopAudioCapture();
    }
  }
});

// When browser window is closing
window.addEventListener('beforeunload', () => {
  if (isListening) {
    stopAudioCapture();
  }
  
  if (synth) {
    synth.cancel();
  }
});

// Log any uncaught errors
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
});