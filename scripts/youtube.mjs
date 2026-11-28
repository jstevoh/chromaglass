#!/usr/bin/env node
/**
 * The owner's YouTube connector (PLAN 44i): `npm run youtube`.
 *
 * What it holds. `mcp/youtube-mcp.js`, driven the way the owner's assistant
 * drives it (its own `login` in a terminal, then initialize, tools/list and
 * tools/call over stdio), against a stand-in Google on this machine's
 * loopback: the consent page, the token endpoint and the YouTube Data API's
 * pieces the server calls, each written to what Google's own pages say it does
 * (2026-11-08), including the two that matter most here. An upload that names
 * no privacy goes up public (since 2026-11-02), and a `videos.update` snippet
 * replaces the whole snippet and is refused without its title and category.
 * Every assertion is read from what the stand-in received or stored, not from
 * what the server says it did.
 *
 *  - the sign-in: an answer with the wrong `state` is refused and the sign-in
 *    waits for the real one; the real one passes PKCE (S256, the verifier
 *    checked against the challenge) and leaves a refresh key in a file only
 *    the owner can read, in a folder only the owner can open.
 *  - an access key Google no longer takes is refreshed once and the call goes
 *    through.
 *  - the upload: one file in ten chunks. The first server is killed while
 *    Google holds its third chunk; a second server, asked for the same file
 *    and title, carries on in the same session from Google's count (one
 *    session made, not two). Then a connection dropped mid-file and a 503:
 *    each resumed from where the stand-in says it stopped, so the bytes on the
 *    wire are at most the file and one chunk. What arrives is the file, byte
 *    for byte; it is private though no privacy was named; it lands in the
 *    playlist and gets its thumbnail.
 *  - the same file and title a second time is refused, naming the video.
 *  - an update that names only the title keeps the description and tags.
 *  - nothing secret (the refresh key, any access key, the client secret, the
 *    upload session's address) is ever in a reply or the log.
 *  - an override of Google's address that is not this machine's loopback
 *    stops the server before it sends anything.
 *
 * Then the mutants. Each rule is removed from a copy of the server in
 * `scratch/youtube-mutants/` (a find-and-replace that must find its text, so a
 * mutant cannot quietly be the original), the scenario runs against the copy,
 * and the check fails unless the line naming that rule fails there.
 * `--no-mutants` runs the scenario alone. No GPU, no build, no network.
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { port } from './ports.mjs';
import { captionRoutes, textScenario } from './youtubeText.mjs';
import { shortsScenario } from './youtubeShorts.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SERVER = resolve(import.meta.dirname, '../mcp/youtube-mcp.js');
// The server's own modules (44i-2a), named as a path so the reach trace counts them as read here.
const MODULES = resolve(import.meta.dirname, '../mcp/youtube');
const MUTANTS_ON = !process.argv.includes('--no-mutants');
const BASE_PORT = port(5381, 'YOUTUBE_PORT');
const CHUNK = 256 * 1024;
const SIZE = 10 * CHUNK - 4321; // ten chunks, the last one short
const CLIENT_SECRET = `csecret-${randomBytes(6).toString('hex')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => createHash('sha256').update(b).digest('hex');

// ── The stand-in Google ────────────────────────────────────────────────

function standIn(gport) {
  const g = {
    codes: new Map(), refresh: new Set(), access: new Set(), refreshes: 0, rejected401: 0,
    sessions: [], videos: new Map(), playlistItems: [], thumbnails: [], updates: 0, wire: 0,
    faults: new Map([[2, 'stall'], [4, 'expire'], [5, 'drop'], [7, '503']]), refreshesAtExpiry: null, stalled: false, secrets: new Set([CLIENT_SECRET]),
    pkceOk: false, authAsked: null,
    requests: 0, limitNext: 0, pageSize: 50, playlistPages: 0, startCalls: 0, holdStart: null, onStartEnter: null,
    playlists: [{ id: 'PL1', snippet: { title: 'Films' }, status: { privacyStatus: 'public' } }],
  };
  const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
  const err = (res, status, reason, message) => json(res, status, { error: { code: status, message, errors: [{ reason, message }] } });
  const body = (req) => new Promise((r) => { const b = []; req.on('data', (c) => b.push(c)); req.on('end', () => r(Buffer.concat(b))); req.on('error', () => r(Buffer.concat(b))); });
  const authed = (req) => g.access.has((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const issue = () => { const a = `at-${randomBytes(8).toString('hex')}`; g.access.add(a); g.secrets.add(a); return a; };
  const finish = (s) => {
    const id = `vid${g.videos.size + 1}`;
    const v = {
      id, snippet: { ...s.meta.snippet, publishedAt: new Date().toISOString(), channelId: 'UC1', thumbnails: {} },
      // Since 2026-11-02 an upload that names no privacy goes up public.
      status: { uploadStatus: 'uploaded', privacyStatus: s.meta.status?.privacyStatus ?? 'public', ...s.meta.status },
      // A part the request's `part` does not name is not written (44i-2b: the localizations ride only when named).
      ...(s.meta.localizations && s.parts.includes('localizations') ? { localizations: s.meta.localizations } : {}),
      statistics: { viewCount: '0', likeCount: '0' }, contentDetails: { duration: 'PT1M' }, bytes: s.data,
    };
    if (!s.meta.status?.privacyStatus) v.status.privacyStatus = 'public';
    // What the owner might set in Studio afterwards, which a whole-part update must not reset.
    Object.assign(v.status, { embeddable: false, license: 'creativeCommon', containsSyntheticMedia: true, madeForKids: false });
    g.videos.set(id, v); s.video = v;
    return v;
  };
  const resource = ({ bytes, ...v }) => v;
  /* What YouTube refuses in the words (its pages, 2026-11-28): < or > in a title or description, a
     description past 5,000 bytes, and localizations on a video with no default language. */
  const wordsRefused = (snippet, localizations, parts) => {
    const texts = [snippet?.title, snippet?.description, ...Object.values(localizations ?? {}).flatMap((l) => [l?.title, l?.description])];
    if (texts.some((t) => /[<>]/.test(t ?? ''))) return 'invalidDescription';
    if ([snippet, ...Object.values(localizations ?? {})].some((l) => Buffer.byteLength(l?.description ?? '') > 5000)) return 'descriptionTooLong';
    if ([snippet, ...Object.values(localizations ?? {})].some((l) => (l?.title ?? '').length > 100)) return 'invalidTitle';
    if (localizations && parts.includes('localizations') && !snippet?.defaultLanguage) return 'defaultLanguageNotSet';
    return null;
  };

  const srv = createServer(async (req, res) => {
    g.requests++;
    const u = new URL(req.url, `http://127.0.0.1:${gport}`);
    const p = u.pathname; const q = u.searchParams;
    try {
      if (p === '/auth') {
        g.authAsked = Object.fromEntries(q);
        const ok = q.get('client_id') === 'cid' && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(q.get('redirect_uri') ?? '') && q.get('code_challenge_method') === 'S256' && q.get('access_type') === 'offline' && (q.get('scope') ?? '').includes('youtube');
        if (!ok) return json(res, 400, { error: 'invalid_request' });
        const code = `code-${randomBytes(6).toString('hex')}`;
        g.codes.set(code, { challenge: q.get('code_challenge'), redirect: q.get('redirect_uri') });
        res.writeHead(302, { location: `${q.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(q.get('state'))}&scope=youtube` }).end();
        return;
      }
      if (p === '/token') {
        const f = new URLSearchParams((await body(req)).toString());
        if (f.get('client_id') !== 'cid' || f.get('client_secret') !== CLIENT_SECRET) return json(res, 401, { error: 'invalid_client' });
        if (f.get('grant_type') === 'authorization_code') {
          const c = g.codes.get(f.get('code'));
          if (!c || c.redirect !== f.get('redirect_uri')) return json(res, 400, { error: 'invalid_grant' });
          const verifier = f.get('code_verifier') ?? '';
          if (createHash('sha256').update(verifier).digest('base64url') !== c.challenge) return json(res, 400, { error: 'invalid_grant', error_description: 'code_verifier' });
          g.codes.delete(f.get('code')); g.pkceOk = true;
          const rt = `rt-${randomBytes(8).toString('hex')}`; g.refresh.add(rt); g.secrets.add(rt);
          return json(res, 200, { access_token: issue(), expires_in: 3599, refresh_token: rt, scope: 'https://www.googleapis.com/auth/youtube', token_type: 'Bearer' });
        }
        if (f.get('grant_type') === 'refresh_token') {
          if (!g.refresh.has(f.get('refresh_token'))) return json(res, 400, { error: 'invalid_grant' });
          g.refreshes++;
          return json(res, 200, { access_token: issue(), expires_in: 3599, token_type: 'Bearer' });
        }
        return json(res, 400, { error: 'unsupported_grant_type' });
      }
      if (p === '/revoke') return json(res, 200, {});
      // A session's address, which takes the file (with the bearer this server always sends).
      const sm = /^\/upload\/session\/(\d+)$/.exec(p);
      if (sm) {
        const s = g.sessions[Number(sm[1])];
        if (!authed(req)) { await body(req); return err(res, 401, 'authError', 'Invalid Credentials'); }
        const range = req.headers['content-range'] ?? '';
        const status = /^bytes \*\/(\d+)$/.exec(range);
        if (status) {
          await body(req);
          if (s.video) return json(res, 200, resource(s.video));
          return res.writeHead(308, s.have ? { range: `bytes=0-${s.have - 1}` } : {}).end();
        }
        const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
        if (!m) return err(res, 400, 'badRange', range);
        const start = Number(m[1]); const chunk = Math.floor(start / CHUNK);
        const fault = sm[1] === '0' ? g.faults.get(chunk) : undefined;
        if (fault) {
          g.faults.delete(chunk);
          if (fault === 'stall') { g.stalled = true; req.on('data', () => {}); return; } // never answers
          if (fault === 'drop') { req.socket.destroy(); return; }
          if (fault === '503') { await body(req); return err(res, 503, 'backendError', 'Backend Error'); }
          // The access key runs out mid-upload, as an hour-long one's does.
          if (fault === 'expire') { g.access.clear(); g.refreshesAtExpiry = g.refreshes; await body(req); return err(res, 401, 'authError', 'Invalid Credentials'); }
        }
        const data = await body(req);
        g.wire += data.length;
        if (start > s.have) return res.writeHead(308, s.have ? { range: `bytes=0-${s.have - 1}` } : {}).end();
        data.copy(s.data, start);
        s.have = Math.max(s.have, start + data.length);
        if (s.have >= s.size) return json(res, 201, resource(finish(s)));
        return res.writeHead(308, { range: `bytes=0-${s.have - 1}` }).end();
      }
      if (!authed(req)) { g.rejected401++; await body(req); return err(res, 401, 'authError', 'Invalid Credentials'); }
      if (await captionRoutes(g, req, res, p, q, { json, err, body })) return;
      if (p === '/upload/youtube/v3/videos' && req.method === 'POST' && q.get('uploadType') === 'resumable') {
        g.startCalls++;
        if (g.onStartEnter) g.onStartEnter();
        if (g.holdStart) await g.holdStart;
        if (g.limitNext > 0) {
          g.limitNext--;
          await body(req);
          return err(res, 400, 'uploadLimitExceeded', 'The user has exceeded the number of videos they may upload.');
        }
        const meta = JSON.parse((await body(req)).toString());
        const size = Number(req.headers['x-upload-content-length']);
        if (!size) return err(res, 400, 'missingContentLength', 'X-Upload-Content-Length');
        const parts = (q.get('part') ?? '').split(',');
        const bad = wordsRefused(meta.snippet, meta.localizations, parts);
        if (bad) return err(res, 400, bad, bad);
        const n = g.sessions.push({ meta, parts, size, data: Buffer.alloc(size), have: 0 }) - 1;
        const at = `http://127.0.0.1:${gport}/upload/session/${n}`; g.secrets.add(at);
        return res.writeHead(200, { location: at }).end();
      }
      if (p === '/upload/youtube/v3/thumbnails/set') {
        const b = await body(req);
        if (q.get('uploadType') !== 'media') return err(res, 400, 'badRequest', 'Upload requests must include an uploadType URL parameter and a URL path beginning with /upload/');
        g.thumbnails.push({ videoId: q.get('videoId'), type: req.headers['content-type'], bytes: b.length });
        return json(res, 200, { items: [{ default: { url: 'x' } }] });
      }
      if (p === '/youtube/v3/channels') {
        return json(res, 200, { items: [{ id: 'UC1', snippet: { title: 'Stand-in Channel', customUrl: '@standin' }, statistics: { subscriberCount: '12', viewCount: '345', videoCount: String(g.videos.size) }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] });
      }
      if (p === '/youtube/v3/playlistItems' && req.method === 'GET') {
        g.playlistPages++;
        const all = q.get('playlistId') === 'UU1' ? [...g.videos.keys()].reverse() : g.playlistItems.filter((i) => i.playlistId === q.get('playlistId')).map((i) => i.videoId);
        const limit = Math.min(Number(q.get('maxResults') ?? 50), g.pageSize);
        const offset = Number(q.get('pageToken') ?? 0);
        const slice = all.slice(offset, offset + limit);
        const nextPageToken = offset + limit < all.length ? String(offset + limit) : undefined;
        return json(res, 200, { items: slice.map((videoId, idx) => ({ contentDetails: { videoId }, snippet: { position: offset + idx, resourceId: { videoId } } })), ...(nextPageToken ? { nextPageToken } : {}) });
      }
      if (p === '/youtube/v3/playlistItems' && req.method === 'POST') {
        const b = JSON.parse((await body(req)).toString());
        g.playlistItems.push({ playlistId: b.snippet.playlistId, videoId: b.snippet.resourceId.videoId, ...(b.snippet.position !== undefined ? { position: b.snippet.position } : {}) });
        return json(res, 200, { id: `pli${g.playlistItems.length}`, snippet: b.snippet });
      }
      if (p === '/youtube/v3/playlists') {
        if (req.method === 'POST') { const b = JSON.parse((await body(req)).toString()); return json(res, 200, { id: 'PL2', ...b }); }
        const all = g.playlists.map((pl) => ({ ...pl, contentDetails: { itemCount: g.playlistItems.filter((i) => i.playlistId === pl.id).length } }));
        const limit = Math.min(Number(q.get('maxResults') ?? 50), g.pageSize);
        const offset = Number(q.get('pageToken') ?? 0);
        const slice = all.slice(offset, offset + limit);
        const nextPageToken = offset + limit < all.length ? String(offset + limit) : undefined;
        return json(res, 200, { items: slice, ...(nextPageToken ? { nextPageToken } : {}) });
      }
      if (p === '/youtube/v3/videos' && req.method === 'GET') {
        const ids = (q.get('id') ?? '').split(',');
        // Only the parts named come back, as YouTube's do (44i-2b: a read without localizations has none to keep).
        const named = (q.get('part') ?? '').split(',');
        const only = (v) => Object.fromEntries(Object.entries(resource(v)).filter(([k]) => k === 'id' || named.includes(k)));
        return json(res, 200, { items: ids.map((i) => g.videos.get(i)).filter(Boolean).map(only) });
      }
      if (p === '/youtube/v3/videos' && req.method === 'PUT') {
        const b = JSON.parse((await body(req)).toString());
        const v = g.videos.get(b.id);
        if (!v) return err(res, 404, 'videoNotFound', b.id);
        // A snippet replaces the whole snippet, and must carry its title and category.
        if (b.snippet && (!b.snippet.title || !b.snippet.categoryId)) return err(res, 400, b.snippet.title ? 'invalidCategoryId' : 'invalidTitle', 'The request metadata specifies an invalid video title or category.');
        const parts = (q.get('part') ?? '').split(',');
        const bad = wordsRefused(b.snippet ?? v.snippet, b.localizations, parts);
        if (bad) return err(res, 400, bad, bad);
        if (b.snippet) v.snippet = { ...b.snippet, publishedAt: v.snippet.publishedAt };
        // Every part named is replaced whole: named with no localizations in the body, they are wiped.
        if (parts.includes('localizations')) v.localizations = b.localizations ?? {};
        if (b.status) { g.lastStatusSent = b.status; v.status = { uploadStatus: v.status.uploadStatus, madeForKids: v.status.madeForKids, ...b.status }; }
        g.updates++;
        return json(res, 200, resource(v));
      }
      return err(res, 404, 'notFound', p);
    } catch (e) { if (!res.headersSent) err(res, 500, 'standIn', String(e)); }
  });
  return { g, srv, listen: () => new Promise((r) => srv.listen(gport, '127.0.0.1', r)), close: () => { srv.closeAllConnections?.(); srv.close(); } };
}

