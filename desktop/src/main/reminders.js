const { addMinutes, dayKey, toIso } = require('./dates');
const { nextTime } = require('./schedule');
const { openTasks, plannedDay, isCarried } = require('./tasks');
const { taskMessage } = require('./messages');

function isPaused(state, now) {
  return Boolean(state.pausedUntil) && new Date(state.pausedUntil) > now;
}

function pauseReminders(state, minutes, now) {
  return { ...state, pausedUntil: addMinutes(now, minutes).toISOString() };
}

function resumeReminders(state) {
  return { ...state, pausedUntil: null };
}

function dailyAt(time) {
  return time ? { type: 'daily', times: [time] } : { type: 'none' };
}

// Moves a schedule to its next time. A time missed while the laptop slept counts as due once.
function stepSchedule(schedule, nextAt, now) {
  const due = nextAt ? new Date(nextAt) : nextTime(schedule, now);
  if (!due || due > now) return { nextAt: toIso(due), due: false };
  return { nextAt: toIso(nextTime(schedule, now)), due: true };
}

function stepTask(task, now) {
  if (task.doneAt) return { task, due: false };
  const step = stepSchedule(task.schedule, task.nextAt, now);
  return { task: { ...task, nextAt: step.nextAt }, due: step.due };
}

// Finds due reminders and moves each one to its next time. Also says when the nightly leftover summary is due.
// Three things can make a task due:
//   its own schedule, the daily nudge (every open task), and the carried-over reminder (tasks from earlier days).
// A task gets at most one notification per check, however many of these are due together.
// While paused, due reminders are skipped, not saved for later.
function checkReminders(state, now) {
  const today = dayKey(now);
  const steps = state.tasks.map((task) => stepTask(task, now));
  const nudge = stepSchedule(state.settings.nudge, state.nudgeNextAt, now);
  const carry = stepSchedule(dailyAt(state.settings.carryTime), state.carryNextAt, now);
  const leftover = stepSchedule(dailyAt(state.settings.leftoverTime), state.leftoverNextAt, now);
  const open = openTasks(state.tasks);
  const dueIds = new Set([
    ...steps.filter((step) => step.due).map((step) => step.task.id),
    ...(nudge.due ? open.map((task) => task.id) : []),
    ...(carry.due ? open.filter((task) => isCarried(task, today)).map((task) => task.id) : []),
  ]);
  const paused = isPaused(state, now);
  const dueTasks = paused ? [] : open.filter((task) => dueIds.has(task.id)).map((task) => ({ ...task, plannedDay: plannedDay(task) }));
  const alerts = dueTasks.map((task) => ({
    kind: isCarried(task, today) ? 'carried' : 'reminder',
    taskId: task.id,
    ...taskMessage(task),
  }));
  return {
    state: {
      ...state,
      tasks: steps.map((step) => step.task),
      nudgeNextAt: nudge.nextAt,
      carryNextAt: carry.nextAt,
      leftoverNextAt: leftover.nextAt,
    },
    alerts,
    dueTasks,
    // Every open task, when the nightly summary is due. Null otherwise.
    leftover: leftover.due && !paused ? open.map((task) => ({ ...task, plannedDay: plannedDay(task) })) : null,
  };
}

module.exports = { isPaused, pauseReminders, resumeReminders, checkReminders };
