const { APP_NAME } = require('./constants');

// A reminder shows only what you wrote: the task title, and its description if it has one.
function taskMessage(task) {
  return { title: task.title, body: task.description ?? '' };
}

function checkInMessage(summary) {
  const tracked = summary.done.length + summary.open.length;
  const body = tracked === 0
    ? 'New day. What will you finish today? Add your tasks.'
    : `Yesterday: ${summary.done.length} done, ${summary.open.length} still open. Let's plan today.`;
  return { title: `${APP_NAME}: new day`, body };
}

module.exports = { taskMessage, checkInMessage };
