// Enhanced renderer.ts with improved speech recognition and audio playback

// @ts-nocheck - Allow for browser-specific APIs
export {}; // Make this a module

// Elements
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const transcriptText = document.getElementById('transcript-text') as HTMLElement;
const responseText = document.getElementById('response-text') as HTMLElement;
const statusElement = document.querySelector('.status') as HTMLElement;
const visualizer = document.querySelector('.emis-visualizer') as HTMLElement;
const settingsBtn = document.querySelector('.settings-button') as HTMLElement;
const settingsPanel = document.querySelector('.settings-panel') as HTMLElement;
const wakeWordInput = document.getElementById('wake-word') as HTMLInputElement;
const voiceSelect = document.getElementById('voice-select') as HTMLSelectElement;
const volumeInput = document.getElementById('volume') as HTMLInputElement;
const saveSettingsBtn = document.getElementById('save-settings') as HTMLButtonElement;

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

// Create audio status indicator
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

// Create debug panel for troubleshooting
const debugPanel = document.createElement('div');
debugPanel.style.display = 'none';
debugPanel.style.padding = '10px';
debugPanel.style.marginTop = '20px';
debugPanel.style.backgroundColor = '#f8f8f8';
debugPanel.style.border = '1px solid #ddd';
debugPanel.style.borderRadius = '4px';
debugPanel.innerHTML = `
  <h3>Debug Information</h3>
  <div id="debug-info" style="font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto;">
    [DEBUG] EMIS starting up...
  </div>
  <button id="debug-toggle-btn" style="margin-top: 10px;">Show/Hide Debug Info</button>
  <button id="debug-clear-btn" style="margin-top: 10px; margin-left: 10px;">Clear</button>
  <div style="margin-top: 10px;">
    <label for="debug-speech-threshold">Speech Detection Threshold:</label>
    <input type="range" id="debug-speech-threshold" min="5" max="50" value="10" style="width: 100%;">
    <span id="threshold-value">10</span>
  </div>
  <div style="margin-top: 15px;">
    <button id="test-tts-btn" style="background-color: #6a0dad; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">Test TTS</button>
    <button id="test-stt-btn" style="background-color: #6a0dad; color: white; border: none; padding: 8px 12px; border-radius: 4px; margin-left: 10px; cursor: pointer;">Test Speech Recognition</button>
  </div>
`;

// Add live threshold adjuster to debug panel
const thresholdAdjuster = document.createElement('div');
thresholdAdjuster.style.marginTop = '10px';
thresholdAdjuster.innerHTML = `
  <label for="live-threshold-slider">Live Speech Threshold Adjuster:</label>
  <input type="range" id="live-threshold-slider" min="1" max="30" value="10" style="width: 100%;">
  <span id="live-threshold-value">10</span>
  <div style="display: flex; justify-content: space-between; margin-top: 5px;">
    <button id="apply-threshold-btn" style="background-color: #6a0dad; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Apply Now</button>
    <div id="current-volume-indicator" style="padding: 5px 10px; background-color: #f0f0f0; border-radius: 4px; font-size: 12px;">Volume: 0</div>
  </div>
`;
debugPanel.appendChild(thresholdAdjuster);

// Create volume level visualizer
const volumeVisualizer = document.createElement('div');
volumeVisualizer.style.marginTop = '10px';
volumeVisualizer.innerHTML = `
  <div style="margin-bottom: 5px;">Real-time Volume Level:</div>
  <div style="display: flex; align-items: center; height: 20px;">
    <div id="volume-bar" style="height: 100%; background: linear-gradient(to right, #6a0dad, #ff69b4); width: 0%; border-radius: 3px; transition: width 0.1s;"></div>
    <div id="threshold-line" style="position: relative; height: 100%; width: 3px; background-color: red; margin-left: -3px;"></div>
  </div>
  <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 2px;">
    <span>0</span>
    <span>50</span>
    <span>100</span>
  </div>
`;
debugPanel.appendChild(volumeVisualizer);

// Create canvas for audio visualization
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

// State variables
let isListening: boolean = false;
let audioContext: AudioContext | null = null;
let audioStream: MediaStream | null = null;
let audioProcessor: ScriptProcessorNode | null = null;
let audioAnalyser: AnalyserNode | null = null;
let audioData: Uint8Array | null = null;
let animationFrame: number | null = null;
let synth: SpeechSynthesis = window.speechSynthesis;
let recognition: any = null;
let emisConfig: any = {
  wakeWord: 'emis',
  voice: 'default',
  fallbackVoice: {
    name: 'Google US English Female',
    lang: 'en-US',
    localService: false
  },
  volume: 0.8,
  speechThreshold: 10 // Lower default threshold from 15 to 10
};

// Debug variables
let debugVisible: boolean = false;
let debugLog: string[] = [];
const MAX_DEBUG_ENTRIES: number = 100;

// Currently playing audio element
let currentAudio: HTMLAudioElement | null = null;

