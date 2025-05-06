// browser-mic-test.js
// A browser-based microphone test utility for EMIS

const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 500,
    height: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: "EMIS Microphone Test"
  });

  win.loadFile(path.join(__dirname, 'tools/mic-test.html'));
  
  // Open DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  app.quit();
});