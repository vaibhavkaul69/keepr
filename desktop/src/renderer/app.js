const api = window.keepr;

const CONFIRM_MS = 3000;
const DONE_MS = 2000;
const BAR_COUNT = 56;

const LISTS = {
  today: { heading: "Today's promises", empty: 'Nothing promised today yet. Go back and add one.' },
  carried: { heading: 'Carried over', empty: 'Nothing carried over. Clean slate.' },
};

let view = null;
let lastJson = '';
let editingId = null;

// Which screen is showing: 'home', 'list' or 'detail'.
let screen = 'home';
// Which list the list screen shows: 'today' or 'carried'.
let listName = 'today';
// The task on the details screen, and the screen "back" returns to.
let detailId = null;
let detailBack = 'home';

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

function formatDay(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

// A "YYYY-MM-DD" day, read as local midnight.
function formatDayKey(day) {
  return formatDay(`${day}T00:00:00`);
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

// ---------- schedule fields (shared by the task form and settings) ----------

function showScheduleFields(prefix) {
  const type = $(`${prefix}-type`).value;
  document.querySelectorAll(`[data-schedule="${prefix}"]`).forEach((group) => {
    group.hidden = group.dataset.for !== type;
  });
}

function readSchedule(prefix) {
  const value = (name) => $(`${prefix}-${name}`)?.value ?? '';
  return {
    type: value('type'),
    times: value('times'),
    minutes: value('minutes'),
    at: value('at'),
  };
}

// The task form has no "every N minutes" choice. Older every-N tasks show as "every minute".
function formType(prefix, schedule) {
  const type = schedule?.type ?? 'none';
  return prefix === 'task' && type === 'every' ? 'minute' : type;
}

function fillSchedule(prefix, schedule) {
  const set = (name, value) => {
    const input = $(`${prefix}-${name}`);
    if (input) input.value = value;
  };
  set('type', formType(prefix, schedule));
  set('times', schedule?.type === 'daily' ? schedule.times.join(', ') : '');
  set('minutes', schedule?.type === 'every' ? schedule.minutes : 60);
  set('at', schedule?.type === 'once' ? toLocalInput(schedule.at) : '');
  showScheduleFields(prefix);
}

// ---------- screens ----------

function showScreen(name) {
  screen = name;
  $('home').hidden = name !== 'home';
  $('list').hidden = name !== 'list';
  $('detail').hidden = name !== 'detail';
  window.scrollTo(0, 0);
  if (name === 'home') $('task-title').focus();
}

function showList(name) {
  listName = name;
  renderList();
  showScreen('list');
}

function findTask(id) {
  return [...view.openTasks, ...view.doneToday].find((task) => task.id === id) ?? null;
}

// Opens a task's details. "back" returns to the screen it was opened from.
function showDetail(taskId) {
  if (!view || !findTask(taskId)) return;
  detailBack = screen === 'detail' ? detailBack : screen;
  detailId = taskId;
  renderDetail();
  showScreen('detail');
}

function goBack() {
  if (screen === 'detail') {
    detailId = null;
    if (detailBack === 'list') showList(listName);
    else showScreen('home');
  } else if (screen === 'list') {
    showScreen('home');
  }
}

// ---------- home ----------

function renderHeader() {
  const now = new Date();
  $('date').textContent = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  $('receipt-no').textContent = `NO. ${view.today.replaceAll('-', '')}`;
  $('hold').hidden = !view.paused;
  $('pause').textContent = view.paused ? `on hold till ${formatTime(view.pausedUntil)}. resume` : 'pause 1 hour';
}

function renderSections() {
  const kept = view.doneToday.length;
  $('today-count').textContent = `${view.todayOpen.length} owed · ${kept} kept`;
  $('carried-count').textContent = `${view.carried.length} owed`;
  $('total-kept').textContent = kept;
  $('total-owed').textContent = view.openTasks.length;
  const bars = barWidths(`${view.today}:${kept}:${view.openTasks.length}`).map((width, index) => {
    const bar = el('span', { className: index % 2 ? 'gap' : '' });
    bar.style.width = `${width}px`;
    return bar;
  });
  $('barcode').replaceChildren(...bars);
}

// ---------- list ----------

// `when` is text, or a button for carried tasks.
function lineTop(task, when) {
  return el('span', { className: 'line-top' }, [
    el('span', { className: 'what', textContent: task.title }),
    el('span', { className: 'dots' }),
    el('span', { className: 'when' }, [when]),
  ]);
}

function moveButton(ids, label) {
  return linkButton(label, (event) => {
    event.stopPropagation();
    run(() => api.moveToToday(ids));
  });
}

// Carried tasks sit under a "promised, not kept" day heading, so they only mention earlier misses.
function lineNote(task, carried) {
  if (carried) return task.missedDays?.length ? `also missed ${task.missedDays.map(formatDayKey).join(', ').toLowerCase()}` : '';
  const movedFrom = task.missedDays?.at(-1);
  const schedule = task.scheduleText.toLowerCase();
  return movedFrom ? `${schedule} · moved from ${formatDayKey(movedFrom).toLowerCase()}` : schedule;
}

function openLine(task, carried) {
  const box = el('button', { className: 'box', type: 'button', textContent: '[ ]', title: 'Mark kept' });
  box.addEventListener('mouseenter', () => { box.textContent = '[✓]'; });
  box.addEventListener('mouseleave', () => { box.textContent = '[ ]'; });
  box.addEventListener('click', (event) => {
    event.stopPropagation();
    run(() => api.setDone(task.id, true));
  });
  const isNew = seen && !seen.has(task.id);
  const when = carried ? moveButton([task.id], 'move to today') : (task.nextAt ? formatWhen(task.nextAt) : '—');
  const line = el('li', { className: isNew ? 'line printed' : 'line', title: 'Open details' }, [
    box,
    lineTop(task, when),
    ...(lineNote(task, carried) ? [el('span', { className: 'sub', textContent: lineNote(task, carried) })] : []),
  ]);
  line.addEventListener('click', () => showDetail(task.id));
  return line;
}

function keptLine(task) {
  const box = el('button', { className: 'box', type: 'button', textContent: '[x]', title: 'Mark not kept' });
  box.addEventListener('click', (event) => {
    event.stopPropagation();
    run(() => api.setDone(task.id, false));
  });
  const justKept = seen && seen.get(task.id) !== 'kept';
  const line = el('li', { className: 'line kept', title: 'Open details' }, [
    box,
    lineTop(task, formatTime(task.doneAt)),
    el('span', { className: justKept ? 'stamp thump' : 'stamp', textContent: 'Kept' }),
  ]);
  line.addEventListener('click', () => showDetail(task.id));
  return line;
}

// Carried tasks grouped by the day they were promised for, newest day first.
function carriedLines() {
  const days = [...new Set(view.carried.map((task) => task.plannedDay))];
  return days.flatMap((day) => [
    el('li', { className: 'day-head', textContent: `${formatDayKey(day)} · promised, not kept` }),
    ...view.carried.filter((task) => task.plannedDay === day).map((task) => openLine(task, true)),
  ]);
}

function renderList() {
  const carried = listName === 'carried';
  const lines = carried
    ? carriedLines()
    : [...view.todayOpen.map((task) => openLine(task, false)), ...view.doneToday.map(keptLine)];
  const moveAll = carried && view.carried.length > 1
    ? [moveButton(view.carried.map((task) => task.id), `move all ${view.carried.length} to today`)]
    : [];
  $('list-heading').textContent = LISTS[listName].heading;
  $('list-tools').replaceChildren(...moveAll);
  $('lines').replaceChildren(...lines);
  $('lines-empty').textContent = LISTS[listName].empty;
  $('lines-empty').hidden = lines.length > 0;
  seen = new Map([
    ...view.openTasks.map((task) => [task.id, 'open']),
    ...view.doneToday.map((task) => [task.id, 'kept']),
  ]);
}

// ---------- details ----------

function fact(label, value) {
  return el('div', {}, [el('dt', { textContent: label }), el('dd', { textContent: value })]);
}

function isCarriedTask(task) {
  return !task.doneAt && task.plannedDay < view.today;
}

function detailActions(task) {
  const kept = Boolean(task.doneAt);
  const toggle = el('button', { className: 'print', type: 'button', textContent: kept ? 'Mark not kept' : 'Mark kept' });
  toggle.addEventListener('click', () => run(() => api.setDone(task.id, !kept)));
  const move = el('button', { className: 'print', type: 'button', textContent: 'Move to today' });
  move.addEventListener('click', () => run(() => api.moveToToday([task.id])));
  return [
    ...(isCarriedTask(task) ? [move] : []),
    toggle,
    ...(kept ? [] : [linkButton('snooze 15 min', () => run(() => api.snooze(task.id)))]),
    linkButton('edit', () => {
      detailId = null;
      showScreen('home');
      startEdit(task);
    }),
    voidButton(task),
  ];
}

// Goes back when the task is gone, for example after "void".
function renderDetail() {
  if (!detailId) return;
  const task = findTask(detailId);
  if (!task) {
    goBack();
    return;
  }
  const kept = Boolean(task.doneAt);
  $('detail-title').textContent = task.title;
  $('detail-stamp').hidden = !kept;
  $('detail-description').textContent = task.description || 'No description.';
  $('detail-description').classList.toggle('none', !task.description);
  $('detail-facts').replaceChildren(
    fact('Schedule', task.scheduleText),
    fact('Next reminder', !kept && task.nextAt ? formatWhen(task.nextAt) : '—'),
    fact('Added', `${formatDay(task.createdAt)}, ${formatTime(task.createdAt)}`),
    fact('Promised for', formatDayKey(task.plannedDay)),
    ...(task.missedDays?.length ? [fact('Missed', task.missedDays.map(formatDayKey).join(', '))] : []),
    fact('Status', kept ? `Kept at ${formatTime(task.doneAt)}` : isCarriedTask(task) ? 'Not kept, carried over' : 'Still owed'),
  );
  $('detail-actions').replaceChildren(...detailActions(task));
}

// Skips identical updates. The app sends state every 20 seconds, and redrawing would reset hover and "sure?".
function render(next) {
  const json = JSON.stringify(next);
  if (json === lastJson) return;
  lastJson = json;
  view = next;
  renderHeader();
  renderSections();
  renderList();
  renderDetail();
}

// ---------- task form ----------

function resetForm() {
  editingId = null;
  $('task-form').reset();
  fillSchedule('task', { type: 'none' });
  $('form-heading').textContent = "Today's promise";
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
}

// A short "printed ✓", since the new line is on another screen.
function flashDone() {
  $('form-done').hidden = false;
  setTimeout(() => { $('form-done').hidden = true; }, DONE_MS);
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
    flashDone();
  }
}

// ---------- settings ----------

function openSettings() {
  const { nudge, startAtLogin, webhookUrl, webhookHeaders, carryTime } = view.settings;
  fillSchedule('nudge', nudge);
  $('start-at-login').checked = startAtLogin;
  $('webhook-url').value = webhookUrl ?? '';
  fillHeaders(webhookHeaders);
  showHeadersBox();
  $('carry-time').value = carryTime ?? '';
  $('settings-status').hidden = true;
  showError($('settings-error'), null);
  $('settings').showModal();
}

async function saveSettings() {
  const input = {
    nudge: readSchedule('nudge'),
    startAtLogin: $('start-at-login').checked,
    webhookUrl: $('webhook-url').value,
    webhookHeaders: readHeaders(),
    carryTime: $('carry-time').value,
  };
  if (await run(() => api.saveSettings(input), $('settings-error'))) $('settings').close();
}

// ---------- webhook headers ----------

function headerRow(row = { name: '', value: '' }) {
  const name = el('input', { className: 'header-name', placeholder: 'Header-Name', value: row.name, spellcheck: false });
  const value = el('input', { className: 'header-value', placeholder: 'value', value: row.value, spellcheck: false });
  const item = el('li', {}, [name, value]);
  const remove = linkButton('×', () => item.remove());
  remove.title = 'Remove header';
  item.append(remove);
  return item;
}

function fillHeaders(rows) {
  $('webhook-headers').replaceChildren(...(rows ?? []).map(headerRow));
}

function readHeaders() {
  return [...$('webhook-headers').children].map((item) => ({
    name: item.querySelector('.header-name').value,
    value: item.querySelector('.header-value').value,
  }));
}

// Headers only make sense once there is a URL to send them to.
function showHeadersBox() {
  $('webhook-headers-box').hidden = !$('webhook-url').value.trim();
}

function addHeader() {
  const row = headerRow();
  $('webhook-headers').append(row);
  row.querySelector('input').focus();
}

// Sends a test reminder to the desktop and to the webhook URL and headers in the boxes, then shows how the webhook replied.
async function sendTest() {
  const status = $('settings-status');
  status.textContent = 'sending...';
  status.hidden = false;
  showError($('settings-error'), null);
  try {
    const { webhook } = await api.testReminder({ url: $('webhook-url').value, headers: readHeaders() });
    status.textContent = webhook ? `Desktop notification sent. ${webhook.message}` : 'Desktop notification sent.';
  } catch (err) {
    status.hidden = true;
    showError($('settings-error'), err);
  }
}

// ---------- messages from the app ----------

function greet(summary) {
  const tracked = summary.done.length + summary.open.length;
  $('greeting-text').textContent = tracked === 0
    ? 'Fresh receipt. What do you promise yourself today?'
    : `Yesterday you kept ${summary.done.length} and still owe ${summary.open.length}. What do you promise today?`;
  detailId = null;
  showScreen('home');
  $('greeting').hidden = false;
}

// Puts the cursor in the promise input, unless you are already typing in another field.
function focusPromiseInput() {
  const busy = document.activeElement?.matches('input, textarea, select');
  if (screen === 'home' && !$('settings').open && !busy) $('task-title').focus();
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
  $('open-today').addEventListener('click', () => showList('today'));
  $('open-carried').addEventListener('click', () => showList('carried'));
  $('list-back').addEventListener('click', goBack);
  $('detail-back').addEventListener('click', goBack);
  $('pause').addEventListener('click', togglePause);
  $('open-settings').addEventListener('click', openSettings);
  $('settings-save').addEventListener('click', saveSettings);
  $('settings-cancel').addEventListener('click', () => $('settings').close());
  $('test-reminder').addEventListener('click', sendTest);
  $('webhook-url').addEventListener('input', showHeadersBox);
  $('add-header').addEventListener('click', addHeader);
  $('greeting-close').addEventListener('click', () => {
    $('greeting').hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('settings').open) goBack();
  });
  window.addEventListener('focus', focusPromiseInput);
  api.onState(render);
  api.onCheckIn(greet);
  api.onFocusTask(showDetail);
}

async function start() {
  bindEvents();
  resetForm();
  render(await api.getState());
  focusPromiseInput();
}

start();
