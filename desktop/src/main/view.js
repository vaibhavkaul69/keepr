const { dayKey, addDays } = require('./dates');
const { describeSchedule } = require('./schedule');
const { openTasks } = require('./tasks');
const { isPaused } = require('./reminders');

// What got done on `day`, and what was added by then but is still open.
function summarizeDay(tasks, day) {
  return {
    day,
    done: tasks.filter((task) => task.doneAt && dayKey(task.doneAt) === day).map((task) => task.title),
    open: tasks.filter((task) => !task.doneAt && dayKey(task.createdAt) <= day).map((task) => task.title),
  };
}

function taskView(task) {
  return { ...task, scheduleText: describeSchedule(task.schedule) };
}

// Everything the screen and the menu bar need, in one object.
function makeView(state, now) {
  const today = dayKey(now);
  return {
    today,
    paused: isPaused(state, now),
    pausedUntil: state.pausedUntil,
    nudgeNextAt: state.nudgeNextAt,
    settings: state.settings,
    openTasks: openTasks(state.tasks).map(taskView),
    doneToday: state.tasks.filter((task) => task.doneAt && dayKey(task.doneAt) === today).map(taskView),
    yesterday: summarizeDay(state.tasks, dayKey(addDays(now, -1))),
  };
}

module.exports = { summarizeDay, makeView };
