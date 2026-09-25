const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { app, ipcMain, powerMonitor } = require('electron');

const { APP_NAME, APP_ID, DATA_FILE, HIDDEN_FLAG, ICON_PATH, TICK_MS, SNOOZE_MINUTES, PAUSE_MINUTES } = require('./constants');
const { dayKey, addDays } = require('./dates');
const { loadState, saveState } = require('./store');
const { cleanSchedule } = require('./schedule');
const { cleanSettings } = require('./settings');
const { makeTask, addTask, editTask, markDone, snoozeTask, removeTask, openTasks } = require('./tasks');
const { checkReminders, pauseReminders, resumeReminders } = require('./reminders');
const { makeView, summarizeDay } = require('./view');
const { taskMessage, checkInMessage } = require('./messages');
const { showAlert } = require('./notify');
const { cleanWebhookUrl, webhookPayload, sendWebhook } = require('./webhook');
const { createWindow, showWindow, sendToWindow, allowQuit } = require('./window');
const { createTray, updateTray } = require('./tray');
const { setStartAtLogin } = require('./startup');

let state = null;
let dataFile = null;

// Run from source, data lives in desktop/data. A packaged app can't write inside itself, so it uses the user data folder.
function getDataFile() {
  const dir = app.isPackaged ? app.getPath('userData') : path.join(app.getAppPath(), 'data');
  return path.join(dir, DATA_FILE);
}

// Saves the new state if it changed, then refreshes the window and the menu bar.
function commit(next) {
  const changed = JSON.stringify(next) !== JSON.stringify(state);
  state = next;
  if (changed) saveState(dataFile, state);
  const view = makeView(state, new Date());
  sendToWindow('state', view);
  updateTray(view);
  return view;
}

function openTask(taskId) {
  showWindow();
  if (taskId) sendToWindow('focus-task', taskId);
}

// Shows the desktop notification, and also POSTs it to the webhook when one is set.
function deliver(alert) {
  showAlert(alert, openTask);
  const url = state.settings.webhookUrl;
  if (url) sendWebhook(url, webhookPayload(alert, new Date()));
}

function tick() {
  const result = checkReminders(state, new Date());
  commit(result.state);
  result.alerts.forEach(deliver);
}

// The first time Keepr sees a new day, it shows yesterday's work and asks to plan today.
function checkIn() {
  const now = new Date();
  const today = dayKey(now);
  if (state.lastOpenDay === today) return;
  const summary = summarizeDay(state.tasks, dayKey(addDays(now, -1)));
  commit({ ...state, lastOpenDay: today });
  showWindow();
  sendToWindow('checkin', summary);
  deliver({ kind: 'check-in', taskId: null, ...checkInMessage(summary) });
}

function onWake() {
  checkIn();
  tick();
}

function saveSettings(input) {
  const settings = cleanSettings(input, new Date());
  setStartAtLogin(settings.startAtLogin);
  return commit({ ...state, settings, nudgeNextAt: null });
}

// Shows the first open task's reminder, or a sample when nothing is open.
// Sends to the webhook URL typed in Settings, so it can be tested before saving.
async function testReminder(webhookInput) {
  const first = openTasks(state.tasks)[0] ?? { id: null, title: 'Keepr', description: 'Reminders are working.' };
  const alert = { kind: 'test', taskId: first.id, ...taskMessage(first) };
  const url = cleanWebhookUrl(webhookInput);
  showAlert(alert, openTask);
  return { webhook: url ? await sendWebhook(url, webhookPayload(alert, new Date())) : null };
}

function readTask(input, now) {
  return { title: input?.title, description: input?.description, schedule: cleanSchedule(input?.schedule, now) };
}

const trayActions = {
  open: showWindow,
  quit: () => app.quit(),
};

const handlers = {
  'state:get': () => makeView(state, new Date()),
  'task:add': (input) => {
    const now = new Date();
    return commit(addTask(state, makeTask(readTask(input, now), now, randomUUID())));
  },
  'task:edit': (id, input) => commit(editTask(state, id, readTask(input, new Date()))),
  'task:done': (id, done) => commit(markDone(state, id, Boolean(done), new Date())),
  'task:snooze': (id) => commit(snoozeTask(state, id, SNOOZE_MINUTES, new Date())),
  'task:remove': (id) => commit(removeTask(state, id)),
  'settings:save': saveSettings,
  'reminders:pause': () => commit(pauseReminders(state, PAUSE_MINUTES, new Date())),
  'reminders:resume': () => commit(resumeReminders(state)),
  'reminders:test': testReminder,
};

function registerHandlers() {
  Object.entries(handlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, (_event, ...args) => handler(...args));
  });
}

function start() {
  // A packaged app gets its Dock icon from the bundle. Run from source, the Dock would show Electron's icon.
  if (app.dock && !app.isPackaged) app.dock.setIcon(ICON_PATH);
  dataFile = getDataFile();
  state = loadState(dataFile);
  registerHandlers();
  createWindow({ show: !process.argv.includes(HIDDEN_FLAG) });
  createTray(trayActions);
  setStartAtLogin(state.settings.startAtLogin);
  commit(state);
  checkIn();
  tick();
  setInterval(tick, TICK_MS);

  powerMonitor.on('resume', onWake);
  powerMonitor.on('unlock-screen', onWake);
  app.on('activate', showWindow);
}

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', allowQuit);
  // Keep running in the menu bar after the window closes.
  app.on('window-all-closed', () => {});
  app.whenReady().then(start);
}
