const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { ICON_PATH } = require('./constants');

let win = null;
let loaded = false;
let quitting = false;

// Messages sent before the page loads. Only the latest one per channel is kept.
const pending = new Map();

function hideDock() {
  if (app.dock) app.dock.hide();
}

function showWindow() {
  if (!win) return;
  if (app.dock) app.dock.show();
  win.show();
  win.focus();
}

function hideWindow() {
  win.hide();
  hideDock();
}

function sendToWindow(channel, data) {
  if (!win) return;
  if (loaded) win.webContents.send(channel, data);
  else pending.set(channel, data);
}

// Lets the window really close. Without this, closing only hides it to the menu bar.
function allowQuit() {
  quitting = true;
}

function createWindow({ show }) {
  win = new BrowserWindow({
    width: 460,
    height: 760,
    minWidth: 380,
    minHeight: 520,
    show: false,
    title: 'Keepr',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('did-finish-load', () => {
    loaded = true;
    pending.forEach((data, channel) => win.webContents.send(channel, data));
    pending.clear();
  });

  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    hideWindow();
  });

  // The morning check-in may have shown the window already, so only hide the Dock if it is still hidden.
  win.once('ready-to-show', () => {
    if (show) showWindow();
    else if (!win.isVisible()) hideDock();
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

module.exports = { createWindow, showWindow, sendToWindow, allowQuit };
