const api = window.keepr;

const CONFIRM_MS = 3000;
const FLASH_MS = 2000;
const BAR_COUNT = 56;

let view = null;
let lastJson = '';
let editingId = null;

// Last known state of each task ('open' or 'kept'). New lines "print" in and newly kept lines get stamped.
// It stays empty until the first render, so nothing animates on launch.
let seen = null;

const $ = (id) => document.getElementById(id);

// Small DOM builder. Text always goes in as textContent, so task titles can never inject HTML.
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatWhen(iso) {
  const date = new Date(iso);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday ? formatTime(iso) : `${date.toLocaleDateString([], { weekday: 'short' })} ${formatTime(iso)}`;
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

// Bar and gap widths (1–3px) worked out from `text`, so each day gets its own barcode.
function barWidths(text) {
  let hash = 2166136261;
  return Array.from({ length: BAR_COUNT }, (_item, index) => {
    hash = Math.imul(hash ^ text.charCodeAt(index % text.length), 16777619) >>> 0;
    return 1 + (hash % 3);
  });
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

function hoursLeft(until) {
  const hours = (new Date(until) - Date.now()) / 3600000;
  return hours > 0 ? Math.ceil(hours * 4) / 4 : '';
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

// ---------- header, yesterday, totals ----------

function renderHeader() {
  const now = new Date();
  $('date').textContent = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  $('receipt-no').textContent = `NO. ${view.today.replaceAll('-', '')}`;
  $('hold').hidden = !view.paused;
  $('hold').textContent = 'On hold';
  $('pause').textContent = view.paused ? `on hold till ${formatTime(view.pausedUntil)}. resume` : 'pause 1 hour';
}

function pastLine(mark, title, tag) {
  return el('li', {}, [
    el('span', { className: 'mark', textContent: mark }),
    el('span', { textContent: title }),
    ...(tag ? [el('span', { className: 'owed-tag', textContent: tag })] : []),
  ]);
}

function renderYesterday() {
  const { done, open } = view.yesterday;
  if (done.length === 0 && open.length === 0) {
    $('yesterday').replaceChildren(el('p', { className: 'empty', textContent: "Nothing on yesterday's receipt." }));
    return;
  }
  $('yesterday').replaceChildren(el('ul', { className: 'past' }, [
    ...done.map((title) => pastLine('✓', title, null)),
    ...open.map((title) => pastLine('·', title, 'still owed')),
  ]));
}

function renderTotals() {
  const kept = view.doneToday.length;
  const owed = view.openTasks.length;
  $('total-promised').textContent = kept + owed;
  $('total-kept').textContent = kept;
  $('total-owed').textContent = owed;
  const bars = barWidths(`${view.today}:${kept}:${owed}`).map((width, index) => {
    const bar = el('span', { className: index % 2 ? 'gap' : '' });
    bar.style.width = `${width}px`;
    return bar;
  });
  $('barcode').replaceChildren(...bars);
}

// ---------- today's lines ----------

function linkButton(label, onClick) {
  const button = el('button', { className: 'link', type: 'button', textContent: label });
  button.addEventListener('click', onClick);
  return button;
}

// "void" asks for a second click, so one stray click never loses a task.
function voidButton(task) {
  const button = linkButton('void', () => {
    if (button.dataset.armed) return run(() => api.removeTask(task.id));
    button.dataset.armed = 'yes';
    button.textContent = 'sure?';
    setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = 'void';
    }, CONFIRM_MS);
  });
  return button;
}

function descriptionLine(task) {
  return task.description ? [el('span', { className: 'desc', textContent: task.description })] : [];
}

function lineTop(task, when) {
  return el('span', { className: 'line-top' }, [
    el('span', { className: 'what', textContent: task.title }),
    el('span', { className: 'dots' }),
    el('span', { className: 'when', textContent: when }),
  ]);
}

function openLine(task) {
  const box = el('button', { className: 'box', type: 'button', textContent: '[ ]', title: 'Mark kept' });
  box.addEventListener('mouseenter', () => { box.textContent = '[✓]'; });
  box.addEventListener('mouseleave', () => { box.textContent = '[ ]'; });
  box.addEventListener('click', () => run(() => api.setDone(task.id, true)));
  const isNew = seen && !seen.has(task.id);
  return el('li', { className: isNew ? 'line printed' : 'line', id: `task-${task.id}` }, [
    box,
    lineTop(task, task.nextAt ? formatWhen(task.nextAt) : '—'),
    ...descriptionLine(task),
    el('span', { className: 'sub' }, [
      task.scheduleText.toLowerCase(),
      linkButton('snooze', () => run(() => api.snooze(task.id))),
      linkButton('edit', () => startEdit(task)),
      voidButton(task),
    ]),
  ]);
}

function keptLine(task) {
  const box = el('button', { className: 'box', type: 'button', textContent: '[x]', title: 'Mark not kept' });
  box.addEventListener('click', () => run(() => api.setDone(task.id, false)));
  const justKept = seen && seen.get(task.id) !== 'kept';
  return el('li', { className: 'line kept', id: `task-${task.id}` }, [
    box,
    lineTop(task, formatTime(task.doneAt)),
    ...descriptionLine(task),
    el('span', { className: justKept ? 'stamp thump' : 'stamp', textContent: 'Kept' }),
  ]);
}

function renderLines() {
  $('lines').replaceChildren(...view.openTasks.map(openLine), ...view.doneToday.map(keptLine));
  $('lines-empty').hidden = view.openTasks.length + view.doneToday.length > 0;
  seen = new Map([
    ...view.openTasks.map((task) => [task.id, 'open']),
    ...view.doneToday.map((task) => [task.id, 'kept']),
  ]);
}

// Skips identical updates. The app sends state every 20 seconds, and redrawing would reset hover and "sure?".
function render(next) {
  const json = JSON.stringify(next);
  if (json === lastJson) return;
  lastJson = json;
  view = next;
  renderHeader();
  renderYesterday();
  renderLines();
  renderTotals();
}

// ---------- task form ----------

function resetForm() {
  editingId = null;
  $('task-form').reset();
  fillSchedule('task', { type: 'none' });
  $('form-heading').textContent = 'New promise';
  $('form-submit').textContent = 'Print promise';
  $('form-cancel').hidden = true;
  showError($('form-error'), null);
}

function startEdit(task) {
  editingId = task.id;
  $('task-title').value = task.title;
  $('task-description').value = task.description ?? '';
  fillSchedule('task', task.schedule);
  $('form-heading').textContent = 'Reprint promise';
  $('form-submit').textContent = 'Reprint';
  $('form-cancel').hidden = false;
  $('task-title').focus();
  $('task-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function submitTask(event) {
  event.preventDefault();
  const input = {
    title: $('task-title').value,
    description: $('task-description').value,
    schedule: readSchedule('task'),
  };
  const call = editingId ? () => api.editTask(editingId, input) : () => api.addTask(input);
  if (await run(call, $('form-error'))) {
    resetForm();
    $('greeting').hidden = true;
    $('task-title').focus();
  }
}

// ---------- settings ----------

function openSettings() {
  const { nudge, startAtLogin } = view.settings;
  fillSchedule('nudge', nudge);
  $('start-at-login').checked = startAtLogin;
  showError($('settings-error'), null);
  $('settings').showModal();
}

async function saveSettings() {
  const input = { nudge: readSchedule('nudge'), startAtLogin: $('start-at-login').checked };
  if (await run(() => api.saveSettings(input), $('settings-error'))) $('settings').close();
}

// ---------- messages from the app ----------

function greet(summary) {
  const tracked = summary.done.length + summary.open.length;
  $('greeting-text').textContent = tracked === 0
    ? 'Fresh receipt. What do you promise yourself today?'
    : `Yesterday you kept ${summary.done.length} and still owe ${summary.open.length}. What do you promise today?`;
  $('greeting').hidden = false;
  $('task-title').focus();
}

function focusTask(taskId) {
  const line = $(`task-${taskId}`);
  if (!line) return;
  line.scrollIntoView({ behavior: 'smooth', block: 'center' });
  line.classList.add('flash');
  setTimeout(() => line.classList.remove('flash'), FLASH_MS);
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
