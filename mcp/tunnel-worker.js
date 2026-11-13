/**
 * The owner's assistant over the internet (PLAN 44h): a Cloudflare Worker that
 * claude.ai on the web and the phone signs in to as a remote MCP connector, and
 * a Durable Object the Mac dials out to, so a tool call typed on a phone
 * reaches the show on the owner's Mac.
 *
 * Why it is built this way, and not the obvious ways:
 *
 * - **The Mac dials out; nothing on the Mac listens.** claude.ai reaches only an
 *   `https://` address on the public internet, and the show server listens on
 *   the venue's Wi-Fi at most (it hands its key only to the laptop itself,
 *   `isLaptop`). Opening a port on the Mac, or a general-purpose tunnel to it,
 *   would put the show server's every route on the internet. Instead the Mac
 *   holds one outbound WebSocket to this Worker (`mcp/tunnel.js`), and only MCP
 *   messages travel it: the Worker can ask the Mac exactly what a local
 *   assistant on the Mac could ask, and nothing else.
 *
 * - **The Worker is a pipe, not a second MCP server.** Each JSON-RPC request
 *   that arrives at `/mcp` is handed down the tunnel whole, and the Mac answers
 *   it with the same code that answers Claude Desktop over stdio
 *   (`onRequest` in `mcp/chromaglass-mcp.js`). So the tools, their schemas,
 *   their guide and every rule are the local ones, and the guard on the Mac
 *   (`server/assistant.js`: the owner's switch and its mode, the room's keys,
 *   the pace, the hand wins, Undo) still decides everything. A copy of the
 *   tools here would drift from the Mac's in a week, and a rule kept here could
 *   be talked round on the Mac's side; a rule kept on the Mac cannot be talked
 *   round from here.
 *
 * - **Only the owner's ChromaGlass account signs in.** claude.ai speaks OAuth
 *   2.1 to a remote server: it reads `/.well-known/oauth-protected-resource`
 *   from a 401, registers itself (`/register`, RFC 7591), sends the person to
 *   `/authorize` with a PKCE S256 challenge, and trades the code at `/token`
 *   (read 2026-11-12 in Claude's own connector pages: a 401 with
 *   `resource_metadata` starts sign-in, DCR is supported by default, PKCE S256
 *   on every request, refresh tokens rotated for a public client, form-encoded
 *   `/token`, `invalid_grant` for a dead refresh token, the callback
 *   `https://claude.ai/api/mcp/auth_callback`). The page at `/authorize` signs
 *   in with Firebase, the app's own accounts, and this Worker checks the ID
 *   token's signature the way the licence Worker does (`firebase-token.js`)
 *   and admits it only when its uid is `OWNER_UID`. Anyone else who adds this
 *   address to their claude.ai gets as far as that page and no further.
 *
 * - **Codes go only to Claude, and only for a sign-in made for them.**
 *   `/register` takes only Claude's hosted callbacks (claude.ai and
 *   claude.com), so a code is never redirected to a stranger's server. Claude
 *   Code's loopback callback is not taken: any program on the computer the
 *   owner approves from could listen there, and Claude Code on the Mac has the
 *   local server already. The page's approval takes the owner's ID token only
 *   from a sign-in made after that page was opened (its `auth_time`), so one of
 *   the owner's tokens copied from elsewhere (the licence Worker, a show
 *   server on a venue's Wi-Fi) cannot be posted here by a script to mint a
 *   code. A sign-in a stranger starts and sends the owner as a link would hand
 *   its code to the owner's own browser at claude.ai; that it is refused there
 *   (its `state` is not the owner's session's) is Claude's to hold, and an
 *   assumption here. ChatGPT and the Gemini app would each be one line of
 *   `REDIRECTS`, added only when the owner wants them.
 *
 * - **No secret is kept in a form it could leak from.** Access tokens, refresh
 *   tokens and codes are random 256-bit strings held here only as their
 *   SHA-256; the Mac's tunnel key lives only on the Mac (`~/.chromaglass/
 *   tunnel/key`, 600) and here only as `TUNNEL_KEY_SHA256`. A copy of this
 *   object's storage drives nothing. Refresh tokens rotate, and an old one
 *   presented again after a minute's grace ends that whole sign-in (OAuth 2.1
 *   on a stolen refresh token). Every token also carries the uid it was given
 *   to and is refused once `OWNER_UID` no longer names it, so changing or
 *   clearing `OWNER_UID` signs every client out; `/admin/revoke`, with the
 *   Mac's tunnel key, does the same from the Mac.
 *
 * - **One Durable Object holds it all.** The tunnel, the sign-ins and the
 *   tokens live in one object (`idFromName('owner')`), whose storage is
 *   strongly consistent, so a code is used once even when two requests race
 *   (Workers KV is eventually consistent and takes a write a second to a key).
 *   It hibernates between calls with the Mac's socket still open, and the
 *   Mac's keep-alive is answered by the runtime without waking it, so an idle
 *   show costs nothing; one person's use sits far inside the Workers free plan.
 *
 * Its check is `npm run relay` (scripts/relay.mjs): this Worker in Node,
 * the real show server, a stand-in display, and the real MCP server in its
 * tunnel mode, driven the way claude.ai drives a connector, every rule with a
 * mutant that must fail.
 *
 * Env: `OWNER_UID` (the owner's Firebase uid), `TUNNEL_KEY_SHA256` (the Mac
 * key's SHA-256, hex), `FIREBASE_API_KEY` and `FIREBASE_AUTH_DOMAIN` (the
 * site's own web config, for the sign-in page), `FIREBASE_PROJECT_ID`
 * (default `chromaglass`); `GOOGLE_JWKS` only in the check. The binding
 * `TUNNEL` is this file's `ShowTunnel` (wrangler.tunnel.toml).
 */
