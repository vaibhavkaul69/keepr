const { Tray, Menu, nativeImage } = require('electron');
const { TRAY_ICON_PATH } = require('./constants');

let tray = null;
let lastTitle = null;

function trayIcon() {
  const icon = nativeImage.createFromPath(TRAY_ICON_PATH);
  icon.setTemplateImage(true);
  return icon;
}

// The menu has only two items. Everything else lives in the window.
function createTray(actions) {
  tray = new Tray(trayIcon());
  tray.setToolTip('Keepr');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Keepr', click: actions.open },
    { label: 'Quit Keepr', click: actions.quit },
  ]));
}

// Shows how many of today's promises are still owed. Carried-over tasks are not counted, so it starts at 0 each day.
function updateTray(view) {
  const title = ` ${view.todayOpen.length}`;
  if (!tray || title === lastTitle) return;
  lastTitle = title;
  tray.setTitle(title);
}

module.exports = { createTray, updateTray };