// Global volume tracking variables
let currentVolume: number = 0;
let activeVolumeThreshold: number = 10;

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
  logDebug('EMIS initializing...');
  updateStatus('Initializing...');
  
  // Add UI elements
  const controlsDiv = document.querySelector('.controls');
  controlsDiv.appendChild(manualCommandContainer);
  controlsDiv.insertBefore(audioStatusContainer, controlsDiv.firstChild);
  controlsDiv.appendChild(debugPanel);
  
  // Set up manual input
  setupManualInput();
  
  // Set up debug tools
  setupDebugTools();
  
  // Load voices and config
  await Promise.all([
    loadVoices(),
    loadConfig()
  ]);
  
  // Set up browser speech recognition
  const recognitionAvailable = initSpeechRecognition();
  logDebug(`Browser speech recognition available: ${recognitionAvailable}`);
  
  // Check if WebRTC audio is supported
  const audioSupported = checkAudioSupport();
  logDebug(`WebRTC audio support: ${audioSupported}`);
  
  // Set up audio file playback listener
  setupAudioFileListener();
  
  // Initial greeting
  const greeting = emisConfig.personality?.greeting || "Hello, I'm EMIS. How can I assist you today?";
  responseText.textContent = greeting;
  
  speakWithPromise(greeting)
    .catch(error => logDebug(`Initial greeting speech error: ${error.message}`, 'error'));
    
  // Set up live threshold controls
  setupLiveThresholdControls();
});

// Debug logging function
function logDebug(message: string, level: string = 'info'): void {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}][${level.toUpperCase()}] ${message}`;
  
  // Add to debug log
  debugLog.unshift(logEntry);
  
  // Trim log if too long
  if (debugLog.length > MAX_DEBUG_ENTRIES) {
    debugLog = debugLog.slice(0, MAX_DEBUG_ENTRIES);
  }
  
  // Update debug panel if visible
  const debugInfo = document.getElementById('debug-info');
  if (debugInfo) {
    debugInfo.innerHTML = debugLog.join('<br>');
  }
  
  // Log to console
  console.log(logEntry);
}

// Set up debug tools
function setupDebugTools() {
  const debugToggleBtn = document.getElementById('debug-toggle-btn');
  const debugClearBtn = document.getElementById('debug-clear-btn');
  const thresholdSlider = document.getElementById('debug-speech-threshold');
  const thresholdValue = document.getElementById('threshold-value');
  const testTtsBtn = document.getElementById('test-tts-btn');
  const testSttBtn = document.getElementById('test-stt-btn');
  
  debugToggleBtn.addEventListener('click', () => {
    debugVisible = !debugVisible;
    document.getElementById('debug-info').style.display = debugVisible ? 'block' : 'none';
  });
  
  debugClearBtn.addEventListener('click', () => {
    debugLog = [];
    document.getElementById('debug-info').innerHTML = '';
  });
  
  thresholdSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    thresholdValue.textContent = value;
    emisConfig.speechThreshold = value;
    logDebug(`Speech threshold set to ${value}`);
    updateThresholdLine(value);
  });
  
  testTtsBtn.addEventListener('click', () => {
    const testPhrase = "This is a test of the text to speech system. If you can hear this, audio playback is working correctly.";
    logDebug('Testing TTS with phrase: ' + testPhrase);
    speakWithPromise(testPhrase)
      .catch(error => logDebug(`TTS test error: ${error.message}`, 'error'));
  });
  
  testSttBtn.addEventListener('click', async () => {
    logDebug('Testing speech recognition with mock data');
    try {
      const result = await window.electronAPI.getMockTranscription();
      if (result && result.success && result.transcript) {
        logDebug(`Got mock transcript: "${result.transcript}"`);
        transcriptText.textContent = result.transcript;
        processCommand(result.transcript);
      } else {
        logDebug('Failed to get mock transcript', 'error');
      }
    } catch (error) {
      logDebug(`Speech recognition test error: ${error.message}`, 'error');
    }
  });
}

// Set up live threshold controls
function setupLiveThresholdControls() {
  const liveThresholdSlider = document.getElementById('live-threshold-slider');
  const liveThresholdValue = document.getElementById('live-threshold-value');
  const applyThresholdBtn = document.getElementById('apply-threshold-btn');
  
  if (liveThresholdSlider && liveThresholdValue && applyThresholdBtn) {
    liveThresholdSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      liveThresholdValue.textContent = value;
      updateThresholdLine(value);
    });
    
    applyThresholdBtn.addEventListener('click', () => {
      const value = parseInt(liveThresholdSlider.value);
      emisConfig.speechThreshold = value;
      activeVolumeThreshold = value; // Update the active threshold
      logDebug(`Live speech threshold updated to ${value}`);
      
      // Also update the debug panel slider to stay in sync
      const debugSlider = document.getElementById('debug-speech-threshold');
      if (debugSlider) {
        debugSlider.value = value;
        document.getElementById('threshold-value').textContent = value;
      }
    });
  }
}

// Update threshold line in the volume visualizer
function updateThresholdLine(value) {
  const thresholdLine = document.getElementById('threshold-line');
  if (thresholdLine) {
    // Convert threshold value to percentage position (0-100)
    const percentage = Math.min(100, Math.max(0, value));
    thresholdLine.style.marginLeft = `${percentage}%`;
  }
}

// Update volume visualizer
function updateVolumeVisualizer(volume) {
  currentVolume = volume;
  const volumeBar = document.getElementById('volume-bar');
  const volumeIndicator = document.getElementById('current-volume-indicator');
  
  if (volumeBar) {
    // Convert the volume level to a percentage (0-100)
    const volumePercentage = Math.min(100, Math.max(0, volume));
    volumeBar.style.width = `${volumePercentage}%`;
    
    // Change color based on volume level
    if (volume > activeVolumeThreshold) {
      volumeBar.style.background = 'linear-gradient(to right, #ff69b4, #ff0000)'; // Pink to red when over threshold
    } else {
      volumeBar.style.background = 'linear-gradient(to right, #6a0dad, #ff69b4)'; // Purple to pink when under threshold
    }
  }
  
  if (volumeIndicator) {
    volumeIndicator.textContent = `Volume: ${Math.round(volume)}`;
  }
}

// Set up manual input
function setupManualInput() {
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
}

// Setup listener for audio file ready events from main process
function setupAudioFileListener() {
  window.electronAPI.onAudioFileReady((filePath) => {
    logDebug(`Audio file ready for playback: ${filePath}`);
    playAudioFile(filePath);
  });
}

// Play audio file from path
function playAudioFile(filePath) {
  // Stop any currently playing audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  
  // Create new audio element
  const audio = new Audio(`file://${filePath}`);
  currentAudio = audio;
  
  // Set volume from config
  audio.volume = emisConfig.volume || 0.8;
  
  // Setup event handlers
  audio.onplay = () => {
    logDebug('Audio playback started');
    visualizer.classList.add('speaking');
    visualizer.classList.remove('listening');
  };
  
  audio.onended = () => {
    logDebug('Audio playback completed');
    visualizer.classList.remove('speaking');
    if (isListening) visualizer.classList.add('listening');
    currentAudio = null;
  };
  
  audio.onerror = (event) => {
    logDebug(`Audio playback error: ${event.type}`, 'error');
    console.error('Audio error details:', event);
    visualizer.classList.remove('speaking');
    if (isListening) visualizer.classList.add('listening');
    currentAudio = null;
  };
  
  // Play the audio
  audio.play()
    .then(() => {
      logDebug('Audio playback started successfully');
    })
    .catch(error => {
      logDebug(`Failed to play audio: ${error.message}`, 'error');
      visualizer.classList.remove('speaking');
      if (isListening) visualizer.classList.add('listening');
      currentAudio = null;
    });
}

