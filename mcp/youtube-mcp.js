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
 * It imports nothing from the repo, so it can be lifted into a repository of
 * its own if the owner ever decides to publish it (44i-2).
 *
 * The YouTube Data API v3, signed in with OAuth as a desktop app: the owner
 * makes a Google Cloud project once and saves its client file in
 * `~/.chromaglass/youtube/` (`CHROMAGLASS_YOUTUBE_DIR`), and `login` below
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
 *   node mcp/youtube-mcp.js login     sign in once (opens the browser)
 *   node mcp/youtube-mcp.js whoami    which channel the saved sign-in is
 *   node mcp/youtube-mcp.js logout    revoke the sign-in and forget it
 *   node mcp/youtube-mcp.js           the MCP server (what the assistant runs)
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const DIR = process.env.CHROMAGLASS_YOUTUBE_DIR ?? join(homedir(), '.chromaglass', 'youtube');
const SECRET_FILE = join(DIR, 'client_secret.json');
const TOKEN_FILE = join(DIR, 'token.json');
const JOBS_FILE = join(DIR, 'uploads.json');
/* One scope: `youtube` covers upload, update, thumbnails and playlists. The
   narrower `youtube.upload` cannot change a video once it is up, which is
   half of what was asked. */
const SCOPE = 'https://www.googleapis.com/auth/youtube';
const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
/* Google takes a chunk in multiples of 256 KiB. 8 MiB is its own suggestion
   for a steady connection: big enough that the per-request cost is nothing,
   small enough that a dropped one loses seconds. The check sets it small. */
const CHUNK = Number(process.env.CHROMAGLASS_YOUTUBE_CHUNK ?? 8 * 1024 * 1024);
/* How long upload_video waits before answering "still going": a short film
   finishes inside one call, a long one answers and carries on in the
   background, read with upload_status. Under a client's tool timeout. */
const WAIT_MS = Number(process.env.CHROMAGLASS_YOUTUBE_WAIT_MS ?? 45_000);
const BACKOFF_MS = Number(process.env.CHROMAGLASS_YOUTUBE_BACKOFF_MS ?? 1_000);
const TRIES = 8;
/* A chunk that neither lands nor fails (a half-dead connection after the Mac
   slept) is given up after this and treated as a drop. */
const PUT_MS = Number(process.env.CHROMAGLASS_YOUTUBE_PUT_MS ?? 120_000);
/* The files this server writes hold keys: the owner's alone. */
const PRIVATE = 0o600;

