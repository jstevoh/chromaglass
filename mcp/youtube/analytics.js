/**
 * How the channel's videos are watched (PLAN 44i-2d): watch time, how long
 * people stay (retention), and where they came from, per video and for the
 * channel, from the YouTube Analytics API.
 *
 * What was asked. The owner picked "everything incl. analytics" for sendreel
 * (2026-11-28), and the reason behind it is the owner's own: the films are
 * looks, and which look holds a viewer to the end and which loses them in the
 * first ten seconds is the one number the channel page does not show. The
 * manifest already keeps views and likes from the Data API; those say a film
 * was opened, not that it was watched. Watch time, average view duration and
 * the retention curve say that, and only the Analytics API has them.
 *
 * Why its own scope, asked only when wanted. The Analytics API needs
 * `yt-analytics.readonly`, a scope the upload sign-in never asked for. Asking
 * for it in every sign-in would put "see YouTube Analytics reports" on the
 * consent page of everyone who only wants uploads, and a person who shares
 * this tool should be asked for exactly what they use. So `login --add
 * analytics` asks for it on top of what the saved sign-in already has, and a
 * plain `login` afterwards keeps it (it asks again for every opt-in the saved
 * key carries, so signing in again never quietly drops one). Google's consent
 * page lets a person untick a scope; the sign-in then says analytics was not
 * granted rather than pretending, and the tool refuses with the command that
 * fixes it. The read is checked against the saved key's own list before any
 * request, so a missing scope costs nothing and says what to do; a key saved
 * before the list was kept is tried, and Google's refusal is read the same way.
 * 44i-2e's comments will be the second entry in `OPT_IN`. The reports page also says
 * a query needs `youtube.readonly`; the upload sign-in's `youtube` scope covers it, so
 * analytics adds only its own.
 *
 * Why these reports and no others. Four questions, one report each, every
 * one a combination the API's channel-report tables list as supported (read
 * 2026-11-28): totals (no dimension, the video as a filter or none), the
 * retention curve (`elapsedVideoTimeRatio`, one video only, 100 points), the
 * traffic sources (`insightTrafficSourceType`), and the search terms that
 * found the video (`insightTrafficSourceDetail` under YouTube search, at most
 * 25). For the channel, the top videos by watch time (`video`, sorted, at
 * most 200, the API's own cap) take the place of retention, which the API
 * keeps per video. Retention is summed up, not dumped: eleven points (start,
 * then every tenth of the film, as clock times when the length is known) and
 * the steepest drop between two of them, which is the moment a person
 * judging a look wants to see; `detail: true` gives the hundred.
 *
 * Dates are YouTube's: the API counts days in Pacific time whatever the
 * channel's zone, and its numbers arrive a day or three late. So the default
 * range is the 28 days ending today in Pacific time (as Studio's own default),
 * and the reply says the dates it asked for. The Analytics API has a quota of
 * its own and does not spend the Data API's 10,000 units; naming a video
 * costs the Data API one unit to read its title and length.
 *
 * Pure apart from `ask` (the server's call to the reports endpoint) and
 * `lookup` (the server's titles), so the check drives it through the server.
 */
import { QUOTA_ZONE, zoneParts } from './zone.js';

export const OPT_IN = { analytics: 'https://www.googleapis.com/auth/yt-analytics.readonly' };
export const ANALYTICS_SCOPE = OPT_IN.analytics;
export const TOP_MAX = 200;
export const TERMS_MAX = 25;
const DAY_MS = 86_400_000;

/** The scopes a sign-in asks for: the server's own, every opt-in the saved key has, and the ones added now. */
export function scopesFor(base, savedScope, add = []) {
  const unknown = add.filter((n) => !OPT_IN[n]);
  if (unknown.length) throw new Error(`login --add takes ${Object.keys(OPT_IN).join(', ')}, not ${unknown.join(', ')}.`);
  const saved = String(savedScope ?? '').split(/\s+/).filter((s) => Object.values(OPT_IN).includes(s));
  return [...new Set([base, ...saved, ...add.map((n) => OPT_IN[n])])];
}

/** Whether a saved key carries a scope: true, false, or null when the key keeps no list (saved before it was kept). */
export function granted(token, scope) {
  if (typeof token?.scope !== 'string') return null;
  return token.scope.split(/\s+/).includes(scope);
}

export const ANALYTICS_OFF = (run) => `Analytics is not switched on for this sign-in. Run: ${run} login --add analytics (Google asks once more; tick "See YouTube Analytics reports"). In the Google Cloud project, also turn on "YouTube Analytics API": https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com`;

/** What a refusal from the reports endpoint means, or null for one this file has no words for. */
export function analyticsFix(e, run) {
  const r = `${e?.reason ?? ''} ${e?.message ?? ''}`;
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(r)) return 'Turn on "YouTube Analytics API" in the Google Cloud project: https://console.cloud.google.com/apis/library/youtubeanalytics.googleapis.com (Enable), wait a minute, ask again.';
  if (/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i.test(r)) return ANALYTICS_OFF(run);
  return null;
}