// Load configuration
async function loadConfig() {
  try {
    const config = await window.electronAPI.getConfig();
    logDebug('Config loaded from main process');
    emisConfig = { ...emisConfig, ...config };
    updateUIFromConfig();
    
    // Try to get cloud TTS voices from Google if available
    try {
      const voiceResult = await window.electronAPI.getTtsVoices();
      if (voiceResult.success && voiceResult.voices && voiceResult.voices.length > 0) {
        logDebug(`Cloud TTS voices available: ${voiceResult.voices.length}`);
        
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
      logDebug(`Cloud TTS not available: ${error.message}`, 'warn');
    }
    
    return emisConfig;
  } catch (error) {
    logDebug(`Error getting config: ${error.message}`, 'error');
    updateStatus('Error loading config');
    throw error;
  }
}

// Load available speech synthesis voices
function loadVoices() {
  return new Promise((resolve) => {
    logDebug('Loading speech synthesis voices...');
    
    // Clear existing options except the default
    while (voiceSelect.options.length > 1) {
      voiceSelect.options.remove(1);
    }
    
    const loadVoicesHandler = () => {
      const voices = synth.getVoices();
      logDebug(`Found ${voices.length} browser speech synthesis voices`);
      
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
            option.textContent = '☁️ ' + option.textContent;
          }
          voiceSelect.appendChild(option);
        });
        
        // Then add other English voices
        const otherEnglishVoices = voices.filter(voice => 
          voice.lang.startsWith('en') && 
          !femaleEnglishVoices.includes(voice)
        );
        
        if (otherEnglishVoices.length > 0) {
          const separator = document.createElement('option');
          separator.disabled = true;
          separator.textContent = '──────────────';
          voiceSelect.appendChild(separator);
          
          otherEnglishVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            if (!voice.localService) {
              option.textContent = '☁️ ' + option.textContent;
            }
            voiceSelect.appendChild(option);
          });
        }
        
        // Finally add non-English voices
        const otherVoices = voices.filter(voice => 
          !voice.lang.startsWith('en')
        );
        
        if (otherVoices.length > 0) {
          const separator = document.createElement('option');
          separator.disabled = true;
          separator.textContent = '──────────────';
          voiceSelect.appendChild(separator);
          
          otherVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            if (!voice.localService) {
              option.textContent = '☁️ ' + option.textContent;
            }
            voiceSelect.appendChild(option);
          });
        }
        
        resolve(voices);
      } else {
        logDebug('No voices found, will retry', 'warn');
        // If no voices, retry once
        setTimeout(() => {
          const retryVoices = synth.getVoices();
          if (retryVoices.length > 0) {
            logDebug(`Found ${retryVoices.length} voices on retry`);
            resolve(retryVoices);
          } else {
            logDebug('Still no voices available after retry', 'error');
            resolve([]);
          }
        }, 1000);
      }
    };
    
    // Different browsers load voices differently
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = () => {
        loadVoicesHandler();
      };
      
      // Also call immediately in case voices are already loaded
      loadVoicesHandler();
      
      // Set a timeout in case the event never fires
      setTimeout(() => {
        const voices = synth.getVoices();
        if (voices.length > 0) {
          loadVoicesHandler();
        }
      }, 2000);
    } else {
      // If no onvoiceschanged event, just try to load directly
      loadVoicesHandler();
    }
  });
}