// ── The server, as a client drives it ──────────────────────────────────

function start(server, env, args = []) {
  const child = spawn(process.execPath, [server, ...args], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const out = { all: '', stderr: '', pending: new Map(), notifications: [], next: 1 };
  child.stderr.on('data', (d) => { out.stderr += d; out.all += d; });
  createInterface({ input: child.stdout }).on('line', (line) => {
    out.all += `${line}\n`;
    let m; try { m = JSON.parse(line); } catch { return; }
    if (m.method && m.id === undefined) out.notifications.push(m);
    out.pending.get(m.id)?.(m); out.pending.delete(m.id);
  });
  const exited = new Promise((r) => child.on('exit', (code) => r(code)));
  const rpc = (method, params, ms = 20_000) => new Promise((res) => {
    const id = out.next++;
    const t = setTimeout(() => { out.pending.delete(id); res({ timeout: true }); }, ms);
    out.pending.set(id, (m) => { clearTimeout(t); res(m); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const tool = async (name, a = {}, ms, meta) => {
    const m = await rpc('tools/call', { name, arguments: a, ...(meta ? { _meta: meta } : {}) }, ms);
    const t = m.result?.content?.[0]?.text ?? '';
    let v = t; try { v = JSON.parse(t); } catch { /* words */ }
    return { error: Boolean(m.result?.isError) || Boolean(m.timeout), text: t, v };
  };
  return { child, out, exited, rpc, tool, kill: () => { child.kill('SIGKILL'); return exited; } };
}

const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(50); } return false; };

async function scenario(server, gport) {
  const lines = [];
  const line = (rule, name, ok, detail = '') => lines.push({ rule, name, ok: Boolean(ok), detail });
  const { g, listen, close } = standIn(gport);
  await listen();
  const dir = mkdtempSync(join(tmpdir(), 'yt-'));
  const conf = join(dir, 'conf');
  // A fake osascript and launchctl sit first on PATH for every server this check starts, so that
  // whatever the server's own guards do, no run of the check (or of a mutant that strips those
  // guards) can reach the real ones and put a notification on the owner's screen; the fakes leave a
  // marker the notifyGuard line reads. Written here, before the first drain, so the marker
  // covers every drain in the scenario and not only the last.
  const binDir = join(dir, 'bin');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, 'launchctl'), `#!/bin/sh\necho "$@" > "${join(dir, 'launchctl-ran')}"\nexit 0\n`, { mode: 0o755 });
  writeFileSync(join(binDir, 'osascript'), `#!/bin/sh\necho "$@" > "${join(dir, 'osascript-ran')}"\nexit 0\n`, { mode: 0o755 });
  // Linux's and Windows' notifier and schedulers too (PLAN 44i-2a): the cloud runs this check on
  // Linux, where the server's notifier is notify-send, so a fake osascript alone would let a
  // mutant without the notify guard pass there unseen.
  for (const b of ['notify-send', 'powershell', 'systemctl', 'schtasks']) writeFileSync(join(binDir, b), `#!/bin/sh\necho "$@" > "${join(dir, `${b}-ran`)}"\nexit 0\n`, { mode: 0o755 });
  // Release times are read in the settings' zone (44i-2a), and the DST line below is written in
  // Pacific; every server here runs with TZ=UTC, so this file is what makes that line pass, which proves the
  // server reads it (the settingsZone mutant pins the zone and must fail there).
  mkdirSync(conf, { recursive: true, mode: 0o700 });
  writeFileSync(join(conf, 'settings.json'), JSON.stringify({ timeZone: 'America/Los_Angeles', categoryId: '10' }));
  const env = { TZ: 'UTC', PATH: `${binDir}:${process.env.PATH}`, CHROMAGLASS_YOUTUBE_DIR: conf, CHROMAGLASS_YOUTUBE_GOOGLE: `http://127.0.0.1:${gport}`, CHROMAGLASS_YOUTUBE_NO_BROWSER: '1', CHROMAGLASS_YOUTUBE_CHUNK: String(CHUNK), CHROMAGLASS_YOUTUBE_WAIT_MS: '800', CHROMAGLASS_YOUTUBE_BACKOFF_MS: '40', CHROMAGLASS_YOUTUBE_NO_NOTIFY: '1' };
  const logs = [];
  try {
    // The override names another host: the server stops before anything.
    const stray = start(server, { ...env, CHROMAGLASS_YOUTUBE_GOOGLE: 'http://example.com' });
    const code = await Promise.race([stray.exited, sleep(3000).then(() => 'running')]);
    if (code === 'running') await stray.kill();
    line('loopback', 'an override of Google that is not 127.0.0.1 stops the server at start', code !== 'running' && code !== 0 && /only name a stand-in/.test(stray.out.stderr), `exit ${code}`);

    // The client file, as Google Cloud downloads it.
    mkdirSync(conf, { recursive: true, mode: 0o755 }); // as the owner would make it; the server closes it
    writeFileSync(join(conf, 'client_secret.json'), JSON.stringify({ installed: { client_id: 'cid', client_secret: CLIENT_SECRET, auth_uri: 'x', token_uri: 'x', redirect_uris: ['http://localhost'] } }));

    // The sign-in, with a browser played by this check.
    const lg = start(server, env, ['login']);
    logs.push(lg.out);
    let authUrl = null;
    await until(() => { authUrl = /(http:\/\/127\.0\.0\.1:\d+\/auth\?\S+)/.exec(lg.out.stderr)?.[1]; return authUrl; }, 5000);
    let wrongState = 0; let signed = false;
    if (authUrl) {
      const redirect = new URL(authUrl).searchParams.get('redirect_uri');
      wrongState = (await fetch(`${redirect}?code=forged&state=not-this-one`).catch(() => ({ status: 0 }))).status;
      const r = await fetch(authUrl, { redirect: 'manual' });
      const back = r.headers.get('location');
      const page = back ? await fetch(back).catch(() => ({ status: 0 })) : { status: 0 };
      const code2 = await Promise.race([lg.exited, sleep(5000).then(() => 'running')]);
      if (code2 === 'running') await lg.kill();
      signed = page.status === 200 && code2 === 0;
    } else await lg.kill();
    line('state', 'a sign-in answer with the wrong state is refused (400) and the sign-in waits for the real one', wrongState === 400 && signed, `wrong state answered ${wrongState}`);
    let tok = {};
    try { tok = JSON.parse(readFileSync(join(conf, 'token.json'), 'utf8')); } catch { /* none */ }
    line('pkce', 'the sign-in passes PKCE (S256, the verifier matching the challenge) and leaves a refresh key', signed && g.pkceOk && g.authAsked?.code_challenge_method === 'S256' && g.refresh.has(tok.refresh_token), lg.out.stderr.slice(-200));
    const mode = (f) => { try { return (statSync(f).mode & 0o777).toString(8); } catch { return 'none'; } };
    line('private', 'the key file is the owner\'s alone (600) in a folder only the owner opens (700)', mode(join(conf, 'token.json')) === '600' && mode(conf) === '700', `file ${mode(join(conf, 'token.json'))}, folder ${mode(conf)}`);

    // An access key Google no longer takes.
    writeFileSync(join(conf, 'token.json'), JSON.stringify({ ...tok, access_token: 'stale-key', expires_at: Date.now() + 3_600_000 }), { mode: 0o600 });
    const a = start(server, env);
    logs.push(a.out);
    const init = await a.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });
    const list = await a.rpc('tools/list', {});
    const names = (list.result?.tools ?? []).map((t) => t.name);
    line('protocol', `it speaks MCP: initialize with a guide, and its seventeen tools listed (${names.join(', ')})`, init.result?.serverInfo?.name === 'youtube' && /PRIVATE/.test(init.result?.instructions ?? '') && names.length === 17 && names.includes('queue_folder') && names.includes('add_captions') && names.includes('list_captions'));
    const before = g.refreshes;
    const ch = await a.tool('channel');
    line('refresh', 'an access key Google refuses is refreshed once and the call goes through', !ch.error && ch.v.title === 'Stand-in Channel' && g.refreshes === before + 1 && g.rejected401 >= 1, ch.text.slice(0, 160));

    // The upload, killed mid-file, resumed by a second server.
    const file = join(dir, 'film.mp4');
    const bytes = randomBytes(SIZE);
    writeFileSync(file, bytes);
    const thumb = join(dir, 'thumb.png');
    writeFileSync(thumb, Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
    const args = { file, title: 'Test film', description: 'A 1920s record, filmed by the looks.', tags: ['liquid light', '1920s'], playlist_id: 'PL1', thumbnail: thumb };
    const first = await a.tool('upload_video', args);
    const stalled = await until(() => g.stalled, 10_000);
    await a.kill();
    const b = start(server, env);
    logs.push(b.out);
    await b.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });
    const again = await b.tool('upload_video', args);
    let status = null;
    await until(async () => { status = (await b.tool('upload_status')).v; return Array.isArray(status) && status.some((j) => j.state === 'done' || j.state === 'failed'); }, 20_000);
    const job = Array.isArray(status) ? status.find((j) => j.title === 'Test film') : null;
    const s = g.sessions[0];
    line('restart', 'a second server, asked for the same file and title after the first was killed mid-upload, resumes the same session (one session made)', stalled && !first.error && !again.error && g.sessions.length === 1 && job?.state === 'done', `stalled ${stalled}, sessions ${g.sessions.length}, job ${job?.state} ${job?.error ?? ''}`);
    line('resume', `after a dropped connection and a 503 it carries on from the stand-in's count (${g.wire} bytes on the wire for a file of ${SIZE}, at most one chunk more)`, job?.state === 'done' && g.faults.size === 0 && g.wire <= SIZE + CHUNK, `wire ${g.wire}, faults not reached ${[...g.faults.keys()].join(',') || 'none'}`);
    const v = s?.video;
    line('bytes', 'what arrives is the file, byte for byte', v && sha(v.bytes) === sha(bytes));
    line('privacy', 'an upload that names no privacy arrives private (Google\'s default is now public)', v?.status?.privacyStatus === 'private', `privacy ${v?.status?.privacyStatus}`);
    line('chunk401', 'an access key that runs out mid-upload is refreshed and the upload carries on', g.refreshesAtExpiry !== null && g.refreshes > g.refreshesAtExpiry && job?.state === 'done', `refreshes ${g.refreshesAtExpiry} then ${g.refreshes}`);
    line('thumb', 'once up it lands in the playlist and gets its thumbnail (a simple upload, uploadType=media), and the reply names its link', g.playlistItems.some((i) => i.playlistId === 'PL1' && i.videoId === v?.id) && g.thumbnails.some((t) => t.videoId === v?.id && t.type === 'image/png') && job?.url === `https://youtu.be/${v?.id}`, JSON.stringify(job ?? {}).slice(0, 200));

    const twice = await b.tool('upload_video', args);
    line('twice', 'the same file and title a second time is refused, naming the video it already is', twice.error && twice.text.includes(`youtu.be/${v?.id}`) && g.sessions.length === 1, twice.text.slice(0, 160));

    /* Which files go to YouTube (the security review of 2026-11-13): any path at all used to,
       so a page read in the same session could ask for a private film, or for a Photos
       original as a public video's thumbnail. Each refusal below is asked of a real file that
       would otherwise upload, and the one allowed beside them proves the door still opens. */
    const lib = join(dir, 'Photos Library.photoslibrary', 'originals');
    mkdirSync(lib, { recursive: true });
    writeFileSync(join(lib, 'private.mov'), randomBytes(1024));
    writeFileSync(join(lib, 'face.jpg'), Buffer.from('ffd8ffe0', 'hex'));
    mkdirSync(join(dir, '.secret'), { recursive: true });
    writeFileSync(join(dir, '.secret', 'film.mp4'), randomBytes(1024));
    writeFileSync(join(dir, 'notes.txt'), 'not a film');
    symlinkSync(join(lib, 'private.mov'), join(dir, 'innocent.mov'));
    const sessionsBefore = g.sessions.length;
    const thumbsBefore = g.thumbnails.length;
    const refusals = [
      await b.tool('upload_video', { file: join(lib, 'private.mov'), title: 'x1' }),
      await b.tool('upload_video', { file: join(dir, '.secret', 'film.mp4'), title: 'x2' }),
      await b.tool('upload_video', { file: join(dir, 'notes.txt'), title: 'x3' }),
      await b.tool('upload_video', { file: join(dir, 'innocent.mov'), title: 'x4' }),
      await b.tool('set_thumbnail', { video_id: v?.id, file: join(lib, 'face.jpg') }),
    ];
    const allowed = await b.tool('set_thumbnail', { video_id: v?.id, file: thumb });
    line('files', 'nothing from the Photos library, a hidden folder or a link into either, and nothing that is not a film or a picture, goes to YouTube; an ordinary picture still does',
      refusals.every((r, i) => r.error && (i === 2 ? /is one of/ : /private library or a hidden folder/).test(r.text)) && g.sessions.length === sessionsBefore && !allowed.error && g.thumbnails.length === thumbsBefore + 1,
      refusals.map((r) => r.text.slice(0, 60)).join(' | ') + ` | allowed: ${allowed.text.slice(0, 40)}`);

    const up = await b.tool('update_video', { video_id: v?.id, title: 'A new title' });
    const after = g.videos.get(v?.id);
    line('merge', 'an update naming only the title keeps the description, tags and privacy', !up.error && after?.snippet.title === 'A new title' && after?.snippet.description === args.description && after?.snippet.tags?.length === 2 && after?.status.privacyStatus === 'private', up.text.slice(0, 160));
    line('status', 'and keeps what the owner set in Studio (embedding, licence, the altered-content mark), sending none of YouTube\'s own fields back', after?.status.embeddable === false && after?.status.license === 'creativeCommon' && after?.status.containsSyntheticMedia === true && g.lastStatusSent && !('madeForKids' in g.lastStatusSent) && !('uploadStatus' in g.lastStatusSent), JSON.stringify(after?.status ?? {}));
    const pub = await b.tool('update_video', { video_id: v?.id, privacy: 'public' });
    const lv = await b.tool('list_videos', { limit: 5 });
    line('update', 'privacy changes when it is named, and list_videos shows it', !pub.error && g.videos.get(v?.id)?.status.privacyStatus === 'public' && Array.isArray(lv.v) && lv.v[0]?.title === 'A new title' && lv.v[0]?.privacy === 'public', lv.text.slice(0, 160));
    const bad = await b.tool('update_video', { video_id: v?.id, privacy: 'public', publish_at: '2030-01-01T00:00:00Z' });
    line('update', 'a schedule with a public privacy is refused before YouTube is asked', bad.error && g.updates === 2);
    b.child.stdin.end();
    await Promise.race([b.exited, sleep(3000)]);

    // ── Queue, drain, manifest, plist (PLAN 44i-5, 44i-6) ──────────────
    const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; } };
    const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
    const t0 = Date.now() + 60_000;
    const c = start(server, { ...env, CHROMAGLASS_YOUTUBE_NOW: String(t0) });
    logs.push(c.out);
    await c.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });

    // (a) uploadLimitExceeded leaves the job queued with notBefore >= lastUploadAt + 24 h and >= now + 2 h
    const file2 = join(dir, 'film2.mp4');
    const bytes2 = randomBytes(2 * CHUNK);
    writeFileSync(file2, bytes2);
    g.limitNext = 1;
    const sessionsBeforeA = g.sessions.length;
    const resA = await c.tool('upload_video', { file: file2, title: 'Queued film', playlist_id: 'PL1', thumbnail: thumb });
    const storeA = readJson(join(conf, 'uploads.json'));
    const qJob = (storeA.jobs ?? []).find((j) => j.meta?.snippet?.title === 'Queued film');
    const nbA = qJob?.notBefore ? Date.parse(qJob.notBefore) : 0;
    const lastA = storeA.lastUploadAt ? Date.parse(storeA.lastUploadAt) : 0;
    const statusA = await c.tool('upload_status', { job: qJob?.id });
    line('limitQueue', 'an upload refused by the daily limit a minute after the last upload waits exactly lastUploadAt + 24 h 10 min',
      !resA.error && g.sessions.length === sessionsBeforeA && qJob?.state === 'queued' && g.limitNext === 0 && lastA > 0 && nbA === lastA + 24 * 3600_000 + 10 * 60_000 && nbA >= t0 + 2 * 3600_000 && /queued, this computer retries after/.test(resA.text) && Boolean(statusA.v?.not_before || statusA.v?.[0]?.not_before),
      `state ${qJob?.state}, nb ${nbA}, last+24h ${lastA + 24 * 3600_000}, now+2h ${t0 + 2 * 3600_000}`);

    // (b) drain before notBefore sends nothing to the stand-in
    const reqBeforeB = g.requests;
    const dBefore = start(server, { ...env, CHROMAGLASS_YOUTUBE_NOW: String(t0 + 3600_000) }, ['drain']);
    logs.push(dBefore.out);
    const codeB = await Promise.race([dBefore.exited, sleep(10_000).then(() => 'timeout')]);
    if (codeB === 'timeout') await dBefore.kill();
    line('drainWait', 'drain before notBefore sends nothing to the stand-in', codeB === 0 && g.requests === reqBeforeB, `code ${codeB}, reqs ${g.requests - reqBeforeB}`);

    // (c) drain after notBefore uploads the file byte for byte, private, into its playlist, one session
    const tAfter = (nbA || t0 + 25 * 3600_000) + 60_000;
    const sessionsBeforeC = g.sessions.length;
    const dAfter = start(server, { ...env, CHROMAGLASS_YOUTUBE_NOW: String(tAfter) }, ['drain']);
    logs.push(dAfter.out);
    const codeC = await Promise.race([dAfter.exited, sleep(15_000).then(() => 'timeout')]);
    if (codeC === 'timeout') await dAfter.kill();
    const sC = g.sessions[sessionsBeforeC];
    const v2 = sC?.video;
    line('drainUpload', 'drain after notBefore uploads the file byte for byte, private, into its playlist, with one session',
      codeC === 0 && g.sessions.length === sessionsBeforeC + 1 && v2 && sha(v2.bytes) === sha(bytes2) && v2.status?.privacyStatus === 'private' && g.playlistItems.some((i) => i.playlistId === 'PL1' && i.videoId === v2.id) && g.thumbnails.some((t) => t.videoId === v2.id),
      `code ${codeC}, sessions ${g.sessions.length - sessionsBeforeC}, bytes ${v2?.bytes?.length}`);

    // (e) queue_upload sends nothing to the stand-in
    const file3 = join(dir, 'film3.mp4');
    const bytes3 = randomBytes(CHUNK);
    writeFileSync(file3, bytes3);
    const reqBeforeE = g.requests;
    const qRes = await c.tool('queue_upload', { file: file3, title: 'Batch film', key: 'batch-film', replaces: v?.id, playlist_id: 'PL1' });
    const qDup = await c.tool('queue_upload', { file: file3, title: 'Batch film' });
    const storeE = readJson(join(conf, 'uploads.json'));
    const batchJob = (storeE.jobs ?? []).find((j) => j.meta?.snippet?.title === 'Batch film');
    line('queueTool', 'queue_upload saves the job as queued and sends nothing to the stand-in',
      !qRes.error && qDup.error && g.requests === reqBeforeE && batchJob?.state === 'queued' && batchJob?.key === 'batch-film' && batchJob?.replaces === v?.id,
      `reqs ${g.requests - reqBeforeE}, dup ${qDup.error}`);

    // (d) a second drain while the first holds the job does not start a second session
    g.holdStart = new Promise((r) => { g.releaseStart = r; });
    const startCallsBefore = g.startCalls;
    let entered = false;
    g.onStartEnter = () => { entered = true; };
    const d1 = start(server, { ...env, CHROMAGLASS_YOUTUBE_NOW: String(tAfter + 60_000) }, ['drain']);
    logs.push(d1.out);
    await until(() => entered, 5000);
    const d2 = start(server, { ...env, CHROMAGLASS_YOUTUBE_NOW: String(tAfter + 60_000) }, ['drain']);
    logs.push(d2.out);
    const d2Code = await Promise.race([d2.exited, sleep(10_000).then(() => 'timeout')]);
    if (d2Code === 'timeout') await d2.kill();
    g.holdStart = null; g.onStartEnter = null; g.releaseStart?.();
    const d1Code = await Promise.race([d1.exited, sleep(10_000).then(() => 'timeout')]);
    if (d1Code === 'timeout') await d1.kill();
    const v3 = g.sessions[sessionsBeforeC + 1]?.video;
    line('drainLock', 'a second drain while the first holds the job does not start a second session',
      entered && d1Code === 0 && d2Code === 0 && g.startCalls === startCallsBefore + 1 && g.sessions.length === sessionsBeforeC + 2,
      `startCalls ${g.startCalls - startCallsBefore}, d1 ${d1Code}, d2 ${d2Code}`);

    // (g) an upload with replaces marks the old entry replaced and the new one ok
    const manifestAfterG = readJson(join(conf, 'manifest.json'));
    const oldEntryG = (manifestAfterG.videos ?? []).find((e) => e.videoId === v?.id);
    const newEntryG = (manifestAfterG.videos ?? []).find((e) => e.videoId === v3?.id);
    line('manifestReplace', 'an upload with replaces marks the old entry replaced and the new one ok in manifest.json',
      Boolean(v?.id) && Boolean(v3?.id) && oldEntryG?.status === 'replaced' && oldEntryG?.replacedBy === v3?.id && newEntryG?.status === 'ok' && newEntryG?.key === 'batch-film' && newEntryG?.replaces === v?.id && newEntryG?.source === realpathSync(file3),
      `old ${oldEntryG?.status}->${oldEntryG?.replacedBy}, new ${newEntryG?.status} key=${newEntryG?.key}`);

    // (f) manifest sync over two pages keeps a local status and reason across the sync
    g.pageSize = 2;
    g.videos.set('vid4', {
      id: 'vid4',
      snippet: { title: 'Gone film', publishedAt: new Date().toISOString(), channelId: 'UC1', thumbnails: {} },
      status: { uploadStatus: 'uploaded', privacyStatus: 'private' },
      statistics: { viewCount: '0', likeCount: '0' },
      contentDetails: { duration: 'PT1M' },
    });
    const pagesBeforeF = g.playlistPages;
    await c.tool('manifest', { sync: true });
    if (v2?.id) await c.tool('mark_video', { video_ids: [v2.id, 'vid4'], status: 'rerecord', reason: 'blurry edge' });
    if (v2?.id && g.videos.has(v2.id)) g.videos.get(v2.id).snippet.title = 'Updated on YouTube';
    g.videos.delete('vid4');
    await c.tool('manifest', { sync: true });
    const manifestAfterF = readJson(join(conf, 'manifest.json'));
    const v2Entry = (manifestAfterF.videos ?? []).find((e) => e.videoId === v2?.id);
    const v4Entry = (manifestAfterF.videos ?? []).find((e) => e.videoId === 'vid4');
    const mdFile = join(dir, 'manifest.md');
    const cliMan = start(server, env, ['manifest', '--md', mdFile]);
    logs.push(cliMan.out);
    const cliCode = await Promise.race([cliMan.exited, sleep(5000).then(() => 'timeout')]);
    if (cliCode === 'timeout') await cliMan.kill();
    const mdText = readText(mdFile);
    line('manifestSync', 'manifest sync over two pages keeps local status and reason across the sync',
      Boolean(v2?.id) && g.playlistPages - pagesBeforeF >= 4 && v2Entry?.title === 'Updated on YouTube' && v2Entry?.status === 'rerecord' && v2Entry?.reason === 'blurry edge' && v4Entry?.status === 'removed' && cliCode === 0 && mdText.includes('rerecord') && mdText.includes(v2.id),
      `pages ${g.playlistPages - pagesBeforeF}, v2 ${v2Entry?.title} / ${v2Entry?.status} / ${v2Entry?.reason}, v4 ${v4Entry?.status}`);

    c.child.stdin.end();
    await Promise.race([c.exited, sleep(3000)]);

    // (a') the floor. In (a) the last upload was a minute old, so lastUploadAt + 24 h
    // was always the later term and a server without the now + 2 h floor passed it
    // (the check-skeptic's control). Here the last upload is 30 hours old, so only
    // the floor stops the Mac retrying at once and hitting the limit again.
    const lastF = Date.parse(readJson(join(conf, 'uploads.json')).lastUploadAt ?? '') || t0;
    const tF = lastF + 30 * 3600_000;
    const cF = start(server, { ...env, CHROMAGLASS_YOUTUBE_NOW: String(tF) });
    logs.push(cF.out);
    await cF.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });
    const fileF = join(dir, 'film-floor.mp4');
    writeFileSync(fileF, randomBytes(CHUNK));
    g.limitNext = 1;
    const startsBeforeF = g.startCalls;
    const resF = await cF.tool('upload_video', { file: fileF, title: 'Floor film' });
    const jobF = (readJson(join(conf, 'uploads.json')).jobs ?? []).find((j) => j.meta?.snippet?.title === 'Floor film');
    const nbF = jobF?.notBefore ? Date.parse(jobF.notBefore) : 0;
    line('limitFloor', 'an upload refused by the daily limit a day after the last upload waits exactly now + 2 h',
      !resF.error && g.limitNext === 0 && g.startCalls === startsBeforeF + 1 && jobF?.state === 'queued' && nbF === tF + 2 * 3600_000,
      `state ${jobF?.state}, nb - now ${(nbF - tF) / 60_000} min, starts ${g.startCalls - startsBeforeF}`);
    cF.child.stdin.end();
    await Promise.race([cF.exited, sleep(3000)]);

    // (h) install-agent writes a valid plist without running launchctl under the env var
    const fakeHome = join(dir, 'home');
    const fakeBin = join(dir, 'bin');
    const launchMarker = join(dir, 'launchctl-ran');
    const notifyMarker = join(dir, 'osascript-ran');
    mkdirSync(fakeHome, { recursive: true });
    mkdirSync(fakeBin, { recursive: true });
    writeFileSync(join(fakeBin, 'launchctl'), `#!/bin/sh\necho "$@" > "${launchMarker}"\nexit 0\n`, { mode: 0o755 });
    writeFileSync(join(fakeBin, 'osascript'), `#!/bin/sh\necho "$@" > "${notifyMarker}"\nexit 0\n`, { mode: 0o755 });
    const ran = (b) => { try { statSync(join(dir, `${b}-ran`)); return true; } catch { return false; } };
    // Each system's plan, written for real into a fake home under the switch that keeps every
    // scheduler command printed and not run (44i-2a): the cloud is Linux and nobody's CI is
    // Windows, so PLATFORM is how one machine reads all three.
    const agentRun = async (platform, cmd) => {
      const p = start(server, { ...env, HOME: fakeHome, XDG_CONFIG_HOME: join(fakeHome, '.config'), PATH: `${fakeBin}:${process.env.PATH}`, CHROMAGLASS_YOUTUBE_NO_LAUNCHCTL: '1', CHROMAGLASS_YOUTUBE_PLATFORM: platform }, [cmd]);
      logs.push(p.out);
      const code = await Promise.race([p.exited, sleep(5000).then(() => 'timeout')]);
      if (code === 'timeout') await p.kill();
      return { code, err: p.out.stderr };
    };
    const exists = (f) => { try { statSync(f); return true; } catch { return false; } };
    const inst = await agentRun('darwin', 'install-agent');
    const instCode = inst.code;
    const plistFile = join(fakeHome, 'Library', 'LaunchAgents', 'art.chromaglass.youtube-drain.plist');
    const plistText = readText(plistFile);
    const uninstCode = (await agentRun('darwin', 'uninstall-agent')).code;
    const plistRemoved = !exists(plistFile);
    const unitDir = join(fakeHome, '.config', 'systemd', 'user');
    const lin = await agentRun('linux', 'install-agent');
    const svcText = readText(join(unitDir, 'art.chromaglass.youtube-drain.service'));
    const timerText = readText(join(unitDir, 'art.chromaglass.youtube-drain.timer'));
    const linUn = await agentRun('linux', 'uninstall-agent');
    const unitsRemoved = !exists(join(unitDir, 'art.chromaglass.youtube-drain.service')) && !exists(join(unitDir, 'art.chromaglass.youtube-drain.timer'));
    const win = await agentRun('win32', 'install-agent');
    const launchRan = ran('launchctl');
    line('plist', 'install-agent writes a plist naming drain, the real script path and StartInterval 3600 without running launchctl under the env var',
      instCode === 0 && uninstCode === 0 && !launchRan && plistRemoved && plistText.includes('<string>drain</string>') && plistText.includes(realpathSync(server)) && plistText.includes('<key>StartInterval</key><integer>3600</integer>'),
      `inst ${instCode}, uninst ${uninstCode}, launchRan ${launchRan}, removed ${plistRemoved}`);
    line('agentLinux', 'install-agent on Linux writes a systemd user service running drain on the real script and an hourly persistent timer, enables it (printed, not run), and uninstall removes both',
      lin.code === 0 && linUn.code === 0 && !ran('systemctl') && unitsRemoved && svcText.includes(`"${realpathSync(server)}" drain`) && /OnUnitActiveSec=1h/.test(timerText) && /Persistent=true/.test(timerText) && /would run: systemctl "--user" "enable" "--now" "art\.chromaglass\.youtube-drain\.timer"/.test(lin.err),
      `inst ${lin.code}, uninst ${linUn.code}, removed ${unitsRemoved}, timer ${/OnUnitActiveSec=1h/.test(timerText)}`);
    line('agentWindows', 'install-agent on Windows makes an hourly Task Scheduler task running drain on the real script (printed, not run)',
      win.code === 0 && !ran('schtasks') && /would run: schtasks "\/Create" "\/F" "\/SC" "HOURLY"/.test(win.err) && win.err.includes(`"/TR" ${JSON.stringify(`"${process.execPath}" "${realpathSync(server)}" drain`)}`),
      `inst ${win.code}, ${win.err.split('\n').find((l) => l.includes('schtasks')) ?? 'no schtasks line'}`);

    // setup (44i-2a): with nothing set up it names the client file as the first thing to do and
    // exits 1; signed in against the stand-in it finds the channel and exits 0.
    const setupRun = async (extra) => {
      const p = start(server, { ...env, ...extra }, ['setup']);
      logs.push(p.out);
      const code = await Promise.race([p.exited, sleep(8000).then(() => 'timeout')]);
      if (code === 'timeout') await p.kill();
      return { code, text: p.out.all };
    };
    const emptyConf = join(dir, 'empty-conf');
    const setupEmpty = await setupRun({ CHROMAGLASS_YOUTUBE_DIR: emptyConf });
    const setupFull = await setupRun({});
    line('setup', 'setup with no client file exits 1 naming the client file and the Cloud console pages; signed in, it exits 0 and names the channel',
      setupEmpty.code === 1 && /TODO {2}Google client file/.test(setupEmpty.text) && setupEmpty.text.includes('youtube.googleapis.com') && !/TODO/.test(setupFull.text) && setupFull.code === 0 && /ok {4}YouTube channel: /.test(setupFull.text),
      `empty ${setupEmpty.code}, full ${setupFull.code}: ${setupFull.text.split('\n').filter((l) => /TODO|channel/.test(l)).join(' | ').slice(0, 200)}`);

    // settings.json with a key this version does not know stops the server at start, naming it.
    const badConf = join(dir, 'bad-conf');
    mkdirSync(badConf, { recursive: true, mode: 0o700 });
    writeFileSync(join(badConf, 'settings.json'), JSON.stringify({ timezone: 'Europe/London' }));
    const badSettings = start(server, { ...env, CHROMAGLASS_YOUTUBE_DIR: badConf });
    const badCode = await Promise.race([badSettings.exited, sleep(3000).then(() => 'running')]);
    if (badCode === 'running') await badSettings.kill();
    line('settingsKeys', 'a settings.json key the server does not know stops it at start with the key named',
      badCode === 2 && /timezone/.test(badSettings.out.stderr) && /Known: timeZone, categoryId/.test(badSettings.out.stderr), `exit ${badCode}`);

    // ── Replace, sidecar card, release plan, progress, notify (PLAN 44i-4, 44i-7..10) ─
    const c2 = start(server, { ...env, CHROMAGLASS_YOUTUBE_NOW: String(tF + 60_000) });
    logs.push(c2.out);
    await c2.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });

    // (44i-4) progressToken receives rising progress notifications
    const fileProg = join(dir, 'film-prog.mp4');
    const bytesProg = randomBytes(4 * CHUNK);
    writeFileSync(fileProg, bytesProg);
    const progNotesBefore = c2.out.notifications.length;
    const progRes = await c2.tool('upload_video', { file: fileProg, title: 'Progress film' }, 20_000, { progressToken: 'prog-1' });
    const progNotes = c2.out.notifications.slice(progNotesBefore).filter((n) => n.method === 'notifications/progress' && n.params?.progressToken === 'prog-1');
    const progRising = progNotes.length >= 2 && progNotes.every((n, i) => n.params.total === bytesProg.length && n.params.progress > (i ? progNotes[i - 1].params.progress : 0) && n.params.progress <= n.params.total) && progNotes.at(-1)?.params?.progress === bytesProg.length;
    line('progress', 'upload_video emits rising MCP progress notifications when progressToken is sent',
      !progRes.error && progRes.v?.state === 'done' && progRising,
      `notes ${progNotes.length}, values ${progNotes.map((n) => n.params.progress).join(',')}`);

    // (j) replace_video + (m) manifest views/likes + no osascript under env var
    g.playlists.push({ id: 'PL2', snippet: { title: 'Ambient' }, status: { privacyStatus: 'public' } });
    g.videos.set('vidOld', {
      id: 'vidOld',
      snippet: { title: 'Old ambient', description: 'Old desc', tags: ['ambient', 'old'], categoryId: '10', publishedAt: new Date(tF).toISOString(), channelId: 'UC1', thumbnails: {} },
      status: { uploadStatus: 'uploaded', privacyStatus: 'public', selfDeclaredMadeForKids: false },
      statistics: { viewCount: '42', likeCount: '7' },
      contentDetails: { duration: 'PT1M' },
    });
    g.playlistItems.push({ playlistId: 'PL1', videoId: 'vidOld' });
    g.playlistItems.push({ playlistId: 'PL2', videoId: 'vidOld' });
    const pl1Pos = g.playlistItems.filter((i) => i.playlistId === 'PL1').length - 1;
    const pl2Pos = g.playlistItems.filter((i) => i.playlistId === 'PL2').length - 1;
    g.pageSize = 1;
    await c2.tool('manifest', { sync: true });
    await c2.tool('mark_video', { video_id: 'vidOld', key: 'old-ambient' });
    const manifestSynced = readJson(join(conf, 'manifest.json'));
    const oldSynced = (manifestSynced.videos ?? []).find((e) => e.videoId === 'vidOld');
    line('manifestViews', 'manifest sync stores views and likes from videos.list statistics on the same call',
      oldSynced?.views === 42 && oldSynced?.likes === 7,
      `views ${oldSynced?.views}, likes ${oldSynced?.likes}`);

    const fileRepl = join(dir, 'film-repl.mp4');
    const bytesRepl = randomBytes(2 * CHUNK);
    writeFileSync(fileRepl, bytesRepl);
    const sessionsBeforeJ = g.sessions.length;
    const updatesBeforeJ = g.updates;
    const repRes = await c2.tool('replace_video', { video_id: 'vidOld', file: fileRepl });
    const jobsAfterJ = readJson(join(conf, 'uploads.json')).jobs ?? [];
    const repJob = jobsAfterJ.find((j) => j.replaces === 'vidOld');
    const queuedOkJ = !repRes.error && g.sessions.length === sessionsBeforeJ && g.updates === updatesBeforeJ
      && g.videos.get('vidOld')?.status?.privacyStatus === 'public'
      && repJob?.state === 'queued' && repJob?.meta?.snippet?.title === 'Old ambient'
      && repJob?.meta?.snippet?.description === 'Old desc'
      && repJob?.meta?.snippet?.tags?.join(',') === 'ambient,old'
      && repJob?.meta?.status?.privacyStatus === 'private'
      && repJob?.key === 'old-ambient';
    // Drain the queued replacement (plus Floor film if due) with NO_NOTIFY=1 and fake osascript on PATH
    const drainRepl = start(server, { ...env, PATH: `${fakeBin}:${process.env.PATH}`, CHROMAGLASS_YOUTUBE_NO_NOTIFY: '1', CHROMAGLASS_YOUTUBE_NOW: String(tF + 3 * 3600_000) }, ['drain']);
    logs.push(drainRepl.out);
    const drainReplCode = await Promise.race([drainRepl.exited, sleep(15_000).then(() => 'timeout')]);
    if (drainReplCode === 'timeout') await drainRepl.kill();
    let notifyRan = false;
    notifyRan = ['osascript', 'notify-send', 'powershell'].some((b) => { try { statSync(join(dir, `${b}-ran`)); return true; } catch { return false; } });
    const vNew = g.sessions.slice(sessionsBeforeJ).map((s) => s.video).find((vv) => vv && sha(vv.bytes) === sha(bytesRepl));
    const manifestAfterJ = readJson(join(conf, 'manifest.json'));
    const oldAfterJ = (manifestAfterJ.videos ?? []).find((e) => e.videoId === 'vidOld');
    const newAfterJ = (manifestAfterJ.videos ?? []).find((e) => e.videoId === vNew?.id);
    const inPl1 = g.playlistItems.some((i) => i.playlistId === 'PL1' && i.videoId === vNew?.id && i.position === pl1Pos);
    const inPl2 = g.playlistItems.some((i) => i.playlistId === 'PL2' && i.videoId === vNew?.id && i.position === pl2Pos);
    line('replaceVideo', 'replace_video queues old metadata and replaces without uploading yet; drain adds new id to all old playlists and marks manifest old replaced, new ok',
      queuedOkJ && drainReplCode === 0 && Boolean(vNew?.id) && inPl1 && inPl2 && oldAfterJ?.status === 'replaced' && oldAfterJ?.replacedBy === vNew?.id && newAfterJ?.status === 'ok' && newAfterJ?.key === 'old-ambient' && newAfterJ?.replaces === 'vidOld',
      `queued ${queuedOkJ}, drain ${drainReplCode}, vNew ${vNew?.id}, pl1 ${inPl1}, pl2 ${inPl2}, old ${oldAfterJ?.status}, new ${newAfterJ?.status}`);
    // What this holds is the guard as a whole (a drain against a stand-in Google never notifies); the
    // NO_NOTIFY switch alone is not separable here, since every drain in the check names the stand-in.
    line('notifyGuard', 'drain never invokes a notifier (osascript, notify-send, powershell) when run against a stand-in Google with CHROMAGLASS_YOUTUBE_NO_NOTIFY=1',
      drainReplCode === 0 && !notifyRan,
      `drain ${drainReplCode}, notifyRan ${notifyRan}`);

    // (k) sidecar upload card: fills omitted title, call wins, unknown field refused with nothing queued
    const cardFile1 = join(dir, 'card1.mp4');
    writeFileSync(cardFile1, randomBytes(CHUNK));
    writeFileSync(join(dir, 'card1.youtube.json'), JSON.stringify({ title: 'From Card', description: 'Card desc', tags: ['card'], playlist: 'PL1', key: 'card-key-1' }));
    const qCard1 = await c2.tool('queue_upload', { file: cardFile1 });
    const cardFile2 = join(dir, 'card2.mp4');
    writeFileSync(cardFile2, randomBytes(CHUNK));
    writeFileSync(join(dir, 'card2.youtube.json'), JSON.stringify({ title: 'Card Loses', description: 'Card desc 2' }));
    const qCard2 = await c2.tool('queue_upload', { file: cardFile2, title: 'Call Wins' });
    const cardFileBad = join(dir, 'cardbad.mp4');
    writeFileSync(cardFileBad, randomBytes(CHUNK));
    writeFileSync(join(dir, 'cardbad.youtube.json'), JSON.stringify({ title: 'Typo film', titel: 'wrong' }));
    const jobsBeforeBad = (readJson(join(conf, 'uploads.json')).jobs ?? []).length;
    const sessionsBeforeBad = g.sessions.length;
    const qCardBad = await c2.tool('queue_upload', { file: cardFileBad });
    const uCardBad = await c2.tool('upload_video', { file: cardFileBad });
    const jobsAfterBad = (readJson(join(conf, 'uploads.json')).jobs ?? []).length;
    const jobsStoreK = readJson(join(conf, 'uploads.json')).jobs ?? [];
    const jCard1 = jobsStoreK.find((j) => j.key === 'card-key-1');
    const jCard2 = jobsStoreK.find((j) => j.file === realpathSync(cardFile2));
    line('sidecar', 'sidecar upload card fills omitted title, call wins over card, and unknown fields are refused with nothing queued',
      !qCard1.error && jCard1?.meta?.snippet?.title === 'From Card' && jCard1?.meta?.snippet?.description === 'Card desc' && jCard1?.playlist_id === 'PL1'
      && !qCard2.error && jCard2?.meta?.snippet?.title === 'Call Wins' && jCard2?.meta?.snippet?.description === 'Card desc 2'
      && qCardBad.error && /titel/.test(qCardBad.text) && uCardBad.error && /titel/.test(uCardBad.text)
      && jobsAfterBad === jobsBeforeBad && g.sessions.length === sessionsBeforeBad,
      `c1 ${jCard1?.meta?.snippet?.title}, c2 ${jCard2?.meta?.snippet?.title}, bad ${qCardBad.error}/${uCardBad.error}`);

    // (l) release_plan dry run sends no update; real run sets publishAt at Pacific clock time across DST (2026-03-08)
    await c2.tool('mark_video', { video_id: v2?.id, key: 'v2-rel' });
    const updatesBeforeL = g.updates;
    const dryPlan = await c2.tool('release_plan', { keys: ['v2-rel', 'old-ambient', 'card-key-1'], start: '2026-03-07', every: 24, at: '10:00', dry_run: true });
    const updatesAfterDry = g.updates;
    const jobAfterDry = (readJson(join(conf, 'uploads.json')).jobs ?? []).find((j) => j.key === 'card-key-1');
    const pubPlan = await c2.tool('release_plan', { video_ids: ['vidOld'], start: '2026-03-07', every: 24, at: '10:00' });
    const realPlan = await c2.tool('release_plan', { keys: ['v2-rel', 'old-ambient', 'card-key-1'], start: '2026-03-07', every: 24, at: '10:00' });
    const jobAfterReal = (readJson(join(conf, 'uploads.json')).jobs ?? []).find((j) => j.key === 'card-key-1');
    const pacWall = (iso) => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(Date.parse(iso)));
      const get = (t) => parts.find((p) => p.type === t)?.value;
      return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
    };
    const slot0 = g.videos.get(v2?.id)?.status?.publishAt;
    const slot1 = g.videos.get(vNew?.id)?.status?.publishAt;
    const slot2 = jobAfterReal?.meta?.status?.publishAt;
    const dstOk = slot0 && slot1 && slot2
      && pacWall(slot0) === '2026-03-07 10:00'
      && pacWall(slot1) === '2026-03-08 10:00'
      && pacWall(slot2) === '2026-03-09 10:00';
    line('releasePlan', 'release_plan dry run sends no update, refuses public targets, and real run sets publishAt at Pacific clock time across DST (2026-03-08)',
      !dryPlan.error && dryPlan.v?.quota_cost === 100 && updatesAfterDry === updatesBeforeL && !jobAfterDry?.meta?.status?.publishAt
      && pubPlan.error && /private/.test(pubPlan.text)
      && !realPlan.error && g.updates === updatesBeforeL + 2 && realPlan.v?.quota_cost === 100 && dstOk,
      `updates dry ${updatesAfterDry - updatesBeforeL} / all ${g.updates - updatesBeforeL}, slots ${slot0 ? pacWall(slot0) : 'none'} / ${slot1 ? pacWall(slot1) : 'none'} / ${slot2 ? pacWall(slot2) : 'none'}`);

    c2.child.stdin.end();
    await Promise.race([c2.exited, sleep(3000)]);

    // (m) the words around a video (44i-2b): credits, chapters, captions, other languages (scripts/youtubeText.mjs)
    await textScenario({ server, start, env, conf, dir, g, line, logs, chunk: CHUNK });

    // (n) Shorts and folders (44i-2c): real MP4 and WebM headers, read by the server's own probe (scripts/youtubeShorts.mjs)
    await shortsScenario({ server, start, env, conf, dir, g, line, logs });

    // (i) nothing secret in any reply, the log, the manifest, uploads.json or the plist
    const manifestRaw = readText(join(conf, 'manifest.json'));
    const uploadsRaw = readText(join(conf, 'uploads.json'));
    const leaked = [...g.secrets].filter((x) => logs.some((o) => o.all.includes(x)));
    line('leak', `nothing secret is in a reply or the log (${g.secrets.size} keys, secrets and session addresses looked for)`, leaked.length === 0, `found ${leaked.map((x) => x.slice(0, 10)).join(', ')}`);
    const leakedFiles = [...g.secrets].filter((x) => manifestRaw.includes(x) || plistText.includes(x));
    line('leakFiles', 'nothing secret is in the manifest or the plist', manifestRaw.length > 0 && plistText.length > 0 && leakedFiles.length === 0, `found ${leakedFiles.map((x) => x.slice(0, 10)).join(', ')}`);
    // Every key the stand-in ever issued (g.secrets keeps them; g.access is emptied at the expire
    // fault), less the upload session addresses, which uploads.json holds on purpose to resume.
    const keySecrets = [...g.secrets].filter((x) => !x.startsWith('http'));
    const leakedUploads = keySecrets.filter((x) => uploadsRaw.includes(x));
    line('leakUploads', 'no key or token is in uploads.json', uploadsRaw.length > 0 && leakedUploads.length === 0, `found ${leakedUploads.map((x) => x.slice(0, 10)).join(', ')}`);
  } catch (e) {
    line('crash', 'the scenario ran to its end', false, String(e?.stack ?? e));
  } finally {
    close();
    rmSync(dir, { recursive: true, force: true });
  }
  return lines;
}

