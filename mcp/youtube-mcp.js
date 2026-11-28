#!/usr/bin/env node
/**
 * The owner's YouTube channel, from the assistant (PLAN 44i).
 *
 * What was asked. The owner's music films went up by hand, a person driving a
 * browser through YouTube Studio one field at a time, six times over, and the
 * owner asked (2026-11-08) for a connector of our own so the next uploads need
 * nobody at the browser. No connector in Claude's directory uploads to
 * YouTube: the ones there read (search, transcripts, statistics). So this is a
 * second Model Context Protocol server beside the show's (`chromaglass-mcp.js`),
 * run the same way by a local assistant on the owner's Mac, over stdio.
 *
 * Why a second server and not more tools on the show's. The show's server is
 * a live link into a running show, dormant unless the owner's switch is on, and
 * every one of its rules is the show server's guard; none of that has anything
 * to do with a channel. This one needs no show running, has its own sign-in,
 * and fails on its own: a Google outage never touches the show's link and a
 * closed show never stops an upload. Two small servers in one folder, each
 * with one job, also keep the assistant's tool list honest about which is which.
 * It imports nothing from the repo but its own folder (`youtube/`), so the two
 * lift into a repository of their own: the owner decided 2026-11-28 to
 * publish them as `sendreel` (44i-2), and 44i-2a took out what only held on
 * the owner's Mac (the scheduler, the notifier, the folder, Pacific time).
 *
 * The YouTube Data API v3, signed in with OAuth as a desktop app: the user
 * makes a Google Cloud project once and saves its client file in the folder
 * `youtube/settings.js` names (`~/.config/sendreel/youtube`, the owner's old
 * `~/.chromaglass/youtube/`, or `SENDREEL_DIR`), and `login` below
 * opens Google's consent page and keeps the refresh key there, readable by the
 * owner alone. Nothing secret is ever in the repository, in a reply to the
 * assistant, or in the log: the assistant drives the channel without ever
 * seeing a key, so nothing it writes anywhere can leak one.
 *
 * Uploads are YouTube's resumable protocol in chunks, and resume across
 * everything that ends them in practice: a dropped connection (back off, ask
 * Google where it stopped, carry on from there), an expired access key
 * (refreshed and retried), and the assistant's app closing mid-upload (the
 * session is saved in `uploads.json`, and asking again for the same file picks
 * it up rather than starting a second copy). The films are hundreds of
 * megabytes on a home connection, so all three happen.
 *
 * Checked against the API's own pages 2026-11-08: since 2026-11-02 an upload
 * from an unverified project is no longer locked private, and an upload that
 * names no privacy now goes up PUBLIC. So this server always names one, and it
 * is private unless the assistant passes another; the guide tells it to do
 * that only when the owner said so. An upload costs 1 unit of its own bucket
 * (100 a day); the rest share 10,000 units a day, and an update is 50.
 * Deleting a video is left out on purpose: it cannot be undone, and Studio is
 * one click.
 *
 * No packages, like the show's server: newline-delimited JSON-RPC on stdin and
 * stdout, Node's own fetch and http. Nothing but protocol goes to stdout; the
 * log goes to stderr.
 *
 *   node mcp/youtube-mcp.js setup             which setup step is done, and the fix for the first that is not
 *   node mcp/youtube-mcp.js login             sign in once (opens the browser)
 *   node mcp/youtube-mcp.js login --add analytics   also ask for the read-only analytics scope (44i-2d)
 *   node mcp/youtube-mcp.js whoami            which channel the saved sign-in is
 *   node mcp/youtube-mcp.js logout            revoke the sign-in and forget it
 *   node mcp/youtube-mcp.js drain             upload queued jobs whose wait has passed
 *   node mcp/youtube-mcp.js install-agent     install the hourly drain (LaunchAgent, systemd timer or Task Scheduler)
 *   node mcp/youtube-mcp.js uninstall-agent   remove it
 *   node mcp/youtube-mcp.js manifest [--sync] [--md <file>]  show or export the channel manifest
 *   node mcp/youtube-mcp.js                   the MCP server (what the assistant runs)
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { ANALYTICS_OFF, ANALYTICS_SCOPE, analyticsFix, channelReport, granted, OPT_IN, parseRange, scopesFor, videoReport } from './youtube/analytics.js';
import { CAPTION, CAPTION_UNITS, captionRequest, readCaptionFile } from './youtube/captions.js';
import { checkTitle, composeDescription, composeLocalizations, creditsLine, isoSeconds, parseChapters, validLanguage } from './youtube/describe.js';
import { filmsIn, titleFromName } from './youtube/folder.js';
import { notifyCommand, schedulePlan } from './youtube/platform.js';
import { bindManifest, formatManifestTable, jobPlaylists, MANIFEST_STATUS, markVideo, readManifest, readManifestStrict, recordPlaylistInManifest, recordUploadedManifest, syncManifest, writeManifest } from './youtube/manifest.js';
import { bindRelease, releasePlan } from './youtube/release.js';
import { configDir, env, readSettings } from './youtube/settings.js';
import { formatSetup, runSetup } from './youtube/setup.js';
import { probeVideo } from './youtube/probe.js';
import { checkShort, shortsNote, tagShort } from './youtube/shorts.js';
import { formatZone, nextQuotaResetPlus10m, zoneWallToMs } from './youtube/zone.js';

const DIR = configDir();
const SECRET_FILE = join(DIR, 'client_secret.json');
const TOKEN_FILE = join(DIR, 'token.json');
const JOBS_FILE = join(DIR, 'uploads.json');
const MANIFEST_FILE = join(DIR, 'manifest.json');
const AGENT_LABEL = 'art.chromaglass.youtube-drain';
/* The host system, which picks the scheduler and the notifier. The check overrides it to read
   every system's plan on one machine; nothing else should. */
const PLATFORM = env('PLATFORM') ?? process.platform;
/* One scope: `youtube` covers upload, update, thumbnails and playlists. The
   narrower `youtube.upload` cannot change a video once it is up, which is
   half of what was asked. */
const SCOPE = 'https://www.googleapis.com/auth/youtube';
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
/* Google takes a chunk in multiples of 256 KiB. 8 MiB is its own suggestion
   for a steady connection: big enough that the per-request cost is nothing,
   small enough that a dropped one loses seconds. The check sets it small. */
const CHUNK = Number(env('CHUNK') ?? 8 * 1024 * 1024);
/* How long upload_video waits before answering "still going": a short film
   finishes inside one call, a long one answers and carries on in the
   background, read with upload_status. Under a client's tool timeout. */
const WAIT_MS = Number(env('WAIT_MS') ?? 45_000);
const BACKOFF_MS = Number(env('BACKOFF_MS') ?? 1_000);
const TRIES = 8;
/* A chunk that neither lands nor fails (a half-dead connection after the Mac
   slept) is given up after this and treated as a drop. */
const PUT_MS = Number(env('PUT_MS') ?? 120_000);
/* The files this server writes hold keys: the owner's alone. */
const PRIVATE = 0o600;

const log = (...a) => process.stderr.write(`youtube-mcp: ${a.join(' ')}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (b) => Buffer.from(b).toString('base64url');
/* The check passes a future clock (`CHROMAGLASS_YOUTUBE_NOW`) so drain after
   `notBefore` can run immediately without sleeping 24 hours; OAuth expiry and
   the live-process `beat` keep real wall-clock time (`Date.now()`). */
function nowMs() {
  const raw = env('NOW');
  if (!raw) return Date.now();
  const n = Number(raw);
  return Number.isFinite(n) ? n : Date.parse(raw);
}
/*
  The person's choices (settings.json beside the keys: the time zone release
  times are read in, the category a new upload gets). Read once at start; a
  bad file stops the server with the line to fix, before it sends anything.
*/
let SETTINGS;
try { SETTINGS = readSettings(DIR); } catch (e) { log(e.message); process.exit(2); }
const ZONE = SETTINGS.timeZone;
const zoneWall = (y, m, d, h, min, s = 0) => zoneWallToMs(y, m, d, h, min, s, ZONE);
const formatLocal = (ms) => formatZone(ms, ZONE);
/* A key file read without quoting it: Node's JSON error carries about ten
   characters of the text, which in these files can be part of a secret. */
function readKeyFile(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Setup(`${file} is not valid JSON: download it again (or, for token.json, run login again).`); }
}

/*
  Where Google is. A stand-in can replace it for the check
  (`CHROMAGLASS_YOUTUBE_GOOGLE`), and only on this machine's loopback: the
  override sends the owner's refresh key and client secret to whatever it
  names, so a stray environment variable must never be able to point them at
  another host.
*/
function endpoints() {
  const o = env('GOOGLE');
  if (!o) return { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', revoke: 'https://oauth2.googleapis.com/revoke', api: 'https://www.googleapis.com/youtube/v3', upload: 'https://www.googleapis.com/upload/youtube/v3', analytics: 'https://youtubeanalytics.googleapis.com/v2' };
  const u = new URL(o);
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1') throw new Error(`The GOOGLE override may only name a stand-in on http://127.0.0.1, not ${u.origin}`);
  const b = o.replace(/\/$/, '');
  return { auth: `${b}/auth`, token: `${b}/token`, revoke: `${b}/revoke`, api: `${b}/youtube/v3`, upload: `${b}/upload/youtube/v3`, analytics: `${b}/youtubeanalytics/v2` };
}
let G;
try { G = endpoints(); } catch (e) { log(e.message); process.exit(2); }

/** A setup step the owner has not done: said in words, not as a stack. */
class Setup extends Error {}

function writePrivate(file, text) {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  chmodSync(DIR, 0o700);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: PRIVATE });
  chmodSync(tmp, PRIVATE);
  renameSync(tmp, file);
}

function client() {
  if (!existsSync(SECRET_FILE)) throw new Setup(`No Google client yet. In Google Cloud, make an OAuth client of type "Desktop app", download its JSON, and save it as ${SECRET_FILE}.`);
  const j = readKeyFile(SECRET_FILE);
  if (j.web) throw new Setup('That client file is a "Web application" client. Make one of type "Desktop app" instead (it signs in through this machine\'s loopback).');
  const c = j.installed ?? j;
  if (!c.client_id) throw new Setup(`${SECRET_FILE} has no client_id: is it the file Google Cloud downloaded?`);
  return { id: c.client_id, secret: c.client_secret ?? '' };
}

// ── The sign-in ────────────────────────────────────────────────────────

let token = null;
function loadToken() {
  if (!token && existsSync(TOKEN_FILE)) token = readKeyFile(TOKEN_FILE);
  return token;
}

async function form(url, fields) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
  return { r, j: await r.json().catch(() => ({})) };
}

