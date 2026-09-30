const { APP_NAME } = require('./constants');
const { formatDayKey } = require('./dates');

// A task is due by the end of the day it is promised for. `day` is "YYYY-MM-DD".
function fulfilText(day) {
  return `Fulfil by ${formatDayKey(day)}, midnight`;
}

// A reminder for one task: its title, then its description, or its fulfil-by time when it has no description.
// `task.plannedDay` is the day it is promised for.
function taskMessage(task) {
  return { title: task.title, body: task.description || fulfilText(task.plannedDay) };
}

function checkInMessage(summary) {
  const tracked = summary.done.length + summary.open.length;
  const body = tracked === 0
    ? 'New day. What will you finish today? Add your tasks.'
    : `Yesterday: ${summary.done.length} done, ${summary.open.length} still open. Let's plan today.`;
  return { title: `${APP_NAME}: new day`, body };
}

function promiseCount(tasks) {
  return `${tasks.length} ${tasks.length === 1 ? 'promise' : 'promises'}`;
}

const LIST_LIMIT = 3;

function shortList(tasks) {
  const names = tasks.slice(0, LIST_LIMIT).map((task) => task.title).join(', ');
  const more = tasks.length - LIST_LIMIT;
  return more > 0 ? `${names} +${more} more` : names;
}

// One notification for all older tasks.
function carriedMessage(tasks) {
  return { title: 'Keepr: still owed from earlier days', body: `${promiseCount(tasks)}: ${shortList(tasks)}` };
}

// The nightly summary's notification, or null when nothing is left over.
function leftoverMessage(tasks) {
  return tasks.length ? { title: 'Keepr: left over tonight', body: `${promiseCount(tasks)} not kept yet.` } : null;
}

module.exports = { fulfilText, taskMessage, checkInMessage, carriedMessage, leftoverMessage };