// Update UI from config
function updateUIFromConfig() {
  wakeWordInput.value = emisConfig.wakeWord || 'emis';
  volumeInput.value = emisConfig.volume || 0.8;
  
  // Set speech threshold if available
  const thresholdSlider = document.getElementById('debug-speech-threshold');
  const thresholdValue = document.getElementById('threshold-value');
  const liveThresholdSlider = document.getElementById('live-threshold-slider');
  const liveThresholdValue = document.getElementById('live-threshold-value');
  
  if (thresholdSlider && emisConfig.speechThreshold) {
    thresholdSlider.value = emisConfig.speechThreshold;
    thresholdValue.textContent = emisConfig.speechThreshold;
  }
  
  if (liveThresholdSlider && emisConfig.speechThreshold) {
    liveThresholdSlider.value = emisConfig.speechThreshold;
    liveThresholdValue.textContent = emisConfig.speechThreshold;
    updateThresholdLine(emisConfig.speechThreshold);
  }
  
  // Find and select voice in dropdown
  if (emisConfig.voice && emisConfig.voice !== 'default') {
    for (let i = 0; i < voiceSelect.options.length; i++) {
      if (voiceSelect.options[i].value === emisConfig.voice) {
        voiceSelect.selectedIndex = i;
        break;
      }
    }
  }
}

// Check WebRTC audio support
function checkAudioSupport() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    logDebug('WebRTC audio not supported in this browser', 'error');
    audioStatusContainer.style.display = 'block';
    document.getElementById('audio-status-message').textContent = 
      'Audio capture not supported in this browser';
    audioStatusContainer.style.backgroundColor = '#ffeeee';
    audioStatusContainer.style.border = '1px solid #ffcccc';
    document.getElementById('audio-status-message').style.color = '#cc0000';
    return false;
  }
  
  audioStatusContainer.style.display = 'block';
  document.getElementById('audio-status-message').textContent = 
    'Audio capture ready - click Start Listening to begin';
  return true;
}

// Initialize browser speech recognition
function initSpeechRecognition() {
  // Get SpeechRecognition constructor
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    logDebug('SpeechRecognition API not supported in this browser', 'error');
    return false;
  }
  
  try {
    // Create recognition instance
    recognition = new SpeechRecognition();
    
    // Configure recognition
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;
    
    // Set up event handlers
    recognition.onstart = () => {
      logDebug('Browser speech recognition started');
    };
    
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');
      
      transcriptText.textContent = transcript;
      
      // If this is a final result, process it
      if (event.results[0].isFinal) {
        logDebug(`Final transcript: "${transcript}"`);
        processCommand(transcript);
      }
    };
    
    recognition.onerror = (event) => {
      logDebug(`Speech recognition error: ${event.error}`, 'error');
      
      // Error handling based on error type
      switch (event.error) {
        case 'network':
          // Network error, try fallback methods
          logDebug('Network error in speech recognition, trying fallbacks', 'warn');
          // Don't stop listening completely - will attempt alternative methods
          break;
          
        case 'not-allowed':
        case 'service-not-allowed':
          // Permission denied
          audioStatusContainer.style.display = 'block';
          document.getElementById('audio-status-message').textContent = 
            'Microphone permission denied. Please check browser settings.';
          audioStatusContainer.style.backgroundColor = '#ffeeee';
          document.getElementById('audio-status-message').style.color = '#cc0000';
          break;
          
        case 'aborted':
          // Recognition was aborted - this is usually intentional
          logDebug('Speech recognition aborted');
          break;
          
        case 'no-speech':
          // No speech detected
          logDebug('No speech detected');
          break;
          
        default:
          // Any other error
          logDebug(`Unhandled speech recognition error: ${event.error}`, 'error');
      }
    };
    
    recognition.onend = () => {
      logDebug('Browser speech recognition ended');
    };
    
    return true;
  } catch (error) {
    logDebug(`Error initializing speech recognition: ${error.message}`, 'error');
    return false;
  }
}