async function accessToken(force = false) {
  const t = loadToken();
  if (!t?.refresh_token) throw new Setup('Not signed in to YouTube yet. In Terminal, from the repo: node mcp/youtube-mcp.js login');
  if (!force && t.access_token && t.expires_at - 60_000 > Date.now()) return t.access_token;
  const c = client();
  const { r, j } = await form(G.token, { client_id: c.id, client_secret: c.secret, refresh_token: t.refresh_token, grant_type: 'refresh_token' });
  if (!r.ok) {
    if (j.error === 'invalid_grant') throw new Setup('The YouTube sign-in has expired or was revoked: run `node mcp/youtube-mcp.js login` again. If this happens every 7 days, the Google app is still in Testing: publish it (Google Auth Platform, Audience, Publish app).');
    throw new Error(`Google would not refresh the sign-in: ${r.status} ${j.error ?? ''}`);
  }
  token = { ...t, access_token: j.access_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000, ...(j.refresh_token ? { refresh_token: j.refresh_token } : {}) };
  writePrivate(TOKEN_FILE, JSON.stringify(token, null, 2));
  return token.access_token;
}

/*
  The installed-app flow: a one-off server on this machine's loopback takes
  Google's answer, PKCE proves the answer came back to the program that asked
  (S256, so a code read off the redirect is useless without the verifier this
  process holds), and `state` refuses an answer this window did not ask for.
  `access_type=offline` and `prompt=consent` are what make Google hand over a
  refresh key, every time, so a second login always ends with one.
  `add` names opt-in scopes (44i-2d: `analytics`); the scopes asked for are the
  server's own, every opt-in the saved key already has, and those, so signing in
  again never drops one (youtube/analytics.js says why each is asked for apart).
*/
async function login(add = []) {
  const c = client();
  const prev = (() => { try { return loadToken(); } catch { return null; } })();
  const scopes = scopesFor(SCOPE, prev?.scope, add);
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const redirect = `http://127.0.0.1:${srv.address().port}/`;
  const url = new URL(G.auth);
  for (const [k, v] of Object.entries({ client_id: c.id, redirect_uri: redirect, response_type: 'code', scope: scopes.join(' '), include_granted_scopes: 'true', access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state })) url.searchParams.set(k, v);
  log(`Sign in with the Google account that owns the channel (pick the channel if it asks). The page should open by itself; if not, open:\n${url}`);
  if (!env('NO_BROWSER')) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    spawn(cmd, [String(url)], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  }
  const code = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('No answer from Google in 5 minutes.')), 300_000);
    srv.on('request', (req, resp) => {
      const q = new URL(req.url, redirect).searchParams;
      if (q.get('state') !== state) { resp.writeHead(400, { 'content-type': 'text/plain' }).end('This is not the sign-in this window asked for.'); return; }
      clearTimeout(timer);
      if (q.get('error')) { resp.writeHead(200, { 'content-type': 'text/plain' }).end(`Google said: ${q.get('error')}. You can close this tab.`); rej(new Error(`Google said: ${q.get('error')}`)); return; }
      resp.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><p style="font:16px system-ui;margin:3em">Signed in to YouTube. You can close this tab.</p>');
      res(q.get('code'));
    });
  }).finally(() => srv.close());
  const { r, j } = await form(G.token, { code, client_id: c.id, client_secret: c.secret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier });
  if (!r.ok) throw new Error(`Google would not finish the sign-in: ${r.status} ${j.error ?? ''} ${j.error_description ?? ''}`);
  if (!j.refresh_token) throw new Error('Google gave no refresh key. Remove the app at myaccount.google.com/permissions and run login again.');
  token = { refresh_token: j.refresh_token, access_token: j.access_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000, scope: j.scope };
  writePrivate(TOKEN_FILE, JSON.stringify(token, null, 2));
  const ch = await channel();
  log(`Signed in as the channel "${ch.title}" (${ch.url}). The key is saved in ${TOKEN_FILE}, readable by you alone.`);
  /* Google's page lets a person untick an opt-in: say which one is off, and end with a failure
     when it was the one this login was run to add, rather than a quiet "signed in". */
  const missing = Object.entries(OPT_IN).filter(([, sc]) => scopes.includes(sc) && granted(token, sc) === false).map(([n]) => n);
  if (missing.length) {
    log(`Not granted on Google's page: ${missing.join(', ')}. Run login --add ${missing.join(' --add ')} again and tick it, if you want it.`);
    if (missing.some((n) => add.includes(n))) process.exitCode = 1;
  }
}

async function logout() {
  const t = loadToken();
  if (t?.refresh_token) await form(G.revoke, { token: t.refresh_token }).catch(() => {});
  if (existsSync(TOKEN_FILE)) unlinkSync(TOKEN_FILE);
  log('Signed out: the key is revoked at Google and deleted here.');
}

// ── The API ────────────────────────────────────────────────────────────

const HINTS = {
  quotaExceeded: "the project's daily quota is spent; it resets at midnight Pacific time.",
  uploadLimitExceeded: "the channel's own daily upload limit is reached; try tomorrow.",
  youtubeSignupRequired: 'this Google account has no YouTube channel: sign in again and pick the channel.',
  forbidden: 'YouTube refused it for this channel. A custom thumbnail needs the channel verified by phone (youtube.com/verify).',
  invalidPublishAt: 'a scheduled time must be in the future, and the video private.',
};
class GoogleApiError extends Error {
  constructor(status, reason, message) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}
function googleErrorInfo(status, j, text) {
  const e = j?.error;
  const reason = e?.errors?.[0]?.reason ?? e?.status ?? '';
  const message = e?.message ?? (typeof e === 'string' ? e : String(text ?? '').slice(0, 200));
  return { reason, text: `YouTube said ${status}${reason ? ` (${reason})` : ''}: ${message}${HINTS[reason] ? `. That means ${HINTS[reason]}` : ''}` };
}

