const { addMinutes, dayKey, toIso } = require('./dates');
const { nextTime } = require('./schedule');
const { openTasks, isCarried } = require('./tasks');
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

function carrySchedule(settings) {
  return settings.carryTime ? { type: 'daily', times: [settings.carryTime] } : { type: 'none' };
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

// Finds due reminders and moves each one to its next time. Three things can make a task due:
//   its own schedule, the daily nudge (every open task), and the carried-over reminder (tasks from earlier days).
// A task gets at most one notification per check, however many of these are due together.
// While paused, due reminders are skipped, not saved for later.
function checkReminders(state, now) {
  const today = dayKey(now);
  const steps = state.tasks.map((task) => stepTask(task, now));
  const nudge = stepSchedule(state.settings.nudge, state.nudgeNextAt, now);
  const carry = stepSchedule(carrySchedule(state.settings), state.carryNextAt, now);
  const open = openTasks(state.tasks);
  const dueIds = new Set([
    ...steps.filter((step) => step.due).map((step) => step.task.id),
    ...(nudge.due ? open.map((task) => task.id) : []),
    ...(carry.due ? open.filter((task) => isCarried(task, today)).map((task) => task.id) : []),
  ]);
  const alerts = isPaused(state, now)
    ? []
    : open.filter((task) => dueIds.has(task.id)).map((task) => ({
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
    },
    alerts,
  };
}

module.exports = { isPaused, pauseReminders, resumeReminders, checkReminders };