// Start audio capture and processing
async function startAudioCapture() {
  if (audioStream) {
    logDebug('Audio already capturing, stopping first');
    stopAudioCapture();
  }
  
  logDebug('Starting audio capture...');
  updateStatus('Starting listening...');
  
  try {
    // Request microphone access with noise reduction
    audioStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    
    // Set up audio context and processing
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(audioStream);
    
    // Set up analyzer for visualization
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 256;
    audioData = new Uint8Array(audioAnalyser.frequencyBinCount);
    source.connect(audioAnalyser);
    
    // Start visualization
    drawVisualization();
    
    // Set up voice activity detection with improved algorithm
    setupEnhancedVoiceDetection(source);
    
    // Update UI state
    isListening = true;
    visualizer.classList.add('listening');
    startBtn.disabled = true;
    stopBtn.disabled = false;
    updateStatus('Listening...');
    
    audioStatusContainer.style.display = 'block';
    document.getElementById('audio-status-message').textContent = 'Audio capture active';
    
    logDebug('Audio capture started successfully');
    return true;
  } catch (error) {
    logDebug(`Error accessing microphone: ${error.message}`, 'error');
    
    audioStatusContainer.style.display = 'block';
    document.getElementById('audio-status-message').textContent = 
      'Error accessing microphone: ' + (error.message || 'Permission denied');
    audioStatusContainer.style.backgroundColor = '#ffeeee';
    audioStatusContainer.style.border = '1px solid #ffcccc';
    document.getElementById('audio-status-message').style.color = '#cc0000';
    
    updateStatus('Microphone error');
    return false;
  }
}

// Enhanced voice detection algorithm
function setupEnhancedVoiceDetection(source) {
  // Create script processor for audio analysis
  // Note: ScriptProcessorNode is deprecated but has better browser support
  audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  
  // Variables for voice activity detection
  let isSpeaking = false;
  let silenceStart = null;
  let recordingStartTime = null;
  let recordedChunks = [];
  let mediaRecorder = null;
  
  // Use dynamic threshold based on ambient noise
  activeVolumeThreshold = emisConfig.speechThreshold || 10; // Lower default from 15 to 10
  let ambientNoiseLevel = 0;
  let sampleCount = 0;
  let isCalibrating = true;
  let calibrationSamples = 30; // Increase from 20 to 30 for better calibration
  
  // Create MediaRecorder for capturing speech
  try {
    // Try to use higher quality audio format with fallbacks
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg'
    ];
    
    let selectedMimeType = null;
    
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType;
        break;
      }
    }
    
    if (!selectedMimeType) {
      throw new Error('No supported MIME type found for MediaRecorder');
    }
    
    logDebug(`Using MediaRecorder with MIME type: ${selectedMimeType}`);
    
    mediaRecorder = new MediaRecorder(audioStream, {
      mimeType: selectedMimeType,
      audioBitsPerSecond: 128000
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      if (recordedChunks.length === 0) {
        logDebug('No audio data recorded');
        return;
      }
      
      const blob = new Blob(recordedChunks, { type: selectedMimeType });
      logDebug(`Recorded audio blob: ${blob.size} bytes`);
      
      // Save the recording for debugging
      try {
        const result = await window.electronAPI.saveRecording(blob, `speech-${Date.now()}.webm`);
        if (result && result.success) {
          logDebug(`Recording saved to: ${result.path}`);
        }
      } catch (error) {
        logDebug(`Error saving recording: ${error.message}`, 'error');
      }
      
      // Process the audio with multiple recognition approaches
      processAudioWithFallbacks(blob);
      
      // Reset recording buffer
      recordedChunks = [];
    };
  } catch (mediaRecorderError) {
    logDebug(`Error creating MediaRecorder: ${mediaRecorderError.message}`, 'error');
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
    const currentVolumeLevel = Math.round((sum / input.length) * 100);
    
    // Update volume visualizer
    updateVolumeVisualizer(currentVolumeLevel);
    
    // Calibration phase to determine ambient noise level
    if (isCalibrating) {
      ambientNoiseLevel += currentVolumeLevel;
      sampleCount++;
      
      if (sampleCount >= calibrationSamples) {
        // Calculate average ambient noise and set threshold
        ambientNoiseLevel = ambientNoiseLevel / calibrationSamples;
        // Use a more conservative factor for the threshold
        activeVolumeThreshold = Math.max(emisConfig.speechThreshold, ambientNoiseLevel * 1.3);
        logDebug(`Calibrated speech threshold: ${activeVolumeThreshold} (base: ${ambientNoiseLevel})`);
        isCalibrating = false;
        
        // Update UI
        document.getElementById('threshold-value').textContent = Math.round(activeVolumeThreshold);
        document.getElementById('debug-speech-threshold').value = Math.round(activeVolumeThreshold);
        document.getElementById('live-threshold-value').textContent = Math.round(activeVolumeThreshold);
        document.getElementById('live-threshold-slider').value = Math.round(activeVolumeThreshold);
        updateThresholdLine(Math.round(activeVolumeThreshold));
      }
      return;
    }
    
    // Detect speech based on volume
    if (currentVolumeLevel > activeVolumeThreshold) {
      if (!isSpeaking) {
        isSpeaking = true;
        silenceStart = null;
        recordingStartTime = Date.now();
        
        // Visual feedback
        visualizer.style.borderColor = '#6a0dad';
        
        // Start recording
        if (mediaRecorder && mediaRecorder.state === 'inactive') {
          try {
            mediaRecorder.start();
            logDebug('Started recording speech');
          } catch (error) {
            logDebug(`Error starting MediaRecorder: ${error.message}`, 'error');
          }
        }
      }
    } else {
      if (isSpeaking) {
        if (silenceStart === null) {
          silenceStart = Date.now();
        } else {
          // Calculate how long silence has lasted
          const silenceDuration = Date.now() - silenceStart;
          
          // Determine silence threshold based on speech length
          // Longer speech segments get more silence tolerance
          const speechDuration = Date.now() - recordingStartTime;
          const silenceThreshold = Math.min(
            2000, // Increase maximum silence tolerance from 1 second to 2 seconds
            300 + (speechDuration / 10) // Increase base threshold from 100 to 300ms
          );
          
          if (silenceDuration > silenceThreshold) {
            // End of speech detected
            isSpeaking = false;
            visualizer.style.borderColor = '';
            
            // Stop recording if it's been going for at least 750ms
            // Increase from 500ms to 750ms to avoid cutting off short commands
            if (recordingStartTime && Date.now() - recordingStartTime > 750) {
              if (mediaRecorder && mediaRecorder.state === 'recording') {
                try {
                  mediaRecorder.stop();
                  logDebug('Stopped recording, processing speech');
                  updateStatus('Processing speech...');
                } catch (error) {
                  logDebug(`Error stopping MediaRecorder: ${error.message}`, 'error');
                  fallbackToManualInput();
                }
              }
            }
          }
        }
      }
    }
  };
}

