/**
 * Analytics, for `npm run youtube` (PLAN 44i-2d). A module of scripts/youtube.mjs,
 * which is past 40 KB, so this part lives beside it, as youtubeText.mjs and
 * youtubeShorts.mjs do.
 *
 * The stand-in Google here answers the YouTube Analytics API's reports endpoint
 * the way the API's own tables say it does (read 2026-11-28): only the
 * combinations this server sends are supported, and any other (a retention
 * curve without one video, search terms without the YouTube-search filter or
 * past 25, top videos without a sort or past 200) is refused 400 as the API
 * refuses it, so a server that sent a report YouTube would refuse fails here.
 * It refuses a key without the analytics scope as Google does (403,
 * insufficientPermissions), and the scope a key carries is what the sign-in
 * asked for less what the person unticked on the consent page, so the scope
 * lines are judged by what Google was asked and granted, not by what the
 * server says. Every number the server reports is one the stand-in made up
 * for this run, so a reply that matches came through the report.
 *
 * What it holds:
 *  - before `login --add analytics` the tool is refused with that command and
 *    no report is asked for; a key with no scope list is tried, and Google's
 *    403 is read as the same words.
 *  - `login --add analytics` asks for both scopes, with include_granted_scopes;
 *    a later plain `login` asks for analytics again; an unticked analytics
 *    ends the login with a failure and the tool still refused; an unknown
 *    `--add` stops before Google is asked.
 *  - a video's report: four reports, each `channel==MINE` and the video's
 *    filter, totals as the stand-in's, the retention at each tenth as clock
 *    times from the video's length, the steepest drop where the curve falls
 *    most, traffic sources in Studio's words with their shares, search terms.
 *  - the channel's: its videos in the API's order, named by manifest key and,
 *    off the manifest, by their YouTube title; a limit past 200 refused with
 *    nothing asked.
 *  - dates are Pacific (the clock is set where UTC is already tomorrow), 28
 *    days counted inclusive by default, `days` the same, a start after the end
 *    and an end after today refused.
 *  - a video with too few views for a curve says so; the API turned off in the
 *    project names the console page that turns it on.
 *  - `setup` says whether analytics is on.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const AN = 'https://www.googleapis.com/auth/yt-analytics.readonly';
const YT = 'https://www.googleapis.com/auth/youtube';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(50); } return false; };

/* The channel this run makes up: three films, each with its own numbers. */
const STATS = {
  vidA: { views: 1234, estimatedMinutesWatched: 2056.7, averageViewDuration: 100, averageViewPercentage: 50.04, likes: 61, comments: 7, shares: 9, subscribersGained: 4 },
  vidB: { views: 410, estimatedMinutesWatched: 3001.2, averageViewDuration: 439, averageViewPercentage: 71.3, likes: 30, comments: 2, shares: 1, subscribersGained: 6 },
  vidC: { views: 3, estimatedMinutesWatched: 1.5, averageViewDuration: 30, averageViewPercentage: 25, likes: 0, comments: 0, shares: 0, subscribersGained: 0 },
};
/* Fifty-five more films off the manifest, so the channel's titles must be asked for fifty at a time (YouTube's cap on videos.list). */
const EXTRA = Array.from({ length: 55 }, (_, i) => `vidX${String(i).padStart(2, '0')}`);
for (const id of EXTRA) STATS[id] = { views: 0, estimatedMinutesWatched: 1, averageViewDuration: 10, averageViewPercentage: 5, likes: 0, comments: 0, shares: 0, subscribersGained: 0 };
/* The metrics each report takes (the API's channel-report tables); any other name is refused 400, as the API refuses an unknown identifier. */
const METRICS = {
  '': ['views', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage', 'likes', 'dislikes', 'comments', 'shares', 'subscribersGained', 'subscribersLost'],
  elapsedVideoTimeRatio: ['audienceWatchRatio', 'relativeRetentionPerformance'],
  insightTrafficSourceType: ['views', 'estimatedMinutesWatched'],
  insightTrafficSourceDetail: ['views', 'estimatedMinutesWatched'],
  video: ['views', 'estimatedMinutesWatched', 'averageViewDuration', 'averageViewPercentage', 'likes', 'comments', 'shares', 'subscribersGained'],
};
/* vidA's curve: 100 points, a slow slide except a fall of 0.35 between 20% and 30% of the film (0:40 to 1:00 of its 3:20). */
const CURVE_A = Array.from({ length: 100 }, (_, i) => {
  const at = (i + 1) / 100;
  const w = at <= 0.2 ? 1.05 - at * 0.5 : at <= 0.3 ? 0.95 - (at - 0.2) * 3.5 : 0.6 - (at - 0.3) * 0.2;
  return [Number(at.toFixed(2)), Number(w.toFixed(4)), Number((0.3 + at * 0.4).toFixed(3))];
});
/* Kept out of order: the API sorts only when asked, so a reply in views order shows the server asked. */
const SOURCES_A = [['EXT_URL', 234, 356.1], ['RELATED_VIDEO', 700, 1200.5], ['YT_SEARCH', 300, 500.1]];
const TERMS_A = [['oil projector', 80], ['liquid light show', 120]];

export function analyticsRoutes(g, req, res, p, q, { json, err }) {
  if (p !== '/youtubeanalytics/v2/reports') return false;
  g.an ??= { tried: 0, reports: [], disabled: false };
  g.an.tried++;
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (g.an.disabled) { json(res, 403, { error: { code: 403, message: 'YouTube Analytics API has not been used in project 1 before or it is disabled.', errors: [{ reason: 'accessNotConfigured' }], status: 'PERMISSION_DENIED' } }); return true; }
  if (!(g.scopeOf.get(bearer) ?? '').split(' ').includes(AN)) { json(res, 403, { error: { code: 403, message: 'Request had insufficient authentication scopes.', errors: [{ reason: 'insufficientPermissions' }], status: 'PERMISSION_DENIED' } }); return true; }
  const a = Object.fromEntries(q);
  g.an.reports.push({ ...a, method: req.method });
  const bad = (m) => { err(res, 400, 'badRequest', m); return true; };
  if (req.method !== 'GET' || a.ids !== 'channel==MINE') return bad('ids');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.startDate ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(a.endDate ?? '') || a.startDate > a.endDate) return bad('dates');
  const filters = (a.filters ?? '').split(';').filter(Boolean);
  const vf = filters.find((f) => f.startsWith('video=='));
  const vid = vf?.slice(7);
  if (vid?.includes(',')) return bad('one video');
  const metrics = (a.metrics ?? '').split(',');
  const unknown = metrics.filter((m) => !(METRICS[a.dimensions ?? ''] ?? []).includes(m));
  if (unknown.length) return bad(`Unknown identifier (${unknown.join(',')}) given in field parameters.metrics.`);
  const headers = (dims) => [...dims, ...metrics].map((name) => ({ name }));
  const answer = (dims, rows) => {
    // Sorted only when asked, by the named column, '-' for descending; an unknown column is refused.
    if (a.sort) {
      const desc = a.sort.startsWith('-'); const col = [...dims, ...metrics].indexOf(a.sort.replace(/^-/, ''));
      if (col < 0) return bad(`Unknown sort ${a.sort}`);
      rows = rows.slice().sort((x, y) => (desc ? y[col] - x[col] : x[col] - y[col]));
    }
    if (a.maxResults) rows = rows.slice(0, Number(a.maxResults));
    json(res, 200, { kind: 'youtubeAnalytics#resultTable', columnHeaders: headers(dims), rows });
    return true;
  };
  const pick = (o) => metrics.map((m) => o[m] ?? 0);
  const dim = a.dimensions ?? '';
  if (!dim) {
    if (filters.length > (vf ? 1 : 0)) return bad('filters');
    const st = vid ? STATS[vid] : Object.values(STATS).reduce((s, x) => Object.fromEntries(Object.keys(x).map((k) => [k, (s[k] ?? 0) + x[k]])), {});
    return answer([], st ? [pick(st)] : []);
  }
  if (dim === 'elapsedVideoTimeRatio') {
    if (!vid || filters.length !== 1) return bad('The query is not supported: a retention curve needs exactly one video');
    return answer(['elapsedVideoTimeRatio'], vid === 'vidA' ? CURVE_A.map(([at, w, r]) => [at, ...metrics.map((m) => (m === 'audienceWatchRatio' ? w : r))]) : []);
  }
  if (dim === 'insightTrafficSourceType') {
    const rows = (vid === 'vidA' || !vid ? SOURCES_A : []).map(([t, v, mins]) => [t, ...metrics.map((m) => (m === 'views' ? v : mins))]);
    return answer(['insightTrafficSourceType'], rows);
  }
  if (dim === 'insightTrafficSourceDetail') {
    if (!filters.includes('insightTrafficSourceType==YT_SEARCH') || !a.sort?.startsWith('-') || !(Number(a.maxResults) <= 25)) return bad('The query is not supported: traffic source detail needs a source filter, a sort and at most 25');
    return answer(['insightTrafficSourceDetail'], vid === 'vidA' ? TERMS_A.map(([t, v]) => [t, v]) : []);
  }
  if (dim === 'video') {
    if (a.sort !== '-estimatedMinutesWatched' || !(Number(a.maxResults) <= 200) || vf) return bad('The query is not supported: top videos need a descending sort and at most 200');
    return answer(['video'], Object.entries(STATS).map(([id, st]) => [id, ...pick(st)]));
  }
  return bad('The query is not supported.');
}

