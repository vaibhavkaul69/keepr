const { APP_NAME, TONES } = require('./constants');

const TASK_LINES = {
  sarcastic: [
    'Oh look, "{task}" is still waiting. Shocking.',
    '"{task}" called. It wants to know if you still remember it.',
    'Great scrolling session. Now how about "{task}"?',
    'Bold plan: ignore "{task}" until it does itself. Let us know how that goes.',
    'Breaking news: "{task}" did not do itself. Again.',
  ],
  cunning: [
    'Finish "{task}" now and feel smug for the rest of the day.',
    'Nobody needs to know how long "{task}" waited. Finish it now and it never happened.',
    'Ten minutes on "{task}" now saves an hour of guilt tonight.',
    'Do "{task}" before anyone asks about it. Look like a genius.',
  ],
  motivating: [
    'You planned "{task}" for a reason. Go get it done.',
    'One focused push and "{task}" is off your plate.',
    'Small step: open "{task}" and start. You have got this.',
    '"{task}" is next. Close the other tabs and finish it.',
  ],
};

const NUDGE_LINES = {
  sarcastic: [
    'You made {count} promises this morning. Still open: {list}. Impressive.',
    'Quick check: {list}. Still waiting. Still judging.',
  ],
  cunning: [
    'Knock out one of these and the rest feel easy: {list}.',
    'Clear {list} while everyone else is distracted.',
  ],
  motivating: [
    '{count} left. Pick one and start: {list}.',
    'You are closer than you think. Next up: {list}.',
  ],
};

const LIST_LIMIT = 3;

// "mixed" picks a random tone each time.
function pickTone(tone, random) {
  return TONES.includes(tone) ? tone : TONES[Math.floor(random() * TONES.length)];
}

function pickLine(lines, random) {
  return lines[Math.floor(random() * lines.length)];
}

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ''));
}

function shortList(titles) {
  const shown = titles.slice(0, LIST_LIMIT).map((title) => `"${title}"`).join(', ');
  const more = titles.length - LIST_LIMIT;
  return more > 0 ? `${shown} +${more} more` : shown;
}

function taskMessage(title, tone, random = Math.random) {
  const line = pickLine(TASK_LINES[pickTone(tone, random)], random);
  return { title: APP_NAME, body: fill(line, { task: title }) };
}

// One reminder about every open task.
function nudgeMessage(titles, tone, random = Math.random) {
  const line = pickLine(NUDGE_LINES[pickTone(tone, random)], random);
  return { title: APP_NAME, body: fill(line, { count: titles.length, list: shortList(titles) }) };
}

function checkInMessage(summary) {
  const tracked = summary.done.length + summary.open.length;
  const body = tracked === 0
    ? 'New day. What will you finish today? Add your tasks.'
    : `Yesterday: ${summary.done.length} done, ${summary.open.length} still open. Let's plan today.`;
  return { title: `${APP_NAME}: new day`, body };
}

function tooManyMessage(count) {
  return { title: APP_NAME, body: `${count} reminders are waiting. Open Keepr and pick one.` };
}

module.exports = { taskMessage, nudgeMessage, checkInMessage, tooManyMessage };
