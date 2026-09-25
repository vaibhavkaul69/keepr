const { MAX_TITLE, MAX_DESCRIPTION } = require('./constants');
const { addMinutes } = require('./dates');

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

module.exports = { makeTask, addTask, editTask, markDone, snoozeTask, removeTask, openTasks };
