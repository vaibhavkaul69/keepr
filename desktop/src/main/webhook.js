const { APP_NAME, WEBHOOK_TIMEOUT_MS } = require('./constants');
const { formatDayKey } = require('./dates');

// Blank means "no webhook". Anything else must be an http(s) URL. Throws a readable error.
function cleanWebhookUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('The webhook URL is not a valid URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The webhook URL must start with https:// or http://');
  }
  return url.toString();
}

// Header names follow the HTTP rule for names. Values must not contain line breaks, or one header could inject another.
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MAX_HEADERS = 20;

// Keeps rows that have a name, and checks each one. Throws a readable error.
function cleanHeaders(list) {
  const rows = (Array.isArray(list) ? list : [])
    .map((row) => ({ name: String(row?.name ?? '').trim(), value: String(row?.value ?? '').trim() }))
    .filter((row) => row.name);
  if (rows.length > MAX_HEADERS) throw new Error(`Add at most ${MAX_HEADERS} headers.`);
  rows.forEach(({ name, value }) => {
    if (!HEADER_NAME.test(name)) throw new Error(`"${name}" is not a valid header name.`);
    if (/[\r\n]/.test(value)) throw new Error(`The value of "${name}" must be on one line.`);
  });
  return rows;
}

// ---------- payloads ----------
// Every webhook is one message:
//   { app, kind, title, sections: [{ heading, tasks: [{ taskId, title, description, promisedFor, dueText }] }], text, content, sentAt }
// `text` (Slack) and `content` (Discord) hold the same message as plain text, for webhooks that only show one field.
// `promisedFor` is the "YYYY-MM-DD" day the task is meant for. `dueText` is ready to show, in the laptop's time zone.
// Each task needs `plannedDay`.

function taskItem(task, dueText) {
  return {
    taskId: task.id,
    title: task.title,
    description: task.description ?? '',
    promisedFor: task.plannedDay,
    dueText,
  };
}

function plainText(title, sections) {
  const lines = [title];
  sections.forEach((section) => {
    lines.push('');
    if (section.heading) lines.push(section.heading);
    section.tasks.forEach((task) => {
      const description = task.description ? `: ${task.description}` : '';
      lines.push(`• ${task.title}${description} (${task.dueText})`);
    });
  });
  return lines.join('\n');
}

function payload(kind, title, sections, now) {
  const text = plainText(title, sections);
  return { app: APP_NAME, kind, title, sections, text, content: text, sentAt: now.toISOString() };
}

// Tasks grouped by the day they were promised for, newest day first.
function daySections(tasks, today, dueText) {
  const days = [...new Set(tasks.map((task) => task.plannedDay))].sort().reverse();
  return days.map((day) => ({
    heading: day === today ? `Promised for today, ${formatDayKey(day)}` : `Promised for ${formatDayKey(day)}`,
    tasks: tasks.filter((task) => task.plannedDay === day).map((task) => taskItem(task, dueText(day))),
  }));
}

function promiseCount(tasks) {
  return `${tasks.length} ${tasks.length === 1 ? 'promise' : 'promises'}`;
}

// One of today's tasks, as its own message: just its title. `taskId` and `promisedFor` are there for other servers.
function taskPayload(task, today, now) {
  const body = payload('reminder', task.title, [], now);
  return { ...body, taskId: task.id, promisedFor: task.plannedDay };
}

// Every older task in one message.
function carriedPayload(tasks, today, now) {
  const sections = daySections(tasks, today, (day) => `overdue since ${formatDayKey(day)}`);
  return payload('carried', `Still owed from earlier days: ${promiseCount(tasks)}`, sections, now);
}

// The nightly summary: every open task in one message, today's and older ones.
function leftoverPayload(tasks, today, now) {
  const sections = daySections(tasks, today, (day) => (day === today ? 'due at midnight tonight' : `overdue since ${formatDayKey(day)}`));
  const title = tasks.length ? `Left over tonight: ${promiseCount(tasks)} not kept` : 'Left over tonight: nothing. Every promise kept.';
  return payload('leftover', title, sections, now);
}

// A message with no tasks, like the morning check-in.
function notePayload(kind, title, body, now) {
  const text = body ? `${title}\n${body}` : title;
  return { app: APP_NAME, kind, title, sections: [], note: body, text, content: text, sentAt: now.toISOString() };
}

// ---------- sending ----------

// POSTs the payload as JSON with your headers added. Never throws: a failed webhook must not stop the desktop notification.
async function sendWebhook(url, headers, body) {
  try {
    const extra = Object.fromEntries(headers.map((row) => [row.name, row.value]));
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (response.ok) return { ok: true, message: `Webhook replied ${response.status}.` };
    return { ok: false, message: `Webhook replied ${response.status} ${response.statusText}.` };
  } catch (err) {
    console.error('Keepr: webhook failed.', err);
    return { ok: false, message: `Webhook failed: ${err.cause?.message ?? err.message}` };
  }
}

module.exports = {
  cleanWebhookUrl,
  cleanHeaders,
  taskPayload,
  carriedPayload,
  leftoverPayload,
  notePayload,
  sendWebhook,
};
