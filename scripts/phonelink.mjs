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
 *      own show address (`/show`, PLAN.md 23.16b: the site's `/` is the
 *      webpage) with nothing after it: no key, no `?remote=1`. That
 *      page opens the show on the phone itself, which is the right page when
 *      there is no show server to drive; the panel's words say so, and how to
 *      get a show server.
 *   7. A press of Link another is forgotten when the count reaches 0: a phone
 *      joining later finds the code put away again. And a socket that never
 *      says hello is never a phone.
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
import zlib from 'node:zlib';
import { launchChromium, port } from './chromium.mjs';
import { clickAt } from './layoutProbe.mjs';
import { SHOW_PATH } from '../src/lib/showPath.ts';

const PORT = port(4197, 'PHONELINK_PORT');
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

/**
 * A PNG of `w`×`h` with a fully clear border `border` pixels wide around opaque
 * noise. Noise because it does not compress, so the file is as big as its
 * pixels (a 1000-pixel square is about 2.6 MB); the clear border is what a
 * JPEG on the wall would lose.
 */
function noisyPng(w, h, border) {
  const rows = Buffer.alloc((w * 4 + 1) * h);
  let seed = 12345;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed >> 23; };
  for (let y = 0; y < h; y++) {
    const at = y * (w * 4 + 1);
    rows[at] = 0;
    for (let x = 0; x < w; x++) {
      const inside = x >= border && x < w - border && y >= border && y < h - border;
      const i = at + 1 + x * 4;
      if (inside) { rows[i] = rand(); rows[i + 1] = rand(); rows[i + 2] = rand(); rows[i + 3] = 255; }
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

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
  /** Open the desk at `base` and bring Setup up, where the Phone · iPad panel is as it ships. */
  const openDesk = async (base) => {
    await page.goto(`${base}/?debug&look=classic&dpr=0.35`, { waitUntil: 'networkidle' });
    for (let i = 0; i < 40 && (await page.getByTestId('mode-segmented-setup').count()) === 0; i++) await settle(300);
    await clickAt(page, 'mode-segmented-setup');
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

  /*
    A socket that connects and never says hello: the relay keeps it as
    'unknown' and it must never count. Held open through everything below,
    so a build that counted every socket on connection rather than those
    whose hello the relay accepted would read one phone too many on every
    line; the wrong-key stranger below is closed by the relay too quickly to
    catch that by itself.
  */
  const silent = new WebSocket(`ws://localhost:${PORT}/remote-ws`);
  await new Promise((resolve, reject) => { silent.onopen = resolve; silent.onerror = () => reject(new Error('the silent socket could not reach the relay')); });

  let p = await openDesk(`http://localhost:${PORT}`);
  const relayUrlOf = (host) => `http://${host}:${PORT}/?remote=1&key=${KEY}`;
  const relayUrl = hosts[0] ? relayUrlOf(hosts[0]) : null;
  /** The address is the relay's: one of its LAN addresses, its port, the remote flag and the key. */
  const isRelays = (url) => !!url && hosts.some(h => url === relayUrlOf(h));
  /*
    The code is compared with the encoder's own for the address the check
    expects, not for the address the panel printed: against the printed one
    the line reads f(x) === f(x) and would pass a panel that printed and drew
    the wrong address (the skeptic's control), so only the line above would
    catch it. Anchored this way each line stands on its own.
  */
  const isRelaysCode = (d) => !!d && hosts.some(h => d === codeOf(relayUrlOf(h)));
  check('with no phone, the panel says "No phone linked." and shows the relay\'s address, with the key',
    p.status === 'No phone linked.' && isRelays(p.url),
    `status "${p.status}", address ${p.url ?? 'none'}${relayUrl && p.url !== relayUrl ? ` (expected ${relayUrl})` : ''}`);
  check('and draws that address as a QR code, module for module the encoder\'s own for the relay\'s address',
    isRelaysCode(p.d), p.d ? `${p.d.length} chars of path` : 'no code drawn');
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
  check('with a phone linked, the code, the address and Copy are put away', p.there && p.status === '1 phone linked.' && p.d === null && p.url === null && !p.copy,
    `${p.d ? 'code' : 'no code'}, ${p.url ? 'address' : 'no address'}, ${p.copy ? 'Copy' : 'no Copy'}`);
  check('and a Link another button stands in their place', /link another/i.test(p.more ?? ''), p.more ?? 'no button');
  check('the footer counts the phone too', /1 phone linked/.test(p.footer), p.footer.trim().slice(0, 80));

  if (p.more) {
    await clickAt(page, 'phone-link-more');
    await settle(400);
    p = await panel();
    check('Link another brings the same code and address back', !!p.d && p.d === codeAtRest && isRelays(p.url) && p.copy,
      p.d ? (p.d === codeAtRest ? 'the same code' : 'a different code') : 'no code');
    check('and the button now reads "Put the code away"', /put the code away/i.test(p.more ?? ''), p.more ?? 'no button');
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

  // The press is forgotten at 0: bring the code up by hand with a phone on,
  // let it leave, and the next phone to join must find the code put away.
  // A build that kept the toggle would show the code with a phone on.
  const third = await phone();
  await says('1 phone linked.');
  p = await panel();
  const hadButton = !!p.more;
  if (hadButton) { await clickAt(page, 'phone-link-more'); await settle(400); }
  check('Link another with a phone on brings the code up', hadButton && !!(await panel()).d, hadButton ? ((await panel()).d ? 'up' : 'no code') : 'no button to press');
  await hangUp(third);
  await says('No phone linked.');
  const fourth = await phone();
  took = await says('1 phone linked.');
  p = await panel();
  check('the next phone to join finds the code put away again: the press was forgotten at 0',
    took >= 0 && p.d === null && /link another/i.test(p.more ?? ''), took >= 0 ? (p.d ? 'the code is still up' : 'away') : `still "${p.status}"`);
  await hangUp(fourth);
  await says('No phone linked.');
  check('the silent socket never counted: back to "No phone linked." with it still open',
    silent.readyState === WebSocket.OPEN && (await panel()).status === 'No phone linked.', `socket state ${silent.readyState}, status "${(await panel()).status}"`);
  silent.close();

  /*
    PLAN 14m-mark: a logo too big for one relay frame still reaches the
    network display. The relay closes a socket on a frame over 512 KB (code
    1009), and the desk's link drops a message that large rather than lose its
    socket; the mark crosses as a data URL, so a print-sized logo used to reach
    no network display at all. The display is a mirror socket here, as a
    network display's page is to the relay. What is asked:
      - a 2 MB PNG with a transparent border reaches a mirror already on, as a
        picture under the frame cap, still clear where the file was clear
        (WebP or PNG; a JPEG would paint that border black on the wall);
      - the desk's socket survives the send: a mirror that joins afterwards is
        handed the same mark on its hello;
      - a small logo crosses byte for byte as the file was, as before 14m-mark.
    Run against the code before this, the first two lines fail: no mark ever
    reaches either mirror.
  */
  // The relay's cap, MAX_FRAME_BYTES in src/lib/remoteProtocol.ts, written out
  // because that module's own imports need the bundler, which this check runs without.
  const MAX_FRAME_BYTES = 512 * 1024;
  /** A mirror: a network display's socket, collecting every mark the desk sends it. */
  const mirror = () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/remote-ws`);
    const marks = [];
    ws.onmessage = (e) => {
      try { const m = JSON.parse(String(e.data)); if (m.type === 'cast' && m.message?.type === 'mark') marks.push(m.message.dataUrl); } catch { /* not ours */ }
    };
    return new Promise((resolve, reject) => {
      ws.onopen = () => { ws.send(JSON.stringify({ type: 'hello', role: 'mirror', key: KEY })); resolve({ ws, marks }); };
      ws.onerror = () => reject(new Error('the mirror could not reach the relay'));
    });
  };
  /** Wait up to `ms` for `marks` to hold a picture (a non-null mark). */
  const markIn = async (marks, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const m = marks.filter(Boolean).at(-1); if (m) return m; await settle(150); }
    return null;
  };
  /** The picture's size and the alpha of a border pixel and the centre one, decoded in the page. */
  const looks = (url) => page.evaluate(async (u) => {
    const img = new Image();
    img.src = u;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const a = (x, y) => g.getImageData(x, y, 1, 1).data[3];
    return { w: img.naturalWidth, h: img.naturalHeight, edge: a(2, 2), centre: a(img.naturalWidth >> 1, img.naturalHeight >> 1) };
  }, url);
  // The file input lives in Settings' Logo & Titles section; the command palette opens it.
  await page.keyboard.press('Control+k');
  await page.getByTestId('palette-input').fill('Settings: Logo & Titles');
  await settle(300);
  if (await page.getByTestId('palette-row-settings-mark').count()) await clickAt(page, 'palette-row-settings-mark');
  await settle(600);
  const markFile = (await page.locator('#mark-file').count()) > 0;
  check('the desk has the mark\'s file input to load a logo through', markFile);
  if (markFile) {
    const first = await mirror();
    await settle(800);
    const big = noisyPng(1000, 1000, 100);
    await page.setInputFiles('#mark-file', { name: 'logo.png', mimeType: 'image/png', buffer: big });
    const got = await markIn(first.marks);
    const seen = got ? await looks(got) : null;
    check(`a ${(big.length / 1e6).toFixed(1)} MB logo reaches a network display already on, under the ${MAX_FRAME_BYTES >> 10} KB frame cap`,
      !!got && got.length < MAX_FRAME_BYTES && !!seen && seen.w > 0, got ? `${(got.length / 1024).toFixed(0)} KB, ${got.slice(5, got.indexOf(';'))}, ${seen?.w}×${seen?.h}` : 'no mark arrived');
    check('and it is still clear where the file was clear, and solid where it was solid (no JPEG)',
      !!seen && seen.edge === 0 && seen.centre === 255 && !/^data:image\/jpe?g/.test(got), seen ? `border alpha ${seen.edge}, centre ${seen.centre}` : 'nothing to read');
    const second = await mirror();
    const again = await markIn(second.marks);
    check('the desk\'s link survived it: a network display joining afterwards is handed the same mark',
      !!again && again === got, again ? (again === got ? `${(again.length / 1024).toFixed(0)} KB, the same` : 'a different mark') : 'no mark arrived');
    const small = noisyPng(48, 48, 8);
    const before = first.marks.length;
    await page.setInputFiles('#mark-file', { name: 'small.png', mimeType: 'image/png', buffer: small });
    let tiny = null;
    for (let i = 0; i < 50 && !tiny; i++) { tiny = first.marks.slice(before).find(Boolean) ?? null; if (!tiny) await settle(150); }
    check('a small logo crosses byte for byte as the file was', tiny === `data:image/png;base64,${small.toString('base64')}`,
      tiny ? `${tiny.length} chars, ${tiny.startsWith('data:image/png;base64,') ? 'a PNG' : tiny.slice(0, 20)}` : 'no mark arrived');
    first.ws.close(); second.ws.close();
  }

  /*
    PLAN 14m-lan: the laptop's page opened at its Wi-Fi address. The relay
    gives the display key only to the machine at its own name (localhost), and
    a browser gives WebGPU only to a secure page, which an http address on the
    Wi-Fi is not, so that page cannot even start: it said "GPUTextureUsage is
    not defined" and nothing else. Asked:
      - the relay hands that address neither key;
      - in a browser as it ships, the failure screen says why and gives the
        localhost address on the same port;
      - a desk the relay hands no key (as it answers that address) says to
        open the page at localhost and draws no code (it used to draw one of
        the remote with no key, which a phone could scan and never join
        with), and opens no socket to the relay. The count is read by
        wrapping the page's WebSocket, and the same count on a desk handed
        its key must see its socket, so the line cannot pass by counting
        nothing.
  */
  const lan = hosts.find(h => h !== 'localhost' && h !== '127.0.0.1');
  /** An element's text, or '' at once when it is not there (a locator's own wait is a minute). */
  const textOf = async (pg, id) => ((await pg.getByTestId(id).count()) ? (await pg.getByTestId(id).first().textContent()) ?? '' : '');
  if (lan) {
    const lanBase = `http://${lan}:${PORT}`;
    const local = `http://localhost:${PORT}/`;
    const lanInfo = await (await fetch(`${lanBase}/remote-info.json`)).json();
    check('the relay hands its Wi-Fi address neither the show key nor the display key', !lanInfo.key && !lanInfo.displayKey,
      `key ${lanInfo.key ?? 'none'}, display key ${lanInfo.displayKey ? 'given' : 'none'}`);

    await page.goto(`${lanBase}/?debug&look=classic&dpr=0.35`, { waitUntil: 'networkidle' });
    let boot = '';
    for (let i = 0; i < 40 && !boot; i++) { boot = await textOf(page, 'boot-insecure'); if (!boot) await settle(300); }
    const link = boot ? await page.getByTestId('boot-insecure').locator('a').getAttribute('href') : null;
    check('at the Wi-Fi address, in a browser as it ships, the failure screen says why and links the localhost address',
      /Wi-Fi address/.test(boot) && /secure page/.test(boot) && link === local, boot ? `${boot.replace(/\s+/g, ' ').slice(0, 90)}… link ${link}` : 'no such words');
    await page.goto(`${lanBase}/?cast=true&key=${KEY}`, { waitUntil: 'networkidle' });
    let castBoot = '';
    for (let i = 0; i < 40 && !castBoot; i++) { castBoot = await textOf(page, 'boot-insecure'); if (!castBoot) await settle(300); }
    check('a network display there is told why, and not sent to its own localhost', /secure page/.test(castBoot) && !castBoot.includes('localhost:'),
      castBoot ? castBoot.replace(/\s+/g, ' ').slice(0, 120) : 'no such words');

    /*
      The panel's own case, asked on the localhost desk with the relay's answer
      rewritten to hand it no key: that is exactly what the relay says to a page
      at its Wi-Fi address. A browser flag that treats the Wi-Fi address as
      secure would ask it more literally, but the runner's Chromium ignored the
      flag (the page still was not a secure context and never started), so the
      line read the start-up screen, not the panel.
    */
    const keyless = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const fpage = await keyless.newPage();
      fpage.setDefaultTimeout(60_000);
      await fpage.addInitScript(() => {
        const W = window.WebSocket;
        window.__cgSockets = [];
        window.WebSocket = class extends W { constructor(u, p) { super(u, p); window.__cgSockets.push(String(u)); } };
      });
      const relaySockets = () => fpage.evaluate(() => (window.__cgSockets ?? []).filter(u => u.includes('/remote-ws')).length);
      const words = () => textOf(fpage, 'phone-link');
      const openAt = async (base) => {
        await fpage.goto(`${base}/?debug&look=classic&dpr=0.35`, { waitUntil: 'load' });
        for (let i = 0; i < 120 && (await fpage.getByTestId('mode-segmented-setup').count()) === 0; i++) await fpage.waitForTimeout(300);
        if (await fpage.getByTestId('mode-segmented-setup').count()) await clickAt(fpage, 'mode-segmented-setup');
        for (let i = 0; i < 40 && (!(await words()) || /looking/i.test(await words())); i++) await fpage.waitForTimeout(300);
        await fpage.waitForTimeout(3000);
      };
      const asWifi = async (route) => {
        const res = await route.fetch();
        await route.fulfill({ response: res, json: { ...(await res.json()), key: null, displayKey: null } });
      };
      await fpage.route('**/remote-info.json', asWifi);
      await openAt(`http://localhost:${PORT}`);
      const w = await words();
      const instead = w ? '' : (await fpage.evaluate(() => document.body?.innerText ?? '')).replace(/\s+/g, ' ').slice(0, 220);
      const hasCode = (await fpage.getByTestId('phone-link-qr').count()) > 0;
      const hasUrl = (await fpage.getByTestId('phone-link-url').count()) > 0;
      check('handed no key, as the relay answers a Wi-Fi address, the desk says to open the page at localhost to link phones',
        (await fpage.getByTestId('phone-link-local').count()) > 0 && w.includes(local) && /Wi-Fi address/.test(w), w.replace(/\s+/g, ' ').slice(0, 160) || `no panel; the page says: ${instead || 'nothing'}`);
      check('and draws no code and no address: a phone could never join with a keyless code', !!w && !hasCode && !hasUrl,
        `${w ? 'a panel' : 'no panel'}, ${hasCode ? 'code' : 'no code'}, ${hasUrl ? 'address' : 'no address'}`);
      const n = await relaySockets();
      check('and that page opens no socket to the relay', !!w && n === 0, `${n} socket${n === 1 ? '' : 's'} to /remote-ws`);
      await fpage.unroute('**/remote-info.json', asWifi);
      await openAt(`http://localhost:${PORT}`);
      const m = await relaySockets();
      check('the same count on the desk handed its key sees its socket (the count is not blind)', m >= 1, `${m} socket${m === 1 ? '' : 's'} to /remote-ws`);
    } finally {
      await keyless.close();
    }
  } else {
    total += 1; failed += 1;
    console.log(' FAIL the Wi-Fi address lines — the show server named no address but localhost');
  }

  stop(relay); relay = null;

  // ── On a static host, as the hosted site is ─────────────────────────
  preview = await startPreview();
  const origin = `http://localhost:${PREVIEW_PORT}`;
  p = await openDesk(origin);
  check('with no show server behind the page, the panel still says "No phone linked."', p.status === 'No phone linked.', `status "${p.status}"`);
  // The show's own address on this host, not `/`: since 23.16b the site's `/`
  // is the webpage, and the phone that scans this should open the show.
  check('and shows the page\'s own show address, with no key and no remote flag after it', p.url === `${origin}${SHOW_PATH}`, p.url ?? 'no address');
  check('drawn as a QR code, module for module the encoder\'s own for that address', !!p.d && p.d === codeOf(`${origin}${SHOW_PATH}`), p.d ? `${p.d.length} chars of path` : 'no code drawn');
  check('and its words say the code opens the show on the phone itself, and how to get a show server',
    /on the phone itself/.test(p.words) && /show server/.test(p.words) && /npm run remote/.test(p.words), p.words.replace(/\s+/g, ' ').slice(0, 120));
  check('with no relay there is no Link another button', p.more === null, p.more ?? 'none');
} finally {
  stop(relay);
  stop(preview);
  await browser.close();
}

console.log(`\n${total - failed}/${total} ok`);
process.exit(failed ? 1 : 0);
