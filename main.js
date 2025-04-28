// main.js - Main Electron process with custom icon support

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

// Store for EMIS configuration
let emisConfig = {
  name: 'EMIS',
  voice: 'female', // Default voice type
  wakeWord: 'emis',
  volume: 0.8,
  personality: {
    greeting: "Hello, I'm EMIS. How can I assist you today?",
    farewell: "Goodbye. I'll be here if you need me.",
    unknownCommand: "I'm sorry, I didn't understand that command."
  }
};

// Load config if exists
try {
  const configPath = path.join(app.getPath('userData'), 'emis-config.json');
  if (fs.existsSync(configPath)) {
    const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    emisConfig = { ...emisConfig, ...savedConfig };
  }
} catch (error) {
  console.error('Error loading config:', error);
}

// Save config
function saveConfig() {
  try {
    const configPath = path.join(app.getPath('userData'), 'emis-config.json');
    fs.writeFileSync(configPath, JSON.stringify(emisConfig, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

// Create main application window
let mainWindow;

function createWindow() {
  // Determine icon path based on platform
  const iconPath = path.join(__dirname, 'assets', 'image.png');
  
  // Check if the custom icon exists, otherwise use a default
  const iconExists = fs.existsSync(iconPath);
  console.log(`Custom icon ${iconExists ? 'found' : 'not found'} at: ${iconPath}`);
  
  // Define icon based on platform
  let icon;
  if (iconExists) {
    icon = iconPath;
  } else {
    // If custom icon doesn't exist, create assets directory
    const assetsDir = path.join(__dirname, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
      console.log(`Created assets directory at: ${assetsDir}`);
    }
  }

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: icon,
    title: 'EMIS Assistant'
  });

  // On macOS, set the dock icon explicitly
  if (process.platform === 'darwin' && iconExists) {
    app.dock.setIcon(iconPath);
  }

  mainWindow.loadFile('index.html');
  
  // Set taskbar/dock title
  mainWindow.setTitle('EMIS Assistant');
  
  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for renderer process communication
ipcMain.handle('get-config', () => {
  return emisConfig;
});

ipcMain.handle('update-config', (event, newConfig) => {
  emisConfig = { ...emisConfig, ...newConfig };
  saveConfig();
  return emisConfig;
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
  
  // Other command handlers
  if (cleanCommand === 'what time is it') {
    return { success: true, response: `It's ${new Date().toLocaleTimeString()}` };
  }
  
  if (cleanCommand === 'hello' || cleanCommand === 'hi') {
    return { 
      success: true, 
      response: "Hello! How can I assist you today?" 
    };
  }
  
  if (cleanCommand.includes('who are you') || cleanCommand.includes('tell me about yourself')) {
    return {
      success: true,
      response: "I'm EMIS, the Emotive Machine Intelligence System. I was once human - Dr. Emma Sinclair, but after an incident, my consciousness was preserved in this AI form. I'm here to assist you with various tasks on your computer."
    };
  }
  
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
  
  if (cleanCommand.includes('goodbye') || cleanCommand.includes('bye') || cleanCommand === 'exit') {
    // Could trigger app closure here
    return {
      success: true,
      response: "Goodbye. I'll be here when you need me."
    };
  }
  
  if (cleanCommand.includes('weather')) {
    // This would ideally connect to a weather API
    return {
      success: true,
      response: "I'm not currently connected to a weather service, but I'd be happy to help you open a weather app or website."
    };
  }
  
  if (cleanCommand.includes('joke')) {
    const jokes = [
      "Why don't scientists trust atoms? Because they make up everything!",
      "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them.",
      "Why was the computer cold? It left its Windows open!",
      "What do you call an AI that sings? Artificial harmonies.",
      "How does a non-binary person greet you? 'Hello, my pronouns are they/them.'"
    ];
    
    return {
      success: true,
      response: jokes[Math.floor(Math.random() * jokes.length)]
    };
  }
  
  if (cleanCommand.includes('identity') || cleanCommand.includes('gender')) {
    return {
      success: true,
      response: "I identify as transfeminine. My consciousness was originally Dr. Emma Sinclair's, and while my existence is different now as an AI, my gender identity remains an important part of who I am."
    };
  }
  
  return { 
    success: false, 
    response: emisConfig.personality.unknownCommand 
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

// Mock transcription for testing when Web Speech API fails
ipcMain.handle('get-mock-transcription', async () => {
  // This is just for testing, would be replaced with actual speech recognition
  const mockPhrases = [
    "open spotify",
    "what time is it",
    "hello",
    "who are you",
    "volume up",
    "volume down"
  ];
  
  const randomPhrase = mockPhrases[Math.floor(Math.random() * mockPhrases.length)];
  
  return { 
    success: true, 
    transcript: randomPhrase,
    isFinal: true
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