import { verifyFirebaseToken } from '../server/firebase-token.js';
import { ipKey } from '../server/turns.js';

/** Where a code may be sent: Claude's hosted apps (claude.com is the address Claude says it may move to). */
export const REDIRECTS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];
export const redirectAllowed = (u) => typeof u === 'string' && REDIRECTS.includes(u);

export const ACCESS_S = 3600;
export const REFRESH_S = 30 * 86400;
export const CODE_S = 120;
export const PENDING_S = 600;
/** A refresh token presented again inside this many seconds of its rotation is a retry, not a theft. */
export const ROTATE_GRACE_S = 60;
/** A registered client that never signed in is dropped after an hour. */
const CLIENT_IDLE_S = 3600;
const MAX_CLIENTS = 30;
const MAX_PENDING = 20;
/** Addresses counted in one window; past it a new address waits rather than everyone's count being forgotten. */
const MAX_ADDRESSES = 1000;
const MAX_FAMILIES = 10;
/** An approval takes a Firebase sign-in at most this old, and none from before its page was opened. */
export const FRESH_SIGN_IN_S = 300;
/** Registrations and sign-in pages from one address, per ten minutes: a stranger's flood cannot push the owner's sign-in out. */
export const PER_ADDRESS = 20;
const WINDOW_S = 600;
/** A tool call may take a while on the Mac (a stroke of gestures, a still, the display's own answer). */
export const MAC_WAIT_MS = 40_000;
const MAX_BODY = 1 << 20;
const MENU_MAX = 512 * 1024;
const SCOPE = 'show';
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/13.1.0';

export const OFFLINE = 'The show is not connected. The Mac links it while ChromaGlass is open and the assistant switch is on (node mcp/chromaglass-mcp.js tunnel). Ask the owner to open the app; nothing was done.';

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256Hex(s) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s))));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}
const s256 = async (verifier) => b64url(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const inScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const NO_STORE = { 'cache-control': 'no-store', pragma: 'no-cache' };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...NO_STORE, ...headers } });
const oauthError = (error, status = 400, description) => json(description ? { error, error_description: description } : { error }, status);
function withParams(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  return u.toString();
}
const bearer = (request) => /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? null;

