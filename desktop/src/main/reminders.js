const { addMinutes, dayKey, toIso } = require('./dates');
const { nextTime } = require('./schedule');
const { openTasks, plannedDay, isCarried } = require('./tasks');

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

function withPlannedDay(task) {
  return { ...task, plannedDay: plannedDay(task) };
}

// Finds what is due and moves each schedule to its next time.
//   Today's tasks: each due one gets its own reminder, from its own schedule or the daily nudge.
//   Older, carried tasks: never one by one. They come back together in the carried-over list and the nightly summary.
// While paused, nothing is due, and missed times are skipped, not saved for later.
function checkReminders(state, now) {
  const today = dayKey(now);
  const steps = state.tasks.map((task) => stepTask(task, now));
  const nudge = stepSchedule(state.settings.nudge, state.nudgeNextAt, now);
  const carry = stepSchedule(dailyAt(state.settings.carryTime), state.carryNextAt, now);
  const leftover = stepSchedule(dailyAt(state.settings.leftoverTime), state.leftoverNextAt, now);
  const open = openTasks(state.tasks).map(withPlannedDay);
  const todays = open.filter((task) => !isCarried(task, today));
  const carried = open.filter((task) => isCarried(task, today));
  const dueIds = new Set([
    ...steps.filter((step) => step.due).map((step) => step.task.id),
    ...(nudge.due ? todays.map((task) => task.id) : []),
  ]);
  const paused = isPaused(state, now);
  return {
    state: {
      ...state,
      tasks: steps.map((step) => step.task),
      nudgeNextAt: nudge.nextAt,
      carryNextAt: carry.nextAt,
      leftoverNextAt: leftover.nextAt,
    },
    // Today's tasks due now, one reminder each.
    dueTasks: paused ? [] : todays.filter((task) => dueIds.has(task.id)),
    // Older tasks, when the carried-over reminder is due and there are any. Null otherwise.
    carried: carry.due && !paused && carried.length ? carried : null,
    // Every open task, when the nightly summary is due. Null otherwise.
    leftover: leftover.due && !paused ? open : null,
  };
}

module.exports = { isPaused, pauseReminders, resumeReminders, checkReminders };
