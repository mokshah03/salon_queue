import { env } from '../config/env.js';

// "2026-11-22" in the salon's timezone. Used for daily token reset.
export function dateKeyFor(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: env.salonTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// "HH:MM" (24h) in the salon's timezone.
export function salonTimeHM(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: env.salonTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('hour')}:${get('minute')}`;
}

export function isOpenAt(settings, date = new Date()) {
  const hm = salonTimeHM(date);
  return hm >= settings.openTime && hm < settings.closeTime;
}
