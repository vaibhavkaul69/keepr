const { MAX_TITLE, MAX_DESCRIPTION } = require('./constants');
const { addMinutes, dayKey } = require('./dates');
const { renewSchedule } = require('./schedule');

function cleanTitle(title) {
  const text = String(title ?? '').trim();
  if (!text) throw new Error('Give the task a name.');
  return text.slice(0, MAX_TITLE);
}

// Optional. Shown as the notification text.
function cleanDescription(description) {
  return String(description ?? '').trim().slice(0, MAX_DESCRIPTION);
}

// `nextAt` stays null until the reminder check works out the next time.
function makeTask(input, now, id) {
  return {
    id,
    title: cleanTitle(input.title),
    description: cleanDescription(input.description),
    schedule: input.schedule,
    createdAt: now.toISOString(),
    doneAt: null,
    nextAt: null,
  };
}

function changeTask(state, id, change) {
  return { ...state, tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...change } : task)) };
}

function addTask(state, task) {
  return { ...state, tasks: [...state.tasks, task] };
}

function editTask(state, id, input) {
  return changeTask(state, id, {
    title: cleanTitle(input.title),
    description: cleanDescription(input.description),
    schedule: input.schedule,
    nextAt: null,
  });
}

function markDone(state, id, done, now) {
  return changeTask(state, id, { doneAt: done ? now.toISOString() : null, nextAt: null });
}

// Moves only the next reminder. The schedule carries on after it.
function snoozeTask(state, id, minutes, now) {
  return changeTask(state, id, { nextAt: addMinutes(now, minutes).toISOString() });
}

function removeTask(state, id) {
  return { ...state, tasks: state.tasks.filter((task) => task.id !== id) };
}

function openTasks(tasks) {
  return tasks.filter((task) => !task.doneAt);
}

// The day a task is meant for: the day it was added, or the day it was last moved to.
function plannedDay(task) {
  return task.plannedFor ?? dayKey(task.createdAt);
}

// An open task meant for a day before `today` (a "YYYY-MM-DD" day).
function isCarried(task, today) {
  return !task.doneAt && plannedDay(task) < today;
}

// Moves carried tasks to today. Each keeps the day it missed in `missedDays`, and its reminders start again.
function moveToToday(state, ids, now) {
  const today = dayKey(now);
  const tasks = state.tasks.map((task) => {
    if (!ids.includes(task.id) || !isCarried(task, today)) return task;
    return {
      ...task,
      plannedFor: today,
      missedDays: [...(task.missedDays ?? []), plannedDay(task)],
      schedule: renewSchedule(task.schedule, now),
      nextAt: null,
    };
  });
  return { ...state, tasks };
}

module.exports = {
  makeTask,
  addTask,
  editTask,
  markDone,
  snoozeTask,
  removeTask,
  openTasks,
  plannedDay,
  isCarried,
  moveToToday,
};
