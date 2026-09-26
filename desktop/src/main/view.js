const { dayKey } = require('./dates');
const { describeSchedule } = require('./schedule');
const { openTasks, plannedDay, isCarried } = require('./tasks');
const { isPaused } = require('./reminders');

// What got done on `day`, and what was added by then but is still open.
function summarizeDay(tasks, day) {
  return {
    day,
    done: tasks.filter((task) => task.doneAt && dayKey(task.doneAt) === day).map((task) => task.title),
    open: tasks.filter((task) => !task.doneAt && plannedDay(task) <= day).map((task) => task.title),
  };
}

function taskView(task) {
  return { ...task, plannedDay: plannedDay(task), scheduleText: describeSchedule(task.schedule) };
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
    todayOpen: openTasks(state.tasks).filter((task) => !isCarried(task, today)).map(taskView),
    // Newest day first, so the list reads back through the days you missed.
    carried: state.tasks
      .filter((task) => isCarried(task, today))
      .map(taskView)
      .sort((a, b) => b.plannedDay.localeCompare(a.plannedDay)),
    doneToday: state.tasks.filter((task) => task.doneAt && dayKey(task.doneAt) === today).map(taskView),
  };
}

module.exports = { summarizeDay, makeView };