// Process audio with multiple fallback methods
async function processAudioWithFallbacks(audioBlob) {
  logDebug('Processing audio with fallback methods');
  
  // Strategy 1: Try sending to main process for Google Cloud Speech
  try {
    logDebug('Attempting to send audio to main process for cloud speech recognition');
    updateStatus('Processing with cloud service...');
    
    const result = await window.electronAPI.convertSpeechToText(audioBlob);
    
    if (result && result.success && result.transcript) {
      logDebug(`Cloud speech recognition successful: "${result.transcript}"`);
      transcriptText.textContent = result.transcript;
      processCommand(result.transcript);
      return;
    } else {
      logDebug('Cloud speech recognition failed or returned no transcript', 'warn');
      // Continue to fallback
    }
  } catch (error) {
    logDebug(`Error with cloud speech recognition: ${error.message}`, 'error');
    // Continue to fallback
  }
  
  // Strategy 2: Try browser's built-in SpeechRecognition
  if (recognition) {
    try {
      logDebug('Attempting browser speech recognition');
      recognition.start();
      
      // Set a timeout in case recognition hangs
      setTimeout(() => {
        if (recognition) {
          try {
            recognition.stop();
          } catch (e) {
            // Ignore errors when stopping
          }
        }
      }, 5000);
      
      return; // Let the recognition.onresult handler process the result
    } catch (error) {
      logDebug(`Error starting browser speech recognition: ${error.message}`, 'error');
      // Continue to next strategy
    }
  }
  
  // Strategy 3: Use mock recognition
  try {
    logDebug('Attempting mock recognition');
    const result = await window.electronAPI.getMockTranscription();
    
    if (result && result.success && result.transcript) {
      logDebug(`Using mock transcription: "${result.transcript}"`);
      transcriptText.textContent = result.transcript;
      processCommand(result.transcript);
      return;
    }
  } catch (error) {
    logDebug(`Mock recognition error: ${error.message}`, 'error');
  }
  
  // Final fallback: Manual input
  logDebug('All speech recognition methods failed, falling back to manual input');
  fallbackToManualInput();
}

// Show command options for selection
function showCommandOptions(commands) {
  updateStatus('Please select what you said:');
  
  // Create a div for the options
  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'command-options';
  optionsDiv.style.marginTop = '10px';
  optionsDiv.style.padding = '10px';
  optionsDiv.style.backgroundColor = '#efefef';
  optionsDiv.style.borderRadius = '5px';
  
  // Add header
  const header = document.createElement('p');
  header.textContent = 'Did you say one of these?';
  header.style.fontWeight = 'bold';
  optionsDiv.appendChild(header);
  
  // Add options
  commands.forEach(cmd => {
    const button = document.createElement('button');
    button.textContent = cmd;
    button.style.margin = '5px';
    button.style.padding = '8px 12px';
    button.style.backgroundColor = '#6a0dad';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    
    button.addEventListener('click', () => {
      // Remove the options div
      if (optionsDiv.parentNode) {
        optionsDiv.parentNode.removeChild(optionsDiv);
      }
      
      // Process the selected command
      transcriptText.textContent = cmd;
      processCommand(cmd);
    });
    
    optionsDiv.appendChild(button);
  });
  
  // Add a "None of these" button
  const noneButton = document.createElement('button');
  noneButton.textContent = "None of these";
  noneButton.style.margin = '5px';
  noneButton.style.padding = '8px 12px';
  noneButton.style.backgroundColor = '#999999';
  noneButton.style.color = 'white';
  noneButton.style.border = 'none';
  noneButton.style.borderRadius = '4px';
  noneButton.style.cursor = 'pointer';
  
  noneButton.addEventListener('click', () => {
    // Remove the options div
    if (optionsDiv.parentNode) {
      optionsDiv.parentNode.removeChild(optionsDiv);
    }
    
    // Fall back to manual input
    fallbackToManualInput();
  });
  
  optionsDiv.appendChild(noneButton);
  
  // Add the options div after the transcript
  const transcriptContainer = document.querySelector('.transcript');
  transcriptContainer.appendChild(optionsDiv);
}