async function readText(request, max) {
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > max) return null;
  const t = await request.text();
  return t.length > max ? null : t;
}
async function readJson(request, max) {
  const t = await readText(request, max);
  if (t === null) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/** A page of the sign-in: framed by nobody, cached by nobody. */
function page(body, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ChromaGlass</title>
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b10;color:#e8e8ee;font:16px/1.5 system-ui,sans-serif}main{max-width:26rem;padding:24px}h1{font-size:1.3rem;margin:0 0 .5rem}p{color:#b8b8c4}button{display:block;width:100%;min-height:44px;margin:.5rem 0;border-radius:12px;border:1px solid #ffffff26;background:#ffffff14;color:#fff;font:inherit;cursor:pointer}button.quiet{background:none;color:#b8b8c4}#say{min-height:1.5em;color:#ffd27a}b{color:#fff}</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE, 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'; base-uri 'none'; object-src 'none'", 'referrer-policy': 'no-referrer' } });
}

function consentPage({ p, host, config }) {
  const who = `<b>Claude</b> at <b>${esc(host)}</b>`;
  if (!config.apiKey || !config.authDomain) return page(`<h1>ChromaGlass</h1><p>This relay has no sign-in set up yet: its FIREBASE_API_KEY and FIREBASE_AUTH_DOMAIN are not set.</p>`, 503);
  return page(`<h1>Let Claude drive your show?</h1>
<p>${who} asks to play the ChromaGlass show on your Mac. Your Mac's assistant switch and its mode still decide what it may do, and you can switch it off there at any time.</p>
<p>Only the show's owner can allow this. Sign in with your ChromaGlass account:</p>
<button id="google" type="button">Continue with Google</button>
<button id="apple" type="button">Continue with Apple</button>
<button id="deny" type="button" class="quiet">Don't allow</button>
<p id="say" role="status"></p>
<script type="module">
import { initializeApp } from '${FIREBASE_SDK}/firebase-app.js';
import { getAuth, inMemoryPersistence, setPersistence, signInWithPopup, signOut, GoogleAuthProvider, OAuthProvider } from '${FIREBASE_SDK}/firebase-auth.js';
const P = ${inScript(p)};
const auth = getAuth(initializeApp(${inScript(config)}));
const say = (t) => { document.getElementById('say').textContent = t; };
async function allow(provider) {
  say('Signing in…');
  try {
    // Kept in this tab's memory only: nothing of the sign-in stays on this site.
    await setPersistence(auth, inMemoryPersistence);
    const { user } = await signInWithPopup(auth, provider);
    const idToken = await user.getIdToken();
    const r = await fetch('/authorize/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ p: P, idToken }) });
    const out = await r.json().catch(() => ({}));
    await signOut(auth).catch(() => {});
    if (r.ok && out.redirect) { say('Allowed. Back to Claude…'); location.replace(out.redirect); }
    else say(out.error || 'Not allowed.');
  } catch (e) { say(e && e.message ? e.message : String(e)); }
}
document.getElementById('google').onclick = () => allow(new GoogleAuthProvider());
document.getElementById('apple').onclick = () => allow(new OAuthProvider('apple.com'));
document.getElementById('deny').onclick = () => { location.replace('/authorize/deny?p=' + encodeURIComponent(P)); };
</script>`);
}

/** The Worker: everything is the one Durable Object's. */
export default {
  async fetch(request, env) {
    const stub = env.TUNNEL.get(env.TUNNEL.idFromName('owner'));
    return stub.fetch(request);
  },
};

/** Who is asking, for the per-address counts: Cloudflare's address for them, IPv6 cut to its /64 (server/turns.js). */
function addressOf(request) {
  return ipKey(request.headers.get('cf-connecting-ip') ?? '') || 'here';
}

export class ShowTunnel {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.store = ctx.storage;
    /** Calls sent down the tunnel, waiting for the Mac's answer: in memory, as the request that waits keeps this object awake. */
    this.waiting = new Map();
    this.sweptAt = 0;
    /** Per address, in memory: it forgets when the object sleeps, which costs a flood nothing it needs. */
    this.hits = new Map();
    // The Mac's keep-alive, answered by the runtime without waking the object.
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch { /* an older runtime: the object answers it */ }
  }

  /** Seconds. `env.CLOCK` exists only in the check (a Worker's env holds no functions). */
  now() { return Math.floor((typeof this.env.CLOCK === 'function' ? this.env.CLOCK() : Date.now()) / 1000); }
  owner() { return String(this.env.OWNER_UID ?? '').trim(); }
  /** The open one, and the newest: an old socket still closing is not the Mac. */
  mac() {
    const all = this.ctx.getWebSockets('mac');
    return all.filter((s) => s.readyState === undefined || s.readyState === 1).at(-1) ?? null;
  }

  /** False once an address has asked PER_ADDRESS times in the window. */
  allowed(request) {
    const who = addressOf(request);
    const now = this.now();
    const h = this.hits.get(who);
    if (!h || now - h.since > WINDOW_S) {
      // This cleared the whole map once it held 1000 addresses, which handed every address,
      // a flood's included, a fresh allowance (the security review of 2026-11-13). Now the
      // spent windows are dropped, and if a thousand live ones remain a new address waits.
      if (!h && this.hits.size >= MAX_ADDRESSES) {
        for (const [k, v] of this.hits) if (now - v.since > WINDOW_S) this.hits.delete(k);
        if (this.hits.size >= MAX_ADDRESSES) return false;
      }
      this.hits.set(who, { since: now, n: 1 });
      return true;
    }
    h.n += 1;
    return h.n <= PER_ADDRESS;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const origin = url.origin;
    const path = url.pathname;
    const m = request.method;
    try {
      if (path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp') {
        return json({ resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: [SCOPE], bearer_methods_supported: ['header'], resource_name: 'ChromaGlass show' });
      }
      if (path === '/.well-known/oauth-authorization-server' || path === '/.well-known/oauth-authorization-server/mcp') {
        return json({
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          registration_endpoint: `${origin}/register`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
          scopes_supported: [SCOPE],
          authorization_response_iss_parameter_supported: true,
        });
      }
      if ((path === '/register' || path === '/authorize') && !this.allowed(request)) return json({ error: 'slow_down' }, 429, { 'retry-after': String(WINDOW_S) });
      if (path === '/register' && m === 'POST') return await this.register(request);
      if (path === '/authorize' && m === 'GET') return await this.authorize(url, origin, addressOf(request));
      if (path === '/authorize/approve' && m === 'POST') return await this.approve(request, origin);
      if (path === '/authorize/deny' && m === 'GET') return await this.deny(url, origin);
      if (path === '/token' && m === 'POST') return await this.token(request, origin);
      if (path === '/mcp') return await this.mcp(request, origin);
      if (path === '/tunnel') return await this.tunnel(request);
      if (path === '/admin/status' || path === '/admin/revoke') return await this.admin(request, path);
      return new Response('Not found', { status: 404, headers: NO_STORE });
    } catch {
      // Never the error's text: it could carry a request's body.
      return json({ error: 'server_error' }, 500);
    }
  }

  // ── Storage ──────────────────────────────────────────────────────────

  async client(id) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
    return (await this.store.get(`client:${id}`)) ?? null;
  }

  /** Expired sign-ins, codes and tokens out, at most every ten minutes. */
  async sweep(force = false) {
    const now = this.now();
    if (!force && now - this.sweptAt < 600) return;
    this.sweptAt = now;
    const live = new Set();
    for (const prefix of ['pend:', 'code:', 'at:', 'rt:', 'used:', 'client:']) {
      const all = await this.store.list({ prefix });
      for (const [k, v] of all) {
        // A client goes once it has no sign-in under way and no token left: idle an hour if it never signed in, at once if its tokens are gone.
        const dead = prefix === 'client:' ? !live.has(k.slice(7)) && (v.used || v.created + CLIENT_IDLE_S < now) : v.exp < now;
        if (dead) await this.store.delete(k);
        else if (prefix !== 'client:') live.add(v.clientId);
      }
    }
  }

  async revokeFamily(family) {
    for (const prefix of ['at:', 'rt:', 'used:']) {
      const all = await this.store.list({ prefix });
      for (const [k, v] of all) if (v.family === family) await this.store.delete(k);
    }
  }

  /** A new pair in a sign-in; `this.lastIssued` names its hashes, for the rotation's record. */
  async issue(clientId, uid, family) {
    const now = this.now();
    const at = random(32), rt = random(32);
    const atHash = await sha256Hex(at), rtHash = await sha256Hex(rt);
    this.lastIssued = { atHash, rtHash };
    await this.store.put(`at:${atHash}`, { clientId, uid, family, exp: now + ACCESS_S });
    await this.store.put(`rt:${rtHash}`, { clientId, uid, family, exp: now + REFRESH_S, born: now });
    // A handful of sign-ins at most: the oldest goes when an eleventh arrives.
    const families = new Map();
    for (const [, v] of await this.store.list({ prefix: 'rt:' })) families.set(v.family, Math.max(families.get(v.family) ?? 0, v.born ?? 0));
    if (families.size > MAX_FAMILIES) {
      const oldest = [...families].sort((a, b) => a[1] - b[1])[0][0];
      if (oldest !== family) await this.revokeFamily(oldest);
    }
    return { access_token: at, token_type: 'Bearer', expires_in: ACCESS_S, refresh_token: rt, scope: SCOPE };
  }

  // ── OAuth ────────────────────────────────────────────────────────────

  async register(request) {
    const body = await readJson(request, 64 * 1024);
    if (!body || typeof body !== 'object') return oauthError('invalid_client_metadata', 400, 'A JSON body is needed.');
    const uris = body.redirect_uris;
    if (!Array.isArray(uris) || !uris.length || uris.length > 5 || !uris.every(redirectAllowed)) {
      return oauthError('invalid_redirect_uri', 400, 'Only Claude\'s own callback addresses are taken here.');
    }
    await this.sweep();
    let clients = [...(await this.store.list({ prefix: 'client:' }))];
    if (clients.length >= MAX_CLIENTS) { await this.sweep(true); clients = [...(await this.store.list({ prefix: 'client:' }))]; }
    if (clients.length >= MAX_CLIENTS) {
      // Only a client that never signed in, has no sign-in page open and is older than one, is dropped for a new one,
      // so a flood of registrations cannot push out the owner's client mid-sign-in.
      const busy = new Set([...(await this.store.list({ prefix: 'pend:' }))].map(([, v]) => v.clientId));
      const now = this.now();
      const idle = clients.filter(([k, v]) => !v.used && !busy.has(k.slice(7)) && v.created + PENDING_S < now).sort((a, b) => a[1].created - b[1].created)[0];
      if (!idle) return oauthError('temporarily_unavailable', 503, 'Too many clients are signing in. Try again in a few minutes.');
      await this.store.delete(idle[0]);
    }
    const id = random(18);
    const name = typeof body.client_name === 'string' ? body.client_name.slice(0, 80) : '';
    const now = this.now();
    await this.store.put(`client:${id}`, { uris: [...uris], name, created: now, used: false });
    return json({ client_id: id, client_id_issued_at: now, client_name: name || undefined, redirect_uris: uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: SCOPE }, 201);
  }

  async authorize(url, origin, who = 'here') {
    const q = url.searchParams;
    const client = await this.client(q.get('client_id'));
    const redirect = q.get('redirect_uri');
    // A client or an address the relay does not know is never redirected to: the person is told here.
    if (!client || !redirect || !client.uris.includes(redirect) || !redirectAllowed(redirect)) {
      return page('<h1>ChromaGlass</h1><p>This sign-in did not come from a client this relay knows. Start again from Claude.</p>', 400);
    }
    const state = q.get('state') ?? undefined;
    const back = (error, description) => Response.redirect(withParams(redirect, { error, error_description: description, state, iss: origin }), 302);
    if (q.get('response_type') !== 'code') return back('unsupported_response_type');
    const challenge = q.get('code_challenge') ?? '';
    if (q.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return back('invalid_request', 'PKCE with S256 is required.');
    const resource = q.get('resource');
    if (resource && resource !== `${origin}/mcp`) return back('invalid_target');
    await this.sweep();
    // Room for this page. Full, this used to delete the oldest page of all, so two addresses
    // opening pages could push out the owner's own while they were signing in (the security
    // review of 2026-11-13). Now a full relay gives up the oldest page of whichever address
    // holds the most, so a flood only ever pushes out its own pages, and when no address holds
    // more than one it says so and keeps every page, the owner's among them.
    const pending = [...(await this.store.list({ prefix: 'pend:' }))].sort((a, b) => a[1].exp - b[1].exp);
    if (pending.length >= MAX_PENDING) {
      const count = new Map();
      for (const [, v] of pending) count.set(v.who, (count.get(v.who) ?? 0) + 1);
      const most = Math.max(...count.values());
      if (most <= 1) return page('<h1>ChromaGlass</h1><p>Too many sign-ins are open on this relay just now. Try again in a few minutes.</p>', 503);
      await this.store.delete(pending.find(([, v]) => count.get(v.who) === most)[0]);
    }
    const p = random(24);
    await this.store.put(`pend:${p}`, { clientId: q.get('client_id'), redirect, challenge, state: state ?? null, who, opened: this.now(), exp: this.now() + PENDING_S });
    const host = new URL(redirect).host;
    return consentPage({
      p,
      host,
      config: { apiKey: this.env.FIREBASE_API_KEY ?? '', authDomain: this.env.FIREBASE_AUTH_DOMAIN ?? '', projectId: this.env.FIREBASE_PROJECT_ID || 'chromaglass' },
    });
  }

  async approve(request, origin) {
    // The sign-in page's own fetch, and nothing another site's page posts.
    if (request.headers.get('origin') !== origin) return json({ error: 'This page takes only its own sign-ins.' }, 403);
    const body = await readJson(request, 16 * 1024);
    const p = typeof body?.p === 'string' ? body.p : '';
    const pend = p && (await this.store.get(`pend:${p}`));
    if (!pend || pend.exp < this.now()) return json({ error: 'This sign-in has expired. Start again from Claude.' }, 400);
    const who = await verifyFirebaseToken(body.idToken, { FIREBASE_PROJECT_ID: this.env.FIREBASE_PROJECT_ID, GOOGLE_JWKS: this.env.GOOGLE_JWKS }, this.now() * 1000);
    if (!who) return json({ error: 'The sign-in could not be checked. Try again.' }, 401);
    // A sign-in made on this page, now: not one of the owner's tokens from somewhere else, which a script could post here.
    const signedIn = who.authTime ?? 0;
    if (signedIn < pend.opened - 5 || this.now() - signedIn > FRESH_SIGN_IN_S) return json({ error: 'Sign in again on this page.' }, 401);
    const owner = this.owner();
    if (!owner) return json({ error: `No owner is set on this relay yet. The account you signed in with is ${who.uid}.` }, 403);
    if (who.uid !== owner) return json({ error: 'That account is not this show\'s owner.' }, 403);
    await this.store.delete(`pend:${p}`);
    const code = random(32);
    await this.store.put(`code:${await sha256Hex(code)}`, { clientId: pend.clientId, redirect: pend.redirect, challenge: pend.challenge, uid: who.uid, exp: this.now() + CODE_S });
    return json({ redirect: withParams(pend.redirect, { code, state: pend.state, iss: origin }) });
  }

  async deny(url, origin) {
    const p = url.searchParams.get('p') ?? '';
    const pend = p && (await this.store.get(`pend:${p}`));
    if (!pend) return page('<h1>ChromaGlass</h1><p>Not allowed. You can close this tab.</p>');
    await this.store.delete(`pend:${p}`);
    return Response.redirect(withParams(pend.redirect, { error: 'access_denied', state: pend.state, iss: origin }), 302);
  }

  async token(request, origin) {
    const type = request.headers.get('content-type') ?? '';
    let f;
    if (type.includes('application/x-www-form-urlencoded')) {
      const t = await readText(request, 16 * 1024);
      if (t === null) return oauthError('invalid_request');
      f = new URLSearchParams(t);
    } else if (type.includes('application/json')) {
      const j = await readJson(request, 16 * 1024);
      if (!j || typeof j !== 'object') return oauthError('invalid_request');
      f = new URLSearchParams(Object.entries(j).map(([k, v]) => [k, String(v)]));
    } else return oauthError('invalid_request', 400, 'Send the form encoded.');
    const clientId = f.get('client_id');
    const client = await this.client(clientId);
    if (!client) return oauthError('invalid_client', 401);
    const resource = f.get('resource');
    if (resource && resource !== `${origin}/mcp`) return oauthError('invalid_target');
    const now = this.now();
    const owner = this.owner();
    const grant = f.get('grant_type');

    if (grant === 'authorization_code') {
      const key = `code:${await sha256Hex(f.get('code') ?? '')}`;
      const rec = await this.store.get(key);
      if (!rec) return oauthError('invalid_grant');
      // Used once, even when what follows refuses it.
      await this.store.delete(key);
      if (rec.exp < now || rec.clientId !== clientId || rec.redirect !== f.get('redirect_uri')) return oauthError('invalid_grant');
      const verifier = f.get('code_verifier') ?? '';
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || (await s256(verifier)) !== rec.challenge) return oauthError('invalid_grant', 400, 'The PKCE verifier does not match.');
      if (!owner || rec.uid !== owner) return oauthError('invalid_grant');
      await this.store.put(`client:${clientId}`, { ...client, used: true });
      await this.sweep();
      return json(await this.issue(clientId, rec.uid, random(12)));
    }

    if (grant === 'refresh_token') {
      const h = await sha256Hex(f.get('refresh_token') ?? '');
      const rec = await this.store.get(`rt:${h}`);
      if (!rec) {
        const used = await this.store.get(`used:${h}`);
        if (used && used.clientId === clientId && owner && used.uid === owner && now - used.rotated <= ROTATE_GRACE_S) {
          // The answer to the first refresh was lost on its way: the pair it carried is withdrawn and another
          // given, so a rotation has one live pair however often its old token comes back inside the grace.
          if (used.child) { await this.store.delete(`at:${used.child.atHash}`); await this.store.delete(`rt:${used.child.rtHash}`); }
          const body = await this.issue(clientId, used.uid, used.family);
          await this.store.put(`used:${h}`, { ...used, child: this.lastIssued });
          return json(body);
        }
        // An old refresh token again, after the grace: someone else has a copy. That whole sign-in ends.
        if (used) await this.revokeFamily(used.family);
        return oauthError('invalid_grant');
      }
      if (rec.clientId !== clientId || rec.exp < now || !owner || rec.uid !== owner) {
        await this.store.delete(`rt:${h}`);
        return oauthError('invalid_grant');
      }
      await this.store.delete(`rt:${h}`);
      const body = await this.issue(clientId, rec.uid, rec.family);
      await this.store.put(`used:${h}`, { family: rec.family, clientId, uid: rec.uid, rotated: now, exp: rec.exp, child: this.lastIssued });
      return json(body);
    }
    return oauthError('unsupported_grant_type');
  }

  // ── MCP over Streamable HTTP ────────────────────────────────────────

  async mcp(request, origin) {
    const token = bearer(request);
    const rec = token && (await this.store.get(`at:${await sha256Hex(token)}`));
    const owner = this.owner();
    if (!rec || rec.exp < this.now() || !owner || rec.uid !== owner) {
      const challenge = `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${SCOPE}"${token ? ', error="invalid_token"' : ''}`;
      return json({ error: token ? 'invalid_token' : 'unauthorized' }, 401, { 'www-authenticate': challenge });
    }
    // Claude calls from its servers, with no Origin; a browser page elsewhere is refused.
    const from = request.headers.get('origin');
    if (from && from !== origin && !REDIRECTS.some((r) => new URL(r).origin === from)) return json({ error: 'origin not allowed' }, 403);
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST', ...NO_STORE } });
    const body = await readJson(request, MAX_BODY);
    if (!body || typeof body !== 'object') return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
    const batch = Array.isArray(body);
    const replies = (await Promise.all((batch ? body : [body]).map((m) => this.one(m)))).filter(Boolean);
    if (!replies.length) return new Response(null, { status: 202, headers: NO_STORE });
    return json(batch ? replies : replies[0]);
  }

  /** One JSON-RPC message: a request goes down the tunnel; a notification or a client's response needs no answer. */
  async one(m) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } };
    if (m.id === undefined || m.id === null || typeof m.method !== 'string') return null;
    const id = m.id;
    const reply = await this.forward({ jsonrpc: '2.0', id, method: m.method, ...(m.params !== undefined ? { params: m.params } : {}) });
    if (reply && typeof reply === 'object' && (reply.result !== undefined || reply.error !== undefined)) {
      if (m.method === 'tools/list' && reply.result) await this.remember('menu:tools', reply.result);
      return { jsonrpc: '2.0', id, ...(reply.error !== undefined ? { error: reply.error } : { result: reply.result }) };
    }
    if (reply === null) {
      return m.method === 'tools/call'
        ? { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'The show did not answer in time. It may still have done it: read show_state.' }], isError: true } }
        : { jsonrpc: '2.0', id, error: { code: -32001, message: 'The show did not answer in time.' } };
    }
    return { jsonrpc: '2.0', id, ...(await this.offline(m)) };
  }

  /**
   * With the Mac away, claude.ai still gets a server it can list: the menu the
   * Mac last sent, so a connector added from the phone with the Mac asleep
   * shows its tools, and a call says plainly that nothing was done.
   */
  async offline(m) {
    if (m.method === 'initialize') {
      const init = (await this.store.get('menu:initialize')) ?? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'chromaglass', version: '0.1.0' }, instructions: OFFLINE };
      return { result: init };
    }
    if (m.method === 'tools/list') return { result: (await this.store.get('menu:tools')) ?? { tools: [] } };
    if (m.method === 'ping') return { result: {} };
    if (m.method === 'tools/call') return { result: { content: [{ type: 'text', text: OFFLINE }], isError: true } };
    return { error: { code: -32000, message: OFFLINE } };
  }

  async remember(key, value) {
    if (JSON.stringify(value).length <= MENU_MAX) await this.store.put(key, value);
  }

  /** Down the tunnel and back: the Mac's answer, null when it took too long, undefined when no Mac is there. */
  forward(m) {
    const mac = this.mac();
    if (!mac) return Promise.resolve(undefined);
    // A random tag, not a counter: a counter starts again when the object wakes, and a late answer could then meet a new call.
    const n = random(12);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.waiting.delete(n); resolve(null); }, MAC_WAIT_MS);
      this.waiting.set(n, { resolve, timer, ws: mac });
      try { mac.send(JSON.stringify({ t: 'rpc', n, m })); } catch { clearTimeout(timer); this.waiting.delete(n); resolve(undefined); }
    });
  }

  // ── The Mac's end ────────────────────────────────────────────────────

  async tunnel(request) {
    if ((request.headers.get('upgrade') ?? '').toLowerCase() !== 'websocket') return new Response('A WebSocket only', { status: 426, headers: NO_STORE });
    const ok = await this.macKey(request);
    if (ok !== true) return ok;
    // One Mac holds the tunnel: a new one (the same Mac, reconnecting) takes it.
    for (const old of this.ctx.getWebSockets('mac')) { try { old.close(4000, 'another connection took the tunnel'); } catch { /* gone */ } }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, ['mac']);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** The Mac's key, checked against its SHA-256: true, or the refusal. */
  async macKey(request) {
    const want = String(this.env.TUNNEL_KEY_SHA256 ?? '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(want)) return json({ error: 'No tunnel key is set on this relay.' }, 503);
    const key = bearer(request);
    if (!key || (await sha256Hex(key)) !== want) return json({ error: 'unauthorized' }, 401);
    return true;
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string') return;
    if (data === 'ping') { ws.send('pong'); return; }
    let f;
    try { f = JSON.parse(data); } catch { return; }
    if (f?.t === 'rpc' && typeof f.n === 'string') {
      const w = this.waiting.get(f.n);
      if (!w) return;
      this.waiting.delete(f.n);
      clearTimeout(w.timer);
      w.resolve(f.m && typeof f.m === 'object' ? f.m : null);
      return;
    }
    // The Mac's menu, sent as it links: what claude.ai lists while the Mac is away.
    if (f?.t === 'menu') {
      if (f.initialize && typeof f.initialize === 'object') await this.remember('menu:initialize', f.initialize);
      if (f.tools && Array.isArray(f.tools.tools)) await this.remember('menu:tools', f.tools);
    }
  }

  webSocketClose(ws, code) {
    // The calls sent down this socket are answered as offline at once, not after MAC_WAIT_MS; those on a
    // newer one (the Mac reconnected and the old socket closed after) wait for theirs. With no Mac left, all go.
    const none = !this.mac() || this.mac() === ws;
    for (const [n, w] of this.waiting) if (none || w.ws === ws) { clearTimeout(w.timer); this.waiting.delete(n); w.resolve(undefined); }
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'closed'); } catch { /* already */ }
  }

  webSocketError(ws) { this.webSocketClose(ws, 1011); }

  async admin(request, path) {
    const ok = await this.macKey(request);
    if (ok !== true) return ok;
    if (path === '/admin/status' && request.method === 'GET') {
      await this.sweep(true);
      const families = new Set([...(await this.store.list({ prefix: 'rt:' }))].map(([, v]) => v.family));
      return json({ mac: !!this.mac(), owner: !!this.owner(), signIns: families.size, clients: (await this.store.list({ prefix: 'client:' })).size });
    }
    if (path === '/admin/revoke' && request.method === 'POST') {
      let n = 0;
      for (const prefix of ['client:', 'pend:', 'code:', 'at:', 'rt:', 'used:']) {
        for (const [k] of await this.store.list({ prefix })) { await this.store.delete(k); n++; }
      }
      return json({ revoked: n });
    }
    return new Response(null, { status: 405, headers: NO_STORE });
  }
}
