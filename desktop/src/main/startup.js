const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app } = require('electron');
const { APP_ID, HIDDEN_FLAG } = require('./constants');

// Opens hidden in the menu bar. The morning check-in still shows the window on a new day.
function loginArgs() {
  return app.isPackaged ? [HIDDEN_FLAG] : [app.getAppPath(), HIDDEN_FLAG];
}

function launchAgentFile() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${APP_ID}.plist`);
}

function escapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function launchAgentPlist(command) {
  const args = command.map((arg) => `    <string>${escapeXml(arg)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${APP_ID}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
`;
}

// macOS login items can't start an unpackaged app, so run from source uses a LaunchAgent instead.
// It is rewritten on every start, so it follows the folder if you move it.
function setLaunchAgent(on) {
  const file = launchAgentFile();
  if (!on) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, launchAgentPlist([process.execPath, ...loginArgs()]));
}

function setStartAtLogin(on) {
  try {
    if (process.platform === 'darwin' && !app.isPackaged) setLaunchAgent(on);
    else app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: loginArgs() });
  } catch (err) {
    console.error('Keepr: could not update start at login.', err);
  }
}

module.exports = { setStartAtLogin };