const log = (...a) => process.stderr.write(`youtube-mcp: ${a.join(' ')}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (b) => Buffer.from(b).toString('base64url');
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
  const o = process.env.CHROMAGLASS_YOUTUBE_GOOGLE;
  if (!o) return { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', revoke: 'https://oauth2.googleapis.com/revoke', api: 'https://www.googleapis.com/youtube/v3', upload: 'https://www.googleapis.com/upload/youtube/v3' };
  const u = new URL(o);
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1') throw new Error(`CHROMAGLASS_YOUTUBE_GOOGLE may only name a stand-in on http://127.0.0.1, not ${u.origin}`);
  const b = o.replace(/\/$/, '');
  return { auth: `${b}/auth`, token: `${b}/token`, revoke: `${b}/revoke`, api: `${b}/youtube/v3`, upload: `${b}/upload/youtube/v3` };
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
*/
async function login() {
  const c = client();
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const redirect = `http://127.0.0.1:${srv.address().port}/`;
  const url = new URL(G.auth);
  for (const [k, v] of Object.entries({ client_id: c.id, redirect_uri: redirect, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state })) url.searchParams.set(k, v);
  log(`Sign in with the Google account that owns the channel (pick the channel if it asks). The page should open by itself; if not, open:\n${url}`);
  if (!process.env.CHROMAGLASS_YOUTUBE_NO_BROWSER) {
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
function googleError(status, j, text) {
  const e = j?.error;
  const reason = e?.errors?.[0]?.reason ?? e?.status ?? '';
  const message = e?.message ?? (typeof e === 'string' ? e : String(text ?? '').slice(0, 200));
  return `YouTube said ${status}${reason ? ` (${reason})` : ''}: ${message}${HINTS[reason] ? `. That means ${HINTS[reason]}` : ''}`;
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
    if (!r.ok) throw new Error(googleError(r.status, j, text));
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
});

async function videos(ids) {
  if (!ids.length) return [];
  const { j } = await api('GET', 'videos', { query: { part: 'snippet,status,statistics,contentDetails', id: ids.join(','), maxResults: 50 } });
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
  if (a.title !== undefined) snippet.title = a.title;
  if (a.description !== undefined) snippet.description = a.description;
  if (a.tags !== undefined) snippet.tags = a.tags;
  if (a.category_id !== undefined) snippet.categoryId = String(a.category_id);
  if (a.language !== undefined) snippet.defaultLanguage = snippet.defaultAudioLanguage = a.language;
  /* The status part is whole too: a field left out is reset (a Studio
     "altered or synthetic" mark, embedding, the licence). So it starts from
     all of the video's status and drops only what YouTube sets itself;
     `madeForKids` is YouTube's own ruling, never the owner's declaration. */
  const status = { ...cur.status };
  for (const k of ['uploadStatus', 'failureReason', 'rejectionReason', 'madeForKids']) delete status[k];
  if (a.privacy !== undefined) { status.privacyStatus = a.privacy; if (a.privacy !== 'private') delete status.publishAt; }
  if (a.publish_at !== undefined) { status.publishAt = a.publish_at || undefined; if (a.publish_at) status.privacyStatus = 'private'; }
  if (a.made_for_kids !== undefined) status.selfDeclaredMadeForKids = Boolean(a.made_for_kids);
  const { j } = await api('PUT', 'videos', { query: { part: 'snippet,status' }, body: { id: cur.id, snippet, status } });
  return describe({ ...cur, ...j });
}

const IMAGE = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
async function setThumbnail(videoId, file) {
  const path = resolve(file);
  const type = IMAGE[extname(path).toLowerCase()];
  if (!type) throw new Error('A thumbnail is a .jpg or .png file.');
  if (statSync(path).size > 2 * 1024 * 1024) throw new Error('A thumbnail must be 2 MB or less.');
  await api('POST', 'thumbnails/set', { base: G.upload, query: { videoId, uploadType: 'media' }, raw: readFileSync(path), type });
  return 'thumbnail set';
}

async function addToPlaylist(videoId, playlistId) {
  await api('POST', 'playlistItems', { query: { part: 'snippet' }, body: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } } });
  return `added to playlist ${playlistId}`;
}

// ── Uploads ────────────────────────────────────────────────────────────

/*
  Every upload is a job, saved as it goes: the session Google gave (a URL
  that takes the rest of the file for about a week), how far Google has it,
  and what to do once it is up. Saved so that an upload outlives the
  assistant's app: asked again for the same file and title, a later server
  finds the job and carries on from Google's count instead of starting over.
  `pid` keeps two servers (a desktop chat and a coding agent open at once)
  from both pushing the same job.
*/
const running = new Map();
function readJobs() { try { return JSON.parse(readFileSync(JOBS_FILE, 'utf8')); } catch { return []; } }
function saveJob(job) {
  if (job.pid === process.pid) job.beat = Date.now();
  const jobs = readJobs().filter((j) => j.id !== job.id);
  jobs.push(job);
  writePrivate(JOBS_FILE, JSON.stringify(jobs.slice(-50), null, 2));
}
/* A pid is reused (a reboot, a kill mid-upload), so a job counts as another
   app's only while that app has saved it in the last five minutes too; a
   stalled chunk times out in two, so a live upload always beats sooner. */
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const busyElsewhere = (j) => Boolean(j.pid) && j.pid !== process.pid && pidAlive(j.pid) && Date.now() - (j.beat ?? 0) < 5 * 60_000;

