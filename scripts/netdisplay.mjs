/**
 * A network display over https (PLAN 14m-https).
 *
 * What was found (2026-10-24): a network display could not start. Browsers
 * give WebGPU only to a secure page (https, or the machine's own localhost),
 * and the address the show server printed for a projector's browser or a
 * second computer was `http://<laptop-ip>:3000/?cast=true&key=…`, so the page
 * stopped at its first shader module with "GPUTextureUsage is not defined".
 * The fix serves the same files and the same relay over https on HTTPS_PORT
 * (PORT + 443 by default), with a self-signed certificate the server makes on
 * its first launch; each display's browser warns once, and once the warning
 * is accepted the page is a secure context with the GPU.
 *
 * What is asked, on the real show server with a network display in Chromium
 * (`ignoreHTTPSErrors` is the warning accepted, as a person does once):
 *
 *   1. The server answers https on PORT + 443 and tells the laptop that port
 *      in `/remote-info.json`; the http port still answers as before.
 *   2. Its certificate names localhost and every LAN address the server prints.
 *   3. The network display at the https address it prints is a secure context
 *      with WebGPU, does not stop on the start-up failure screen, and joins
 *      the relay: the laptop's display socket is told one network display is
 *      on. The same page at the http address is not a secure context (the
 *      control: what made the difference is the https).
 *   4. A socket to any other path is still refused, as it was before the relay
 *      served two ports.
 *   5. With the https port already taken, the server still starts, http only,
 *      says why, and tells the laptop there is no https port.
 *
 * Why the display's joining is read at the laptop's end, not the page's: the
 * receiver opens its socket to the relay only once it has mounted, so a page
 * that stopped on the failure screen never joins, and the count comes from the
 * relay itself. Why not "it drew a plate": a cloud session and the Measure
 * runner have no GPU adapter behind WebGPU; how the wall looks is the Mac's.
 *
 * Runs in a cloud session and in Measure's browser part, on the built `dist/`.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { request } from 'node:https';
import { createServer } from 'node:net';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const PORT = Number(process.env.NETDISPLAY_PORT ?? 4297);
const HTTPS_PORT = PORT + 443;
const KEY = '24681357';
const TLS_DIR = mkdtempSync(join(tmpdir(), 'cg-tls-'));

let failed = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** The show server; resolves with it and everything it printed once it prints the show key. */
function startRelay(env = {}) {
  const proc = spawn(process.execPath, ['server/remote-server.js'], {
    env: { ...process.env, PORT: String(PORT), SHOW_KEY: KEY, OSC_PORT: '0', TLS_DIR, ...env },
    stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  let said = '';
  return new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error(`the show server did not start: ${said.slice(0, 300)}`)), 30_000);
    const seen = () => { if (said.includes('Same Wi-Fi')) { clearTimeout(bail); resolve({ proc, said: () => said }); } };
    proc.stdout.on('data', d => { said += String(d); seen(); });
    proc.stderr.on('data', d => { said += String(d); seen(); });
    proc.on('exit', c => { clearTimeout(bail); reject(new Error(`the show server exited ${c}: ${said.slice(0, 300)}`)); });
  });
}
/** Stop the server and wait until it has let go of its ports. */
const stop = (r) => new Promise((resolve) => {
  if (!r || r.proc.exitCode !== null) { resolve(); return; }
  r.proc.once('exit', () => resolve());
  try { process.kill(-r.proc.pid, 'SIGTERM'); } catch { resolve(); }
});

