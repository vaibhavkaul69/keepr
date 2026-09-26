const path = require('node:path');

const APP_NAME = 'Keepr';
const APP_ID = 'com.keepr.desktop';
const DATA_FILE = 'keepr.json';
const HIDDEN_FLAG = '--hidden';

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
const ICON_PATH = path.join(ASSETS_DIR, 'icon.png');
const TRAY_ICON_PATH = path.join(ASSETS_DIR, 'trayTemplate.png');

const TICK_MS = 20 * 1000;
const SNOOZE_MINUTES = 15;
const PAUSE_MINUTES = 60;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 1000;
const WEBHOOK_TIMEOUT_MS = 10 * 1000;

const DEFAULT_SETTINGS = {
  nudge: { type: 'daily', times: ['10:00', '12:00', '14:00', '16:00', '18:00'] },
  startAtLogin: true,
  webhookUrl: '',
  // Extra request headers for the webhook, like [{ name: 'Authorization', value: 'Bearer …' }].
  webhookHeaders: [],
  // One daily reminder for every task carried over from an earlier day. Blank turns it off.
  carryTime: '11:00',
};

module.exports = {
  APP_NAME,
  APP_ID,
  DATA_FILE,
  HIDDEN_FLAG,
  ICON_PATH,
  TRAY_ICON_PATH,
  TICK_MS,
  SNOOZE_MINUTES,
  PAUSE_MINUTES,
  MAX_TITLE,
  MAX_DESCRIPTION,
  WEBHOOK_TIMEOUT_MS,
  DEFAULT_SETTINGS,
};