function jobView(job) {
  const pct = job.size ? Math.floor((100 * job.sent) / job.size) : 0;
  return {
    job: job.id, file: job.file, title: job.meta.snippet.title, privacy: job.meta.status.privacyStatus, state: job.state,
    sent: `${(job.sent / 1048576).toFixed(1)} of ${(job.size / 1048576).toFixed(1)} MB (${pct}%)`,
    ...(job.video_id ? { video_id: job.video_id, url: watchUrl(job.video_id) } : {}),
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
  throw new Error(googleError(r.status, await r.json().catch(() => ({}))));
}

async function startSession(job) {
  const { r } = await api('POST', 'videos', { base: G.upload, query: { uploadType: 'resumable', part: 'snippet,status' }, body: job.meta, headers: { 'x-upload-content-length': String(job.size), 'x-upload-content-type': job.mime } });
  const at = r.headers.get('location');
  if (!at) throw new Error('YouTube gave no upload address.');
  return at;
}

async function push(job) {
  const fh = await open(job.file, 'r');
  let fails = 0;
  try {
    if (!job.session) { job.session = await startSession(job); job.sent = 0; saveJob(job); }
    else {
      const o = await askOffset(job);
      if (o.video) return o.video;
      if (o.gone) { job.session = await startSession(job); job.sent = 0; } else job.sent = o.at;
      saveJob(job);
    }
    const buf = Buffer.alloc(Math.min(CHUNK, job.size));
    for (;;) {
      const n = Math.min(CHUNK, job.size - job.sent);
      await fh.read(buf, 0, n, job.sent);
      let r = null; let why = '';
      try {
        r = await fetch(job.session, { method: 'PUT', headers: { authorization: `Bearer ${await accessToken()}`, 'content-range': `bytes ${job.sent}-${job.sent + n - 1}/${job.size}` }, body: buf.subarray(0, n), signal: AbortSignal.timeout(PUT_MS) });
      } catch (e) { why = String(e?.cause?.code ?? e?.message ?? e); }
      if (r && (r.status === 200 || r.status === 201)) return await r.json();
      if (r && r.status === 308) {
        const m = /bytes=0-(\d+)/.exec(r.headers.get('range') ?? '');
        const at = m ? Number(m[1]) + 1 : 0;
        const moved = at > job.sent;
        job.sent = at; saveJob(job);
        if (moved) { fails = 0; continue; }
        why = '308 without progress';
        r = null;
      }
      if (r && r.status === 401) { await accessToken(true); if (++fails > TRIES) throw new Error('The sign-in keeps being refused.'); continue; }
      if (r && (r.status === 404 || r.status === 410)) { job.session = await startSession(job); job.sent = 0; saveJob(job); continue; }
      if (r && r.status < 500) throw new Error(googleError(r.status, await r.json().catch(() => ({}))));
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

function run(job) {
  job.state = 'uploading'; job.pid = process.pid; job.error = undefined; saveJob(job);
  const p = (async () => {
    try {
      const video = await push(job);
      job.video_id = video.id; job.sent = job.size; job.state = 'done'; job.finished = new Date().toISOString(); job.after = [];
      if (job.playlist_id) job.after.push(await addToPlaylist(video.id, job.playlist_id).catch((e) => `playlist not added: ${e.message}`));
      if (job.thumbnail) job.after.push(await setThumbnail(video.id, job.thumbnail).catch((e) => `thumbnail not set: ${e.message}`));
      log(`uploaded ${job.file} as ${watchUrl(video.id)}`);
    } catch (e) {
      job.state = 'failed'; job.error = String(e?.message ?? e); log(`upload of ${job.file} failed: ${job.error}`);
    }
    job.pid = undefined; saveJob(job); running.delete(job.id);
  })();
  running.set(job.id, p);
  return p;
}

const PRIVACY = ['private', 'unlisted', 'public'];
async function uploadVideo(a) {
  const file = resolve(String(a.file ?? ''));
  if (!existsSync(file)) throw new Error(`No file at ${file}.`);
  const st = statSync(file);
  if (!a.title) throw new Error('A title is needed.');
  if (String(a.title).length > 100) throw new Error('YouTube takes a title of at most 100 characters.');
  if (a.privacy !== undefined && !PRIVACY.includes(a.privacy)) throw new Error(`privacy is one of ${PRIVACY.join(', ')}.`);
  if (a.publish_at && a.privacy && a.privacy !== 'private') throw new Error('A scheduled video goes up private and turns public at publish_at; leave privacy out or private.');
  if (a.thumbnail && !existsSync(resolve(a.thumbnail))) throw new Error(`No thumbnail at ${resolve(a.thumbnail)}.`);
  await accessToken();
  const jobs = readJobs();
  const same = (j) => j.file === file && j.size === st.size && j.mtime === st.mtimeMs && j.meta.snippet.title === a.title;
  const done = jobs.find((j) => same(j) && j.state === 'done');
  if (done && !a.again) throw new Error(`This file is already up with this title: ${watchUrl(done.video_id)}. Pass again: true to upload a second copy.`);
  let job = a.again ? null : jobs.find((j) => same(j) && j.state !== 'done');
  if (job && running.has(job.id)) return { ...jobView(job), note: 'already uploading in this window' };
  if (job && busyElsewhere(job)) return { ...jobView(job), note: 'already uploading from another app on this Mac' };
  if (!job) {
    job = {
      id: b64url(randomBytes(6)), file, size: st.size, mtime: st.mtimeMs, mime: MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      meta: {
        snippet: { title: a.title, description: a.description ?? '', tags: a.tags ?? [], categoryId: String(a.category_id ?? 10), ...(a.language ? { defaultLanguage: a.language, defaultAudioLanguage: a.language } : {}) },
        status: { privacyStatus: a.privacy ?? 'private', selfDeclaredMadeForKids: Boolean(a.made_for_kids ?? false), ...(a.publish_at ? { publishAt: a.publish_at } : {}) },
      },
      playlist_id: a.playlist_id, thumbnail: a.thumbnail ? resolve(a.thumbnail) : undefined, sent: 0, started: new Date().toISOString(),
    };
  }
  const p = run(job);
  await Promise.race([p, sleep(WAIT_MS)]);
  return jobView(job);
}

// ── The tools ──────────────────────────────────────────────────────────

const GUIDE = `You manage the owner's YouTube channel. Nothing here needs the light show running.

- Uploads go up PRIVATE unless you pass privacy. Make a video unlisted or public, or schedule it (publish_at), only when the owner said so in this conversation. A scheduled video is private until its time.
- Before uploading, say what you will upload: the file, the title, the privacy. Credit the music's source in the description when the owner has one (where a recording came from and its date).
- upload_video answers within about 45 seconds: a short film is done by then; a long one answers "uploading" and carries on. Check it with upload_status. If an upload stops (the Mac slept, the app closed), ask upload_video again with the same file and title: it carries on where it stopped and never makes a second copy unless you pass again: true.
- YouTube processes a video for a few minutes after the upload; its upload_status in list_videos says when it is "processed".
- Deleting is not here on purpose: tell the owner to delete in YouTube Studio.
- Quota: 100 uploads a day; an update, thumbnail or playlist change costs 50 of 10,000 a day; reading costs 1.`;

const str = { type: 'string' };
const TOOLS = [
  { name: 'channel', description: 'The signed-in channel: its name, link, subscribers, views and video count.', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_videos', description: "The channel's latest uploads, newest first: id, link, title, privacy, schedule, processing state, views.", inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50, description: 'How many (default 10).' } } } },
  {
    name: 'upload_video',
    description: 'Upload a video file from this Mac. Private unless privacy says otherwise. Resumes an interrupted upload of the same file and title.',
    inputSchema: {
      type: 'object', required: ['file', 'title'],
      properties: {
        file: { ...str, description: 'Full path to the video file on this Mac.' },
        title: { ...str, description: 'At most 100 characters.' },
        description: str,
        tags: { type: 'array', items: str },
        privacy: { type: 'string', enum: PRIVACY, description: 'Default private. Only another value when the owner asked for it.' },
        publish_at: { ...str, description: 'Schedule: an ISO 8601 time in the future; the video stays private until then.' },
        category_id: { ...str, description: 'YouTube category id; default 10 (Music). 24 is Entertainment, 1 Film & Animation.' },
        made_for_kids: { type: 'boolean', description: 'Default false.' },
        language: { ...str, description: 'e.g. en' },
        playlist_id: { ...str, description: 'Add it to this playlist once it is up.' },
        thumbnail: { ...str, description: 'Full path to a .jpg or .png (16:9, at most 2 MB) to set once it is up.' },
        again: { type: 'boolean', description: 'Upload a second copy of a file already up with this title.' },
      },
    },
  },
  { name: 'upload_status', description: 'How the uploads are going (or one, by its job id): MB sent, done, failed and why, the link once up.', inputSchema: { type: 'object', properties: { job: str } } },
  {
    name: 'update_video',
    description: "Change a video's title, description, tags, category, privacy or schedule. Only the fields you pass change.",
    inputSchema: { type: 'object', required: ['video_id'], properties: { video_id: str, title: str, description: str, tags: { type: 'array', items: str }, category_id: str, language: str, privacy: { type: 'string', enum: PRIVACY }, publish_at: { ...str, description: 'ISO time to go public; empty string to unschedule.' }, made_for_kids: { type: 'boolean' } } },
  },
  { name: 'set_thumbnail', description: "Set a video's thumbnail from a .jpg or .png on this Mac (needs the channel phone-verified).", inputSchema: { type: 'object', required: ['video_id', 'file'], properties: { video_id: str, file: str } } },
  { name: 'list_playlists', description: "The channel's playlists: id, title, privacy, how many videos.", inputSchema: { type: 'object', properties: {} } },
  { name: 'create_playlist', description: 'Make a playlist (private unless privacy says otherwise).', inputSchema: { type: 'object', required: ['title'], properties: { title: str, description: str, privacy: { type: 'string', enum: PRIVACY } } } },
  { name: 'add_to_playlist', description: 'Add a video to a playlist.', inputSchema: { type: 'object', required: ['video_id', 'playlist_id'], properties: { video_id: str, playlist_id: str } } },
];

const text = (v) => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const fail = (m) => ({ content: [{ type: 'text', text: m }], isError: true });

async function call(name, a = {}) {
  switch (name) {
    case 'channel': { const { uploads, ...c } = await channel(); return text(c); }
    case 'list_videos': return text(await listVideos(Number(a.limit ?? 10)));
    case 'upload_video': return text(await uploadVideo(a));
    case 'upload_status': {
      const jobs = readJobs().filter((j) => !a.job || j.id === a.job).map((j) => (j.state === 'uploading' && !running.has(j.id) && !busyElsewhere(j) ? { ...j, state: 'stopped (ask upload_video again with the same file and title to resume)' } : j));
      return text(jobs.length ? jobs.slice(-10).map(jobView) : 'No uploads yet.');
    }
    case 'update_video': {
      if (a.privacy !== undefined && !PRIVACY.includes(a.privacy)) return fail(`privacy is one of ${PRIVACY.join(', ')}.`);
      if (a.publish_at && a.privacy && a.privacy !== 'private') return fail('A scheduled video stays private until publish_at; leave privacy out.');
      return text(await updateVideo(a));
    }
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
    case 'tools/call':
      try { reply(await call(params?.name, params?.arguments ?? {})); } catch (e) { reply(fail(String(e?.message ?? e))); }
      return;
    default:
      if (method?.startsWith('notifications/')) return;
      if (id !== undefined) write({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

const command = process.argv[2];
if (command === 'login' || command === 'logout' || command === 'whoami') {
  try {
    if (command === 'login') await login();
    else if (command === 'logout') await logout();
    else { const { uploads, ...c } = await channel(); log(JSON.stringify(c)); }
    process.exit(0);
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
