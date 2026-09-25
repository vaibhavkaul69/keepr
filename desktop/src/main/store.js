const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_SETTINGS } = require('./constants');

function emptyState() {
  return { tasks: [], settings: { ...DEFAULT_SETTINGS }, nudgeNextAt: null, pausedUntil: null, lastOpenDay: null };
}

// Fills in any field an older data file is missing.
function withDefaults(data) {
  const base = emptyState();
  return {
    ...base,
    ...data,
    settings: { ...base.settings, ...data?.settings },
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
  };
}

function loadState(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return emptyState();
    throw err;
  }
  try {
    return withDefaults(JSON.parse(text));
  } catch {
    // Keep the unreadable file so no tasks are lost, then start fresh.
    fs.renameSync(file, `${file}.broken-${Date.now()}`);
    return emptyState();
  }
}

// Writes to a temp file first, so a crash mid-write never leaves a half-written data file.
function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, file);
}

module.exports = { loadState, saveState };
