/**
 * The Phone · iPad panel's link (PLAN.md 8f-1): a code whenever nothing is
 * linked, and a way to bring it back while phones are.
 *
 * What the owner saw (2026-10-11, a screenshot of the hosted site): the panel
 * said "No phone linked" over three lines about the show server, and no code.
 * The code of 8f is drawn only when `relayInfo()` answers, which it does only
 * on a page the show server serves; the hosted site's panel had nothing to
 * draw. Asked for: a QR code there whenever nothing is linked, a way to bring
 * it back up when something is (to link a second device), and a code that
 * goes straight to the right page.
 *
 * Read in the code while diagnosing it: the desk did not know whether a phone
 * was linked at all. `status.phone` was `remoteLink.status === 'connected'`,
 * the display's own socket to the relay, so with the Mac app running the panel
 * said "A phone is linked and driving the show" and the footer "phone linked"
 * with no phone in the room. The relay tells the display how many network
 * displays are on (`mirrors`) and nothing about phones. So "when nothing is
 * linked" needs a count the relay sends, and this check asks for one.
 *
 * What is asked, on the real show server (`server/remote-server.js`, the one
 * `npm run remote` starts) with the desk in a browser, phones as sockets:
 *
 *   1. With no phone, the panel says "No phone linked." and draws the code of
 *      the relay's address: `http://<a LAN address>:<port>/?remote=1&key=<key>`,
 *      module for module the encoder's own for the address it shows.
 *   2. A phone's hello with the key is counted within 5 s: "1 phone linked.",
 *      the code, the address and Copy put away, and a Link another button in
 *      their place. The footer counts it too. A hello with the wrong key is
 *      refused by the relay and never counted.
 *   3. Link another brings the same code back; pressed again, it goes away.
 *   4. A second phone makes "2 phones linked."; the first leaving, "1 phone
 *      linked."; the last leaving brings the code back with no button pressed.
 *   5. A desk opened while a phone is already on counts it: the relay tells a
 *      display the count when the display says hello, not only on changes.
 *   6. On a static host (vite preview, which answers `/remote-info.json` with
 *      index.html as Firebase does) the panel still draws a code, of the page's
 *      own address with nothing after the slash: no key, no `?remote=1`. That
 *      page opens the show on the phone itself, which is the right page when
 *      there is no show server to drive; the panel's words still say how to
 *      get one.
 *
 * Why a count from the relay and not the display's socket: the display's
 * socket is open whenever the relay is, phones or not (the mistake above). Why
 * the relay's address and not the page's when there is a relay: a phone that
 * opens the laptop's page gets the remote (`?remote=1`) with the key, which is
 * the only page that drives this show. Why the page's own address and not
 * nothing when there is no relay: the hosted site is the show, and a phone
 * that opens it plays it; a panel with words and no code was the complaint.
 *
 * Why the code is compared module for module with `encodeQr(address)` rather
 * than decoded: `npm run qr` reads the encoder back to the text for every
 * length it can make, so the encoder is the reader's oracle here; what this
 * check asks is that the panel drew the code of the address it shows, and
 * that the address is the right one for the page it is on.
 *
 * Runs in a cloud session (no plate needed: the panel is DOM) and in Measure's
 * browser part after `remotemix`, which built `dist/`. `npm run phonelink`
 * builds first.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';
import { clickAt } from './layoutProbe.mjs';

const PORT = Number(process.env.PHONELINK_PORT ?? 4197);
const PREVIEW_PORT = PORT + 1;
const KEY = '7391';
/** How long the panel has to notice a phone: the relay's message, React, a paint. */
const NOTICE_MS = 5000;
const HEADED = process.argv.includes('--head');

