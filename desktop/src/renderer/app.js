const api = window.keepr;

const CONFIRM_MS = 3000;
const FLASH_MS = 2000;

let view = null;
let editingId = null;

const $ = (id) => document.getElementById(id);

// Small DOM builder. Text always goes in as textContent, so task titles can never inject HTML.
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function formatWhen(iso) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday ? time : `${date.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

// A local "YYYY-MM-DDTHH:MM" value for a datetime-local input.
function toLocalInput(iso) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// Drops Electron's "Error invoking remote method" prefix so only our message shows.
function errorText(err) {
  return String(err?.message ?? err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

function showError(box, err) {
  box.textContent = err ? errorText(err) : '';
  box.hidden = !err;
}

// Runs an app call and shows its error in `box`. Returns true when it worked.
async function run(call, box) {
  try {
    const next = await call();
    if (next) render(next);
    if (box) showError(box, null);
    return true;
  } catch (err) {
    if (box) showError(box, err);
    else console.error(err);
    return false;
  }
}

// ---------- schedule fields (shared by the task form and settings) ----------

function showScheduleFields(prefix) {
  const type = $(`${prefix}-type`).value;
  document.querySelectorAll(`[data-schedule="${prefix}"]`).forEach((group) => {
    group.hidden = group.dataset.for !== type;
  });
}

function readSchedule(prefix) {
  const value = (name) => $(`${prefix}-${name}`)?.value ?? '';
  return { type: value('type'), times: value('times'), minutes: value('minutes'), hours: value('hours'), at: value('at') };
}

function fillSchedule(prefix, schedule) {
  const set = (name, value) => {
    const input = $(`${prefix}-${name}`);
    if (input) input.value = value;
  };
  set('type', schedule?.type ?? 'none');
  set('times', schedule?.type === 'daily' ? schedule.times.join(', ') : '');
  set('minutes', schedule?.type === 'every' ? schedule.minutes : 60);
  set('hours', schedule?.type === 'every' && schedule.until ? hoursLeft(schedule.until) : '');
  set('at', schedule?.type === 'once' ? toLocalInput(schedule.at) : '');
  showScheduleFields(prefix);
}

function hoursLeft(until) {
  const hours = (new Date(until) - Date.now()) / 3600000;
  return hours > 0 ? Math.ceil(hours * 4) / 4 : '';
}

// ---------- rendering ----------

function renderHeader() {
  $('today').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  $('pause').textContent = view.paused ? `Paused till ${formatWhen(view.pausedUntil)}. Resume` : 'Pause 1 hour';
}

function titleList(titles) {
  return el('ul', { className: 'yesterday-list' }, titles.map((title) => el('li', { textContent: title })));
}

function renderYesterday() {
  const { done, open } = view.yesterday;
  const box = $('yesterday');
  if (done.length === 0 && open.length === 0) {
    box.replaceChildren(el('p', { className: 'muted', textContent: 'Nothing tracked yesterday.' }));
    return;
  }
  box.replaceChildren(
    el('p', { className: 'muted', textContent: `Done (${done.length})` }),
    done.length ? titleList(done) : el('p', { textContent: 'Nothing finished.' }),
    el('p', { className: 'muted', textContent: `Still open (${open.length})` }),
    open.length ? titleList(open) : el('p', { textContent: 'All clear.' }),
  );
}

// Delete asks for a second click, so one stray click never loses a task.
function deleteButton(task) {
  const button = el('button', { className: 'ghost small', type: 'button', textContent: 'Delete' });
  let armed = false;
  button.addEventListener('click', () => {
    if (armed) return run(() => api.removeTask(task.id));
    armed = true;
    button.textContent = 'Sure?';
    setTimeout(() => {
      armed = false;
      button.textContent = 'Delete';
    }, CONFIRM_MS);
  });
  return button;
}

function smallButton(label, onClick) {
  const button = el('button', { className: 'ghost small', type: 'button', textContent: label });
  button.addEventListener('click', onClick);
  return button;
}

function openTaskItem(task) {
  const checkbox = el('input', { type: 'checkbox', title: 'Mark done' });
  checkbox.addEventListener('change', () => run(() => api.setDone(task.id, true)));
  const next = task.nextAt ? ` · next ${formatWhen(task.nextAt)}` : '';
  return el('li', { className: 'task', id: `task-${task.id}` }, [
    checkbox,
    el('span', { className: 'task-title', textContent: task.title }),
    el('span', { className: 'task-meta', textContent: `${task.scheduleText}${next}` }),
    el('div', { className: 'task-actions' }, [
      smallButton('Snooze 15 min', () => run(() => api.snooze(task.id))),
      smallButton('Edit', () => startEdit(task)),
      deleteButton(task),
    ]),
  ]);
}

function doneTaskItem(task) {
  const checkbox = el('input', { type: 'checkbox', checked: true, title: 'Mark not done' });
  checkbox.addEventListener('change', () => run(() => api.setDone(task.id, false)));
  return el('li', { className: 'task done', id: `task-${task.id}` }, [
    checkbox,
    el('span', { className: 'task-title', textContent: task.title }),
    el('span', { className: 'task-meta', textContent: `Done at ${formatWhen(task.doneAt)}` }),
  ]);
}

function renderLists() {
  $('open-count').textContent = view.openTasks.length ? `(${view.openTasks.length})` : '';
  $('open-list').replaceChildren(...view.openTasks.map(openTaskItem));
  $('open-empty').hidden = view.openTasks.length > 0;
  $('done-list').replaceChildren(...view.doneToday.map(doneTaskItem));
  $('done-empty').hidden = view.doneToday.length > 0;
}

function render(next) {
  view = next;
  renderHeader();
  renderYesterday();
  renderLists();
}

// ---------- task form ----------

function resetForm() {
  editingId = null;
  $('task-form').reset();
  fillSchedule('task', { type: 'none' });
  $('form-heading').textContent = 'Add a task';
  $('form-submit').textContent = 'Add task';
  $('form-cancel').hidden = true;
  showError($('form-error'), null);
}

function startEdit(task) {
  editingId = task.id;
  $('task-title').value = task.title;
  fillSchedule('task', task.schedule);
  $('form-heading').textContent = 'Edit task';
  $('form-submit').textContent = 'Save';
  $('form-cancel').hidden = false;
  $('task-title').focus();
  $('task-form').scrollIntoView({ behavior: 'smooth' });
}

async function submitTask(event) {
  event.preventDefault();
  const input = { title: $('task-title').value, schedule: readSchedule('task') };
  const call = editingId ? () => api.editTask(editingId, input) : () => api.addTask(input);
  if (await run(call, $('form-error'))) {
    resetForm();
    $('greeting').hidden = true;
    $('task-title').focus();
  }
}

// ---------- settings ----------

function openSettings() {
  const { tone, nudge, startAtLogin } = view.settings;
  $('tone').value = tone;
  fillSchedule('nudge', nudge);
  $('start-at-login').checked = startAtLogin;
  showError($('settings-error'), null);
  $('settings').showModal();
}

async function saveSettings() {
  const input = { tone: $('tone').value, nudge: readSchedule('nudge'), startAtLogin: $('start-at-login').checked };
  if (await run(() => api.saveSettings(input), $('settings-error'))) $('settings').close();
}

// ---------- messages from the app ----------

function greet(summary) {
  const tracked = summary.done.length + summary.open.length;
  $('greeting-text').textContent = tracked === 0
    ? 'What will you finish today? Add each task below and pick when to be reminded.'
    : `Yesterday you finished ${summary.done.length} and left ${summary.open.length} open. What will you finish today?`;
  $('greeting').hidden = false;
  $('task-title').focus();
}

function focusTask(taskId) {
  const item = $(`task-${taskId}`);
  if (!item) return;
  item.scrollIntoView({ behavior: 'smooth', block: 'center' });
  item.classList.add('flash');
  setTimeout(() => item.classList.remove('flash'), FLASH_MS);
}

function togglePause() {
  return run(() => (view.paused ? api.resume() : api.pause()));
}

// ---------- start ----------

function bindEvents() {
  $('task-type').addEventListener('change', () => showScheduleFields('task'));
  $('nudge-type').addEventListener('change', () => showScheduleFields('nudge'));
  $('task-form').addEventListener('submit', submitTask);
  $('form-cancel').addEventListener('click', resetForm);
  $('pause').addEventListener('click', togglePause);
  $('open-settings').addEventListener('click', openSettings);
  $('settings-save').addEventListener('click', saveSettings);
  $('settings-cancel').addEventListener('click', () => $('settings').close());
  $('test-reminder').addEventListener('click', () => run(() => api.testReminder(), $('settings-error')));
  $('greeting-close').addEventListener('click', () => {
    $('greeting').hidden = true;
  });
  api.onState(render);
  api.onCheckIn(greet);
  api.onFocusTask(focusTask);
}

async function start() {
  bindEvents();
  resetForm();
  render(await api.getState());
}

start();
