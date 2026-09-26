const { MINUTE_MS, addDays, addMinutes, atTime, endOfDay, formatDateTime } = require('./dates');

// A schedule is one of:
//   { type: 'none' }                                  only the daily nudges
//   { type: 'daily', times: ['11:00', '14:00'] }      set times, every day
//   { type: 'every', minutes, from, until }           every N minutes; until is null for "until done"
//   { type: 'hourly' }                                on the hour, 6 am to 12 midnight, every day
//   { type: 'once', at }                              one reminder
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MAX_EVERY_MINUTES = 24 * 60;
const MAX_EVERY_HOURS = 30 * 24;
const HOURLY_FIRST = 6;
const HOURLY_LAST = 23;

// Turns "11:00, 9:30" or ['11:00'] into sorted, unique "HH:MM" times.
function parseTimes(value) {
  const parts = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/);
  const times = parts.filter(Boolean).map((part) => {
    const match = TIME_PATTERN.exec(String(part).trim());
    if (!match) throw new Error(`"${part}" is not a time. Use 24-hour time, like 14:30.`);
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  });
  return [...new Set(times)].sort();
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function cleanDaily(input) {
  const times = parseTimes(input.times);
  if (times.length === 0) throw new Error('Add at least one time, like 11:00, 15:30.');
  return { type: 'daily', times };
}

// Starts counting from now, so the first reminder comes one interval later.
function cleanEvery(input, now) {
  const minutes = Number(input.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_EVERY_MINUTES) {
    throw new Error(`Pick whole minutes between reminders, from 1 to ${MAX_EVERY_MINUTES}.`);
  }
  const hours = isBlank(input.hours) ? null : Number(input.hours);
  if (hours !== null && !(hours > 0 && hours <= MAX_EVERY_HOURS)) {
    throw new Error(`Pick up to ${MAX_EVERY_HOURS} hours, or leave it empty to repeat until done.`);
  }
  const until = hours === null ? null : addMinutes(now, hours * 60).toISOString();
  return { type: 'every', minutes, from: now.toISOString(), until };
}

// "Every minute": from the next minute until the end of today.
function cleanMinute(now) {
  return { type: 'every', minutes: 1, from: now.toISOString(), until: endOfDay(now).toISOString() };
}

function pad(number) {
  return String(number).padStart(2, '0');
}

// Every full hour from 6 am to 11 pm, plus 12 midnight, the last one of the day.
// Quiet from 12 midnight to 6 am. Set at 7:51, the first reminder is at 8:00, not 8:51.
const HOURLY_TIMES = [
  '00:00',
  ...Array.from({ length: HOURLY_LAST - HOURLY_FIRST + 1 }, (_item, index) => `${pad(HOURLY_FIRST + index)}:00`),
];

function cleanOnce(input, now) {
  const at = new Date(input.at);
  if (Number.isNaN(at.getTime())) throw new Error('Pick a date and time.');
  if (at <= now) throw new Error('Pick a time in the future.');
  return { type: 'once', at: at.toISOString() };
}

// Checks a schedule sent from the screen and returns a clean copy. Throws a readable error.
function cleanSchedule(input, now) {
  const type = input?.type ?? 'none';
  if (type === 'none') return { type };
  if (type === 'daily') return cleanDaily(input);
  if (type === 'every') return cleanEvery(input, now);
  if (type === 'minute') return cleanMinute(now);
  if (type === 'hourly') return { type: 'hourly' };
  if (type === 'once') return cleanOnce(input, now);
  throw new Error(`Unknown schedule type: ${type}`);
}

function nextDailyTime(times, after) {
  for (const offset of [0, 1]) {
    const day = addDays(after, offset);
    const hit = times.map((time) => atTime(day, time)).find((date) => date > after);
    if (hit) return hit;
  }
  return null;
}

function nextEveryTime({ minutes, from, until }, after) {
  const start = new Date(from).getTime();
  const step = minutes * MINUTE_MS;
  const count = Math.max(1, Math.floor((after.getTime() - start) / step) + 1);
  const next = new Date(start + count * step);
  return until && next > new Date(until) ? null : next;
}

// The first reminder time strictly after `after`, or null when the schedule has no more.
function nextTime(schedule, after) {
  const from = new Date(after);
  if (schedule?.type === 'daily') return nextDailyTime(schedule.times, from);
  if (schedule?.type === 'every') return nextEveryTime(schedule, from);
  if (schedule?.type === 'hourly') return nextDailyTime(HOURLY_TIMES, from);
  if (schedule?.type === 'once') {
    const at = new Date(schedule.at);
    return at > from ? at : null;
  }
  return null;
}

// Restarts a timed run for a task moved to today. "Every minute" runs until the end of today again.
// Other schedules are left as they are.
function renewSchedule(schedule, now) {
  if (schedule?.type !== 'every' || !schedule.until) return schedule;
  return { ...schedule, from: now.toISOString(), until: endOfDay(now).toISOString() };
}

function describeSchedule(schedule) {
  if (schedule?.type === 'daily') return `Every day at ${schedule.times.join(', ')}`;
  if (schedule?.type === 'hourly') return 'Every hour on the hour, 6 am to 12 midnight, every day';
  if (schedule?.type === 'every' && schedule.minutes === 1) {
    return schedule.until ? `Every minute until ${formatDateTime(schedule.until)}` : 'Every minute until done';
  }
  if (schedule?.type === 'every') {
    const end = schedule.until ? `until ${formatDateTime(schedule.until)}` : 'until done';
    return `Every ${schedule.minutes} min, ${end}`;
  }
  if (schedule?.type === 'once') return `Once, ${formatDateTime(schedule.at)}`;
  return 'Daily nudges only';
}

module.exports = { parseTimes, cleanSchedule, nextTime, renewSchedule, describeSchedule };