export async function analyticsScenario({ server, start, env, conf, dir, g, line, logs }) {
  g.an ??= { tried: 0, reports: [], disabled: false };
  const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; } };
  const aconf = join(dir, 'conf-analytics');
  mkdirSync(aconf, { recursive: true, mode: 0o700 });
  for (const f of ['client_secret.json', 'token.json']) writeFileSync(join(aconf, f), readFileSync(join(conf, f)));
  writeFileSync(join(aconf, 'settings.json'), JSON.stringify({ timeZone: 'America/Los_Angeles', categoryId: '10' }));
  writeFileSync(join(aconf, 'manifest.json'), JSON.stringify({ syncedAt: null, videos: [
    { videoId: 'vidA', key: 'night-sea', title: 'Night Sea (manifest)', status: 'ok' },
    { videoId: 'vidB', key: 'lava-pop', title: 'Lava Pop', status: 'ok' },
    { videoId: 'vidOld', key: 'old-cut', title: 'Old', status: 'replaced' },
  ] }, null, 2));
  const film = (id, title, duration) => g.videos.set(id, { id, snippet: { title, channelId: 'UC1' }, status: { privacyStatus: 'public' }, statistics: { viewCount: '0', likeCount: '0' }, contentDetails: { duration } });
  film('vidA', 'Night Sea', 'PT3M20S'); film('vidB', 'Lava Pop', 'PT10M'); film('vidC', 'Off The List', 'PT2M');
  for (const id of EXTRA) film(id, `Extra ${id.slice(4)}`, 'PT1M');
  // A public film of another channel, which videos.list would return all the same.
  g.videos.set('vidZ', { id: 'vidZ', snippet: { title: 'Not Ours', channelId: 'UC2' }, status: { privacyStatus: 'public' }, statistics: {}, contentDetails: { duration: 'PT1M' } });
  // 06:00 UTC on 11-28 is 22:00 on 11-27 in Los Angeles: a server that counts days in UTC asks for the 28th.
  const aenv = { ...env, CHROMAGLASS_YOUTUBE_DIR: aconf, CHROMAGLASS_YOUTUBE_NOW: '2026-11-28T06:00:00Z' };
  const token = () => readJson(join(aconf, 'token.json'));
  const scopesAsked = () => (g.authAsked?.scope ?? '').split(' ');

  /* A login played as the browser would: open Google's page, follow it back, wait for the exit. */
  const loginWith = async (args) => {
    const authsBefore = g.auths;
    const lg = start(server, aenv, ['login', ...args]);
    logs.push(lg.out);
    let url = null; let gone = false;
    lg.exited.then(() => { gone = true; });
    await until(() => { url = /(http:\/\/127\.0\.0\.1:\d+\/auth\?\S+)/.exec(lg.out.stderr)?.[1]; return url || gone; }, 4000);
    if (url) {
      const r = await fetch(url, { redirect: 'manual' }).catch(() => null);
      const back = r?.headers.get('location');
      if (back) await fetch(back).catch(() => null);
    }
    const code = await Promise.race([lg.exited, sleep(6000).then(() => 'running')]);
    if (code === 'running') await lg.kill();
    return { code, asked: g.auths > authsBefore, stderr: lg.out.stderr };
  };

  const s1 = start(server, aenv);
  logs.push(s1.out);
  await s1.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });
  const tried0 = g.an.tried;
  const off = await s1.tool('analytics', { key: 'night-sea' });
  line('analyticsOff', 'before login --add analytics, analytics is refused with that command and no report is asked for',
    off.error && /login --add analytics/.test(off.text) && /youtubeanalytics\.googleapis\.com/.test(off.text) && g.an.tried === tried0, `${off.text.slice(0, 120)}; reports tried ${g.an.tried - tried0}`);
  s1.child.stdin.end();
  await Promise.race([s1.exited, sleep(3000)]);

  // A key saved with no scope list is tried, and Google's 403 is read as the same words.
  const plain = token();
  const { scope: _drop, ...noList } = plain;
  writeFileSync(join(aconf, 'token.json'), JSON.stringify(noList));
  const s0 = start(server, aenv);
  logs.push(s0.out);
  await s0.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });
  const tried1 = g.an.tried;
  const fromGoogle = await s0.tool('analytics', {});
  line('scopeFromGoogle', "a key that keeps no scope list is tried, and Google's insufficient-scope 403 is answered with login --add analytics",
    fromGoogle.error && g.an.tried > tried1 && /login --add analytics/.test(fromGoogle.text), `${fromGoogle.text.slice(0, 120)}; tried ${g.an.tried - tried1}`);
  s0.child.stdin.end();
  await Promise.race([s0.exited, sleep(3000)]);
  const suN = start(server, aenv, ['setup']); logs.push(suN.out);
  await Promise.race([suN.exited, sleep(8000)]);
  const setupNoList = /ok\s+Analytics: this sign-in keeps no scope list/.test(suN.out.all);
  writeFileSync(join(aconf, 'token.json'), JSON.stringify(plain));

  // setup before: an opt-in, so not a TODO, and off.
  const su0 = start(server, aenv, ['setup']); logs.push(su0.out);
  await Promise.race([su0.exited, sleep(8000)]);
  const setupOff = /ok\s+Analytics: optional, off: .*login --add analytics/.test(su0.out.all);

  // An unknown opt-in stops before Google is asked.
  const unknown = await loginWith(['--add', 'everything']);
  line('addName', 'login --add with a name it does not know exits with the names it takes and never opens Google',
    unknown.code !== 0 && unknown.code !== 'running' && !unknown.asked && /takes analytics/.test(unknown.stderr), `exit ${unknown.code}, asked ${unknown.asked}`);

  // The person unticks analytics on Google's page: the login fails, the tool still refuses.
  g.untick.add(AN);
  const unt = await loginWith(['--add', 'analytics']);
  g.untick.clear();
  const s2 = start(server, aenv); logs.push(s2.out);
  await s2.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });
  const tried2 = g.an.tried;
  const stillOff = await s2.tool('analytics', {});
  s2.child.stdin.end();
  await Promise.race([s2.exited, sleep(3000)]);
  line('untick', 'analytics unticked on the consent page ends login --add analytics with a failure that says so, and the tool is still refused without a report',
    unt.asked && unt.code === 1 && /Not granted on Google's page: analytics/.test(unt.stderr) && !String(token().scope ?? '').includes(AN) && stillOff.error && /login --add analytics/.test(stillOff.text) && g.an.tried === tried2,
    `exit ${unt.code}, saved scope ${token().scope}, tool ${stillOff.text.slice(0, 60)}`);

  // Granted: both scopes asked for, the key keeps it.
  const add = await loginWith(['--add', 'analytics']);
  line('addScope', 'login --add analytics asks Google for the upload scope and the analytics scope together (include_granted_scopes) and the saved key lists both',
    add.code === 0 && scopesAsked().includes(YT) && scopesAsked().includes(AN) && g.authAsked?.include_granted_scopes === 'true' && String(token().scope).split(' ').includes(AN),
    `exit ${add.code}, asked ${g.authAsked?.scope}, saved ${token().scope}`);
  const again = await loginWith([]);
  line('keepScope', 'a plain login after that asks for analytics again, so signing in again never drops it',
    again.code === 0 && scopesAsked().includes(AN) && String(token().scope).split(' ').includes(AN), `asked ${g.authAsked?.scope}`);

  const su1 = start(server, aenv, ['setup']); logs.push(su1.out);
  await Promise.race([su1.exited, sleep(8000)]);
  line('setupAnalytics', 'setup says analytics is an optional step that is off, unknown for a key that keeps no scope list, then on once added',
    setupOff && setupNoList && /ok\s+Analytics: on/.test(su1.out.all), `before ${setupOff}, no list ${setupNoList}, after ${/Analytics: [^\n]*/.exec(su1.out.all)?.[0]}`);

  const s = start(server, aenv); logs.push(s.out);
  await s.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });

  // One video, named by its manifest key.
  const n0 = g.an.reports.length;
  const v = await s.tool('analytics', { key: 'night-sea' });
  const sent = g.an.reports.slice(n0);
  const r = v.v ?? {};
  const pts = Array.isArray(r.retention?.points) ? r.retention.points : [];
  line('videoReport', "a video's report is four reports, each for this channel and this video, and its totals, sources and search terms are the stand-in's",
    !v.error && sent.length === 4 && sent.every((q) => q.ids === 'channel==MINE' && q.filters?.split(';')[0] === 'video==vidA')
      && r.video_id === 'vidA' && r.key === 'night-sea' && r.title === 'Night Sea' && r.length === '3:20'
      && r.views === 1234 && r.watch_minutes === 2056.7 && r.average_view === '1:40' && r.average_percent_watched === 50 && r.likes === 61 && r.comments === 7 && r.shares === 9 && r.subscribers_gained === 4
      && r.traffic_sources?.[0]?.source === 'Suggested videos' && r.traffic_sources?.[1]?.source === 'YouTube search' && r.traffic_sources?.[0]?.share_percent === 56.7
      && r.search_terms?.[0]?.term === 'liquid light show' && r.search_terms?.[1]?.views === 80 && sent[3]?.sort === '-views',
    `${v.error ? v.text.slice(0, 160) : JSON.stringify({ n: sent.length, views: r.views, wm: r.watch_minutes, av: r.average_view, src: r.traffic_sources?.[0], len: r.length })}`);
  line('retention', 'retention is eleven points, start and each tenth, at clock times from the film\'s length, and the steepest drop is where the curve falls (20% to 30%, 0:40 to 1:00)',
    pts.length === 11 && pts[0].percent === 1 && pts[10].percent === 100 && pts[2].at === '0:40' && pts[5].at === '1:40' && pts[2].watching === 0.95 && pts[0].vs_similar === 0.3 && pts[10].vs_similar === 0.7
      && r.retention?.steepest_drop?.from_percent === 20 && r.retention?.steepest_drop?.to_percent === 30 && r.retention?.steepest_drop?.from === '0:40' && r.retention?.steepest_drop?.lost === 0.35,
    JSON.stringify(r.retention ?? null).slice(0, 220));
  line('pacificDates', 'the default range is the 28 days ending today in Pacific time (the 27th when UTC is already the 28th)',
    sent.every((q) => q.startDate === '2026-10-31' && q.endDate === '2026-11-27') && /2026-10-31 to 2026-11-27 \(Pacific, 28 days\)/.test(r.dates ?? ''), `${sent[0]?.startDate} to ${sent[0]?.endDate}`);

  const n1 = g.an.reports.length;
  const week = await s.tool('analytics', { video_id: 'vidB', days: 7 });
  const backwards = await s.tool('analytics', { start: '2026-11-20', end: '2026-11-10' });
  const future = await s.tool('analytics', { end: '2026-11-28' });
  const badDate = await s.tool('analytics', { start: '2026-02-30' });
  line('dateRange', '7 days ends today and starts six days back; a start after the end, an end after today (Pacific) and a date that is not one are refused before any report',
    !week.error && g.an.reports[n1]?.startDate === '2026-11-21' && g.an.reports[n1]?.endDate === '2026-11-27'
      && backwards.error && /after end/.test(backwards.text) && future.error && /after today/.test(future.text) && badDate.error && /YYYY-MM-DD/.test(badDate.text)
      && g.an.reports.length === n1 + 4,
    `${g.an.reports[n1]?.startDate}..${g.an.reports[n1]?.endDate}; ${backwards.text.slice(0, 40)} | ${future.text.slice(0, 40)} | sent ${g.an.reports.length - n1}`);

  // A film with too few views: no curve, said in words.
  const thin = await s.tool('analytics', { video_id: 'vidC' });
  line('noCurve', 'a video YouTube has no curve for yet says so in words, with its totals, rather than failing',
    !thin.error && typeof thin.v?.retention === 'string' && /no retention curve/.test(thin.v.retention) && thin.v?.views === 3, thin.text.slice(0, 160));

  const n1b = g.an.reports.length;
  const full = await s.tool('analytics', { video_id: 'vidA', detail: true });
  line('detail', 'detail gives all 100 retention points, the last at 100%', !full.error && full.v?.retention?.all?.length === 100 && full.v.retention.all[99].percent === 100 && full.v.retention.all[99].at === '3:20', `${full.v?.retention?.all?.length} points`);
  const nBoth = g.an.reports.length;
  const both1 = await s.tool('analytics', { start: '2026-11-01', days: 3 });
  const both2 = await s.tool('analytics', { video_id: 'vidA', key: 'night-sea' });
  line('oneOf', 'start with days, or video_id with key, is refused before any report', both1.error && /start or days, not both/.test(both1.text) && both2.error && /video_id or key, not both/.test(both2.text) && g.an.reports.length === nBoth, `${both1.text.slice(0, 50)} | ${both2.text.slice(0, 50)}`);
  const notOurs = await s.tool('analytics', { video_id: 'vidZ' });
  line('ownChannel', "another channel's public film is refused as not on this channel, before any report", notOurs.error && /No video vidZ on this channel/.test(notOurs.text) && g.an.reports.length === nBoth, notOurs.text.slice(0, 100));
  void n1b;

  // The channel: videos in the API's order, named by key, or by YouTube's title off the manifest.
  const n2 = g.an.reports.length;
  const ch = await s.tool('analytics', {});
  const top = g.an.reports.slice(n2).find((q) => q.dimensions === 'video');
  const vids = ch.v?.videos ?? [];
  line('channelTop', "the channel's report lists its videos by watch time as the API sorts them, each by manifest key and title, or by YouTube's title off the manifest, 25 asked for by default",
    !ch.error && top?.maxResults === '25' && vids.length === 25 && vids.slice(0, 3).map((x) => x.video_id).join() === 'vidB,vidA,vidC'
      && g.an.reports.slice(n2).every((q) => q.startDate === '2026-10-31' && q.endDate === '2026-11-27') && /2026-10-31 to 2026-11-27/.test(ch.v?.dates ?? '')
      && ch.v?.traffic_sources?.[0]?.source === 'Suggested videos' && ch.v?.traffic_sources?.length === 3
      && vids[1].key === 'night-sea' && vids[1].title === 'Night Sea (manifest)' && vids[2].title === 'Off The List' && !vids[2].key && vids[0].average_view === '7:19' && ch.v?.views === 1647,
    ch.text.slice(0, 200));
  const many = await s.tool('analytics', { limit: 200 });
  const mv = many.v?.videos ?? [];
  line('channelTitles', "with 58 videos, 55 off the manifest, every one is titled from YouTube, asked fifty at a time (YouTube's cap)",
    !many.error && mv.length === 58 && mv.filter((x) => /^Extra \d\d$/.test(x.title)).length === 55, many.error ? many.text.slice(0, 120) : `${mv.length} videos, ${mv.filter((x) => x.title).length} titled`);
  const n3 = g.an.tried;
  const over = await s.tool('analytics', { limit: 201 });
  line('topLimit', 'a limit past 200 (the API\'s cap on a top-videos report) is refused with nothing asked', over.error && /1 to 200/.test(over.text) && g.an.tried === n3, over.text.slice(0, 100));

  // The API not turned on in the project.
  g.an.disabled = true;
  const disabled = await s.tool('analytics', {});
  g.an.disabled = false;
  line('apiDisabled', 'the Analytics API turned off in the project names the console page that turns it on', disabled.error && /Turn on "YouTube Analytics API"/.test(disabled.text) && /apis\/library\/youtubeanalytics/.test(disabled.text), disabled.text.slice(0, 140));

  // A replaced video's key is not read as the live one.
  const old = await s.tool('analytics', { key: 'old-cut' });
  line('liveKey', 'a key held only by a replaced video is refused, not read as that video', old.error && /No live video with key "old-cut"/.test(old.text), old.text.slice(0, 100));

  s.child.stdin.end();
  await Promise.race([s.exited, sleep(3000)]);
  // Summer: 07:30 UTC on 07-15 is 00:30 that day in Los Angeles (UTC-7); a fixed UTC-8 says the 14th.
  const sj = start(server, { ...aenv, CHROMAGLASS_YOUTUBE_NOW: '2026-07-15T07:30:00Z' }); logs.push(sj.out);
  await sj.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });
  const nJ = g.an.reports.length;
  const july = await sj.tool('analytics', { days: 1 });
  line('pacificDates', 'in summer the day is Pacific daylight time (00:30 on 07-15 in Los Angeles is the 15th)', !july.error && g.an.reports[nJ]?.endDate === '2026-07-15' && g.an.reports[nJ]?.startDate === '2026-07-15', `${g.an.reports[nJ]?.startDate}..${g.an.reports[nJ]?.endDate}`);
  sj.child.stdin.end();
  await Promise.race([sj.exited, sleep(3000)]);

  line('readOnly', 'every analytics request is a GET', g.an.reports.length > 0 && g.an.reports.every((q) => q.method === 'GET'), `${g.an.reports.length} reports`);
}