const ymd = (p) => `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
function readDate(s, what) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? '').trim());
  const t = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  if (!m || new Date(t).toISOString().slice(0, 10) !== m[0]) throw new Error(`${what} must be a date in YYYY-MM-DD, not ${JSON.stringify(s)}.`);
  return t;
}

/**
 * The dates asked for, as YouTube counts them (Pacific). `end` defaults to today there, `start`
 * to `days` (28) back, both ends counted. A start after the end, or an end after today, is refused:
 * the API would answer an empty report, which reads as "nobody watched".
 */
export function parseRange(a, now) {
  const today = ymd(zoneParts(now, QUOTA_ZONE));
  const todayMs = readDate(today, 'today');
  const endMs = a.end === undefined ? todayMs : readDate(a.end, 'end');
  if (endMs > todayMs) throw new Error(`end is after today (${today}, Pacific time, as YouTube counts days).`);
  let startMs;
  if (a.start !== undefined) {
    if (a.days !== undefined) throw new Error('Pass start or days, not both.');
    startMs = readDate(a.start, 'start');
  } else {
    const days = a.days === undefined ? 28 : Number(a.days);
    if (!Number.isInteger(days) || days < 1) throw new Error('days is a whole number of days, 1 or more.');
    startMs = endMs - (days - 1) * DAY_MS;
  }
  if (startMs > endMs) throw new Error(`start (${new Date(startMs).toISOString().slice(0, 10)}) is after end (${new Date(endMs).toISOString().slice(0, 10)}).`);
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  return { startDate: iso(startMs), endDate: iso(endMs), days: Math.round((endMs - startMs) / DAY_MS) + 1 };
}

/** A report's rows as objects named by its column headers. */
export function rowsOf(j) {
  const names = (j?.columnHeaders ?? []).map((h) => h.name);
  return (j?.rows ?? []).map((r) => Object.fromEntries(names.map((n, i) => [n, r[i]])));
}

/* The API's traffic source codes in the words Studio uses (its dimensions page, 2026-11-28); an unknown one shows as itself. */
export const SOURCE_NAMES = {
  ADVERTISING: 'YouTube advertising', ANNOTATION: 'Annotations', CAMPAIGN_CARD: 'Campaign cards', END_SCREEN: 'End screens',
  EXT_URL: 'External', HASHTAGS: 'Hashtag pages', IMMERSIVE_LIVE: 'Immersive live', LIVE_REDIRECT: 'Live redirect',
  NO_LINK_EMBEDDED: 'Embedded, no link', NO_LINK_OTHER: 'Direct or unknown', NOTIFICATION: 'Notifications', PLAYLIST: 'Playlists',
  PRODUCT_PAGE: 'Product pages', PROMOTED: 'Promoted', RELATED_VIDEO: 'Suggested videos', SHORTS: 'Shorts feed',
  SHORTS_CONTENT_LINKS: 'Shorts content links', SOUND_PAGE: 'Sound pages', SUBSCRIBER: 'Browse features', VIDEO_REMIXES: 'Remixes', WATCH_WITH: 'Watch With',
  YT_CHANNEL: 'Channel pages', YT_OTHER_PAGE: 'Other YouTube features', YT_PLAYLIST_PAGE: 'Playlist pages', YT_SEARCH: 'YouTube search',
};

const round = (n, k = 1) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 10 ** k) / 10 ** k : null);
const clock = (sec) => { const s = Math.round(sec); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };

const TOTALS = 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained';
function totalsOf(j) {
  const t = rowsOf(j)[0];
  if (!t) return { views: 0, watch_minutes: 0, note: 'No views in these dates (YouTube\'s numbers arrive a day or three late).' };
  return {
    views: Number(t.views ?? 0),
    watch_minutes: round(t.estimatedMinutesWatched),
    average_view: t.averageViewDuration === undefined ? null : clock(Number(t.averageViewDuration)),
    average_view_seconds: round(t.averageViewDuration, 0),
    average_percent_watched: round(t.averageViewPercentage),
    likes: Number(t.likes ?? 0), comments: Number(t.comments ?? 0), shares: Number(t.shares ?? 0), subscribers_gained: Number(t.subscribersGained ?? 0),
  };
}

function sourcesOf(j) {
  const rows = rowsOf(j);
  const all = rows.reduce((s, r) => s + Number(r.views ?? 0), 0);
  return rows.map((r) => ({
    source: SOURCE_NAMES[r.insightTrafficSourceType] ?? r.insightTrafficSourceType,
    views: Number(r.views ?? 0),
    share_percent: all ? round((100 * Number(r.views ?? 0)) / all) : 0,
    watch_minutes: round(r.estimatedMinutesWatched),
  }));
}

/**
 * The curve, summed up: who is still watching at the start and at each tenth of the film (a share
 * of the views that began; above 1 where people watch a part again), how that compares with
 * YouTube's videos of a similar length (0.5 is typical), and the steepest drop between two
 * neighbouring points. Null when YouTube has no curve yet (too few views).
 */
export function retentionSummary(j, durationSec, detail = false) {
  const rows = rowsOf(j).map((r) => ({ at: Number(r.elapsedVideoTimeRatio), watching: Number(r.audienceWatchRatio), vs: Number(r.relativeRetentionPerformance) }))
    .filter((r) => Number.isFinite(r.at) && Number.isFinite(r.watching)).sort((x, y) => x.at - y.at);
  if (!rows.length) return null;
  const when = (ratio) => (Number.isFinite(durationSec) && durationSec > 0 ? clock(ratio * durationSec) : null);
  const nearest = (target) => rows.reduce((b, r) => (Math.abs(r.at - target) < Math.abs(b.at - target) ? r : b));
  const marks = [...new Set([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map(nearest))];
  const point = (r) => ({ percent: Math.round(r.at * 100), ...(when(r.at) ? { at: when(r.at) } : {}), watching: round(r.watching, 3), ...(Number.isFinite(r.vs) ? { vs_similar: round(r.vs, 2) } : {}) });
  let drop = null;
  for (let i = 1; i < marks.length; i++) {
    const lost = marks[i - 1].watching - marks[i].watching;
    if (!drop || lost > drop.lost) drop = { lost, from: marks[i - 1], to: marks[i] };
  }
  return {
    points: marks.map(point),
    ...(drop && drop.lost > 0 ? { steepest_drop: { from_percent: Math.round(drop.from.at * 100), to_percent: Math.round(drop.to.at * 100), ...(when(drop.from.at) ? { from: when(drop.from.at), to: when(drop.to.at) } : {}), lost: round(drop.lost, 3) } } : {}),
    ...(detail ? { all: rows.map(point) } : {}),
  };
}

/** One video: totals, the retention curve, where its viewers came from, what they searched. Four reports. */
export async function videoReport({ ask, video, range, detail }) {
  const f = `video==${video.id}`;
  const base = { startDate: range.startDate, endDate: range.endDate };
  const totals = await ask({ ...base, metrics: TOTALS, filters: f });
  const curve = await ask({ ...base, metrics: 'audienceWatchRatio,relativeRetentionPerformance', dimensions: 'elapsedVideoTimeRatio', filters: f });
  const sources = await ask({ ...base, metrics: 'views,estimatedMinutesWatched', dimensions: 'insightTrafficSourceType', filters: f, sort: '-views' });
  const terms = await ask({ ...base, metrics: 'views', dimensions: 'insightTrafficSourceDetail', filters: `${f};insightTrafficSourceType==YT_SEARCH`, sort: '-views', maxResults: TERMS_MAX });
  const retention = retentionSummary(curve, video.durationSec, detail);
  return {
    video_id: video.id, ...(video.key ? { key: video.key } : {}), title: video.title,
    ...(Number.isFinite(video.durationSec) ? { length: clock(video.durationSec) } : {}),
    dates: `${range.startDate} to ${range.endDate} (Pacific, ${range.days} days)`,
    ...totalsOf(totals),
    retention: retention ?? 'YouTube has no retention curve for these dates yet (it needs more views).',
    traffic_sources: sourcesOf(sources),
    search_terms: rowsOf(terms).map((r) => ({ term: r.insightTrafficSourceDetail, views: Number(r.views ?? 0) })),
  };
}

/** The channel: totals, its videos by watch time (each named by its manifest key when it has one), where viewers came from. */
export async function channelReport({ ask, lookup, range, limit }) {
  const n = limit === undefined ? 25 : Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > TOP_MAX) throw new Error(`limit is a whole number from 1 to ${TOP_MAX} (the API's own cap on a top-videos report).`);
  const base = { startDate: range.startDate, endDate: range.endDate };
  const totals = await ask({ ...base, metrics: TOTALS });
  const top = rowsOf(await ask({ ...base, metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage', dimensions: 'video', sort: '-estimatedMinutesWatched', maxResults: n }));
  const sources = await ask({ ...base, metrics: 'views,estimatedMinutesWatched', dimensions: 'insightTrafficSourceType', sort: '-views' });
  const names = await lookup(top.map((r) => r.video));
  return {
    dates: `${range.startDate} to ${range.endDate} (Pacific, ${range.days} days)`,
    ...totalsOf(totals),
    videos: top.map((r) => ({
      video_id: r.video, ...(names.get(r.video)?.key ? { key: names.get(r.video).key } : {}), title: names.get(r.video)?.title ?? '',
      views: Number(r.views ?? 0), watch_minutes: round(r.estimatedMinutesWatched),
      average_view: clock(Number(r.averageViewDuration ?? 0)), average_percent_watched: round(r.averageViewPercentage),
    })),
    traffic_sources: sourcesOf(sources),
  };
}
