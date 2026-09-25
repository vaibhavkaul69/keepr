const { addMinutes, toIso } = require('./dates');
const { nextTime } = require('./schedule');
const { openTasks } = require('./tasks');
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

// A reminder missed while the laptop slept fires once, then moves to the next future time.
function stepTask(task, now) {
  if (task.doneAt) return { task, due: false };
  const due = task.nextAt ? new Date(task.nextAt) : nextTime(task.schedule, now);
  if (!due || due > now) return { task: { ...task, nextAt: toIso(due) }, due: false };
  return { task: { ...task, nextAt: toIso(nextTime(task.schedule, now)) }, due: true };
}

function stepNudge(state, now) {
  const { nudge } = state.settings;
  const due = state.nudgeNextAt ? new Date(state.nudgeNextAt) : nextTime(nudge, now);
  if (!due || due > now) return { nudgeNextAt: toIso(due), due: false };
  return { nudgeNextAt: toIso(nextTime(nudge, now)), due: true };
}

// Finds due reminders and moves each one to its next time. A daily nudge reminds about every open task, one notification each.
// A task gets at most one notification per check, even when its own reminder and the nudge are due together.
// While paused, due reminders are skipped, not saved for later.
function checkReminders(state, now) {
  const steps = state.tasks.map((task) => stepTask(task, now));
  const nudge = stepNudge(state, now);
  const dueTasks = nudge.due ? openTasks(state.tasks) : steps.filter((step) => step.due).map((step) => step.task);
  const alerts = isPaused(state, now) ? [] : dueTasks.map((task) => ({ kind: 'reminder', taskId: task.id, ...taskMessage(task) }));
  return {
    state: { ...state, tasks: steps.map((step) => step.task), nudgeNextAt: nudge.nudgeNextAt },
    alerts,
  };
}

module.exports = { isPaused, pauseReminders, resumeReminders, checkReminders };