// ── The mutants: each rule taken out of a copy of the server ───────────

const MUTANTS = [
  { rule: 'loopback', find: "if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1') throw", replace: 'if (false) throw' },
  { rule: 'state', find: "if (q.get('state') !== state)", replace: 'if (false)' },
  { rule: 'pkce', find: 'grant_type: \'authorization_code\', code_verifier: verifier', replace: 'grant_type: \'authorization_code\'' },
  { rule: 'private', find: 'const PRIVATE = 0o600;', replace: 'const PRIVATE = 0o644;' },
  { rule: 'refresh', find: 'if (r.status === 401 && attempt === 0) continue;', replace: '' },
  { rule: 'restart', find: "let job = a.again ? null : jobs.find((j) => same(j) && j.state !== 'done');", replace: 'let job = null;' },
  { rule: 'resume', find: 'const at = o.at; job.sent = at;', replace: 'job.sent = 0;' },
  { rule: 'privacy', find: "privacyStatus: a.privacy ?? 'private'", replace: '...(a.privacy ? { privacyStatus: a.privacy } : {})' },
  { rule: 'twice', find: 'if (done && !a.again) throw', replace: 'if (false) throw' },
  { rule: 'merge', find: 'const snippet = { ...cur.snippet };', replace: 'const snippet = {};' },
  { rule: 'status', find: 'const status = { ...cur.status };', replace: 'const status = { privacyStatus: cur.status?.privacyStatus, selfDeclaredMadeForKids: cur.status?.selfDeclaredMadeForKids ?? false };' },
  { rule: 'chunk401', find: "if (r && r.status === 401) { await accessToken(true);", replace: 'if (r && r.status === 401) {' },
  { rule: 'thumb', find: "query: { videoId, uploadType: 'media' }", replace: 'query: { videoId }' },
  { rule: 'leak', find: 'log(`Signed in as the channel', replace: 'log(token.refresh_token, `Signed in as the channel' },
  { rule: 'limitQueue', find: "if (e instanceof GoogleApiError && (e.reason === 'uploadLimitExceeded' || e.reason === 'quotaExceeded'))", replace: 'if (false)' },
  { rule: 'drainWait', find: 'if (fresh.notBefore && Date.parse(fresh.notBefore) > nowMs()) continue;', replace: 'if (false) continue;' },
  { rule: 'drainLock', find: 'if (busyElsewhere(fresh)) continue;', replace: 'if (false) continue;' },
  { rule: 'limitFloor', find: 'return Math.max(now + 2 * 3600_000, afterLast);', replace: 'return afterLast || now + 2 * 3600_000;' },
  // The check's old video has no manifest entry yet when its replacement finishes, so
  // the server takes the push branch (the entry made on the spot), and that is the one cut.
  { rule: 'manifestReplace', find: "status: 'replaced', replacedBy: video.id, updatedAt: finishedAt });", replace: "status: 'replaced', updatedAt: finishedAt });" },
  { rule: 'leakFiles', find: 'writePrivate(MANIFEST_FILE, JSON.stringify({ syncedAt: m.syncedAt ?? null, videos: m.videos }, null, 2));', replace: 'writePrivate(MANIFEST_FILE, JSON.stringify({ syncedAt: m.syncedAt ?? null, videos: m.videos, t: loadToken()?.refresh_token }, null, 2));' },
  { rule: 'progress', find: 'if (moved) { onProgress?.(job.sent, job.size); fails = 0; continue; }', replace: 'if (moved) { fails = 0; continue; }' },
  { rule: 'replaceVideo', find: 'const playlists = Array.isArray(oldEntry?.playlists) ? oldEntry.playlists : await findVideoPlaylists(oldId);', replace: 'const playlists = [];' },
  { rule: 'sidecar', find: 'if (unknown.length) {', replace: 'if (false) {' },
  { rule: 'notifyGuard', find: "if (env('NO_SCHEDULER') === '1' || env('NO_LAUNCHCTL') === '1' || env('NO_NOTIFY') === '1' || env('GOOGLE')) return;", replace: '' },
  // The regression that matters is a server reading the computer's zone instead of the settings';
  // the servers run with TZ=UTC, so on the owner's Pacific Mac too this mutant reads UTC and fails.
  { rule: 'releasePlan', find: 'const ZONE = SETTINGS.timeZone;', replace: 'const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;', as: 'settingsZone' },
  { rule: 'agentLinux', find: "const dryScheduler = () => env('NO_SCHEDULER') === '1' || env('NO_LAUNCHCTL') === '1';", replace: 'const dryScheduler = () => false;' },
  { rule: 'setup', find: 'process.exit(r.ok ? 0 : 1);', replace: 'process.exit(0);' },
  { rule: 'settingsKeys', find: 'try { SETTINGS = readSettings(DIR); } catch (e) { log(e.message); process.exit(2); }', replace: "try { SETTINGS = readSettings(DIR); } catch (e) { SETTINGS = { timeZone: 'UTC', categoryId: '22' }; }" },
  { rule: 'manifestViews', find: '...(v?.statistics ? { views: Number(v.statistics.viewCount ?? 0), likes: Number(v.statistics.likeCount ?? 0) } : {}),', replace: '' },
  // The words around a video (44i-2b): the server's wiring, then the rules in youtube/describe.js and youtube/captions.js.
  { rule: 'credits', find: 'const credits = creditsLine(SETTINGS.credits, a.credits, a.music, a.description);', replace: "const credits = '';" },
  { rule: 'updateChapters', in: 'youtube/describe.js', find: 'if (credits) text = text.split(credits).join', replace: 'if (false) text = text.split(credits).join', as: 'creditsOnce' },
  { rule: 'creditsNeedMusic', in: 'youtube/describe.js', find: "if (!piece) throw new Error('The credits line", replace: "if (false) throw new Error('The credits line" },
  { rule: 'replaceCredits', in: 'youtube/describe.js', find: "if (!piece) piece = musicIn(line, body) ?? '';", replace: '' },
  { rule: 'chapterRules', in: 'youtube/describe.js', find: 'if (list[0].at !== 0) throw', replace: 'if (false) throw', as: 'chapterZero' },
  { rule: 'chapterRules', in: 'youtube/describe.js', find: 'if (list[i].at - list[i - 1].at < 10) throw', replace: 'if (false) throw', as: 'chapterGap' },
  { rule: 'updateChapters', in: 'youtube/describe.js', find: 'if (chapters) text = stripChapters(text);', replace: '', as: 'chapterStrip' },
  { rule: 'updateChapters', in: 'youtube/describe.js', find: 'if (Number.isFinite(durationSec) && durationSec > 0 && durationSec - list[list.length - 1].at < 10)', replace: 'if (false)', as: 'chapterEnd' },
  { rule: 'captions', find: 'for (const c of job.captions ?? []) job.after.push(', replace: 'for (const c of []) job.after.push(' },
  { rule: 'captions', find: "query: { part: 'snippet', uploadType: 'multipart' }", replace: "query: { part: 'snippet' }", as: 'captionsMultipart' },
  { rule: 'captionFiles', in: 'youtube/captions.js', find: '} else if (!SRT_CUE.test(body)) {', replace: '} else if (false) {' },
  { rule: 'localizations', find: "part: job.meta.localizations ? 'snippet,status,localizations' : 'snippet,status'", replace: "part: 'snippet,status'" },
  { rule: 'localizationsLanguage', in: 'youtube/describe.js', find: "if (!validLanguage(language)) throw new Error('Titles in other languages", replace: "if (false) throw new Error('Titles in other languages" },
  { rule: 'updateLocalizations', find: 'localizations = { ...(cur.localizations ?? {}) };', replace: 'localizations = {};' },
  { rule: 'addCaptions', find: "const [c] = captionsFor({ captions: [{ file: a.file, language: a.language, name: a.name, draft: a.draft }] });", replace: "const c = { file: a.file, language: 'en' };" },
  { rule: 'cardWords', find: "const here = (f) => resolve(dir,", replace: 'const here = (f) => String(f) || resolve(dir,' },
  { rule: 'creditsFalse', in: 'youtube/describe.js', find: "if (own === false || own === 'false') return '';", replace: '' },
  { rule: 'creditsFalse', find: 'catch { lenient = { credits: false }; }', replace: 'catch { /* none */ }', as: 'lenientUpdate' },
  { rule: 'drainedWords', find: 'if (raw.credits !== undefined) out.credits = raw.credits === false ? false : String(raw.credits);', replace: '', as: 'cardCredits' },
  { rule: 'updateLocalizations', find: "part: 'snippet,status,statistics,contentDetails,localizations'", replace: "part: 'snippet,status,statistics,contentDetails'", as: 'readLocalizations' },
  { rule: 'updateLocalizations', find: "part: localizations ? 'snippet,status,localizations' : 'snippet,status'", replace: "part: 'snippet,status,localizations'", as: 'alwaysPart' },
  { rule: 'updateLocalizations', find: "part: localizations ? 'snippet,status,localizations' : 'snippet,status'", replace: "part: 'snippet,status'", as: 'neverPart' },
  { rule: 'updateLocalizations', find: 'if (v === null) delete localizations[lang]; else localizations[lang] = v;', replace: 'localizations[lang] = v;', as: 'nullRemoves' },
  { rule: 'chapterRules', in: 'youtube/describe.js', find: 'if (list.length < 3) throw', replace: 'if (false) throw', as: 'chapterThree' },
  { rule: 'processingLength', in: 'youtube/describe.js', find: 'durationSec > 0 && ', replace: '' },
  { rule: 'limits', in: 'youtube/describe.js', find: 'if (ANGLE.test(out)) throw', replace: 'if (false) throw', as: 'descAngle' },
  { rule: 'limits', in: 'youtube/describe.js', find: 'if (bytes > DESCRIPTION_BYTES) throw', replace: 'if (false) throw', as: 'descBytes' },
  { rule: 'limits', in: 'youtube/describe.js', find: 'if (t.length > TITLE_CHARS) throw', replace: 'if (false) throw', as: 'titleChars' },
  { rule: 'limits', in: 'youtube/describe.js', find: 'if (ANGLE.test(t)) throw', replace: 'if (false) throw', as: 'titleAngle' },
  { rule: 'captionFiles', in: 'youtube/captions.js', find: 'if (!/^WEBVTT', replace: 'if (false && !/^WEBVTT', as: 'vttHeader' },
  { rule: 'captionFiles', in: 'youtube/captions.js', find: 'if (!VTT_CUE.test(body)) throw', replace: 'if (false) throw', as: 'vttCue' },
  { rule: 'captionFiles', in: 'youtube/captions.js', find: "new TextDecoder('utf-8', { fatal: true })", replace: "new TextDecoder('utf-8', { fatal: false })", as: 'utf8' },
  { rule: 'captionFiles', in: 'youtube/captions.js', find: 'if (size > MAX_BYTES) throw', replace: 'if (false) throw', as: 'captionSize' },
  { rule: 'captions', find: "query: { part: 'snippet', uploadType: 'multipart' }", replace: "query: { uploadType: 'multipart' }", as: 'captionsPart' },
  { rule: 'addCaptions', find: 'language: t.snippet?.language,', replace: '', as: 'listLanguage' },
  { rule: 'addCaptions', find: "...(o.draft ? { draft: true } : {})", replace: '', as: 'captionDraft' },
  // Shorts and folders (44i-2c): the server's wiring, then youtube/shorts.js, youtube/probe.js and youtube/folder.js.
  { rule: 'shortLength', find: 'if (a.short) checkShort(shape, basename(file));', replace: '', as: 'shortWired' },
  { rule: 'shortLength', in: 'youtube/shorts.js', find: 'const over = p.durationSec > SHORT_MAX_SEC', replace: 'const over = false' },
  { rule: 'shortShape', in: 'youtube/shorts.js', find: 'wide = p.width > p.height', replace: 'wide = false' },
  { rule: 'shortShape', in: 'youtube/probe.js', find: 'const turned = rotation === 90 || rotation === 270;', replace: 'const turned = false;', as: 'shortTurn' },
  { rule: 'shortTag', find: "a.short ? tagShort(a.title, a.description) : a.description ?? ''", replace: "a.description ?? ''" },
  { rule: 'tagOnce', in: 'youtube/shorts.js', find: "if (TAGGED.test(String(title ?? '')) || TAGGED.test(d)) return d;", replace: '' },
  { rule: 'shortUnknown', in: 'youtube/shorts.js', find: 'if (!p.durationSec) {', replace: 'if (false) {' },
  { rule: 'webmLength', in: 'youtube/probe.js', find: 'if (f.id === ID.SCALE) scale = uint(buf, f);', replace: 'if (false) scale = uint(buf, f);' },
  { rule: 'shortsNote', find: '...(a.short ? { short: true } : {}), ...(shorts ? { shorts } : {}),', replace: '...(a.short ? { short: true } : {}),' },
  { rule: 'shortsNote', in: 'youtube/shorts.js', find: 'return is ? `YouTube will show', replace: 'return false ? `YouTube will show', as: 'notAsked' },
  { rule: 'shortsNote', in: 'youtube/shorts.js', find: '${p.durationSec > 60 ?', replace: '${false ?', as: 'contentId' },
  { rule: 'mp4Read', in: 'youtube/probe.js', find: 'size = Number(h.readBigUInt64BE(8)); head = 16; }', replace: '}', as: 'mp4Large' },
  { rule: 'mp4Read', in: 'youtube/probe.js', find: '(moov[tkhd.start] === 1 ? 32 : 20)', replace: '20', as: 'tkhdVersion' },
  { rule: 'mp4Read', in: 'youtube/probe.js', find: 'const scale = v === 1 ? moov.readUInt32BE(mvhd.start + 20) : moov.readUInt32BE(mvhd.start + 12);', replace: 'const scale = moov.readUInt32BE(mvhd.start + 12);', as: 'mvhdVersion' },
  { rule: 'mp4Read', in: 'youtube/probe.js', find: "!== 'vide') continue;", replace: "!== 'vide' && false) continue;", as: 'videoTrack' },
  { rule: 'uploadChapters', find: 'wordsFor(a, shape?.durationSec)', replace: 'wordsFor(a)', all: true },
  { rule: 'cardShort', find: 'if (raw.short !== undefined) out.short = raw.short;', replace: '' },
  { rule: 'cardShort', find: "if (a.short !== undefined && typeof a.short !== 'boolean') throw", replace: 'if (false) throw', as: 'shortType' },
  { rule: 'shortsNote', in: 'youtube/shorts.js', find: 'return p.durationSec <= SHORT_MAX_SEC && p.height >= p.width;', replace: 'return p.height >= p.width;', as: 'notAskedLen' },
  { rule: 'shortsNote', in: 'youtube/shorts.js', find: 'return p.durationSec <= SHORT_MAX_SEC && p.height >= p.width;', replace: 'return p.durationSec <= SHORT_MAX_SEC;', as: 'notAskedShape' },
  { rule: 'mp4Read', in: 'youtube/probe.js', find: 'size = Number(h.readBigUInt64BE(8));', replace: 'size = h.readUInt32BE(12);', as: 'lowWord' },
  { rule: 'webmLength', in: 'youtube/probe.js', find: 'let value = keepMarker ? first : first & (0xff >> len);', replace: 'let value = keepMarker ? first : first & (0x7f >> len);', as: 'vintMask' },
  { rule: 'shortTag', find: "composeDescription(a.short ? tagShort(a.title, a.description) : a.description ?? '', chapters, credits)", replace: "(a.short ? (x) => tagShort(a.title, x) : (x) => x)(composeDescription(a.description ?? '', chapters, credits))", as: 'tagAfter' },
  { rule: 'folderAgain', find: "if (done) return { ...row, title: m.title, state: 'already up'", replace: "if (false) return { ...row, title: m.title, state: 'already up'", as: 'alreadyUp' },
  { rule: 'probeKinds', in: 'youtube/probe.js', find: 'if (width && height && (rotation === 90 || rotation === 270)) [width, height] = [height, width];', replace: '', as: 'webmRoll' },
  { rule: 'probeKinds', in: 'youtube/probe.js', find: 'width = get(ID.DW) ?? get(ID.PW); height = get(ID.DH) ?? get(ID.PH);', replace: 'width = get(ID.PW); height = get(ID.PH);', as: 'displaySize' },
  { rule: 'probeKinds', in: 'youtube/probe.js', find: 'if (mehd) whole =', replace: 'if (false) whole =', as: 'mehd' },
  { rule: 'probeKinds', in: 'youtube/probe.js', find: 'if (stsd && stsd.start + 8 + 36 <= stsd.end)', replace: 'if (false)', as: 'stsd' },
  { rule: 'folderWhole', find: 'const go = !a.dry_run && (!refused || a.skip_refused === true);', replace: 'const go = !a.dry_run;' },
  { rule: 'folderDry', find: 'const go = !a.dry_run && (!refused || a.skip_refused === true);', replace: 'const go = !refused || a.skip_refused === true;' },
  { rule: 'folderSkip', find: ' || a.skip_refused === true);', replace: ');' },
  { rule: 'folderCard', find: 'mergeArgsWithCard(readUploadCard(path), shared)', replace: 'mergeArgsWithCard(shared, readUploadCard(path))' },
  { rule: 'folderAgain', find: "if (pending) return { ...row", replace: "if (false) return { ...row" },
  { rule: 'folderOrder', in: 'youtube/folder.js', find: "{ numeric: true, sensitivity: 'base' }", replace: "{ sensitivity: 'base' }" },
  { rule: 'folderOrder', in: 'youtube/folder.js', find: "replace(/[-_.]+/g, ' ')", replace: "replace(/[_.]+/g, ' ')", as: 'titleFromName' },
  { rule: 'folderFilms', in: 'youtube/folder.js', find: "!n.startsWith('.') && ", replace: '' },
  { rule: 'folderFilms', in: 'youtube/folder.js', find: 'try { if (!statSync(p).isFile()) continue; } catch { continue; }', replace: '', as: 'folderIsFile' },
  { rule: 'folderHidden', in: 'youtube/folder.js', find: 'if (/[\\/\\\\]\\.[^\\/\\\\]/.test(under)) throw', replace: 'if (false) throw' },
  { rule: 'folderMax', in: 'youtube/folder.js', find: 'if (films.length > FOLDER_MAX) throw', replace: 'if (false) throw' },
  { rule: 'releasePlan', find: 'const slotMs = every % 24 === 0\n      ? zoneWall(y, mo, d + i * (every / 24), h, min, 0)\n      : slot0Ms + i * every * 3600_000;', replace: 'const slotMs = slot0Ms + i * every * 3600_000;' },
];

