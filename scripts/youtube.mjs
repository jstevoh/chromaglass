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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { port } from './ports.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SERVER = resolve(import.meta.dirname, '../mcp/youtube-mcp.js');
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
      statistics: { viewCount: '0', likeCount: '0' }, contentDetails: { duration: 'PT1M' }, bytes: s.data,
    };
    if (!s.meta.status?.privacyStatus) v.status.privacyStatus = 'public';
    // What the owner might set in Studio afterwards, which a whole-part update must not reset.
    Object.assign(v.status, { embeddable: false, license: 'creativeCommon', containsSyntheticMedia: true, madeForKids: false });
    g.videos.set(id, v); s.video = v;
    return v;
  };
  const resource = ({ bytes, ...v }) => v;

  const srv = createServer(async (req, res) => {
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
      if (p === '/upload/youtube/v3/videos' && req.method === 'POST' && q.get('uploadType') === 'resumable') {
        const meta = JSON.parse((await body(req)).toString());
        const size = Number(req.headers['x-upload-content-length']);
        if (!size) return err(res, 400, 'missingContentLength', 'X-Upload-Content-Length');
        const n = g.sessions.push({ meta, size, data: Buffer.alloc(size), have: 0 }) - 1;
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
        const ids = q.get('playlistId') === 'UU1' ? [...g.videos.keys()].reverse() : g.playlistItems.filter((i) => i.playlistId === q.get('playlistId')).map((i) => i.videoId);
        return json(res, 200, { items: ids.map((videoId) => ({ contentDetails: { videoId } })) });
      }
      if (p === '/youtube/v3/playlistItems' && req.method === 'POST') {
        const b = JSON.parse((await body(req)).toString());
        g.playlistItems.push({ playlistId: b.snippet.playlistId, videoId: b.snippet.resourceId.videoId });
        return json(res, 200, { id: 'pli1', snippet: b.snippet });
      }
      if (p === '/youtube/v3/playlists') {
        if (req.method === 'POST') { const b = JSON.parse((await body(req)).toString()); return json(res, 200, { id: 'PL2', ...b }); }
        return json(res, 200, { items: [{ id: 'PL1', snippet: { title: 'Films' }, status: { privacyStatus: 'public' }, contentDetails: { itemCount: g.playlistItems.length } }] });
      }
      if (p === '/youtube/v3/videos' && req.method === 'GET') {
        const ids = (q.get('id') ?? '').split(',');
        return json(res, 200, { items: ids.map((i) => g.videos.get(i)).filter(Boolean).map(resource) });
      }
      if (p === '/youtube/v3/videos' && req.method === 'PUT') {
        const b = JSON.parse((await body(req)).toString());
        const v = g.videos.get(b.id);
        if (!v) return err(res, 404, 'videoNotFound', b.id);
        // A snippet replaces the whole snippet, and must carry its title and category.
        if (b.snippet && (!b.snippet.title || !b.snippet.categoryId)) return err(res, 400, b.snippet.title ? 'invalidCategoryId' : 'invalidTitle', 'The request metadata specifies an invalid video title or category.');
        if (b.snippet) v.snippet = { ...b.snippet, publishedAt: v.snippet.publishedAt };
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
  const out = { all: '', stderr: '', pending: new Map(), next: 1 };
  child.stderr.on('data', (d) => { out.stderr += d; out.all += d; });
  createInterface({ input: child.stdout }).on('line', (line) => {
    out.all += `${line}\n`;
    let m; try { m = JSON.parse(line); } catch { return; }
    out.pending.get(m.id)?.(m); out.pending.delete(m.id);
  });
  const exited = new Promise((r) => child.on('exit', (code) => r(code)));
  const rpc = (method, params, ms = 20_000) => new Promise((res) => {
    const id = out.next++;
    const t = setTimeout(() => { out.pending.delete(id); res({ timeout: true }); }, ms);
    out.pending.set(id, (m) => { clearTimeout(t); res(m); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const tool = async (name, a = {}, ms) => {
    const m = await rpc('tools/call', { name, arguments: a }, ms);
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
  const env = { CHROMAGLASS_YOUTUBE_DIR: conf, CHROMAGLASS_YOUTUBE_GOOGLE: `http://127.0.0.1:${gport}`, CHROMAGLASS_YOUTUBE_NO_BROWSER: '1', CHROMAGLASS_YOUTUBE_CHUNK: String(CHUNK), CHROMAGLASS_YOUTUBE_WAIT_MS: '800', CHROMAGLASS_YOUTUBE_BACKOFF_MS: '40' };
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
    line('protocol', `it speaks MCP: initialize with a guide, and its nine tools listed (${names.join(', ')})`, init.result?.serverInfo?.name === 'youtube' && /PRIVATE/.test(init.result?.instructions ?? '') && names.length === 9);
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

    const leaked = [...g.secrets].filter((x) => logs.some((o) => o.all.includes(x)));
    line('leak', `nothing secret is in a reply or the log (${g.secrets.size} keys, secrets and session addresses looked for)`, leaked.length === 0, `found ${leaked.map((x) => x.slice(0, 10)).join(', ')}`);
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
];

function mutant(m) {
  const dir = join(ROOT, 'scratch', 'youtube-mutants', m.rule);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const src = readFileSync(SERVER, 'utf8');
  if (!src.includes(m.find)) return { why: `its text is not in mcp/youtube-mcp.js: "${m.find}"` };
  const file = join(dir, 'youtube-mcp.js');
  writeFileSync(file, src.replace(m.find, m.replace));
  return { file };
}

// ── The run ────────────────────────────────────────────────────────────

const failures = [];
const say = (ok, l) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${l}`); if (!ok) failures.push(l); };

const src = readFileSync(SERVER, 'utf8');
say(!/^import .* from '\.\.?\//m.test(src), 'the server imports nothing from the repo (it can be lifted out on its own, 44i-2)');

console.log('\nThe scenario, against mcp/youtube-mcp.js:');
for (const l of await scenario(SERVER, BASE_PORT)) say(l.ok, `${l.name}${l.ok ? '' : `  [${l.detail}]`}`);

if (MUTANTS_ON) {
  console.log('\nThe mutants (each must fail its own line):');
  const results = await Promise.all(MUTANTS.map(async (m, i) => {
    const { file, why } = mutant(m);
    return { m, why, lines: file ? await scenario(file, BASE_PORT + 1 + i) : [] };
  }));
  for (const { m, why, lines } of results) {
    if (why) { say(false, `mutant without ${m.rule}: ${why}`); continue; }
    const crashed = lines.find((l) => l.rule === 'crash' && !l.ok);
    const caught = lines.filter((l) => l.rule === m.rule && !l.ok);
    say(!crashed && caught.length > 0, `mutant without ${m.rule}: ${crashed ? `crashed (${crashed.detail.slice(0, 120)})` : caught.length ? `caught by "${caught[0].name}"` : 'NOTHING FAILED: the rule is unmeasured'}`);
  }
}

console.log(`\n${failures.length ? `${failures.length} FAILED` : 'All passed'}.`);
process.exit(failures.length ? 1 : 0);