/** GET over https, taking the self-signed certificate; the body and the peer's certificate. */
const getTls = (path) => new Promise((resolve, reject) => {
  const req = request({ host: 'localhost', port: HTTPS_PORT, path, rejectUnauthorized: false }, (res) => {
    let body = '';
    res.on('data', d => { body += d; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.on('error', reject);
  req.end();
});

/** The laptop's own display socket: collects every `mirrors` count the relay tells it. */
function display(displayKey) {
  const ws = new WebSocket(`ws://localhost:${PORT}/remote-ws`);
  const counts = [];
  ws.onmessage = (e) => { try { const m = JSON.parse(String(e.data)); if (m.type === 'mirrors') counts.push(m.count); } catch { /* not ours */ } };
  return new Promise((resolve, reject) => {
    ws.onopen = () => { ws.send(JSON.stringify({ type: 'hello', role: 'display', key: displayKey })); resolve({ ws, counts }); };
    ws.onerror = () => reject(new Error('the display could not reach the relay'));
  });
}

let relay = null;
let squatter = null;
const browser = await launchChromium(chromium, { headless: true, args: ['--no-proxy-server'] });
try {
  relay = await startRelay();
  const info = await (await fetch(`http://localhost:${PORT}/remote-info.json`)).json();
  const hosts = Array.isArray(info.hosts) ? info.hosts : [];
  let tls = null;
  try { tls = await getTls('/remote-info.json'); } catch (e) { tls = { status: 0, body: String(e?.message ?? e) }; }
  check(`the show server answers https on port ${HTTPS_PORT} and tells the laptop so`,
    tls.status === 200 && info.httpsPort === HTTPS_PORT, `https ${tls.status || tls.body}, httpsPort ${info.httpsPort}`);
  check('the http port still answers, with the keys for the laptop', !!info.key && !!info.displayKey, `key ${info.key ? 'given' : 'none'}`);
  const printed = relay.said();
  check('it prints the https address for a network display, and says the browser warns once',
    hosts.length > 0 && hosts.every(h => printed.includes(`https://${h}:${HTTPS_PORT}/?cast=true&key=${KEY}`)) && /warns once/.test(printed),
    hosts.length ? hosts.join(' ') : 'no LAN address');

  let names = '';
  try { names = new X509Certificate(readFileSync(join(TLS_DIR, 'cert.pem'))).subjectAltName ?? ''; } catch (e) { names = `unreadable: ${e?.message ?? e}`; }
  check('its certificate names localhost and every LAN address it prints',
    names.includes('DNS:localhost') && hosts.every(h => names.includes(`IP Address:${h}`)), names.slice(0, 160));

  const lan = hosts[0];
  if (lan) {
    const laptop = await display(info.displayKey);
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 960, height: 540 } });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    // A server with no https refuses the connection: that is a red line, not a crash of the check.
    const opened = await page.goto(`https://${lan}:${HTTPS_PORT}/?cast=true&key=${KEY}`, { waitUntil: 'load' }).then(() => '', (e) => String(e?.message ?? e).split('\n')[0]);
    let joined = -1;
    for (let i = 0; i < 100 && joined < 0 && !opened; i++) { if (laptop.counts.includes(1)) joined = i * 300; else await page.waitForTimeout(300); }
    const seen = opened
      ? { secure: false, gpu: false, words: `not opened: ${opened}` }
      : await page.evaluate(() => ({ secure: window.isSecureContext, gpu: !!navigator.gpu, words: document.body?.innerText ?? '' }));
    check('the network display at that https address is a secure page with WebGPU',
      seen.secure && seen.gpu, `secure ${seen.secure}, WebGPU ${seen.gpu}`);
    check('and does not stop on the start-up failure screen', !opened && !/could not start/.test(seen.words), seen.words.replace(/\s+/g, ' ').slice(0, 120) || 'a plate, no words');
    check('and joins the relay: the laptop is told one network display is on', joined >= 0,
      joined >= 0 ? `within ${(joined / 1000).toFixed(1)} s` : `counts heard: ${laptop.counts.join(' ') || 'none'}`);
    await page.goto(`http://${lan}:${PORT}/?cast=true&key=${KEY}`, { waitUntil: 'load' });
    const plain = await page.evaluate(() => window.isSecureContext);
    check('the control: the same page at the http address is not a secure page', plain === false, `secure ${plain}`);
    await context.close();
    laptop.ws.close();
  } else {
    total += 4; failed += 4;
    console.log(' FAIL the network display lines — the show server named no LAN address');
  }

  const stray = new WebSocket(`ws://localhost:${PORT}/not-the-relay`);
  const strayEnd = await new Promise((resolve) => { stray.onopen = () => resolve('opened'); stray.onerror = () => resolve('refused'); setTimeout(() => resolve('no answer'), 5000); });
  check('a socket to any other path is still refused', strayEnd === 'refused', strayEnd);
  await stop(relay); relay = null;

  // The https port taken: the show must still start, http only, and say why.
  squatter = createServer();
  await new Promise((resolve) => squatter.listen(HTTPS_PORT, '0.0.0.0', resolve));
  relay = await startRelay();
  const info2 = await (await fetch(`http://localhost:${PORT}/remote-info.json`)).json().catch(() => null);
  check('with the https port taken, the server still starts on http and tells the laptop there is no https',
    !!info2 && info2.httpsPort === null, info2 ? `httpsPort ${info2.httpsPort}` : 'http did not answer');
  check('and says why network displays have no https', /Network displays need https, which is off: port \d+ is in use/.test(relay.said()),
    (relay.said().match(/Network displays need https[^\n]*/) ?? ['nothing said'])[0]);
} finally {
  await stop(relay);
  squatter?.close();
  await browser.close();
  rmSync(TLS_DIR, { recursive: true, force: true });
}

console.log(`\n${total - failed}/${total} ok`);
process.exit(failed ? 1 : 0);