// Fall back to manual text input
function fallbackToManualInput() {
  logDebug('Falling back to manual input');
  updateStatus('Please type your command');
  
  // Show the manual input with prompt
  const manualInput = document.getElementById('manual-command-input');
  if (manualInput) {
    manualInput.placeholder = "What did you say? Type your command here";
    manualInput.focus();
    
    // Add visual cue
    manualInput.style.borderColor = '#ff69b4';
    manualInput.style.boxShadow = '0 0 5px #ff69b4';
    
    // Reset style after 2 seconds
    setTimeout(() => {
      manualInput.style.borderColor = '';
      manualInput.style.boxShadow = '';
    }, 2000);
  }
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
    logDebug('Stopping audio capture');
    
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
      audioContext.suspend();
    }
    
    // Stop visualization animation
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    
    // Try to stop speech recognition if active
    if (recognition) {
      try {
        recognition.abort();
      } catch (error) {
        // Ignore errors when stopping
      }
    }
    
    // Update status
    isListening = false;
    visualizer.classList.remove('listening');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus('Idle');
    
    audioStatusContainer.style.display = 'block';
    document.getElementById('audio-status-message').textContent = 'Audio capture stopped';
    
    logDebug('Audio capture successfully stopped');
  }
}

// Process commands
async function processCommand(command) {
  if (!command) return;
  
  const cleanCommand = command.toLowerCase().trim();
  logDebug(`Processing command: "${cleanCommand}"`);
  
  // Skip wake word check for manual input
  const skipWakeWordCheck = !isListening;
  
  // Check for wake word if needed
  if (isListening && 
      !skipWakeWordCheck && 
      !cleanCommand.startsWith(emisConfig.wakeWord.toLowerCase()) && 
      statusElement.textContent !== 'Processing...') {
    logDebug('Wake word not detected, ignoring command');
    return;
  }
  
  // Remove wake word from command if present
  const commandWithoutWake = cleanCommand.startsWith(emisConfig.wakeWord.toLowerCase()) 
    ? cleanCommand.substring(emisConfig.wakeWord.length).trim() 
    : cleanCommand;
  
  if (!commandWithoutWake) {
    logDebug('Empty command after removing wake word');
    return;
  }
  
  updateStatus('Processing...');
  visualizer.classList.remove('listening');
  visualizer.classList.add('processing');
  
  try {
    // Send command to main process
    logDebug(`Sending command to main process: "${commandWithoutWake}"`);
    const result = await window.electronAPI.executeCommand(commandWithoutWake);
    
    visualizer.classList.remove('processing');
    
    if (result.success) {
      updateStatus('Command executed');
      logDebug(`Command successful: "${result.response}"`);
      
      // Update response
      responseText.textContent = result.response;
      
      // Speak the response
      try {
        await speakWithPromise(result.response);
      } catch (error) {
        logDebug(`Speech error: ${error.message}`, 'error');
      }
    } else {
      updateStatus('Command failed');
      logDebug(`Command failed: "${result.response || 'No response'}"`, 'warn');
      
      // Update response
      responseText.textContent = result.response || "I couldn't process that command.";
      
      // Speak the response
      try {
        await speakWithPromise(result.response || "I couldn't process that command.");
      } catch (error) {
        logDebug(`Speech error: ${error.message}`, 'error');
      }
    }
    
    // Resume listening if appropriate
    if (isListening) {
      visualizer.classList.add('listening');
    }
  } catch (error) {
    logDebug(`Error executing command: ${error.message}`, 'error');
    updateStatus('Error');
    visualizer.classList.remove('processing');
    
    const errorMessage = "I'm sorry, I encountered an error while processing your request.";
    responseText.textContent = errorMessage;
    
    try {
      await speakWithPromise(errorMessage);
    } catch (speechError) {
      logDebug(`Speech error: ${speechError.message}`, 'error');
    }
    
    // Resume listening if appropriate
    if (isListening) {
      visualizer.classList.add('listening');
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
      
      // Stop any currently playing audio
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      
      // Try to use Google Cloud TTS first if it's a cloud voice
      if (emisConfig.voice && (emisConfig.voice.match(/^[a-z]{2}-[A-Z]{2}/) || 
          voiceSelect.querySelector(`option[value="${emisConfig.voice}"]`)?.dataset.isCloud === 'true')) {
        // This looks like a cloud voice ID
        window.electronAPI.synthesizeSpeech(text)
          .then(result => {
            if (result.success) {
              // Cloud TTS successful - audio will play via event listener
              logDebug('Cloud TTS request sent successfully');
              
              // Set a timeout in case the audio playback event never fires
              setTimeout(() => {
                resolve();
              }, 5000);
            } else {
              // Fall back to browser TTS
              logDebug(`Cloud TTS failed: ${result.error || 'Unknown error'}`, 'warn');
              continueBrowserTTS();
            }
          })
          .catch(error => {
            logDebug(`Cloud TTS error: ${error.message}`, 'error');
            continueBrowserTTS();
          });
        
        return;
      } else {
        continueBrowserTTS();
      }
      
      function continueBrowserTTS() {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = emisConfig.volume;
        
        // Select voice
        selectVoice(utterance);
        
        // Set up event handlers
        utterance.onstart = () => {
          logDebug('Speech started');
          visualizer.classList.add('speaking');
          visualizer.classList.remove('listening');
        };
        
        utterance.onend = () => {
          logDebug('Speech ended');
          visualizer.classList.remove('speaking');
          if (isListening) visualizer.classList.add('listening');
          resolve();
        };
        
        utterance.onerror = (event) => {
          logDebug(`Speech synthesis error: ${event.error}`, 'error');
          visualizer.classList.remove('speaking');
          if (isListening) visualizer.classList.add('listening');
          resolve(); // Still resolve to continue execution
        };
        
        // Speak
        synth.speak(utterance);
        
        // Safety fallback after max time
        setTimeout(() => {
          if (synth.speaking) {
            logDebug('Speech taking too long, forcing continue', 'warn');
            resolve();
          }
        }, 10000);
      }
    } catch (error) {
      logDebug(`Error with speech synthesis: ${error.message}`, 'error');
      resolve(); // Still resolve to continue execution
    }
  });
}

