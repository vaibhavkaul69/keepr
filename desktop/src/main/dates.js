const MINUTE_MS = 60 * 1000;

function pad(number) {
  return String(number).padStart(2, '0');
}

// Local calendar day as "YYYY-MM-DD", so days compare as plain strings.
function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * MINUTE_MS);
}

// The same day as `date`, at a local "HH:MM" time.
function atTime(date, time) {
  const [hours, minutes] = time.split(':').map(Number);
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// The last millisecond of `date`'s local day.
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function toIso(date) {
  return date ? date.toISOString() : null;
}

function formatDateTime(date) {
  return new Date(date).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

module.exports = { MINUTE_MS, dayKey, addDays, addMinutes, atTime, endOfDay, toIso, formatDateTime };
