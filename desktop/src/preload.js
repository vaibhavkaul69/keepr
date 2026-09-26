const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel) {
  return (...args) => ipcRenderer.invoke(channel, ...args);
}

function listen(channel) {
  return (listener) => ipcRenderer.on(channel, (_event, data) => listener(data));
}

// The only calls the window can make into the app.
contextBridge.exposeInMainWorld('keepr', {
  getState: invoke('state:get'),
  addTask: invoke('task:add'),
  editTask: invoke('task:edit'),
  setDone: invoke('task:done'),
  snooze: invoke('task:snooze'),
  removeTask: invoke('task:remove'),
  moveToToday: invoke('task:move-today'),
  saveSettings: invoke('settings:save'),
  pause: invoke('reminders:pause'),
  resume: invoke('reminders:resume'),
  testReminder: invoke('reminders:test'),
  onState: listen('state'),
  onCheckIn: listen('checkin'),
  onFocusTask: listen('focus-task'),
});