// Helper function to select the best voice
function selectVoice(utterance) {
  const voices = synth.getVoices();
  let voiceFound = false;
  
  // Try to use the configured voice
  if (emisConfig.voice !== 'default') {
    const selectedVoice = voices.find(voice => voice.name === emisConfig.voice);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      voiceFound = true;
      logDebug(`Using configured voice: ${selectedVoice.name}`);
    }
  }
  
  if (!voiceFound) {
    // Try to find a female English voice
    const femaleVoice = voices.find(voice => 
      (voice.name.includes('Female') || 
       voice.name.includes('female') || 
       voice.name.includes('-F')) && 
      voice.lang.startsWith('en')
    );
    
    if (femaleVoice) {
      utterance.voice = femaleVoice;
      voiceFound = true;
      logDebug(`Using female voice: ${femaleVoice.name}`);
    } else {
      // Any English voice
      const englishVoice = voices.find(voice => voice.lang.startsWith('en'));
      if (englishVoice) {
        utterance.voice = englishVoice;
        voiceFound = true;
        logDebug(`Using English voice: ${englishVoice.name}`);
      } else if (voices.length > 0) {
        // Any voice
        utterance.voice = voices[0];
        logDebug(`Using fallback voice: ${voices[0].name}`);
      }
    }
  }
}

// Update status display
function updateStatus(status) {
  statusElement.textContent = status;
  logDebug(`Status updated: ${status}`);
}

// Setup event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Start/stop listening
  startBtn.addEventListener('click', () => {
    logDebug('Start button clicked');
    startAudioCapture();
  });
  
  stopBtn.addEventListener('click', () => {
    logDebug('Stop button clicked');
    stopAudioCapture();
  });
  
  // Settings panel
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('active');
  });
  
  saveSettingsBtn.addEventListener('click', async () => {
    // Update config
    const newConfig = {
      wakeWord: wakeWordInput.value,
      voice: voiceSelect.value,
      volume: parseFloat(volumeInput.value),
      speechThreshold: parseInt(document.getElementById('debug-speech-threshold').value)
    };
    
    try {
      // Save to main process
      logDebug(`Saving new config: ${JSON.stringify(newConfig)}`);
      emisConfig = await window.electronAPI.updateConfig(newConfig);
      updateStatus('Settings saved');
      
      // Confirm with voice
      speak('Settings updated successfully.');
      
      // Close panel
      settingsPanel.classList.remove('active');
    } catch (error) {
      logDebug(`Error saving settings: ${error.message}`, 'error');
      updateStatus('Error saving settings');
    }
  });
  
  // Visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isListening) {
      logDebug('Document hidden, stopping audio capture');
      stopAudioCapture();
    }
  });
  
  // Window closing
  window.addEventListener('beforeunload', () => {
    if (isListening) {
      stopAudioCapture();
    }
    
    if (synth) {
      synth.cancel();
    }
    
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
  });
  
  // Error logging
  window.addEventListener('error', (event) => {
    logDebug(`Uncaught error: ${event.error}`, 'error');
  });
});

// Legacy speak function for compatibility
function speak(text, callback) {
  if (!text) {
    if (callback) callback();
    return;
  }
  
  responseText.textContent = text;
  logDebug(`EMIS response: ${text}`);
  
  speakWithPromise(text)
    .then(() => {
      if (callback) callback();
    })
    .catch(error => {
      logDebug(`Speech error: ${error.message}`, 'error');
      if (callback) callback();
    });
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