/* Each rule taken out of a copy of the server; each must fail its own line. */
export const ANALYTICS_MUTANTS = [
  { rule: 'analyticsOff', find: 'if (granted(loadToken(), ANALYTICS_SCOPE) === false) throw', replace: 'if (false) throw' },
  { rule: 'scopeFromGoogle', in: 'youtube/analytics.js', find: '/insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i', replace: '/never-said/' },
  { rule: 'addName', in: 'youtube/analytics.js', find: 'if (unknown.length) throw', replace: 'if (false) throw' },
  { rule: 'untick', find: 'if (missing.some((n) => add.includes(n))) process.exitCode = 1;', replace: '' },
  { rule: 'addScope', find: "scope: scopes.join(' '), include_granted_scopes: 'true',", replace: 'scope: SCOPE,' },
  { rule: 'keepScope', in: 'youtube/analytics.js', find: 'return [...new Set([base, ...saved, ', replace: 'return [...new Set([base, ' },
  { rule: 'setupAnalytics', in: 'youtube/setup.js', find: "detail: on ? 'on (watch time", replace: "detail: !on ? 'on (watch time" },
  { rule: 'videoReport', in: 'youtube/analytics.js', find: 'const totals = await ask({ ...base, metrics: TOTALS, filters: f });', replace: 'const totals = await ask({ ...base, metrics: TOTALS });' },
  { rule: 'videoReport', in: 'youtube/analytics.js', find: 'source: SOURCE_NAMES[r.insightTrafficSourceType] ?? r.insightTrafficSourceType,', replace: 'source: r.insightTrafficSourceType,', as: 'sourceNames' },
  { rule: 'retention', in: 'youtube/analytics.js', find: 'if (!drop || lost > drop.lost)', replace: 'if (!drop || lost < drop.lost)' },
  { rule: 'retention', in: 'youtube/analytics.js', find: 'clock(ratio * durationSec)', replace: 'clock(ratio * 100)', as: 'retentionClock' },
  { rule: 'pacificDates', in: 'youtube/analytics.js', find: 'const today = ymd(zoneParts(now, QUOTA_ZONE));', replace: "const today = ymd(zoneParts(now, 'UTC'));" },
  { rule: 'dateRange', in: 'youtube/analytics.js', find: 'startMs = endMs - (days - 1) * DAY_MS;', replace: 'startMs = endMs - days * DAY_MS;' },
  { rule: 'dateRange', in: 'youtube/analytics.js', find: 'if (endMs > todayMs) throw', replace: 'if (false) throw', as: 'endFuture' },
  { rule: 'noCurve', in: 'youtube/analytics.js', find: 'if (!rows.length) return null;', replace: '' },
  { rule: 'channelTop', find: 'const names = new Map(m.videos.filter((e) => ids.includes(e.videoId)).map((e) => [e.videoId, { key: e.key, title: e.title }]));', replace: 'const names = new Map();' },
  { rule: 'topLimit', in: 'youtube/analytics.js', find: 'n > TOP_MAX) throw', replace: 'n > 1e9) throw' },
  { rule: 'apiDisabled', in: 'youtube/analytics.js', find: '/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i', replace: '/never-said/' },
  { rule: 'videoReport', in: 'youtube/analytics.js', find: 'likes,comments,shares,subscribersGained', replace: 'likes,commments,sharez,subscribersGained', as: 'metricNames' },
  { rule: 'videoReport', in: 'youtube/analytics.js', find: "dimensions: 'insightTrafficSourceType', filters: f, sort: '-views' });", replace: "dimensions: 'insightTrafficSourceType', filters: f });", as: 'sourceSort' },
  { rule: 'retention', in: 'youtube/analytics.js', find: "metrics: 'audienceWatchRatio,relativeRetentionPerformance'", replace: "metrics: 'audienceWatchRatio'", as: 'vsSimilar' },
  { rule: 'detail', in: 'youtube/analytics.js', find: '...(detail ? { all: rows.map(point) } : {}),', replace: '' },
  { rule: 'oneOf', in: 'youtube/analytics.js', find: "if (a.days !== undefined) throw new Error('Pass start or days, not both.');", replace: '' },
  { rule: 'oneOf', find: "if (id) throw new Error('Pass video_id or key, not both.');", replace: '', as: 'keyAndId' },
  { rule: 'ownChannel', find: 'if (!v || v.snippet?.channelId !== (await channel()).id) throw', replace: 'if (!v) throw' },
  { rule: 'channelTop', in: 'youtube/analytics.js', find: "const sources = await ask({ ...base, metrics: 'views,estimatedMinutesWatched', dimensions: 'insightTrafficSourceType', sort: '-views' });\n  const names", replace: "const sources = { rows: [] };\n  const names", as: 'channelSources' },
  { rule: 'channelTop', in: 'youtube/analytics.js', find: 'const totals = await ask({ ...base, metrics: TOTALS });', replace: "const totals = await ask({ ...base, startDate: '2005-02-14', metrics: TOTALS });", as: 'channelDates' },
  { rule: 'channelTitles', find: 'for (let i = 0; i < rest.length; i += 50) for (const v of await videos(rest.slice(i, i + 50)))', replace: 'for (const v of await videos(rest))' },
  { rule: 'pacificDates', in: 'youtube/analytics.js', find: 'const today = ymd(zoneParts(now, QUOTA_ZONE));', replace: "const today = ymd(zoneParts(now, 'Etc/GMT+8'));", as: 'fixedOffset' },
  { rule: 'setupAnalytics', in: 'youtube/setup.js', find: "on === false ? `optional, off", replace: "on !== true ? `optional, off", as: 'setupNoList' },
  { rule: 'liveKey', find: "v.key === String(a.key) && v.status !== 'replaced' && v.status !== 'removed'", replace: 'v.key === String(a.key)' },
];
