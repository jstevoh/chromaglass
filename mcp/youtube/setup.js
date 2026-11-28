/**
 * `setup`: one command that says which part of the Google setup is done and
 * what to do about the first part that is not (PLAN 44i-2a).
 *
 * Why. Every user of this server brings their own Google Cloud project (one
 * shared project would share one 10,000-unit quota among everyone, and would
 * need Google's verification), so everyone walks the same ten minutes in the
 * Cloud console, and every step can be half done: the API never enabled, a
 * "Web application" client instead of a "Desktop app" one, the consent screen
 * left in Testing so the sign-in dies every seven days, a brand channel not
 * picked at sign-in. Each of those showed up for the owner as one opaque
 * failure at the first upload. This walks the chain in order, each step's
 * check the real call that would fail later (the client file read the way
 * login reads it, the refresh the way every call refreshes, `channels.list`
 * the way every tool starts), and prints the fix beside the first one that
 * fails, with the console page that fixes it. It costs 1 quota unit.
 *
 * It is handed the server's own functions rather than importing them, so the
 * checks here can never drift from what the server does.
 */
import { existsSync, statSync } from 'node:fs';

const CONSOLE = {
  project: 'https://console.cloud.google.com/projectcreate',
  api: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
  clients: 'https://console.cloud.google.com/auth/clients',
  audience: 'https://console.cloud.google.com/auth/audience',
};

/* What a Google error at the first API call means, in the order people hit them. */
function apiFix(e) {
  const r = `${e?.reason ?? ''} ${e?.message ?? ''}`;
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(r)) return `Turn on "YouTube Data API v3" for the project: ${CONSOLE.api} (Enable), wait a minute, run setup again.`;
  if (/youtubeSignupRequired|no YouTube channel/i.test(r)) return 'This Google account has no channel, or the wrong one was picked: run login again and pick the channel (brand channels are listed on the sign-in page).';
  if (/quotaExceeded/i.test(r)) return "The project's daily quota is spent; it resets at midnight Pacific. Everything else is set up.";
  return null;
}

/**
 * deps: { dir, secretFile, tokenFile, script, platform, settings, client, loadToken, accessToken, channel, agentFiles }
 * Returns { ok, lines } and never throws: a broken step is a line, not a stack.
 */
export async function runSetup(deps) {
  const lines = [];
  const pass = (what, detail = '') => { lines.push({ ok: true, what, detail }); return true; };
  const fail = (what, fix) => { lines.push({ ok: false, what, fix }); return false; };
  const run = `node ${deps.script}`;

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) fail('Node.js 18 or later', `This is Node ${process.versions.node}; install a current one from https://nodejs.org.`);
  else pass('Node.js 18 or later', process.versions.node);

  pass('Settings', `${deps.settings.timeZone}, new uploads in category ${deps.settings.categoryId}${existsSync(deps.settings.file) ? '' : ' (defaults; settings.json not made)'}`);

  if (!existsSync(deps.dir)) {
    fail('Key folder', `Make the folder ${deps.dir} and put the client file in it (next step).`);
  } else if (deps.platform !== 'win32' && (statSync(deps.dir).mode & 0o077) !== 0) {
    fail('Key folder', `${deps.dir} can be read by other users of this computer: chmod 700 "${deps.dir}".`);
  } else pass('Key folder', deps.dir);

  let clientOk = false;
  try { deps.client(); clientOk = pass('Google client file', deps.secretFile); } catch (e) {
    fail('Google client file', `${e.message}\n    1. A Google Cloud project: ${CONSOLE.project}\n    2. Turn on YouTube Data API v3: ${CONSOLE.api}\n    3. Consent screen, Audience External, then Publish app: ${CONSOLE.audience}\n    4. Clients, Create client, Desktop app, Download JSON: ${CONSOLE.clients}`);
  }

  let signedIn = false;
  if (clientOk) {
    const t = (() => { try { return deps.loadToken(); } catch { return null; } })();
    if (!t?.refresh_token) fail('Signed in', `Run: ${run} login`);
    else {
      try { await deps.accessToken(true); signedIn = pass('Signed in', 'the saved sign-in refreshes'); } catch (e) { fail('Signed in', e.message); }
    }
  }

  if (signedIn) {
    try {
      const c = await deps.channel();
      pass('YouTube channel', `${c.title} (${c.url})`);
    } catch (e) {
      fail('YouTube channel', apiFix(e) ?? e.message);
    }
  }

  const files = deps.agentFiles();
  if (files === null) lines.push({ ok: true, what: 'Hourly upload queue', detail: `no scheduler known on ${deps.platform}: run "${run} drain" hourly yourself if you queue uploads` });
  else if (files.length && files.every((f) => existsSync(f))) pass('Hourly upload queue', files.join(', '));
  else lines.push({ ok: true, what: 'Hourly upload queue', detail: `optional, not installed: "${run} install-agent" finishes queued uploads on their own` });

  return { ok: lines.every((l) => l.ok), lines };
}

export function formatSetup({ ok, lines }) {
  const out = lines.map((l) => (l.ok ? `  ok    ${l.what}${l.detail ? `: ${l.detail}` : ''}` : `  TODO  ${l.what}\n    ${l.fix}`));
  out.push(ok ? '\nAll set: add the server to your assistant (see the README) and ask it to list your videos.' : '\nFix the first TODO and run setup again.');
  return out.join('\n');
}