function mutant(m) {
  const dir = join(ROOT, 'scratch', 'youtube-mutants', m.as ?? m.rule);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'youtube-mcp.js');
  // The server's own modules beside it (44i-2a), so the copy imports what the original does;
  // a mutant that names a module (`in`, 44i-2b) is cut there instead of in the server.
  cpSync(MODULES, join(dir, 'youtube'), { recursive: true });
  const target = m.in ? join(dir, m.in) : file;
  const src = readFileSync(m.in ? join(MODULES, '..', m.in) : SERVER, 'utf8');
  if (!src.includes(m.find)) return { why: `its text is not in mcp/${m.in ?? 'youtube-mcp.js'}: "${m.find}"` };
  if (m.in) writeFileSync(file, readFileSync(SERVER, 'utf8'));
  writeFileSync(target, m.all ? src.split(m.find).join(m.replace) : src.replace(m.find, m.replace));
  return { file };
}

// ── The run ────────────────────────────────────────────────────────────

const failures = [];
const say = (ok, l) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}`); if (!ok) failures.push(l); };

const src = readFileSync(SERVER, 'utf8');
// It imports only Node's own modules and its own folder (mcp/youtube/, 44i-2a), and that folder
// imports only Node's and its own siblings, so the server and the folder lift out together.
const modDir = MODULES;
// Every static, re-export, bare and dynamic form, either quote, any indent; the sample below must
// yield each of its five specifiers, so a narrowed pattern fails here rather than passing quietly.
const importsOf = (text) => [...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*(['"])([^'"]+)\1/g)].map((m) => m[2]);
const sampleImports = importsOf(`import a from "../a.js";\n  export { b } from '../b.js';\nimport '../c.js';\nconst d = await import('../d.js');\nimport {\n  e,\n} from '../e.js';`);
say(['../a.js', '../b.js', '../c.js', '../d.js', '../e.js'].every((x) => sampleImports.includes(x)), `the import reader finds every import form (${sampleImports.join(', ')})`);
const serverForeign = importsOf(src).filter((p) => !p.startsWith('node:') && !/^\.\/youtube\/[a-z]+\.js$/.test(p));
const modFiles = readdirSync(modDir).filter((f) => f.endsWith('.js'));
const modForeign = modFiles.flatMap((f) => importsOf(readFileSync(join(modDir, f), 'utf8')).filter((p) => !p.startsWith('node:') && !/^\.\/[a-z]+\.js$/.test(p)).map((p) => `${f}: ${p}`));
say(serverForeign.length === 0 && modForeign.length === 0 && modFiles.length > 0, `the server imports nothing from the repo but its own folder, so the two lift out on their own (44i-2)${serverForeign.length || modForeign.length ? `: ${[...serverForeign, ...modForeign].join(', ')}` : ''}`);

console.log('\nThe scenario, against mcp/youtube-mcp.js:');
for (const l of await scenario(SERVER, BASE_PORT)) say(l.ok, `${l.name}${l.ok ? '' : `  [${l.detail}]`}`);

if (MUTANTS_ON) {
  console.log('\nThe mutants (each must fail its own line):');
  /* A few at a time, not all at once. With every scenario started together (46 of them by 44i-2b)
     the lines that wait on a fixed timeout (a server's exit, a drain) failed on copies that changed
     nothing, so those rules' mutants were "caught" by load, not by the rule (a review of the check,
     2026-11-28: 20 unchanged copies in parallel each failed some of loopback, setup, settingsKeys,
     progress, agentLinux). So at most POOL run together, and the first copy is the server
     unchanged, which must fail no line at all: any line it fails makes the verdicts void. */
  const POOL = Number(process.env.YOUTUBE_POOL ?? 8);
  const jobs = [{ rule: '(control)', control: true, find: '', replace: '', as: 'control' }, ...MUTANTS];
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(POOL, jobs.length) }, async () => {
    for (let i = next++; i < jobs.length; i = next++) {
      const m = jobs[i];
      const { file, why } = m.control ? mutant({ ...m, find: '', replace: '' }) : mutant(m);
      results[i] = { m, why, lines: file ? await scenario(file, BASE_PORT + 1 + i) : [] };
    }
  }));
  const control = results.shift();
  const controlFailed = control.lines.filter((l) => !l.ok);
  say(!control.why && control.lines.length > 0 && controlFailed.length === 0, `an unchanged copy, run beside the mutants, fails no line${controlFailed.length ? `: ${controlFailed.map((l) => l.name.slice(0, 60)).join(' | ')}` : ''}`);
  for (const { m, why, lines } of results) {
    if (why) { say(false, `mutant without ${m.rule}: ${why}`); continue; }
    const crashed = lines.find((l) => l.rule === 'crash' && !l.ok);
    const caught = lines.filter((l) => l.rule === m.rule && !l.ok);
    say(!crashed && caught.length > 0, `mutant without ${m.rule}: ${crashed ? `crashed (${crashed.detail.slice(0, 120)})` : caught.length ? `caught by "${caught[0].name}"` : 'NOTHING FAILED: the rule is unmeasured'}`);
  }
}

console.log(`\n${failures.length ? `${failures.length} FAILED` : 'All passed'}.`);
process.exit(failures.length ? 1 : 0);