async function api(method, path, { query = {}, body, raw, type, headers: extra = {}, base = G.api } = {}) {
  const url = new URL(`${base}/${path}`);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    const headers = { authorization: `Bearer ${await accessToken(attempt > 0)}`, ...extra };
    if (raw) headers['content-type'] = type; else if (body !== undefined) headers['content-type'] = 'application/json; charset=UTF-8';
    const r = await fetch(url, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    if (r.status === 401 && attempt === 0) continue;
    const text = await r.text();
    let j = {};
    try { j = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
    if (!r.ok) {
      const info = googleErrorInfo(r.status, j, text);
      throw new GoogleApiError(r.status, info.reason, info.text);
    }
    return { r, j };
  }
}

const watchUrl = (id) => `https://youtu.be/${id}`;

async function channel() {
  const { j } = await api('GET', 'channels', { query: { part: 'snippet,statistics,contentDetails', mine: true } });
  const c = j.items?.[0];
  if (!c) throw new Setup('This sign-in has no YouTube channel: run login again and pick the channel.');
  return {
    id: c.id, title: c.snippet?.title, url: c.snippet?.customUrl ? `https://youtube.com/${c.snippet.customUrl}` : `https://youtube.com/channel/${c.id}`,
    subscribers: c.statistics?.hiddenSubscriberCount ? 'hidden' : Number(c.statistics?.subscriberCount ?? 0),
    views: Number(c.statistics?.viewCount ?? 0), videos: Number(c.statistics?.videoCount ?? 0),
    uploads: c.contentDetails?.relatedPlaylists?.uploads,
  };
}

const describe = (v) => ({
  id: v.id, url: watchUrl(v.id), title: v.snippet?.title, privacy: v.status?.privacyStatus,
  ...(v.status?.publishAt ? { publish_at: v.status.publishAt } : {}),
  published: v.snippet?.publishedAt, upload_status: v.status?.uploadStatus,
  ...(v.status?.rejectionReason ? { rejected: v.status.rejectionReason } : {}),
  duration: v.contentDetails?.duration, views: v.statistics ? Number(v.statistics.viewCount ?? 0) : undefined,
  likes: v.statistics ? Number(v.statistics.likeCount ?? 0) : undefined,
  description: v.snippet?.description, tags: v.snippet?.tags ?? [], category_id: v.snippet?.categoryId,
  made_for_kids: v.status?.selfDeclaredMadeForKids ?? v.status?.madeForKids,
  ...(v.snippet?.defaultLanguage ? { language: v.snippet.defaultLanguage } : {}),
  ...(v.localizations && Object.keys(v.localizations).length ? { localizations: v.localizations } : {}),
});

async function videos(ids) {
  if (!ids.length) return [];
  const { j } = await api('GET', 'videos', { query: { part: 'snippet,status,statistics,contentDetails,localizations', id: ids.join(','), maxResults: 50 } });
  return j.items ?? [];
}

async function listVideos(limit) {
  const ch = await channel();
  const { j } = await api('GET', 'playlistItems', { query: { part: 'contentDetails', playlistId: ch.uploads, maxResults: Math.max(1, Math.min(50, limit)) } });
  const ids = (j.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean);
  return (await videos(ids)).map(describe).map(({ description, tags, ...v }) => v);
}

/*
  An update sends whole parts: whatever `snippet` says replaces the video's
  snippet, so a title change sent alone would wipe the description and tags,
  and YouTube refuses a snippet without its title and category. So the video
  is read first and only the named fields change.
*/
async function updateVideo(a) {
  const [cur] = await videos([String(a.video_id)]);
  if (!cur) throw new Error(`No video ${a.video_id} on this channel.`);
  const snippet = { ...cur.snippet };
  for (const k of ['thumbnails', 'localized', 'publishedAt', 'channelId', 'channelTitle', 'liveBroadcastContent']) delete snippet[k];
  if (a.title !== undefined) snippet.title = checkTitle(a.title);
  if (a.tags !== undefined) snippet.tags = a.tags;
  if (a.category_id !== undefined) snippet.categoryId = String(a.category_id);
  if (a.language !== undefined) snippet.defaultLanguage = snippet.defaultAudioLanguage = a.language;
  /* The words (44i-2b). The description is put together again only when one
     of its parts is named: new text keeps its chapters and gets the credits
     line, new chapters replace the old ones, checked against the video's own
     length. A title-only update leaves the description exactly as it was. */
  let localizations;
  if (['description', 'chapters', 'credits', 'music', 'localizations'].some((k) => a[k] !== undefined)) {
    /* Other languages added alone to a video whose description has no credits line (one from
       before 44i-2b, or uploaded with credits: false) take its description as it is: adding a
       Spanish title is not the moment to demand the music's name. */
    const wordsNamed = ['description', 'chapters', 'credits', 'music'].some((k) => a[k] !== undefined);
    const body = a.description ?? cur.snippet?.description ?? '';
    let lenient = {};
    if (!wordsNamed) { try { creditsLine(SETTINGS.credits, undefined, undefined, body); } catch { lenient = { credits: false }; } }
    const w = wordsFor({ ...a, ...lenient, description: body, language: snippet.defaultLanguage }, isoSeconds(cur.contentDetails?.duration));
    if (wordsNamed) snippet.description = w.description;
    /* The localizations part is whole as well: languages not named are kept,
       one set to null is taken off. */
    if (w.localizations) {
      localizations = { ...(cur.localizations ?? {}) };
      for (const [lang, v] of Object.entries(w.localizations)) { if (v === null) delete localizations[lang]; else localizations[lang] = v; }
    }
  }
  /* The status part is whole too: a field left out is reset (a Studio
     "altered or synthetic" mark, embedding, the licence). So it starts from
     all of the video's status and drops only what YouTube sets itself;
     `madeForKids` is YouTube's own ruling, never the owner's declaration. */
  const status = { ...cur.status };
  for (const k of ['uploadStatus', 'failureReason', 'rejectionReason', 'madeForKids']) delete status[k];
  if (a.privacy !== undefined) { status.privacyStatus = a.privacy; if (a.privacy !== 'private') delete status.publishAt; }
  if (a.publish_at !== undefined) { status.publishAt = a.publish_at || undefined; if (a.publish_at) status.privacyStatus = 'private'; }
  if (a.made_for_kids !== undefined) status.selfDeclaredMadeForKids = Boolean(a.made_for_kids);
  const { j } = await api('PUT', 'videos', { query: { part: localizations ? 'snippet,status,localizations' : 'snippet,status' }, body: { id: cur.id, snippet, status, ...(localizations ? { localizations } : {}) } });
  return describe({ ...cur, ...j });
}

const IMAGE = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

/*
  Which files this server will send to YouTube (the security review of
  2026-11-13). It took any path at all: `upload_video` any file, sent as
  application/octet-stream when its kind was unknown, and `set_thumbnail` any
  .jpg or .png, the Photos library's originals included. The show server's own
  media door refuses the Photos library because "an assistant steered by
  somebody's words" might put a private picture up (server/assistantMedia.js),
  and this door is wider: what it sends can go public on the owner's channel.
  A web page, a document or a track title read in the same Claude session is
  enough to ask for it, and the guide's "only when the owner said so" is a
  request to the model, not a control.

  So a file is judged where it really is (links followed, so a link in
  ~/Movies to a private library is judged as the library), and must be of the
  kind asked for: a video for an upload, a .jpg or .png for a thumbnail. Never
  from Apple's private libraries (Photos, Photo Booth, iMovie), ~/Library, or
  any hidden folder (a dot-folder holds keys and app data, never a film). Not
  narrowed to fixed folders: the owner's films are made in several places
  (~/chromaglass-films, ~/Movies, a recording's own folder), and a list that
  missed one would refuse the owner's own upload in the middle of a release.
*/
const PRIVATE_PLACE = /(\.photoslibrary|Photo Booth Library|\.imovielibrary|\.tvlibrary|\.musiclibrary)(\/|$)/i;
function uploadable(raw, kinds, what, home = homedir()) {
  const asked = String(raw ?? '').trim().replace(/^~(?=$|\/)/, home);
  if (!asked) throw new Error(`${what}: a full path to the file on this computer.`);
  let real;
  try { real = realpathSync(resolve(asked)); } catch { throw new Error(`No file at ${resolve(asked)}.`); }
  if (!statSync(real).isFile()) throw new Error(`${real} is not a file.`);
  const type = kinds[extname(real).toLowerCase()];
  if (!type) throw new Error(`${what} is one of ${Object.keys(kinds).join(' ')}; ${real} is not.`);
  // A Mac's disk ignores case and realpath keeps the case it was asked in, so `~/library` is ~/Library.
  const lower = real.toLowerCase(), homeLower = home.toLowerCase();
  const inHome = lower === homeLower || lower.startsWith(homeLower.endsWith(sep) ? homeLower : homeLower + sep);
  const under = inHome ? real.slice(home.length) : real;
  if (PRIVATE_PLACE.test(real) || (inHome && /^[\/]Library([\/]|$)/i.test(under)) || /[\/]\.[^\/]/.test(under)) {
    throw new Error(`${real} is inside a private library or a hidden folder; this server never sends from there. Export the file to ~/Movies first.`);
  }
  return { path: real, type };
}

async function setThumbnail(videoId, file) {
  const { path, type } = uploadable(file, IMAGE, 'A thumbnail');
  if (statSync(path).size > 2 * 1024 * 1024) throw new Error('A thumbnail must be 2 MB or less.');
  await api('POST', 'thumbnails/set', { base: G.upload, query: { videoId, uploadType: 'media' }, raw: readFileSync(path), type });
  return 'thumbnail set';
}

/*
  Captions (44i-2b, youtube/captions.js). Every caption an upload names is
  looked at when the job is made (its file, its kind, its cues, its language),
  so the drain hours later sends only what passed. `captions.insert` is 400
  units, so a film with three languages is 1,200 of the day's 10,000.
*/
function captionsFor(a) {
  if (a.captions === undefined || a.captions === null) return [];
  const list = Array.isArray(a.captions) ? a.captions : [a.captions];
  return list.map((c) => {
    const o = typeof c === 'string' ? { file: c } : c;
    if (!o || typeof o !== 'object') throw new Error('captions is a list of caption files, each a path or { file, language, name }.');
    const { path } = uploadable(o.file, CAPTION, 'A caption file');
    readCaptionFile(path);
    const language = String(o.language ?? a.language ?? '');
    if (!validLanguage(language)) throw new Error(`The caption file ${basename(path)} needs its language (e.g. "en"): on the caption, or the upload's language.`);
    return { file: path, language, ...(o.name ? { name: String(o.name) } : {}), ...(o.draft ? { draft: true } : {}) };
  });
}
async function addCaptions(videoId, c) {
  const { path } = uploadable(c.file, CAPTION, 'A caption file');
  const { raw, type } = captionRequest({ videoId, language: c.language, name: c.name ?? '', draft: c.draft }, readCaptionFile(path));
  const { j } = await api('POST', 'captions', { base: G.upload, query: { part: 'snippet', uploadType: 'multipart' }, raw, type });
  return `captions ${c.language}${c.name ? ` (${c.name})` : ''} added (${j.id})`;
}
async function listCaptions(videoId) {
  const { j } = await api('GET', 'captions', { query: { part: 'snippet', videoId } });
  return (j.items ?? []).map((t) => ({ id: t.id, language: t.snippet?.language, name: t.snippet?.name, kind: t.snippet?.trackKind, draft: t.snippet?.isDraft, status: t.snippet?.status }));
}

/* The description and the other languages' words for an upload or an update (youtube/describe.js). */
function wordsFor(a, durationSec) {
  const chapters = parseChapters(a.chapters, durationSec);
  const credits = creditsLine(SETTINGS.credits, a.credits, a.music, a.description);
  /* A Short's #Shorts ends the description's own text, before the chapters and the credits (44i-2c, youtube/shorts.js). */
  const description = composeDescription(a.short ? tagShort(a.title, a.description) : a.description ?? '', chapters, credits);
  const localizations = composeLocalizations(a.localizations, { language: a.language, chapters, credits, fallbackDescription: description });
  return { description, localizations };
}

async function addToPlaylist(videoId, playlistId, position) {
  const snippet = { playlistId, resourceId: { kind: 'youtube#video', videoId } };
  if (Number.isInteger(position) && position >= 0) {
    try {
      await api('POST', 'playlistItems', { query: { part: 'snippet' }, body: { snippet: { ...snippet, position } } });
      recordPlaylistInManifest(videoId, { id: playlistId, position });
      return `added to playlist ${playlistId} at position ${position}`;
    } catch (e) {
      if (!(e instanceof GoogleApiError && e.status === 400)) throw e;
    }
  }
  await api('POST', 'playlistItems', { query: { part: 'snippet' }, body: { snippet } });
  recordPlaylistInManifest(videoId, { id: playlistId });
  return `added to playlist ${playlistId}`;
}

// ── Uploads & queue ────────────────────────────────────────────────────

/*
  Every upload is a job, saved as it goes: the session Google gave (a URL
  that takes the rest of the file for about a week), how far Google has it,
  and what to do once it is up. Saved so that an upload outlives the
  assistant's app: asked again for the same file and title, a later server
  finds the job and carries on from Google's count instead of starting over.
  `pid` keeps two servers (a desktop chat and a coding agent open at once)
  from both pushing the same job.

  YouTube's per-channel daily upload limit (`uploadLimitExceeded`) is not
  documented with a fixed reset hour and behaves in practice as a rolling
  24-hour window from the last completed upload. So `uploads.json` records
  `lastUploadAt`, and an upload refused by `uploadLimitExceeded` is queued
  with `notBefore = max(now + 2 hours, lastUploadAt + 24 hours + 10 minutes)`:
  the 10-minute slack avoids waking on the boundary and hitting the limit a
  second time, while `now + 2 hours` avoids tight retries when `lastUploadAt`
  is unknown (earlier uploads made in Studio) or older than 22 hours. By
  contrast, `quotaExceeded` is the Google Cloud project's daily 10,000-unit
  quota, which resets at midnight Pacific time, so its `notBefore` is the next
  midnight Pacific + 10 minutes.
*/
const running = new Map();
function readStoreStrict() {
  if (!existsSync(JOBS_FILE)) return { lastUploadAt: null, jobs: [] };
  const d = JSON.parse(readFileSync(JOBS_FILE, 'utf8'));
  if (Array.isArray(d)) return { lastUploadAt: null, jobs: d };
  if (!d || typeof d !== 'object' || !Array.isArray(d.jobs)) throw new Error(`${JOBS_FILE} is unreadable.`);
  return { lastUploadAt: d.lastUploadAt ?? null, jobs: d.jobs };
}
function readStore() { try { return readStoreStrict(); } catch { return { lastUploadAt: null, jobs: [] }; } }
function writeStore(store) {
  writePrivate(JOBS_FILE, JSON.stringify({ lastUploadAt: store.lastUploadAt ?? null, jobs: store.jobs.slice(-50) }, null, 2));
}
function saveJob(job, { lastUploadAt } = {}) {
  if (job.pid === process.pid) job.beat = Date.now();
  const store = readStore();
  if (lastUploadAt) store.lastUploadAt = lastUploadAt;
  store.jobs = store.jobs.filter((j) => j.id !== job.id);
  store.jobs.push(job);
  writeStore(store);
}
/* A pid is reused (a reboot, a kill mid-upload), so a job counts as another
   app's only while that app has saved it in the last five minutes too; a
   stalled chunk times out in two, so a live upload always beats sooner. */
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const busyElsewhere = (j) => Boolean(j.pid) && j.pid !== process.pid && pidAlive(j.pid) && Date.now() - (j.beat ?? 0) < 5 * 60_000;

function computeNotBefore(reason, now, lastUploadAt) {
  if (reason === 'quotaExceeded') return nextQuotaResetPlus10m(now);
  const last = lastUploadAt ? Date.parse(lastUploadAt) : 0;
  const afterLast = Number.isFinite(last) && last > 0 ? last + 24 * 3600_000 + 10 * 60_000 : 0;
  return Math.max(now + 2 * 3600_000, afterLast);
}
function limitNote(reason, nbMs) {
  const prefix = reason === 'quotaExceeded' ? "YouTube's daily quota is spent" : "YouTube's daily upload limit";
  return `${prefix}; queued, this computer retries after ${formatLocal(nbMs)}`;
}

function jobView(job) {
  const pct = job.size ? Math.floor((100 * job.sent) / job.size) : 0;
  return {
    job: job.id, file: job.file, title: job.meta.snippet.title, privacy: job.meta.status.privacyStatus, state: job.state,
    sent: `${(job.sent / 1048576).toFixed(1)} of ${(job.size / 1048576).toFixed(1)} MB (${pct}%)`,
    ...(job.key ? { key: job.key } : {}),
    ...(job.replaces ? { replaces: job.replaces } : {}),
    ...(job.meta?.status?.publishAt ? { publish_at: job.meta.status.publishAt } : {}),
    ...(job.notBefore ? { not_before: formatLocal(Date.parse(job.notBefore)), not_before_iso: job.notBefore } : {}),
    ...(job.note ? { note: job.note } : {}),
    ...(job.shorts ? { shorts: job.shorts } : {}),
    ...(job.video_id ? { video_id: job.video_id, url: watchUrl(job.video_id) } : {}),
    ...(job.playlists?.length ? { playlists: job.playlists } : {}),
    ...(job.after?.length ? { then: job.after } : {}), ...(job.error ? { error: job.error } : {}),
  };
}

const MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo' };

/** Where Google has the upload: a byte count, or the finished video. */
async function askOffset(job, retried = false) {
  const r = await fetch(job.session, { method: 'PUT', headers: { authorization: `Bearer ${await accessToken(retried)}`, 'content-range': `bytes */${job.size}` }, body: new Uint8Array(0), signal: AbortSignal.timeout(PUT_MS) });
  if (r.status === 401 && !retried) return askOffset(job, true);
  if (r.status === 200 || r.status === 201) return { video: await r.json() };
  if (r.status === 308) { const m = /bytes=0-(\d+)/.exec(r.headers.get('range') ?? ''); return { at: m ? Number(m[1]) + 1 : 0 }; }
  if (r.status === 404 || r.status === 410) return { gone: true };
  const info = googleErrorInfo(r.status, await r.json().catch(() => ({})));
  throw new GoogleApiError(r.status, info.reason, info.text);
}

async function startSession(job) {
  const { r } = await api('POST', 'videos', { base: G.upload, query: { uploadType: 'resumable', part: job.meta.localizations ? 'snippet,status,localizations' : 'snippet,status' }, body: job.meta, headers: { 'x-upload-content-length': String(job.size), 'x-upload-content-type': job.mime } });
  const at = r.headers.get('location');
  if (!at) throw new Error('YouTube gave no upload address.');
  return at;
}

async function push(job, onProgress) {
  const fh = await open(job.file, 'r');
  let fails = 0;
  try {
    if (!job.session) { job.session = await startSession(job); job.sent = 0; saveJob(job); }
    else {
      const o = await askOffset(job);
      if (o.video) { onProgress?.(job.size, job.size); return o.video; }
      if (o.gone) { job.session = await startSession(job); job.sent = 0; } else job.sent = o.at;
      saveJob(job);
    }
    if (job.sent > 0) onProgress?.(job.sent, job.size);
    const buf = Buffer.alloc(Math.min(CHUNK, job.size));
    for (;;) {
      const n = Math.min(CHUNK, job.size - job.sent);
      await fh.read(buf, 0, n, job.sent);
      let r = null; let why = '';
      try {
        r = await fetch(job.session, { method: 'PUT', headers: { authorization: `Bearer ${await accessToken()}`, 'content-range': `bytes ${job.sent}-${job.sent + n - 1}/${job.size}` }, body: buf.subarray(0, n), signal: AbortSignal.timeout(PUT_MS) });
      } catch (e) { why = String(e?.cause?.code ?? e?.message ?? e); }
      if (r && (r.status === 200 || r.status === 201)) { onProgress?.(job.size, job.size); return await r.json(); }
      if (r && r.status === 308) {
        const m = /bytes=0-(\d+)/.exec(r.headers.get('range') ?? '');
        const at = m ? Number(m[1]) + 1 : 0;
        const moved = at > job.sent;
        job.sent = at; saveJob(job);
        if (moved) { onProgress?.(job.sent, job.size); fails = 0; continue; }
        why = '308 without progress';
        r = null;
      }
      if (r && r.status === 401) { await accessToken(true); if (++fails > TRIES) throw new Error('The sign-in keeps being refused.'); continue; }
      if (r && (r.status === 404 || r.status === 410)) { job.session = await startSession(job); job.sent = 0; saveJob(job); continue; }
      if (r && r.status < 500) {
        const info = googleErrorInfo(r.status, await r.json().catch(() => ({})));
        throw new GoogleApiError(r.status, info.reason, info.text);
      }
      // A dropped connection or Google's own 5xx: wait, ask where it stopped, carry on from there.
      if (r) why = `${r.status}`;
      if (++fails > TRIES) throw new Error(`The upload stalled ${TRIES} times in a row (last: ${why}). Ask again with the same file and title to resume it.`);
      log(`chunk at ${job.sent} failed (${why}); trying again in ${BACKOFF_MS * 2 ** (fails - 1)} ms`);
      await sleep(BACKOFF_MS * 2 ** (fails - 1));
      const o = await askOffset(job).catch(() => ({ at: job.sent }));
      if (o.video) return o.video;
      if (o.gone) { job.session = await startSession(job); job.sent = 0; } else { const at = o.at; job.sent = at; }
      saveJob(job);
    }
  } finally { await fh.close(); }
}

// The channel manifest (44i-6) lives in youtube/manifest.js (moved 44i-2c-2); it is given the
// server's file, writer, clock and Google calls here, once, before any tool or command runs.
bindManifest({ MANIFEST_FILE, writePrivate, nowMs, channel, api, videos });

function run(job, onProgress) {
  job.state = 'uploading'; job.pid = process.pid; job.error = undefined; job.limitReason = undefined; saveJob(job);
  const p = (async () => {
    let setupErr = null;
    try {
      const video = await push(job, onProgress);
      const finishedAt = new Date(nowMs()).toISOString();
      job.video_id = video.id; job.sent = job.size; job.state = 'done'; job.finished = finishedAt;
      job.notBefore = undefined; job.note = undefined; job.after = [];
      for (const pl of jobPlaylists(job)) {
        job.after.push(await addToPlaylist(video.id, pl.id, pl.position).catch((e) => `playlist ${pl.id} not added: ${e.message}`));
      }
      if (job.thumbnail) job.after.push(await setThumbnail(video.id, job.thumbnail).catch((e) => `thumbnail not set: ${e.message}`));
      for (const c of job.captions ?? []) job.after.push(await addCaptions(video.id, c).catch((e) => `captions ${c.language} not added: ${e.message}`));
      recordUploadedManifest(job, video, finishedAt);
      log(`uploaded ${job.file} as ${watchUrl(video.id)}`);
      job.pid = undefined; saveJob(job, { lastUploadAt: finishedAt });
    } catch (e) {
      if (e instanceof GoogleApiError && (e.reason === 'uploadLimitExceeded' || e.reason === 'quotaExceeded')) {
        const nbMs = computeNotBefore(e.reason, nowMs(), readStore().lastUploadAt);
        job.state = 'queued';
        job.notBefore = new Date(nbMs).toISOString();
        job.limitReason = e.reason;
        job.note = limitNote(e.reason, nbMs);
        job.error = undefined;
        log(`queued ${job.file}: ${job.note}`);
      } else {
        if (e instanceof Setup) setupErr = e;
        job.state = 'failed'; job.error = String(e?.message ?? e); log(`upload of ${job.file} failed: ${job.error}`);
      }
      job.pid = undefined; saveJob(job);
    }
    running.delete(job.id);
    if (setupErr) throw setupErr;
  })();
  running.set(job.id, p);
  return p;
}

const PRIVACY = ['private', 'unlisted', 'public'];
const SIDECAR_FIELDS = new Set(['title', 'description', 'tags', 'playlist', 'thumbnail', 'key', 'replaces', 'publish_at', 'privacy', 'language', 'chapters', 'music', 'credits', 'captions', 'localizations', 'short']);
function readUploadCard(videoPath) {
  const ext = extname(videoPath);
  const cardPath = `${ext ? videoPath.slice(0, -ext.length) : videoPath}.youtube.json`;
  if (!existsSync(cardPath)) return {};
  // Never follow a sidecar link out of the video's own folder.
  let realCard;
  try { realCard = realpathSync(cardPath); } catch { throw new Error(`Cannot read upload card ${cardPath}.`); }
  if (dirname(realCard) !== dirname(videoPath) || !statSync(realCard).isFile()) {
    throw new Error(`Upload card must live beside the video file: ${cardPath}.`);
  }
  let raw;
  try { raw = JSON.parse(readFileSync(realCard, 'utf8')); } catch { throw new Error(`Upload card ${basename(cardPath)} is not valid JSON.`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Upload card ${basename(cardPath)} must be a JSON object.`);
  }
  const unknown = Object.keys(raw).filter((k) => !SIDECAR_FIELDS.has(k));
  if (unknown.length) {
    throw new Error(`Unknown field${unknown.length > 1 ? 's' : ''} in upload card ${basename(cardPath)}: ${unknown.join(', ')}.`);
  }
  if (raw.tags !== undefined && (!Array.isArray(raw.tags) || raw.tags.some((t) => typeof t !== 'string'))) {
    throw new Error(`Upload card ${basename(cardPath)}: tags must be an array of strings.`);
  }
  const dir = dirname(videoPath);
  const out = {};
  if (raw.title !== undefined) out.title = String(raw.title);
  if (raw.description !== undefined) out.description = String(raw.description);
  if (raw.tags !== undefined) out.tags = raw.tags;
  if (raw.playlist !== undefined) {
    if (Array.isArray(raw.playlist)) out.playlists = raw.playlist.map((id) => ({ id: String(id) }));
    else if (typeof raw.playlist === 'string' && raw.playlist) out.playlist_id = raw.playlist;
    else throw new Error(`Upload card ${basename(cardPath)}: playlist must be a playlist id string or array.`);
  }
  if (raw.thumbnail !== undefined) {
    const tRaw = String(raw.thumbnail).trim().replace(/^~(?=$|\/)/, homedir());
    out.thumbnail = tRaw ? resolve(dir, tRaw) : undefined;
  }
  if (raw.key !== undefined) out.key = String(raw.key);
  if (raw.replaces !== undefined) out.replaces = String(raw.replaces);
  if (raw.publish_at !== undefined) out.publish_at = String(raw.publish_at);
  if (raw.privacy !== undefined) out.privacy = String(raw.privacy);
  /* 44i-2b. A caption file named in the card is found beside the card, like its thumbnail. */
  if (raw.language !== undefined) out.language = String(raw.language);
  if (raw.chapters !== undefined) out.chapters = raw.chapters;
  if (raw.music !== undefined) out.music = String(raw.music);
  if (raw.credits !== undefined) out.credits = raw.credits === false ? false : String(raw.credits);
  if (raw.localizations !== undefined) out.localizations = raw.localizations;
  if (raw.short !== undefined) out.short = raw.short; // judged with the call's own, in validateUploadArgs
  if (raw.captions !== undefined) {
    const here = (f) => resolve(dir, String(f ?? '').trim().replace(/^~(?=$|\/)/, homedir()));
    out.captions = (Array.isArray(raw.captions) ? raw.captions : [raw.captions]).map((c) => (typeof c === 'string' ? here(c) : c && typeof c === 'object' ? { ...c, file: here(c.file) } : c));
  }
  return out;
}
function mergeArgsWithCard(a, card) {
  const out = { ...card };
  for (const [k, v] of Object.entries(a)) {
    if (v !== undefined) out[k] = v;
  }
  if (a.playlist_id !== undefined) delete out.playlists;
  if (a.playlists !== undefined) delete out.playlist_id;
  return out;
}
function validateUploadArgs(a, resolvedFile) {
  const { path: file } = resolvedFile ? { path: resolvedFile } : uploadable(a.file, MIME, 'A video');
  const st = statSync(file);
  if (!a.title) throw new Error('A title is needed.');
  if (String(a.title).length > 100) throw new Error('YouTube takes a title of at most 100 characters.');
  checkTitle(a.title);
  /* A Short is held to YouTube's rule from the file itself, and the film's own length now holds an
     upload's chapters to its end as an update's already were (44i-2c, closing 44i-2b-2; youtube/probe.js). */
  if (a.short !== undefined && typeof a.short !== 'boolean') throw new Error('short is true or false.');
  const shape = probeVideo(file);
  if (a.short) checkShort(shape, basename(file));
  /* The words and the captions are judged here, before a job exists, so a bad chapter list or caption file is refused at the call and never fails later in the drain (44i-2b). */
  wordsFor(a, shape?.durationSec);
  captionsFor(a);
  if (a.privacy !== undefined && !PRIVACY.includes(a.privacy)) throw new Error(`privacy is one of ${PRIVACY.join(', ')}.`);
  if (a.publish_at && a.privacy && a.privacy !== 'private') throw new Error('A scheduled video goes up private and turns public at publish_at; leave privacy out or private.');
  if (a.thumbnail) uploadable(a.thumbnail, IMAGE, 'A thumbnail');
  return { file, st };
}
function buildJob(a, file, st) {
  const playlists = Array.isArray(a.playlists)
    ? a.playlists.map((p) => (typeof p === 'string' ? { id: p } : { id: String(p.id), ...(Number.isInteger(p.position) ? { position: p.position } : {}) }))
    : a.playlist_id ? [{ id: String(a.playlist_id) }] : undefined;
  const shape = probeVideo(file);
  const words = wordsFor(a, shape?.durationSec);
  const captions = captionsFor(a);
  const shorts = shortsNote(shape, a.short);
  return {
    id: b64url(randomBytes(6)), file, size: st.size, mtime: st.mtimeMs, mime: MIME[extname(file).toLowerCase()],
    meta: {
      snippet: { title: a.title, description: words.description, tags: a.tags ?? [], categoryId: String(a.category_id ?? SETTINGS.categoryId), ...(a.language ? { defaultLanguage: a.language, defaultAudioLanguage: a.language } : {}) },
      status: { privacyStatus: a.privacy ?? 'private', selfDeclaredMadeForKids: Boolean(a.made_for_kids ?? false), ...(a.publish_at ? { publishAt: a.publish_at } : {}) },
      ...(words.localizations ? { localizations: words.localizations } : {}),
    },
    ...(captions.length ? { captions } : {}),
    playlist_id: a.playlist_id ?? playlists?.[0]?.id,
    ...(playlists?.length ? { playlists } : {}),
    thumbnail: a.thumbnail ? resolve(a.thumbnail) : undefined,
    ...(a.key ? { key: String(a.key) } : {}),
    ...(a.replaces ? { replaces: String(a.replaces) } : {}),
    ...(a.short ? { short: true } : {}), ...(shorts ? { shorts } : {}),
    sent: 0, started: new Date(nowMs()).toISOString(),
  };
}

async function uploadVideo(rawArgs, onProgress) {
  const { path: resolvedFile } = uploadable(rawArgs.file, MIME, 'A video');
  const a = mergeArgsWithCard(rawArgs, readUploadCard(resolvedFile));
  const { file, st } = validateUploadArgs(a, resolvedFile);
  await accessToken();
  const { jobs } = readStore();
  const same = (j) => j.file === file && j.size === st.size && j.mtime === st.mtimeMs && j.meta.snippet.title === a.title;
  const done = jobs.find((j) => same(j) && j.state === 'done');
  if (done && !a.again) throw new Error(`This file is already up with this title: ${watchUrl(done.video_id)}. Pass again: true to upload a second copy.`);
  let job = a.again ? null : jobs.find((j) => same(j) && j.state !== 'done');
  if (job && running.has(job.id)) return { ...jobView(job), note: 'already uploading in this window' };
  if (job && busyElsewhere(job)) return { ...jobView(job), note: 'already uploading from another app on this computer' };
  if (job && job.state === 'queued' && job.notBefore && Date.parse(job.notBefore) > nowMs()) return jobView(job);
  if (!job) job = buildJob(a, file, st);
  else {
    if (a.key && !job.key) job.key = String(a.key);
    if (a.replaces && !job.replaces) job.replaces = String(a.replaces);
  }
  let live = true;
  const p = run(job, (sent, total) => { if (live) onProgress?.(sent, total); });
  await Promise.race([p.catch(() => {}), sleep(WAIT_MS)]);
  live = false;
  return jobView(job);
}

function queueUploadCore(a, file, st) {
  const { jobs } = readStore();
  const same = (j) => j.file === file && j.size === st.size && j.mtime === st.mtimeMs && j.meta.snippet.title === a.title;
  const done = jobs.find((j) => same(j) && j.state === 'done');
  if (done && !a.again) throw new Error(`This file is already up with this title: ${watchUrl(done.video_id)}. Pass again: true to upload a second copy.`);
  const existing = a.again ? null : jobs.find((j) => same(j) && (j.state === 'queued' || j.state === 'uploading'));
  if (existing) throw new Error(`This file is already queued with this title (job ${existing.id}). Pass again: true to queue a second copy.`);
  const job = { ...buildJob(a, file, st), state: 'queued', note: 'Queued; this computer uploads it on the next pass.' };
  saveJob(job);
  if (job.replaces) {
    const m = readManifest();
    const idx = m.videos.findIndex((e) => e.videoId === job.replaces);
    if (idx >= 0) {
      m.videos[idx] = { ...m.videos[idx], status: 'queued', updatedAt: new Date(nowMs()).toISOString() };
      writeManifest(m);
    }
  }
  return jobView(job);
}

function queueUpload(a) {
  const { path: resolvedFile } = uploadable(a.file, MIME, 'A video');
  const merged = mergeArgsWithCard(a, readUploadCard(resolvedFile));
  const { file, st } = validateUploadArgs(merged, resolvedFile);
  return queueUploadCore(merged, file, st);
}

/*
  A whole folder queued at once (44i-2c, youtube/folder.js). Every film is
  judged as queue_upload would judge it, its card winning over the folder's
  shared fields (the card was written for that film), and only then is
  anything queued: one refused film queues nothing unless skip_refused says
  to queue the rest, so a release is never half in. A film already queued or
  up under the same title is left alone, so asking again after adding films
  queues the new ones.
*/
const FOLDER_SHARED = ['description', 'tags', 'privacy', 'category_id', 'made_for_kids', 'language', 'playlist_id', 'music', 'credits', 'short'];
function queueFolder(a) {
  const { folder, films } = filmsIn(a.folder, { home: homedir(), kinds: MIME, uploadable: (p) => uploadable(p, MIME, 'A video') });
  if (!films.length) throw new Error(`${folder} holds no film (${Object.keys(MIME).join(' ')}).`);
  const shared = Object.fromEntries(FOLDER_SHARED.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));
  const { jobs } = readStore();
  const plan = films.map(({ path, refused }) => {
    const row = { file: basename(path) };
    if (refused) return { ...row, state: 'refused', reason: refused };
    try {
      const m = mergeArgsWithCard(readUploadCard(path), shared);
      if (!m.title && a.title_from_name) m.title = titleFromName(path);
      if (!m.title) throw new Error(`no title: give it a card (${basename(path, extname(path))}.youtube.json) or pass title_from_name: true.`);
      const { file, st } = validateUploadArgs(m, path);
      const same = (j) => j.file === file && j.size === st.size && j.mtime === st.mtimeMs && j.meta.snippet.title === m.title;
      const done = jobs.find((j) => same(j) && j.state === 'done');
      if (done) return { ...row, title: m.title, state: 'already up', url: watchUrl(done.video_id) };
      const pending = jobs.find((j) => same(j) && (j.state === 'queued' || j.state === 'uploading'));
      if (pending) return { ...row, title: m.title, state: 'already queued', job: pending.id };
      const shorts = shortsNote(probeVideo(file), m.short);
      return { ...row, title: m.title, privacy: m.privacy ?? 'private', state: 'ready', ...(shorts ? { shorts } : {}), go: () => queueUploadCore(m, file, st) };
    } catch (e) { return { ...row, state: 'refused', reason: e.message }; }
  });
  const refused = plan.filter((r) => r.state === 'refused').length;
  const ready = plan.filter((r) => r.state === 'ready');
  const go = !a.dry_run && (!refused || a.skip_refused === true);
  if (go) for (const r of ready) { r.job = r.go().job; r.state = 'queued'; }
  const files = plan.map(({ go: _, ...r }) => (r.state === 'ready' ? { ...r, state: a.dry_run ? 'would queue' : 'not queued' } : r));
  const note = a.dry_run ? `Dry run, nothing queued: ${ready.length} would be${refused ? `, ${refused} refused` : ''}.`
    : !go ? `Nothing queued: ${refused} refused. Fix ${refused > 1 ? 'them' : 'it'}, or pass skip_refused: true to queue the other ${ready.length}.`
    : `${ready.length} queued${refused ? `, ${refused} refused and left out` : ''}; this computer uploads them on its own passes (100 a day).`;
  return { folder, note, files };
}

async function findVideoPlaylists(videoId) {
  const allPlaylists = [];
  let plToken;
  for (;;) {
    const { j } = await api('GET', 'playlists', { query: { part: 'snippet', mine: true, maxResults: 50, ...(plToken ? { pageToken: plToken } : {}) } });
    for (const p of j.items ?? []) allPlaylists.push({ id: p.id, title: p.snippet?.title });
    if (!j.nextPageToken || !(j.items ?? []).length) break;
    plToken = j.nextPageToken;
  }
  const found = [];
  for (const pl of allPlaylists) {
    let itemToken;
    for (;;) {
      const { j } = await api('GET', 'playlistItems', { query: { part: 'snippet,contentDetails', playlistId: pl.id, maxResults: 50, ...(itemToken ? { pageToken: itemToken } : {}) } });
      const items = j.items ?? [];
      for (const item of items) {
        const vid = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
        if (vid === videoId) {
          const pos = item.snippet?.position;
          found.push({ id: pl.id, ...(Number.isInteger(pos) ? { position: pos } : {}) });
        }
      }
      if (!j.nextPageToken || !items.length) break;
      itemToken = j.nextPageToken;
    }
  }
  return found;
}

async function replaceVideo(a) {
  const { path: resolvedFile } = uploadable(a.file, MIME, 'A video');
  const card = readUploadCard(resolvedFile);
  const oldId = String(a.video_id ?? card.replaces ?? '').trim();
  if (!oldId) throw new Error('video_id is needed.');
  const [old] = await videos([oldId]);
  if (!old) throw new Error(`No video ${oldId} on this channel.`);
  const m = readManifest();
  const oldIdx = m.videos.findIndex((e) => e.videoId === oldId);
  const oldEntry = oldIdx >= 0 ? m.videos[oldIdx] : null;
  const playlists = Array.isArray(oldEntry?.playlists) ? oldEntry.playlists : await findVideoPlaylists(oldId);
  const nowIso = new Date(nowMs()).toISOString();
  if (oldIdx >= 0) {
    m.videos[oldIdx] = { ...oldEntry, playlists, updatedAt: nowIso };
  } else {
    m.videos.push({
      videoId: oldId,
      title: old.snippet?.title ?? '',
      privacy: old.status?.privacyStatus ?? '',
      publishedAt: old.snippet?.publishedAt ?? '',
      playlists,
      status: 'ok',
      updatedAt: nowIso,
    });
  }
  writeManifest(m);
  const base = {
    title: old.snippet?.title,
    description: old.snippet?.description ?? '',
    tags: old.snippet?.tags ?? [],
    category_id: old.snippet?.categoryId ? String(old.snippet.categoryId) : SETTINGS.categoryId,
    ...(old.snippet?.defaultLanguage ? { language: old.snippet.defaultLanguage } : {}),
    ...(old.localizations && Object.keys(old.localizations).length ? { localizations: old.localizations } : {}),
    made_for_kids: Boolean(old.status?.selfDeclaredMadeForKids ?? false),
    ...(playlists.length ? { playlists } : {}),
    ...(oldEntry?.key ? { key: oldEntry.key } : {}),
    privacy: 'private',
    replaces: oldId,
  };
  let merged = mergeArgsWithCard(card, base);
  merged = mergeArgsWithCard({ ...a, replaces: oldId }, merged);
  const { file, st } = validateUploadArgs(merged, resolvedFile);
  const queued = queueUploadCore(merged, file, st);
  return {
    read: {
      video_id: oldId,
      title: old.snippet?.title,
      description: old.snippet?.description ?? '',
      tags: old.snippet?.tags ?? [],
      category_id: old.snippet?.categoryId,
      privacy: old.status?.privacyStatus,
      playlists,
      ...(oldEntry?.key ? { key: oldEntry.key } : {}),
    },
    queued,
  };
}

// The release plan (44i-9) lives in youtube/release.js (moved 44i-2c-2), bound the same way.
bindRelease({ ZONE, PRIVACY, nowMs, readStoreStrict, writeStore, videos, updateVideo, zoneWall, formatLocal });

function notify(message) {
  // Only a real drain speaks. A run against a stand-in Google (the check, the GOOGLE override
  // set) never does: on 2026-11-22 the check's early drain lines ran without NO_NOTIFY while the
  // check and its mutants ran again and again, and every pass put a real "YouTube" notification
  // on the owner's screen. A notification the check did not ask for is a bug in the check's
  // reach, so the server refuses it here, not only the check's env. Which notifier runs is the
  // host's own (platform.js): osascript on macOS, notify-send on Linux, a PowerShell balloon on
  // Windows; a system with none just stays quiet, since the queue's state is the real record.
  if (env('NO_SCHEDULER') === '1' || env('NO_LAUNCHCTL') === '1' || env('NO_NOTIFY') === '1' || env('GOOGLE')) return;
  const n = notifyCommand(PLATFORM, 'YouTube', message);
  if (!n) return;
  try {
    execFileSync(n.cmd, n.args, { stdio: 'ignore', timeout: 15_000, env: { ...process.env, ...(n.env ?? {}) } });
  } catch { /* notification is best-effort */ }
}

async function drain() {
  // Check local sign-in and manifest/jobs readability before touching Google,
  // so a drain with nothing due sends zero requests yet still catches broken config.
  client();
  if (!loadToken()?.refresh_token) throw new Setup('Not signed in to YouTube yet. In Terminal, from the repo: node mcp/youtube-mcp.js login');
  const initial = readStoreStrict();
  readManifestStrict();
  const ordered = initial.jobs
    .slice()
    .sort((a, b) => Date.parse(a.started ?? 0) - Date.parse(b.started ?? 0));
  let authed = false;
  for (const item of ordered) {
    const fresh = readStoreStrict().jobs.find((j) => j.id === item.id);
    if (!fresh || (fresh.state !== 'queued' && fresh.state !== 'uploading')) continue;
    if (busyElsewhere(fresh)) continue;
    if (fresh.notBefore && Date.parse(fresh.notBefore) > nowMs()) continue;
    if (!authed) { await accessToken(); authed = true; }
    await run(fresh);
    if (fresh.state === 'done') {
      notify(`${fresh.meta.snippet.title} — ${watchUrl(fresh.video_id)}`);
    } else if (fresh.state === 'failed') {
      notify(`Failed: ${fresh.meta.snippet.title} — ${fresh.error ?? 'upload failed'}`);
    } else if (fresh.state === 'queued' && fresh.notBefore) {
      const store = readStoreStrict();
      const nbMs = Date.parse(fresh.notBefore);
      let changed = false;
      for (const j of store.jobs) {
        if (j.id !== fresh.id && j.state === 'queued' && (!j.notBefore || Date.parse(j.notBefore) < nbMs)) {
          j.notBefore = fresh.notBefore;
          j.note = fresh.note;
          changed = true;
        }
      }
      if (changed) writeStore(store);
      break;
    }
  }
}

/*
  The hourly drain, in the host system's own scheduler (platform.js: a
  LaunchAgent, a systemd user timer, or a Task Scheduler task). The plan is
  computed, written and run here; with NO_SCHEDULER (or the old NO_LAUNCHCTL)
  the files are written and the commands printed but not run, which is how the
  check reads every system's plan on one machine (PLATFORM picks which).
*/
function agentPlan() {
  const plan = schedulePlan({ platform: PLATFORM, home: homedir(), node: process.execPath, script: realpathSync(fileURLToPath(import.meta.url)), log: join(DIR, 'drain.log'), label: AGENT_LABEL });
  if (!plan) throw new Setup(`No scheduler this server knows on ${PLATFORM}. Run \`node ${fileURLToPath(import.meta.url)} drain\` every hour with the system's own scheduler.`);
  return plan;
}
const dryScheduler = () => env('NO_SCHEDULER') === '1' || env('NO_LAUNCHCTL') === '1';
function runSteps(steps) {
  for (const st of steps) {
    if (dryScheduler()) { log(`would run: ${st.cmd} ${st.args.map((x) => JSON.stringify(x)).join(' ')}`); continue; }
    try { execFileSync(st.cmd, st.args, { stdio: st.mayFail ? 'ignore' : 'inherit' }); } catch (e) { if (!st.mayFail) throw e; }
  }
}
function installAgent() {
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  if (PLATFORM !== 'win32') chmodSync(DIR, 0o700);
  const plan = agentPlan();
  for (const d of plan.dirs) mkdirSync(d, { recursive: true });
  for (const f of plan.files) writeFileSync(f.path, f.text, { mode: 0o644 });
  runSteps(plan.install);
  log(`installed the hourly drain as a ${plan.kind}${plan.files.length ? `: ${plan.files.map((f) => f.path).join(', ')}` : ` named ${AGENT_LABEL}`}`);
}
function uninstallAgent() {
  const plan = agentPlan();
  runSteps(plan.uninstall);
  for (const f of plan.files) if (existsSync(f.path)) unlinkSync(f.path);
  log(`uninstalled the hourly drain (${plan.kind})`);
}

// ── The tools ──────────────────────────────────────────────────────────

// ── Analytics (44i-2d) ─────────────────────────────────────────────────

/* Asked for only after `login --add analytics`: a key that lists its scopes and lacks this one is
   refused here, before any request, with the command that fixes it (youtube/analytics.js). */
async function analytics(a) {
  const run = 'node mcp/youtube-mcp.js';
  if (granted(loadToken(), ANALYTICS_SCOPE) === false) throw new Setup(ANALYTICS_OFF(run));
  const range = parseRange(a, nowMs());
  const ask = async (query) => {
    try { return (await api('GET', 'reports', { query: { ids: 'channel==MINE', ...query }, base: G.analytics })).j; } catch (e) {
      const fix = analyticsFix(e, run);
      throw fix ? new Setup(fix) : e;
    }
  };
  let id = a.video_id === undefined ? null : String(a.video_id);
  const m = readManifest();
  if (a.key !== undefined) {
    if (id) throw new Error('Pass video_id or key, not both.');
    const e = m.videos.find((v) => v.key === String(a.key) && v.status !== 'replaced' && v.status !== 'removed');
    if (!e) throw new Error(`No live video with key "${a.key}" in the manifest.`);
    id = e.videoId;
  }
  if (id) {
    const [v] = await videos([id]);
    // videos.list answers for any public video; the reports cover this channel's alone, so a film of another's is refused here, in words (1 more unit).
    if (!v || v.snippet?.channelId !== (await channel()).id) throw new Error(`No video ${id} on this channel.`);
    const key = m.videos.find((e) => e.videoId === id)?.key;
    return videoReport({ ask, range, detail: Boolean(a.detail), video: { id, key, title: v.snippet?.title ?? '', durationSec: isoSeconds(v.contentDetails?.duration) } });
  }
  const lookup = async (ids) => {
    const names = new Map(m.videos.filter((e) => ids.includes(e.videoId)).map((e) => [e.videoId, { key: e.key, title: e.title }]));
    const rest = ids.filter((x) => !names.get(x)?.title);
    for (let i = 0; i < rest.length; i += 50) for (const v of await videos(rest.slice(i, i + 50))) names.set(v.id, { ...names.get(v.id), title: v.snippet?.title ?? '' });
    return names;
  };
  return channelReport({ ask, lookup, range, limit: a.limit });
}

const GUIDE = `You manage the owner's YouTube channel. Nothing here needs the light show running.

- Uploads go up PRIVATE unless you pass privacy. Make a video unlisted or public, or schedule it (publish_at), or run release_plan, only when the owner said so in this conversation. A scheduled video is private until its time; YouTube only schedules a private video.
- Before uploading, say what you will upload: the file, the title, the privacy. Credit the music's source in the description when the owner has one (where a recording came from and its date).
- Credits: when settings.json has a credits line, every new upload's description ends with it (and each other language's). If the line holds {music}, pass music (the title of the piece); for a film with other music pass a credits line of its own, or credits: false only when the owner said the film needs none.
- Chapters: pass chapters (lines like "0:00 Intro", or { at, title }) and they go into the description as YouTube reads them: first at 0:00, three or more, each ten seconds or longer. update_video with chapters replaces the old list.
- Captions: an upload's captions (.srt or .vtt, with a language) are added once it is up; add_captions adds one to a video already up. Each costs 400 quota units, so say so first.
- Other languages: localizations ({"es": {"title", "description"}}) need the video's own language (language).
- If a file has a sidecar card beside it (<file without extension>.youtube.json), upload_video, queue_upload and replace_video read it for any field the call leaves out (call wins); unknown fields in the card are refused.
- upload_video answers within about 45 seconds: a short film is done by then; a long one answers "uploading" and carries on. Check it with upload_status. If an upload stops (the computer slept, the app closed), ask upload_video again with the same file and title: it carries on where it stopped and never makes a second copy unless you pass again: true.
- A job in state "queued" (from queue_upload, replace_video, or from upload_video hitting YouTube's daily upload limit or quota) is NOT a failure: this computer's hourly drain finishes it on its own after not_before (shown in the settings time zone) and shows a notification when done or failed. Do not retry it by hand.
- Shorts: pass short: true (or "short": true in the card) and the film is held to YouTube's rule, measured from the file: 3:00 or less, square or vertical (a landscape film, such as most best.mp4 clips from reelreader, is refused: cut a 9:16 copy first); #Shorts is added to the description unless the title or description has it. A short, tall film uploaded without short: true is still a Short on YouTube; its job says so under shorts. A Short over a minute with a Content ID claim on its music is blocked everywhere, so say so when the music is not the owner's or CC.
- queue_folder queues every film directly in a folder (each one's card wins over the call's shared fields; title_from_name makes a title from a file name with no card). Run it with dry_run: true first and show the owner the list. One refused film queues nothing unless skip_refused: true; films already queued or up are left alone. Then release_plan can space them out.
- Use queue_upload to line up several films without uploading them immediately, and replace_video to queue a re-rendered file carrying the old video's title, description, tags, category and playlists (without deleting or changing the old video; deleting stays in YouTube Studio).
- Use manifest (with sync: true to pull all pages from the channel, 1 quota unit a page, including views and likes) and mark_video to track which videos are ok, need rerecord, are queued, replaced or removed.
- YouTube processes a video for a few minutes after the upload; its upload_status in list_videos says when it is "processed".
- analytics: watch time, average view, retention (who is still watching at each tenth of the film and the steepest drop) and traffic sources for one video (video_id or key, plus the search terms that found it), or the channel's videos by watch time. Dates are YouTube's, in Pacific time, the last 28 days by default; numbers arrive a day or three late. It needs the owner to have run login --add analytics once; if it says so, pass that on, do not retry.
- Deleting is not here on purpose: tell the owner to delete in YouTube Studio.
- Quota: 100 uploads a day; an update, thumbnail or playlist change costs 50 of 10,000 a day (release_plan costs 50 per live video updated, 0 per queued job — state the cost first); reading (and each manifest sync page or playlist scan) costs 1.`;

const str = { type: 'string' };
/* The parts of the description and the other languages (44i-2b), shared by uploads and update_video. */
const wordProps = {
  chapters: { description: 'Chapters written into the description: lines like "0:00 Intro" (one string or a list), or [{ at: "1:30" or seconds, title }]. First at 0:00, three or more, each ten seconds or longer.', anyOf: [str, { type: 'array', items: { anyOf: [str, { type: 'object', properties: { at: { anyOf: [str, { type: 'number' }] }, title: str } }] } }] },
  music: { ...str, description: 'The title of the piece of music, for a credits line in settings.json that holds {music}.' },
  credits: { description: 'This upload\'s own credits line instead of the one in settings.json, or false for none.', anyOf: [str, { type: 'boolean' }] },
  localizations: { type: 'object', description: 'Title and description in other languages: {"es": {"title": "...", "description": "..."}}; needs language. A language without a description gets the default one. On update_video, null for a language removes it.', additionalProperties: { anyOf: [{ type: 'object', properties: { title: str, description: str } }, { type: 'null' }] } },
};
const uploadProps = {
  file: { ...str, description: 'Full path to the video file on this computer.' },
  title: { ...str, description: 'At most 100 characters (may come from <file>.youtube.json).' },
  description: str,
  tags: { type: 'array', items: str },
  privacy: { type: 'string', enum: PRIVACY, description: 'Default private. Only another value when the owner asked for it.' },
  publish_at: { ...str, description: 'Schedule: an ISO 8601 time in the future; the video stays private until then.' },
  category_id: { ...str, description: 'YouTube category id; default from settings.json (categoryId, else 22 People & Blogs). 10 is Music, 24 Entertainment, 1 Film & Animation.' },
  made_for_kids: { type: 'boolean', description: 'Default false.' },
  language: { ...str, description: 'e.g. en' },
  playlist_id: { ...str, description: 'Add it to this playlist once it is up.' },
  thumbnail: { ...str, description: 'Full path to a .jpg or .png (16:9, at most 2 MB) to set once it is up.' },
  key: { ...str, description: 'Optional short film id (e.g. "hymn-to-the-dawn") recorded in the channel manifest.' },
  replaces: { ...str, description: 'Optional existing video id this upload replaces in the manifest.' },
  again: { type: 'boolean', description: 'Upload a second copy of a file already up with this title.' },
  short: { type: 'boolean', description: 'A YouTube Short: refused unless the file is 3:00 or less and square or vertical (measured from it); #Shorts added to the description.' },
  ...wordProps,
  captions: { type: 'array', description: 'Caption files to add once it is up (400 quota units each): a path, or { file, language, name, draft }. language defaults to the upload\'s.', items: { anyOf: [str, { type: 'object', required: ['file'], properties: { file: str, language: str, name: str, draft: { type: 'boolean' } } }] } },
};
const TOOLS = [
  {
    name: 'analytics',
    description: "How videos are watched (YouTube Analytics, after login --add analytics): for one video (video_id or the manifest's key) its views, watch minutes, average view, share watched, retention at each tenth of the film with the steepest drop, traffic sources and the search terms that found it; with no video, the channel's totals, its videos by watch time and its traffic sources. Dates in Pacific time, as YouTube counts them: the last 28 days unless days or start/end say otherwise. Read-only; costs 1 Data API unit for a named video's title and length.",
    inputSchema: {
      type: 'object',
      properties: {
        video_id: str, key: { type: 'string', description: "A manifest key in place of video_id." },
        days: { type: 'integer', minimum: 1, description: 'Days ending today (or end), 28 by default.' },
        start: { type: 'string', description: 'First day, YYYY-MM-DD (Pacific).' }, end: { type: 'string', description: 'Last day, YYYY-MM-DD (Pacific), today by default.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: "The channel's top videos by watch time, 25 by default." },
        detail: { type: 'boolean', description: 'All 100 retention points, not eleven.' },
      },
    },
  },
  { name: 'channel', description: 'The signed-in channel: its name, link, subscribers, views and video count.', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_videos', description: "The channel's latest uploads, newest first: id, link, title, privacy, schedule, processing state, views.", inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50, description: 'How many (default 10).' } } } },
  {
    name: 'upload_video',
    description: 'Upload a video file from this computer (reads <file>.youtube.json sidecar for omitted fields; call wins). Private unless privacy says otherwise. Resumes an interrupted upload of the same file and title. If YouTube answers with the daily upload limit or quota, queues the job for automatic retry on the Mac instead of failing.',
    inputSchema: { type: 'object', required: ['file'], properties: uploadProps },
  },
  {
    name: 'queue_upload',
    description: 'Save a video upload job in state "queued" without uploading yet (reads <file>.youtube.json sidecar for omitted fields; call wins); this computer drains the queue on its own. Refuses if the same file and title is already queued or up.',
    inputSchema: { type: 'object', required: ['file'], properties: uploadProps },
  },
  {
    name: 'queue_folder',
    description: 'Queue every film directly in a folder (MP4, MOV, WebM...; not its subfolders), in name order, each judged as queue_upload would. Each film\'s <file>.youtube.json card wins over the shared fields given here. If any film is refused nothing is queued, unless skip_refused. Films already queued or up with the same title are left alone. Run with dry_run first.',
    inputSchema: {
      type: 'object', required: ['folder'],
      properties: {
        folder: { ...str, description: 'Full path to the folder on this computer.' },
        dry_run: { type: 'boolean', description: 'List what would be queued and what is refused, queue nothing.' },
        skip_refused: { type: 'boolean', description: 'Queue the films that pass even when others are refused.' },
        title_from_name: { type: 'boolean', description: 'A film with no title in its card is titled from its file name ("hymn-to-the-dawn.mp4" -> "Hymn to the dawn").' },
        ...Object.fromEntries(FOLDER_SHARED.map((k) => [k, uploadProps[k]])),
      },
    },
  },
  {
    name: 'replace_video',
    description: 'Read an old video (snippet, status and playlists) and queue a replacement upload of a new file with the old title, description, tags, category, playlists and manifest key (unless overridden by call or <file>.youtube.json sidecar), privacy private, replaces = old video_id. Never deletes or modifies the old video.',
    inputSchema: {
      type: 'object',
      required: ['video_id', 'file'],
      properties: {
        video_id: { ...str, description: 'Existing video id being replaced.' },
        ...uploadProps,
      },
    },
  },
  { name: 'upload_status', description: 'How the uploads are going (or one, by its job id): MB sent, queued jobs with not_before in the settings time zone (not a failure; this computer finishes them on its own — do not retry by hand), done, failed and why, the link once up.', inputSchema: { type: 'object', properties: { job: str } } },
  {
    name: 'update_video',
    description: "Change a video's title, description, chapters, credits, other languages, tags, category, privacy or schedule. Only the fields you pass change; new chapters replace the old list.",
    inputSchema: { type: 'object', required: ['video_id'], properties: { video_id: str, title: str, description: str, tags: { type: 'array', items: str }, category_id: str, language: str, privacy: { type: 'string', enum: PRIVACY }, publish_at: { ...str, description: 'ISO time to go public; empty string to unschedule.' }, made_for_kids: { type: 'boolean' }, ...wordProps } },
  },
  {
    name: 'add_captions',
    description: `Add a caption track to a video already up, from an .srt or .vtt file on this computer (${CAPTION_UNITS} quota units).`,
    inputSchema: { type: 'object', required: ['video_id', 'file', 'language'], properties: { video_id: str, file: str, language: { ...str, description: 'e.g. en, es, pt-BR' }, name: { ...str, description: 'The track\'s name as viewers see it (optional).' }, draft: { type: 'boolean', description: 'Keep it hidden from viewers until published in Studio.' } } },
  },
  { name: 'list_captions', description: "A video's caption tracks: id, language, name, draft (50 quota units).", inputSchema: { type: 'object', required: ['video_id'], properties: { video_id: str } } },
  {
    name: 'release_plan',
    description: 'Schedule a release across private live videos and queued upload jobs, one slot apart at a clock time in the settings time zone (the computer\'s own unless settings.json names one). Only run this without dry_run when the owner asked for that release in this conversation. Live video updates cost 50 quota units each (queued jobs cost 0); YouTube only schedules a private video.',
    inputSchema: {
      type: 'object',
      required: ['start'],
      properties: {
        keys: { type: 'array', items: str, description: 'Manifest keys of videos or queued jobs to schedule in order.' },
        video_ids: { type: 'array', items: str, description: 'YouTube video ids to schedule in order.' },
        start: { ...str, description: 'First release date (YYYY-MM-DD, in the settings time zone).' },
        every: { type: 'number', description: 'Hours between slots (default 24).' },
        at: { ...str, description: 'Clock time HH:MM in the settings time zone (default "10:00").' },
        privacy: { type: 'string', enum: PRIVACY, description: 'Target release privacy (default "public"; YouTube schedules private videos to become public).' },
        dry_run: { type: 'boolean', description: 'Return the computed plan and quota cost without changing anything.' },
      },
    },
  },
  { name: 'set_thumbnail', description: "Set a video's thumbnail from a .jpg or .png on this computer (needs the channel phone-verified).", inputSchema: { type: 'object', required: ['video_id', 'file'], properties: { video_id: str, file: str } } },
  { name: 'list_playlists', description: "The channel's playlists: id, title, privacy, how many videos.", inputSchema: { type: 'object', properties: {} } },
  { name: 'create_playlist', description: 'Make a playlist (private unless privacy says otherwise).', inputSchema: { type: 'object', required: ['title'], properties: { title: str, description: str, privacy: { type: 'string', enum: PRIVACY } } } },
  { name: 'add_to_playlist', description: 'Add a video to a playlist.', inputSchema: { type: 'object', required: ['video_id', 'playlist_id'], properties: { video_id: str, playlist_id: str } } },
  {
    name: 'manifest',
    description: 'Show the channel manifest table (key, title, id, privacy, views, likes, status, replacedBy), optionally filtered by status. Pass sync: true to page through the whole channel (including views and likes) and merge without overwriting local fields; sync costs 1 quota unit a page (plus 1 per 50 videos).',
    inputSchema: { type: 'object', properties: { sync: { type: 'boolean', description: 'Page through all uploads on the channel first (1 unit a page).' }, status: { type: 'string', enum: MANIFEST_STATUS, description: 'Filter table rows by status.' } } },
  },
  {
    name: 'mark_video',
    description: 'Set local manifest fields (status, reason, replaced_by, notes, key) on one video by video_id or key, or set one status change across a list of video_ids.',
    inputSchema: {
      type: 'object',
      properties: {
        video_id: str,
        video_ids: { type: 'array', items: str, description: 'Batch update multiple video ids in one call.' },
        key: { ...str, description: 'Film id to look up (when no video_id) or to set (when video_id is given).' },
        status: { type: 'string', enum: MANIFEST_STATUS },
        reason: str,
        replaced_by: str,
        notes: str,
      },
    },
  },
];

const text = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const fail = (m) => ({ content: [{ type: 'text', text: m }], isError: true });

async function call(name, a = {}, onProgress = null) {
  switch (name) {
    case 'analytics': return text(await analytics(a));
    case 'channel': { const { uploads, ...c } = await channel(); return text(c); }
    case 'list_videos': return text(await listVideos(Number(a.limit ?? 10)));
    case 'upload_video': return text(await uploadVideo(a, onProgress));
    case 'queue_upload': return text(queueUpload(a));
    case 'queue_folder': return text(queueFolder(a));
    case 'replace_video': return text(await replaceVideo(a));
    case 'upload_status': {
      const { jobs } = readStore();
      const filtered = jobs.filter((j) => !a.job || j.id === a.job).map((j) => (j.state === 'uploading' && !running.has(j.id) && !busyElsewhere(j) ? { ...j, state: 'stopped (ask upload_video again with the same file and title to resume)' } : j));
      const shown = a.job ? filtered : filtered.filter((j, idx) => j.state === 'queued' || j.state === 'uploading' || idx >= filtered.length - 10);
      return text(shown.length ? shown.map(jobView) : 'No uploads yet.');
    }
    case 'update_video': {
      if (a.privacy !== undefined && !PRIVACY.includes(a.privacy)) return fail(`privacy is one of ${PRIVACY.join(', ')}.`);
      if (a.publish_at && a.privacy && a.privacy !== 'private') return fail('A scheduled video stays private until publish_at; leave privacy out.');
      return text(await updateVideo(a));
    }
    case 'release_plan': return text(await releasePlan(a));
    case 'add_captions': {
      const [c] = captionsFor({ captions: [{ file: a.file, language: a.language, name: a.name, draft: a.draft }] });
      return text(await addCaptions(String(a.video_id), c));
    }
    case 'list_captions': return text(await listCaptions(String(a.video_id)));
    case 'set_thumbnail': return text(await setThumbnail(String(a.video_id), String(a.file)));
    case 'list_playlists': {
      const { j } = await api('GET', 'playlists', { query: { part: 'snippet,status,contentDetails', mine: true, maxResults: 50 } });
      return text((j.items ?? []).map((p) => ({ id: p.id, title: p.snippet?.title, privacy: p.status?.privacyStatus, videos: p.contentDetails?.itemCount })));
    }
    case 'create_playlist': {
      if (a.privacy !== undefined && !PRIVACY.includes(a.privacy)) return fail(`privacy is one of ${PRIVACY.join(', ')}.`);
      const { j } = await api('POST', 'playlists', { query: { part: 'snippet,status' }, body: { snippet: { title: a.title, description: a.description ?? '' }, status: { privacyStatus: a.privacy ?? 'private' } } });
      return text({ id: j.id, title: j.snippet?.title, privacy: j.status?.privacyStatus });
    }
    case 'add_to_playlist': return text(await addToPlaylist(String(a.video_id), String(a.playlist_id)));
    case 'manifest': {
      if (a.status !== undefined && !MANIFEST_STATUS.includes(a.status)) return fail(`status is one of ${MANIFEST_STATUS.join(', ')}.`);
      const m = a.sync ? await syncManifest() : readManifest();
      return text(formatManifestTable(m.videos, a.status));
    }
    case 'mark_video': return text(markVideo(a));
    default: return fail(`No such tool: ${name}`);
  }
}

// ── The protocol ───────────────────────────────────────────────────────

const write = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
process.stdout.on('error', () => process.exit(0));

async function onRequest(m) {
  const { id, method, params } = m;
  const reply = (result) => { if (id !== undefined) write({ jsonrpc: '2.0', id, result }); };
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      reply({ protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: 'youtube', version: '0.1.0' }, instructions: GUIDE });
      return;
    }
    case 'ping': reply({}); return;
    case 'tools/list': reply({ tools: TOOLS }); return;
    case 'tools/call': {
      const progressToken = params?._meta?.progressToken;
      let openProgress = true;
      const onProgress = (progressToken !== undefined && progressToken !== null)
        ? (progress, total) => { if (openProgress) write({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken, progress, total } }); }
        : null;
      try { reply(await call(params?.name, params?.arguments ?? {}, onProgress)); }
      catch (e) { reply(fail(String(e?.message ?? e))); }
      finally { openProgress = false; }
      return;
    }
    default:
      if (method?.startsWith('notifications/')) return;
      if (id !== undefined) write({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

const command = process.argv[2];
if (command === 'setup') {
  const r = await runSetup({
    dir: DIR, secretFile: SECRET_FILE, tokenFile: TOKEN_FILE, script: realpathSync(fileURLToPath(import.meta.url)), platform: PLATFORM, settings: SETTINGS,
    client, loadToken, accessToken, channel,
    agentFiles: () => { try { return agentPlan().files.map((f) => f.path); } catch { return null; } },
  });
  process.stdout.write(`${formatSetup(r)}\n`);
  process.exit(r.ok ? 0 : 1);
} else if (command === 'login' || command === 'logout' || command === 'whoami' || command === 'drain' || command === 'install-agent' || command === 'uninstall-agent' || command === 'manifest') {
  try {
    if (command === 'login') {
      // `login --add analytics` (44i-2d): an opt-in scope on top of what the saved sign-in has.
      const args = process.argv.slice(3);
      const add = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] !== '--add' || !args[i + 1]) throw new Error(`login takes --add ${Object.keys(OPT_IN).join('|')}, not ${JSON.stringify(args.slice(i).join(' '))}.`);
        add.push(args[++i]);
      }
      await login(add);
    }
    else if (command === 'logout') await logout();
    else if (command === 'whoami') { const { uploads, ...c } = await channel(); log(JSON.stringify(c)); }
    else if (command === 'drain') await drain();
    else if (command === 'install-agent') installAgent();
    else if (command === 'uninstall-agent') uninstallAgent();
    else {
      const args = process.argv.slice(3);
      const sync = args.includes('--sync');
      const mdIdx = args.indexOf('--md');
      const mdFile = mdIdx >= 0 ? args[mdIdx + 1] : null;
      if (mdIdx >= 0 && !mdFile) throw new Error('--md needs a file path.');
      const m = sync ? await syncManifest() : readManifestStrict();
      const table = formatManifestTable(m.videos);
      if (mdFile) { writeFileSync(mdFile, `${table}\n`); log(`wrote ${mdFile}`); }
      else process.stdout.write(`${table}\n`);
    }
    process.exit(process.exitCode ?? 0); // a login whose opt-in was unticked has set 1 (44i-2d)
  } catch (e) { log(e instanceof Setup ? e.message : `failed: ${e?.message ?? e}`); process.exit(1); }
} else {
  const lines = createInterface({ input: process.stdin });
  lines.on('line', (line) => {
    if (!line.trim()) return;
    let m;
    try { m = JSON.parse(line); } catch { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
    void onRequest(m);
  });
  /* The client gone: an upload in flight finishes first (it is saved as it
     goes either way, so a kill loses nothing but the time to resume). */
  lines.on('close', async () => { await Promise.allSettled([...running.values()]); process.exit(0); });
  log(`ready; keys in ${DIR}`);
}
