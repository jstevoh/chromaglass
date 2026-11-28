/**
 * Clock times in a named time zone, for the YouTube server (PLAN 44i-2a).
 *
 * Why this is its own file. The server was written for one channel on one
 * computer, and every clock time it read or wrote was Pacific: a release at
 * "10:00" meant 10:00 in Los Angeles, and a queued job said when it would try
 * again in Pacific time. Lifted out for anyone to run, that is wrong for
 * everyone who is not in California, so the zone is now a setting (the
 * computer's own unless `settings.json` names one) and these helpers take it
 * as an argument. One thing stays Pacific on purpose, and the server says so
 * where it uses it: YouTube's daily quota resets at midnight Pacific whatever
 * zone the channel's owner lives in, so the time a quota-stopped job may try
 * again is computed in America/Los_Angeles and only shown in the owner's zone.
 *
 * The method is the one the server already used for Pacific, now with the zone
 * passed in: read a moment's wall clock in the zone with Intl, and find the
 * moment for a wall-clock time by guessing and correcting three times, which
 * settles across a daylight-saving change (the check schedules across
 * 2026-03-08 to hold that). Node's Intl knows every IANA zone, so there are no
 * tables here to go stale.
 */

export const QUOTA_ZONE = 'America/Los_Angeles';

/** The computer's own zone, which is what a person means by "10:00" unless they set another. */
export function systemZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** True when Intl knows the zone (so a typo in settings.json is caught when it is read, not mid-release). */
export function validZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

export function zoneParts(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, min: get('minute'), s: get('second') };
}

/** The moment at wall-clock y-m-d h:min:s in the zone. Day overflow (d + 3) is allowed and rolls over. */
export function zoneWallToMs(y, m, d, h, min, s, tz) {
  const targetWall = Date.UTC(y, m - 1, d, h, min, s);
  let t = targetWall;
  for (let i = 0; i < 3; i++) {
    const g = zoneParts(t, tz);
    t += targetWall - Date.UTC(g.y, g.m - 1, g.d, g.h, g.min, g.s);
  }
  return t;
}

/** Ten minutes past the next quota reset (midnight Pacific), the earliest a quota-stopped job is worth trying. */
export function nextQuotaResetPlus10m(now) {
  const p = zoneParts(now, QUOTA_ZONE);
  return zoneWallToMs(p.y, p.m, p.d + 1, 0, 10, 0, QUOTA_ZONE);
}

/** "Mar 7, 10:00 AM PST": short, with the zone's name, so nobody has to guess which clock it is. */
export function formatZone(ms, tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(ms));
}
