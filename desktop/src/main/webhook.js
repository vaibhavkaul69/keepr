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

// POSTs the payload as JSON. Never throws: a failed webhook must not stop the desktop notification.
async function sendWebhook(url, payload) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

module.exports = { cleanWebhookUrl, webhookPayload, sendWebhook };