let failed = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A child that prints `ready` on stdout, or dies. */
function startChild(args, env, ready, what) {
  const proc = spawn(process.execPath, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  return new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error(`${what} did not start`)), 30_000);
    let said = '';
    const seen = () => { if (said.includes(ready)) { clearTimeout(bail); resolve(proc); } };
    proc.stdout.on('data', d => { said += String(d); seen(); });
    proc.stderr.on('data', d => { said += String(d); seen(); });
    proc.on('exit', c => { clearTimeout(bail); reject(new Error(`${what} exited ${c}: ${said.slice(0, 300)}`)); });
  });
}
const startRelay = () => startChild(['server/remote-server.js'], { PORT: String(PORT), SHOW_KEY: KEY, OSC_PORT: '0' }, 'Show key', 'the show server');
const startPreview = () => startChild(['node_modules/vite/bin/vite.js', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {}, `${PREVIEW_PORT}`, 'vite preview');
const stop = (proc) => { if (!proc) return; try { process.kill(-proc.pid, 'SIGTERM'); } catch { try { proc.kill('SIGTERM'); } catch { /* gone */ } } };

/** A phone: a controller socket that has said hello. Resolves once the socket is open and the hello sent. */
function phone(key = KEY) {
  const ws = new WebSocket(`ws://localhost:${PORT}/remote-ws`);
  return new Promise((resolve, reject) => {
    ws.onopen = () => { ws.send(JSON.stringify({ type: 'hello', role: 'controller', key })); resolve(ws); };
    ws.onerror = () => reject(new Error('the phone could not reach the relay'));
  });
}
const hangUp = (ws) => new Promise((resolve) => { if (ws.readyState === WebSocket.CLOSED) return resolve(); ws.onclose = () => resolve(); ws.close(); });

const { encodeQr, qrPath } = await import('../src/lib/qr.ts');

let relay = null;
let preview = null;
const browser = await launchChromium(chromium, { headless: !HEADED });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const settle = (ms = 500) => page.waitForTimeout(ms);

  /** What the panel shows right now; `null` fields for what it does not. */
  const panel = () => page.evaluate(() => {
    const q = (id) => document.querySelector(`[data-testid="${id}"]`);
    const svg = q('phone-link-qr');
    return {
      there: !!q('phone-link'),
      status: q('phone-link-status')?.textContent?.trim() ?? null,
      words: q('phone-link')?.textContent ?? '',
      url: q('phone-link-url')?.textContent?.trim() ?? null,
      d: svg?.querySelector('path')?.getAttribute('d') ?? null,
      copy: !!q('phone-link-copy'),
      more: q('phone-link-more')?.textContent?.trim() ?? null,
      footer: q('status-running')?.textContent ?? '',
    };
  });
  /** Wait for the panel to say `status`, up to NOTICE_MS; the time it took, or -1. */
  const says = async (status) => {
    const t0 = Date.now();
    while (Date.now() - t0 < NOTICE_MS) {
      if ((await panel()).status === status) return Date.now() - t0;
      await settle(150);
    }
    return -1;
  };
  /** Open the desk at `base` and bring Load-in up, where the Phone · iPad panel lives. */
  const openDesk = async (base) => {
    await page.goto(`${base}/?debug&look=classic&dpr=0.35`, { waitUntil: 'networkidle' });
    for (let i = 0; i < 40 && (await page.getByTestId('mode-segmented-loadin').count()) === 0; i++) await settle(300);
    await clickAt(page, 'mode-segmented-loadin');
    // The panel asks the relay for its address when it mounts; give it the answer.
    for (let i = 0; i < 40; i++) {
      const p = await panel();
      if (p.there && p.status && !/looking/i.test(p.words)) return p;
      await settle(300);
    }
    return panel();
  };
  const codeOf = (text) => { const c = encodeQr(text); return c ? qrPath(c) : null; };

  // ── On the show server ──────────────────────────────────────────────
  relay = await startRelay();
  const info = await (await fetch(`http://localhost:${PORT}/remote-info.json`)).json();
  const hosts = Array.isArray(info.hosts) ? info.hosts : [];
  check('the show server names at least one LAN address (the machine this runs on has one)', hosts.length > 0, hosts.join(' ') || 'none');

  let p = await openDesk(`http://localhost:${PORT}`);
  const relayUrl = hosts[0] ? `http://${hosts[0]}:${PORT}/?remote=1&key=${KEY}` : null;
  /** The address is the relay's: one of its LAN addresses, its port, the remote flag and the key. */
  const isRelays = (url) => !!url && hosts.some(h => url === `http://${h}:${PORT}/?remote=1&key=${KEY}`);
  check('with no phone, the panel says "No phone linked." and shows the relay\'s address, with the key',
    p.status === 'No phone linked.' && isRelays(p.url),
    `status "${p.status}", address ${p.url ?? 'none'}${relayUrl && p.url !== relayUrl ? ` (expected ${relayUrl})` : ''}`);
  check('and draws that address as a QR code, module for module the encoder\'s own',
    !!p.d && !!p.url && p.d === codeOf(p.url), p.d ? `${p.d.length} chars of path` : 'no code drawn');
  const codeAtRest = p.d;
  check('with no phone there is no Link another button: the code is already up', p.more === null, p.more ?? 'none');

  // A stranger with the wrong key is refused by the relay, and must not count.
  const stranger = await phone('0000');
  await settle(1500);
  p = await panel();
  check('a hello with the wrong key is not counted as a phone', p.status === 'No phone linked.' && !!p.d, `status "${p.status}"`);
  await hangUp(stranger);

  const first = await phone();
  let took = await says('1 phone linked.');
  p = await panel();
  check(`a phone's hello is counted within ${NOTICE_MS / 1000} s: "1 phone linked."`, took >= 0, took >= 0 ? `${took} ms` : `still "${p.status}"`);
  check('with a phone linked, the code, the address and Copy are put away', p.d === null && p.url === null && !p.copy,
    `${p.d ? 'code' : 'no code'}, ${p.url ? 'address' : 'no address'}, ${p.copy ? 'Copy' : 'no Copy'}`);
  check('and a Link another button stands in their place', /link another/i.test(p.more ?? ''), p.more ?? 'no button');
  check('the footer counts the phone too', /1 phone linked/.test(p.footer), p.footer.trim().slice(0, 80));

  if (p.more) {
    await clickAt(page, 'phone-link-more');
    await settle(400);
    p = await panel();
    check('Link another brings the same code and address back', !!p.d && p.d === codeAtRest && isRelays(p.url) && p.copy,
      p.d ? (p.d === codeAtRest ? 'the same code' : 'a different code') : 'no code');
    check('and the button now offers to put it away', !!p.more && !/link another/i.test(p.more), p.more ?? 'no button');
    await clickAt(page, 'phone-link-more');
    await settle(400);
    p = await panel();
    check('pressed again, the code goes away', p.d === null && /link another/i.test(p.more ?? ''), p.d ? 'still up' : 'away');
  } else {
    total += 3; failed += 3;
    console.log(' FAIL Link another brings the code back — no button to press');
  }

  const second = await phone();
  took = await says('2 phones linked.');
  check('a second phone makes "2 phones linked."', took >= 0, took >= 0 ? `${took} ms` : `still "${(await panel()).status}"`);

  // A desk that opens while phones are on: the relay tells it the count on hello.
  p = await openDesk(`http://localhost:${PORT}`);
  if (p.status !== '2 phones linked.') await says('2 phones linked.');
  p = await panel();
  check('a desk opened while two phones are on counts them at once', p.status === '2 phones linked.' && p.d === null, `status "${p.status}"`);

  await hangUp(first);
  took = await says('1 phone linked.');
  check('the first phone leaving makes "1 phone linked."', took >= 0, took >= 0 ? `${took} ms` : `still "${(await panel()).status}"`);
  await hangUp(second);
  took = await says('No phone linked.');
  p = await panel();
  check('the last phone leaving brings the code back with no button pressed', took >= 0 && !!p.d && p.d === codeAtRest && p.more === null,
    took >= 0 ? `${took} ms, ${p.d ? (p.d === codeAtRest ? 'the same code' : 'a different code') : 'no code'}${p.more ? `, button "${p.more}"` : ''}` : `still "${p.status}"`);

  stop(relay); relay = null;

  // ── On a static host, as the hosted site is ─────────────────────────
  preview = await startPreview();
  const origin = `http://localhost:${PREVIEW_PORT}`;
  p = await openDesk(origin);
  check('with no show server behind the page, the panel still says "No phone linked."', p.status === 'No phone linked.', `status "${p.status}"`);
  check('and shows the page\'s own address, with no key and no remote flag after it', p.url === `${origin}/`, p.url ?? 'no address');
  check('drawn as a QR code, module for module the encoder\'s own', !!p.d && !!p.url && p.d === codeOf(p.url), p.d ? `${p.d.length} chars of path` : 'no code drawn');
  check('and its words still say how to get a show server', /show server/.test(p.words) && /npm run remote/.test(p.words), p.words.replace(/\s+/g, ' ').slice(0, 120));
  check('with no relay there is no Link another button', p.more === null, p.more ?? 'none');
} finally {
  stop(relay);
  stop(preview);
  await browser.close();
}

console.log(`\n${total - failed}/${total} ok`);
process.exit(failed ? 1 : 0);
