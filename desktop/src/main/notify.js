const { Notification } = require('electron');
const { ICON_PATH } = require('./constants');

const KEEP_LIMIT = 50;

// Holds recent notifications. A notification that gets garbage-collected no longer responds to clicks.
const recent = [];

// Shows a desktop notification. A click calls onClick with the alert's task id, or null.
function showAlert(alert, onClick) {
  if (!Notification.isSupported()) return;
  const note = new Notification({ title: alert.title, body: alert.body, icon: ICON_PATH });
  note.on('click', () => onClick(alert.taskId));
  recent.push(note);
  if (recent.length > KEEP_LIMIT) recent.shift();
  note.show();
}

module.exports = { showAlert };
