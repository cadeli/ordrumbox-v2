const { app, BrowserWindow } = require('electron');
const path = require('path');
const express = require('express');
const server = express();
const PORT = 3001;

// On utilise un petit serveur interne pour éviter les problèmes de CORS avec les fichiers locaux
function startInternalServer() {
  server.use(express.static(path.join(__dirname, 'dist')));
  server.listen(PORT, '127.0.0.1');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'assets/images/logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadURL(`http://127.0.0.1:${PORT}`);
  // win.webContents.openDevTools(); // Optionnel pour le debug
}

app.whenReady().then(() => {
  startInternalServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
