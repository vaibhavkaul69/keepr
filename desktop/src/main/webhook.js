const { APP_NAME, WEBHOOK_TIMEOUT_MS } = require('./constants');

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

// `text` is what a Slack incoming webhook shows and `content` is what Discord shows. The other fields are for your own server.
function webhookPayload(alert, now) {
  const text = alert.body ? `${alert.title}\n${alert.body}` : alert.title;
  return {
    text,
    content: text,
    app: APP_NAME,
    kind: alert.kind,
    title: alert.title,
    description: alert.body,
    taskId: alert.taskId,
    sentAt: now.toISOString(),
  };
}

// POSTs the payload as JSON with your headers added. Never throws: a failed webhook must not stop the desktop notification.
async function sendWebhook(url, headers, payload) {
  try {
    const extra = Object.fromEntries(headers.map((row) => [row.name, row.value]));
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (response.ok) return { ok: true, message: `Webhook replied ${response.status}.` };
    return { ok: false, message: `Webhook replied ${response.status} ${response.statusText}.` };
  } catch (err) {
    console.error('Keepr: webhook failed.', err);
    return { ok: false, message: `Webhook failed: ${err.cause?.message ?? err.message}` };
  }
}

module.exports = { cleanWebhookUrl, cleanHeaders, webhookPayload, sendWebhook };
