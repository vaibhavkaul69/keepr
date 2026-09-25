const { Tray, Menu, nativeImage } = require('electron');
const { TRAY_ICON_PATH } = require('./constants');

const MENU_TASK_LIMIT = 5;

let tray = null;
let lastSignature = '';

function trayIcon() {
  const icon = nativeImage.createFromPath(TRAY_ICON_PATH);
  icon.setTemplateImage(true);
  return icon;
}

function trayTitle(view) {
  return view.paused ? ' paused' : ` ${view.openTasks.length}`;
}

function trayMenu(view, actions) {
  const tasks = view.openTasks.slice(0, MENU_TASK_LIMIT).map((task) => ({ label: task.title, click: actions.open }));
  return [
    { label: 'Open Keepr', click: actions.open },
    { type: 'separator' },
    ...(tasks.length ? tasks : [{ label: 'Nothing open', enabled: false }]),
    { type: 'separator' },
    view.paused
      ? { label: 'Resume reminders', click: actions.resume }
      : { label: 'Pause reminders for 1 hour', click: actions.pause },
    { type: 'separator' },
    { label: 'Quit Keepr', click: actions.quit },
  ];
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Keepr');
}

// Rebuilds the menu only when it changes, so an open menu does not close on every reminder check.
function updateTray(view, actions) {
  if (!tray) return;
  const signature = JSON.stringify([view.paused, view.openTasks.map((task) => task.title)]);
  if (signature === lastSignature) return;
  lastSignature = signature;
  tray.setTitle(trayTitle(view));
  tray.setContextMenu(Menu.buildFromTemplate(trayMenu(view, actions)));
}

module.exports = { createTray, updateTray };
