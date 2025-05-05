// renderer.js - Enhanced speech recognition with improved voice selection logic

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

// Create network error notification
const networkErrorContainer = document.createElement('div');
networkErrorContainer.style.display = 'none';
networkErrorContainer.style.padding = '10px';
networkErrorContainer.style.marginBottom = '10px';
networkErrorContainer.style.backgroundColor = '#ffeeee';
networkErrorContainer.style.border = '1px solid #ffcccc';
networkErrorContainer.style.borderRadius = '4px';
networkErrorContainer.innerHTML = `
  <p style="margin: 0; color: #cc0000;">
    <strong>Speech Recognition Error:</strong> 
    Network connection issue detected. Voice commands may not work.
    Please use text input instead.
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

// State
let isListening = false;
let recognition = null;
let synth = window.speechSynthesis;
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
let shouldRestartRecognition = false;
let networkErrorCount = 0;
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
  
  // Add error notification containers
  controlsDiv.insertBefore(networkErrorContainer, controlsDiv.firstChild);
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
  
  // Initialize but don't start speech recognition
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

// Initialize speech recognition
function initSpeechRecognition() {
  // Check browser support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error('Speech Recognition API not supported');
    updateStatus('Speech recognition not supported');
    usingFallbackMode = true;
    networkErrorContainer.style.display = 'block';
    networkErrorContainer.innerHTML = `
      <p style="margin: 0; color: #cc0000;">
        <strong>Speech Recognition Not Available:</strong> 
        Your browser doesn't support speech recognition.
        Please use text input instead.
      </p>
    `;
    return false;
  }
  
  try {
    // Create a new instance - don't start it yet
    recognition = new SpeechRecognition();
    
    // Configure recognition
    recognition.continuous = false;  // Changed to false to avoid auto-restart issues
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
      console.log('Recognition started');
      updateStatus('Listening...');
      isListening = true;
      visualizer.classList.add('listening');
      startBtn.disabled = true;
      stopBtn.disabled = false;
    };
    
    recognition.onend = () => {
      console.log('Recognition ended');
      
      if (shouldRestartRecognition && networkErrorCount < 3) {
        console.log('Restarting recognition as requested');
        try {
          recognition.start();
        } catch (error) {
          console.error('Error restarting recognition:', error);
          isListening = false;
          shouldRestartRecognition = false;
          visualizer.classList.remove('listening');
          startBtn.disabled = false;
          stopBtn.disabled = true;
          updateStatus('Idle');
        }
      } else {
        isListening = false;
        visualizer.classList.remove('listening');
        startBtn.disabled = false;
        stopBtn.disabled = true;
        if (statusElement.textContent !== 'Processing...') {
          updateStatus('Idle');
        }
      }
    };
    
    recognition.onresult = (event) => {
      // Reset network error count on successful result
      networkErrorCount = 0;
      networkErrorContainer.style.display = 'none';
      
      const transcript = Array.from(event.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      
      transcriptText.textContent = transcript;
      
      // Check for final result
      const isFinal = event.results[0].isFinal;
      
      if (isFinal) {
        shouldRestartRecognition = false;  // Stop listening while processing command
        processCommand(transcript);
      }
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      
      // Handle different error types
      if (event.error === 'network') {
        networkErrorCount++;
        console.log(`Network error count: ${networkErrorCount}`);
        
        if (networkErrorCount >= 2) {
          // Show network error message after multiple failures
          networkErrorContainer.style.display = 'block';
          shouldRestartRecognition = false;
        }
      } else if (event.error === 'no-speech') {
        // No speech detected, just keep listening
        console.log('No speech detected, continuing to listen');
        networkErrorCount = 0; // Reset count on non-network errors
      } else {
        // Other errors - stop listening
        shouldRestartRecognition = false;
        isListening = false;
        updateStatus(`Error: ${event.error}`);
        visualizer.classList.remove('listening');
        startBtn.disabled = false;
        stopBtn.disabled = true;
      }
    };
    
    console.log('Speech recognition initialized successfully');
    return true;
  } catch (error) {
    console.error('Error setting up speech recognition:', error);
    usingFallbackMode = true;
    return false;
  }
}

// Start listening
function startListening() {
  if (!recognition) {
    if (!initSpeechRecognition()) {
      updateStatus('Speech recognition not available');
      return;
    }
  }
  
  // Reset network error count on new attempt
  networkErrorCount = 0;
  
  try {
    shouldRestartRecognition = true;  // Set to restart when onend fires
    recognition.start();
  } catch (error) {
    console.error('Error starting recognition:', error);
    shouldRestartRecognition = false;
    isListening = false;
    updateStatus(`Error: ${error.message}`);
  }
}

// Stop listening
function stopListening() {
  if (recognition) {
    shouldRestartRecognition = false;  // Don't restart
    try {
      recognition.stop();
    } catch (error) {
      console.error('Error stopping recognition:', error);
    }
  }
  
  isListening = false;
  visualizer.classList.remove('listening');
  startBtn.disabled = false;
  stopBtn.disabled = true;
  updateStatus('Idle');
}

// Process voice commands
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
    
    // Restart recognition if we're supposed to keep listening
    if (shouldRestartRecognition && recognition) {
      try {
        recognition.start();
      } catch (error) {
        console.error('Error restarting recognition after ignored command:', error);
      }
    }
    
    return;
  }
  
  // Remove wake word from command if present
  const commandWithoutWake = cleanCommand.startsWith(emisConfig.wakeWord.toLowerCase()) 
    ? cleanCommand.substring(emisConfig.wakeWord.length).trim() 
    : cleanCommand;
  
  if (!commandWithoutWake) {
    // Restart recognition if we're supposed to keep listening
    if (shouldRestartRecognition && recognition) {
      try {
        recognition.start();
      } catch (error) {
        console.error('Error restarting recognition after empty command:', error);
      }
    }
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
      
      // Restart listening if needed
      if (shouldRestartRecognition) {
        startListening();
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
      
      // Restart listening if needed
      if (shouldRestartRecognition) {
        startListening();
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
    
    // Restart listening if needed
    if (shouldRestartRecognition) {
      startListening();
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
  startListening();
});

stopBtn.addEventListener('click', () => {
  console.log('Stop button clicked');
  stopListening();
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
      shouldRestartRecognition = false;
      try {
        if (recognition) recognition.stop();
      } catch (error) {
        console.error('Error stopping recognition on visibility change:', error);
      }
      isListening = false;
    }
  }
});

// When browser window is closing
window.addEventListener('beforeunload', () => {
  shouldRestartRecognition = false;
  isListening = false;
  if (recognition) {
    try {
      recognition.stop();
    } catch (error) {
      console.error('Error stopping recognition on unload:', error);
    }
  }
  synth.cancel();
});

// Log any uncaught errors
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
});