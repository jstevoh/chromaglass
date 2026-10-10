#!/usr/bin/env node
/**
 * Does picking an input change what the show hears, at once?
 *
 *   npm run inputpick        # builds, then about half a minute
 *
 * PLAN.md 14s, measured 2026-09-28 with Chromium's fake devices: picking
 * Input 1 and then Input 2 in the settings made three `getUserMedia` calls,
 * none with a `deviceId`, and all three tracks stayed live. The input picker
 * (`chooseAudioInput`, App.tsx) was memoised on the source alone and called
 * the `handleSourceChange` of the render in which the source last changed,
 * when the stream was still `null` and the input the old one. So the
 * interface picked at soundcheck was not the one the show heard until a
 * reload, and each pick left another microphone open.
 *
 * So this goes the way a hand does: the app on the microphone (as a visitor
 * who chose it comes back to it), the Mic dot on the desk, the settings'
 * input list, Input 1 and then Input 2 picked from it. And asks, of every
 * call the page makes to `getUserMedia` and every stream it was handed:
 *
 *   - that each pick opened the input picked, by its id
 *   - that one microphone is open at the end, and it is the one picked last:
 *     the earlier ones' tracks ended
 *   - and the same for two picks back to back, the second made before the
 *     first has answered
 *
 * The control: the app opened the microphone on load (else the picks have
 * nothing to change), and the fake devices offer two inputs besides the
 * default (else picking "two" is picking one twice and could pass on it).
 *
 * No GPU: it reads the page's media, not the plate.
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { launchChromium } from './chromium.mjs';

const PORT = Number(process.env.INPUTPICK_PORT ?? 4193);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// On CI an earlier step has built dist/; anywhere else build it, so a stale
// build is never what is measured.
if (!process.env.CI) {
  const b = spawnSync('npm', ['run', 'build'], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (b.status !== 0) { check('the site builds', false, `exit ${b.status}`); process.exit(1); }
}

const notes = [];
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
await new Promise((resolve, reject) => {
  const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
  server.stdout.on('data', (d) => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
  server.stderr.on('data', (d) => { notes.push(String(d).trim()); });
  server.on('exit', (c) => { clearTimeout(bail); reject(new Error(`preview exited ${c}: ${notes.join(' ').slice(0, 200)}`)); });
});

const browser = await launchChromium(chromium);
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.addInitScript(() => {
    localStorage.setItem('chromaglass-audio-source', 'microphone');
    localStorage.setItem('chromaglass-desk-mode', 'perform');
    // Every ask and every stream it was answered with, in order.
    window.__asks = [];
    window.__streams = [];
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const audio = c && typeof c.audio === 'object' ? c.audio : null;
      window.__asks.push({ deviceId: audio?.deviceId?.exact ?? audio?.deviceId ?? null });
      const s = await gum(c);
      window.__streams.push(s);
      return s;
    };
  });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__streams.length > 0, null, { timeout: 30_000 }).catch(() => {});
  const media = () => page.evaluate(() => ({
    asks: window.__asks.slice(),
    live: window.__streams.flatMap((s) => s.getAudioTracks()).filter((t) => t.readyState === 'live')
      .map((t) => t.getSettings().deviceId ?? '?'),
  }));
  const onLoad = await media();
  check('the app opened the microphone on load', onLoad.asks.length >= 1 && onLoad.live.length === 1,
    `${onLoad.asks.length} asks, ${onLoad.live.length} live`);

  const inputs = await page.evaluate(async () => (await navigator.mediaDevices.enumerateDevices())
    .filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d) => ({ id: d.deviceId, label: d.label })));
  check('the fake devices offer two inputs besides the default', inputs.length >= 2,
    inputs.map((d) => d.label || d.id.slice(0, 8)).join(', ') || 'none');
  if (inputs.length < 2) throw new Error('nothing to pick between');
  const [one, two] = inputs;

  // The way a hand gets there: the desk's Mic dot opens the settings at the input.
  await page.click('[data-testid="dot-sound"]');
  const picker = page.locator('[data-testid="audio-input"]');
  await picker.waitFor({ state: 'visible' });
  await page.waitForFunction((ids) => ids.every((id) => [...document.querySelectorAll('[data-testid="audio-input"] option')].some((o) => o.value === id)),
    [one.id, two.id], { timeout: 10_000 });

  const before = (await media()).asks.length;
  await picker.selectOption(one.id);
  await page.waitForTimeout(1500);
  const afterOne = await media();
  await picker.selectOption(two.id);
  await page.waitForTimeout(1500);
  const afterTwo = await media();

  const asked = (m, from) => m.asks.slice(from).map((a) => a.deviceId);
  const short = (id) => (id ? (id === one.id ? 'Input 1' : id === two.id ? 'Input 2' : id.slice(0, 8)) : 'no id');
  const firstPick = asked(afterOne, before);
  check('picking Input 1 opens Input 1, by its id', firstPick.length >= 1 && firstPick.every((id) => id === one.id),
    `asked for ${firstPick.map(short).join(', ') || 'nothing'}`);
  const secondPick = asked(afterTwo, afterOne.asks.length);
  check('then picking Input 2 opens Input 2, by its id', secondPick.length >= 1 && secondPick.every((id) => id === two.id),
    `asked for ${secondPick.map(short).join(', ') || 'nothing'}`);
  check('and one microphone is open, the one picked last: the earlier inputs closed',
    afterTwo.live.length === 1 && afterTwo.live[0] === two.id,
    `${afterTwo.live.length} live track${afterTwo.live.length === 1 ? '' : 's'}: ${afterTwo.live.map(short).join(', ') || 'none'}; `
    + `${afterTwo.asks.length} asks in all`);

  // And two picks back to back, the second before the first has answered,
  // the way a hand runs down the list: what is heard is the one picked last,
  // and the one between, opened or not, is closed.
  await picker.selectOption(one.id);
  await picker.selectOption(two.id);
  await page.waitForTimeout(1500);
  const quick = await media();
  check('two picks back to back: one microphone open, the one picked last',
    quick.live.length === 1 && quick.live[0] === two.id,
    `${quick.live.length} live: ${quick.live.map(short).join(', ') || 'none'}; asked for ${asked(quick, afterTwo.asks.length).map(short).join(', ') || 'nothing'}`);
} catch (err) {
  check('the run completed', false, String(err).split('\n')[0]);
} finally {
  await browser.close();
  stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} input-picker checks passed`);
process.exit(failed.length ? 1 : 0);
