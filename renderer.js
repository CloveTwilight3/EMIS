// renderer.js - Fixed speech recognition with network error handling

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
  volume: 0.8
};
let usingFallbackMode = false;
let shouldRestartRecognition = false;
let networkErrorCount = 0;
let voiceSynthesisErrorCount = 0;
let voicesLoaded = false;

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
  
  // Check for wake word if not already actively processing commands
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
  
  try {
    // Send command to main process
    console.log('Sending command to main process:', commandWithoutWake);
    const result = await window.electronAPI.executeCommand(commandWithoutWake);
    
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
      
      // Set voice if specified and available
      if (emisConfig.voice !== 'default') {
        const voices = synth.getVoices();
        const selectedVoice = voices.find(voice => voice.name === emisConfig.voice);
        if (selectedVoice) utterance.voice = selectedVoice;
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
    
    // Set voice if specified and available
    if (emisConfig.voice !== 'default') {
      const voices = synth.getVoices();
      const selectedVoice = voices.find(voice => voice.name === emisConfig.voice);
      if (selectedVoice) utterance.voice = selectedVoice;
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
  
  // Clear existing options
  while (voiceSelect.options.length > 1) {
    voiceSelect.options.remove(1);
  }
  
  // Get and add voices
  const voices = synth.getVoices();
  console.log('Available voices:', voices.length);
  
  if (voices.length > 0) {
    voices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      voiceSelect.appendChild(option);
    });
    voicesLoaded = true;
  } else {
    // Add at least one dummy option
    const option = document.createElement('option');
    option.value = "default";
    option.textContent = "Default Voice";
    voiceSelect.appendChild(option);
    
    // Handle delayed voice loading in some browsers
    synth.onvoiceschanged = () => {
      console.log('Voices changed event triggered');
      loadVoices();
    };
    
    // Fallback for browsers where onvoiceschanged may not fire
    setTimeout(() => {
      const voices = synth.getVoices();
      if (voices.length > 0 && !voicesLoaded) {
        loadVoices();
      }
    }, 1000);
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
