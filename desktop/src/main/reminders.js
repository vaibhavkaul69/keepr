const { MAX_ALERTS } = require('./constants');
const { addMinutes, toIso } = require('./dates');
const { nextTime } = require('./schedule');
const { openTasks } = require('./tasks');
const { taskMessage, nudgeMessage, tooManyMessage } = require('./messages');

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
function stepTask(task, now, quiet, tone, random) {
  if (task.doneAt) return { task, alert: null };
  const due = task.nextAt ? new Date(task.nextAt) : nextTime(task.schedule, now);
  if (!due || due > now) return { task: { ...task, nextAt: toIso(due) }, alert: null };
  const next = { ...task, nextAt: toIso(nextTime(task.schedule, now)) };
  const alert = quiet ? null : { taskId: task.id, ...taskMessage(task.title, tone, random) };
  return { task: next, alert };
}

// The daily nudge lists every open task. It stays quiet when nothing is open.
function stepNudge(state, now, quiet, random) {
  const { nudge, tone } = state.settings;
  const due = state.nudgeNextAt ? new Date(state.nudgeNextAt) : nextTime(nudge, now);
  if (!due || due > now) return { nudgeNextAt: toIso(due), alert: null };
  const titles = openTasks(state.tasks).map((task) => task.title);
  const alert = quiet || titles.length === 0 ? null : { taskId: null, ...nudgeMessage(titles, tone, random) };
  return { nudgeNextAt: toIso(nextTime(nudge, now)), alert };
}

// Finds due reminders and moves each one to its next time. While paused, due reminders are skipped, not saved for later.
function checkReminders(state, now, random = Math.random) {
  const quiet = isPaused(state, now);
  const steps = state.tasks.map((task) => stepTask(task, now, quiet, state.settings.tone, random));
  const nudge = stepNudge(state, now, quiet, random);
  const alerts = [...steps.map((step) => step.alert), nudge.alert].filter(Boolean);
  return {
    state: { ...state, tasks: steps.map((step) => step.task), nudgeNextAt: nudge.nudgeNextAt },
    alerts: alerts.length > MAX_ALERTS ? [{ taskId: null, ...tooManyMessage(alerts.length) }] : alerts,
  };
}

module.exports = { isPaused, pauseReminders, resumeReminders, checkReminders };
