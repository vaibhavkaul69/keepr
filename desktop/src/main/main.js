const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { app, ipcMain, powerMonitor } = require('electron');

const { APP_NAME, APP_ID, DATA_FILE, HIDDEN_FLAG, ICON_PATH, TICK_MS, SNOOZE_MINUTES, PAUSE_MINUTES } = require('./constants');
const { dayKey, addDays } = require('./dates');
const { loadState, saveState } = require('./store');
const { cleanSchedule } = require('./schedule');
const { cleanSettings } = require('./settings');
const {
  makeTask,
  addTask,
  editTask,
  markDone,
  snoozeTask,
  removeTask,
  openTasks,
  plannedDay,
  moveToToday,
} = require('./tasks');
const { checkReminders, pauseReminders, resumeReminders } = require('./reminders');
const { makeView, summarizeDay } = require('./view');
const { taskMessage, checkInMessage } = require('./messages');
const { showAlert } = require('./notify');
const { cleanWebhookUrl, cleanHeaders, reminderPayload, leftoverPayload, notePayload, queueWebhook } = require('./webhook');
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

// Queues one webhook message when a webhook URL is set. The queue sends one at a time, 1.5 s apart.
function postWebhook(body) {
  const { webhookUrl, webhookHeaders } = state.settings;
  if (webhookUrl) queueWebhook(webhookUrl, webhookHeaders ?? [], body);
}

// The nightly summary: one desktop notification and one webhook message listing every open task.
function sendLeftover(tasks, now) {
  if (tasks.length) {
    const count = `${tasks.length} ${tasks.length === 1 ? 'promise' : 'promises'}`;
    showAlert({ taskId: null, title: 'Keepr: left over tonight', body: `${count} not kept yet.` }, openTask);
  }
  postWebhook(leftoverPayload(tasks, dayKey(now), now));
}

// Works out next reminder times, sends any that are due, then saves. Runs on the timer and after every change,
// so a new or edited schedule shows its next reminder right away instead of "—".
// Each due task gets its own desktop notification. The webhook gets them all in one message.
function tick(next = state) {
  const now = new Date();
  const result = checkReminders(next, now);
  const view = commit(result.state);
  result.alerts.forEach((alert) => showAlert(alert, openTask));
  if (result.dueTasks.length) postWebhook(reminderPayload(result.dueTasks, dayKey(now), now));
  if (result.leftover) sendLeftover(result.leftover, now);
  return view;
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
  const message = checkInMessage(summary);
  showAlert({ taskId: null, ...message }, openTask);
  postWebhook(notePayload('check-in', message.title, message.body, now));
}

function onWake() {
  checkIn();
  tick();
}

function saveSettings(input) {
  const settings = cleanSettings(input, new Date());
  setStartAtLogin(settings.startAtLogin);
  return tick({ ...state, settings, nudgeNextAt: null, carryNextAt: null, leftoverNextAt: null });
}

// Shows the first open task's reminder, or a sample when nothing is open.
// Sends to the webhook URL and headers typed in Settings, so they can be tested before saving.
async function testReminder(webhookInput) {
  const url = cleanWebhookUrl(webhookInput?.url);
  const headers = cleanHeaders(webhookInput?.headers);
  const now = new Date();
  const first = openTasks(state.tasks)[0];
  const alert = first
    ? { taskId: first.id, ...taskMessage(first) }
    : { taskId: null, title: 'Keepr', body: 'Reminders are working.' };
  showAlert(alert, openTask);
  if (!url) return { webhook: null };
  const body = first
    ? reminderPayload([{ ...first, plannedDay: plannedDay(first) }], dayKey(now), now)
    : notePayload('test', 'Keepr test', 'Reminders are working.', now);
  return { webhook: await queueWebhook(url, headers, { ...body, kind: 'test' }) };
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
    return tick(addTask(state, makeTask(readTask(input, now), now, randomUUID())));
  },
  'task:edit': (id, input) => tick(editTask(state, id, readTask(input, new Date()))),
  'task:done': (id, done) => tick(markDone(state, id, Boolean(done), new Date())),
  'task:snooze': (id) => tick(snoozeTask(state, id, SNOOZE_MINUTES, new Date())),
  'task:remove': (id) => tick(removeTask(state, id)),
  'task:move-today': (ids) => tick(moveToToday(state, Array.isArray(ids) ? ids : [], new Date())),
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
