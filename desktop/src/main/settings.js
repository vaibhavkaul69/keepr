const { cleanSchedule } = require('./schedule');

// Checks settings sent from the screen and returns a clean copy. Throws a readable error.
function cleanSettings(input, now) {
  const nudge = cleanSchedule(input?.nudge, now);
  if (nudge.type === 'once') throw new Error('Daily nudges repeat. Pick set times or an interval.');
  return { nudge, startAtLogin: input?.startAtLogin !== false };
}

module.exports = { cleanSettings };
