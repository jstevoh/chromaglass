#!/usr/bin/env node
/**
 * `npm run clicks`: a click on the laptop is not a beat.
 *
 * What was reported: pressing a control (the Speed ride, a tool) sometimes
 * made the plate pulse, as if it had taken a beat or a press. The show was on
 * the laptop's microphone, and a trackpad's click, a mouse button, a key or a
 * finger on a phone's glass is a sharp knock a few centimetres from it. The
 * ear's onsets (`src/lib/audioFeatures.ts`) are built to call exactly that, a
 * sudden arrival of energy, and the plate's kick (the squeeze, the centre
 * pulse, the ring, the rock) follows the kick onset. The fix is
 * `src/lib/handSounds.ts`: on the microphone, a reading taken in the moment
 * of a gesture calls no onset.
 *
 * The ear, in arithmetic (node, no browser): the analyser emulated
 * (`AnalyserEmulator`, the node's window, FFT and smoothing), a click as a
 * broadband tick with a short thump (90 Hz, a desk or the case; 160 Hz, a
 * trackpad's actuator), at 48 and 44.1 kHz, over the band's arrangement once
 * round (126 s):
 *
 *   the fault        with no gesture marked, the ear takes the clicks for
 *                    kicks: in a quiet room nearly every one, and with the
 *                    show's band playing most of the loud ones. This is the
 *                    control: if it heard none, the click modelled here is
 *                    not a click the ear can hear, and every line after it
 *                    would pass on nothing.
 *   the room         with each click marked as the page marks a gesture, no
 *                    source calls an onset in a click's moment, with the
 *                    sound reaching the analyser 0, 30, 100 or 200 ms after
 *                    the gesture (a laptop's input latency to a headset's),
 *                    and the ear did hear them: it swallowed hits.
 *   the music        with the band playing and clicks marked, no kick is
 *                    called that the band did not play, and every kick the
 *                    ear heard of the band alone, outside a click's moment,
 *                    it still hears; and the beat clock, with Follow Beat as
 *                    the show sets it, still fires its kicks through the
 *                    moments, so a hand on the desk during a steady song
 *                    loses next to none (the clock runs ahead of them).
 *
 * The app (`npm run clicks -- --app`, on the built site, no GPU needed): the
 * microphone is a stand-in stream whose room knocks on every press, release
 * and key, the way the laptop's microphone hears them, and also knocks with
 * no hand on anything, the control. Off CI it builds the site first.
 *
 *   the control      the timer's knocks are heard as kicks by the real ear
 *                    (the AnalyserNode, the hook), each within 150 ms of the
 *                    knock: loud enough, soon enough, and nothing masking it
 *                    with no gesture.
 *   the desk         tools picked, the Speed ride pressed and two tool keys
 *                    typed on the Perform desk: the ear hears no kick, and
 *                    swallowed a kick for all but one of the gestures (it
 *                    did hear the knocks). Then the control again: the gate
 *                    opens after the hand, the show is not left deaf.
 *   the phone        the same on the phone's own layout: its tools tapped
 *                    and its Amount slider pressed.
 *   the band         on the band the gate is off: tools picked, nothing
 *                    swallowed and its kicks heard throughout.
 *
 * What it cannot see: a real laptop's microphone and a real click. The
 * owner's machine is the judge of that (docs/judging.md).
 */
import { AnalyserEmulator, AudioFeatures, SOURCE_NAMES } from '../src/lib/audioFeatures.ts';
import { BeatClock } from '../src/lib/beatClock.ts';
import { BAND_STEP_S } from '../src/lib/simulatedMusic.ts';
import { HandSounds, HAND_HEARD_FOR_S } from '../src/lib/handSounds.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { stream, setShowSeed } from '../src/lib/rng.ts';
import { renderBand } from './band.mjs';

const APP = process.argv.includes('--app');
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── The ear, in arithmetic ──────────────────────────────────────────────

/**
 * A click as a laptop's microphone hears it: a broadband tick (the switch)
 * over a short thump at `hz` (the case, the desk, a trackpad's actuator),
 * `peak` at its loudest. Both are a few milliseconds; the thump is what puts
 * it in a kick's band.
 */
function addClick(pcm, sr, t, peak, hz, rng) {
  const i0 = Math.floor(t * sr);
  for (let i = 0; i < sr * 0.04 && i0 + i < pcm.length; i++) {
    const s = i / sr;
    pcm[i0 + i] += peak * (0.6 * rng.signed() * Math.exp(-s / 0.0008) + 0.8 * Math.sin(2 * Math.PI * hz * s) * Math.exp(-s / 0.012));
  }
}

/** The ear at 60 readings a second, with `hand(t)` saying whether a reading is in a gesture's moment. */
function hear(pcm, sr, hand = () => false) {
  const an = new AnalyserEmulator(sr);
  const features = new AudioFeatures();
  const clock = new BeatClock();
  const hits = Object.fromEntries(SOURCE_NAMES.map((n) => [n, []]));
  const ticks = [];
  let lastAt = null;
  const frames = Math.floor((pcm.length / sr) * 60);
  for (let i = 1; i < frames; i++) {
    const t = i / 60;
    const { bins: db, timeDomainData: td } = an.frame(pcm, Math.round(t * sr), 1 / 60);
    const r = features.update({ bins: db, timeDomainData: td, scale: 'db', sampleRate: sr, fftSize: an.fftSize }, t, hand(t));
    for (const n of SOURCE_NAMES) if (r.onsets[n].hit) hits[n].push(t);
    // The plate's own reading of a kick (LiquidVisualizer): the onset's time changing.
    const at = r.onsets.kick.at;
    let heardAt = null;
    if (at !== null && at !== lastAt) { lastAt = at; heardAt = at * 1000; }
    if (clock.update(t * 1000, heardAt, DEFAULT_SETTINGS.beatPrediction, DEFAULT_SETTINGS.beatLead).kick) ticks.push(t);
  }
  return { hits, ticks, swallowed: features.swallowed };
}

function arithmetic() {
  setShowSeed(7);
  const SECONDS = 8 * 8 * 16 * BAND_STEP_S;   // the arrangement once round, 126 s
  for (const sr of [48000, 44100]) {
    const khz = `${(sr / 1000).toFixed(1)} kHz`;
    const band = renderBand(SECONDS, sr);
    let peak = 0; for (const v of band.pcm) peak = Math.max(peak, Math.abs(v));
    // Clicks at seeded moments a second or so apart, none within 120 ms of
    // one of the band's kicks, so a kick near a click is the click's.
    const rng = stream('clicks.when');
    const clicks = [];
    for (let t = 1.3; t < SECONDS - 1; t += 0.9 + rng.float() * 0.8) {
      if (!band.kicks.some((k) => Math.abs(k.t - t) < 0.12)) clicks.push(t);
    }
    const room = (base) => {
      const pcm = new Float32Array(band.pcm.length);
      const nz = stream('clicks.room');
      for (let i = 0; i < pcm.length; i++) pcm[i] = (base ? base[i] : 0) + 0.0005 * nz.signed();
      return pcm;
    };
    // The page stamps each gesture as it arrives, a few ms after the knock
    // (`listenForHands`), and handles it before the next reading; the sound
    // reaches the analyser whenever the input's latency says, which each
    // case below sets. Marked as time passes, as live, not all up front:
    // a reading sees a mark only once the page has handled its event, which
    // is at its stamp, or `handled` seconds after it on a busy page.
    const marked = (handled = 0) => {
      const hands = new HandSounds();
      let next = 0;
      return (t) => {
        while (next < clicks.length && clicks[next] + 0.005 + handled <= t) hands.mark(clicks[next++] + 0.005);
        return hands.covers(t);
      };
    };
    const near = (ts) => ts.filter((t) => clicks.some((c) => t >= c && t < c + 0.2)).length;
    console.log(`\n  ${khz}: ${clicks.length} clicks over ${SECONDS.toFixed(0)} s; the band ${band.kicks.length} kicks, peak ${peak.toFixed(2)}\n`);

    // The quiet room.
    for (const hz of [90, 160]) {
      const pcm = room(null);
      const knocks = stream('clicks.knock');
      for (const c of clicks) addClick(pcm, sr, c, 0.1, hz, knocks);
      const bare = hear(pcm, sr);
      const kicks = near(bare.hits.kick);   // the room's clicks are heard at once
      check(`${khz}, a quiet room, clicks with a ${hz} Hz thump: the fault, the ear takes them for kicks with no gesture marked`,
        kicks >= clicks.length * (hz === 90 ? 0.8 : 0.3),
        `${kicks} of ${clicks.length} clicks heard as kicks, ${near(bare.hits.bass)} as bass, ${near(bare.hits.snare)} as the snare`);
      /*
        The click's sound `lag` after the knock, the same knocks later; and
        once with the event handled a frame late (a busy page hands input
        over at the next frame), against a laptop's 30 ms of input latency.
        "The ear heard them": it swallowed a kick for three in four of the
        clicks the bare ear took for one (on the knock's own time: a 160 Hz
        thump is a kick on about half the clicks, and which half moves with
        where the sound falls between readings), so a gate that saw a handful
        passes nothing.
      */
      for (const [lag, handled] of [[0.01, 0], [0.03, 0], [0.1, 0], [0.2, 0], [0.03, 0.017]]) {
        const late = room(null);
        const k2 = stream('clicks.knock');
        for (const c of clicks) addClick(late, sr, c + lag, 0.1, hz, k2);
        const gated = hear(late, sr, marked(handled));
        const any = SOURCE_NAMES.map((n) => [n, gated.hits[n].filter((t) => clicks.some((c) => t >= c + lag && t < c + lag + 0.15)).length]);
        const total = any.reduce((a, [, v]) => a + v, 0);
        check(`${khz}, a quiet room, ${hz} Hz, the sound ${Math.round(lag * 1000)} ms after the knock${handled ? `, the event handled ${Math.round(handled * 1000)} ms late` : ''}: no onset in a click's moment, and the ear heard them`,
          total === 0 && gated.swallowed.kick >= kicks * 0.75,
          `${total === 0 ? 'none' : any.filter(([, v]) => v).map(([n, v]) => `${v} ${n}`).join(', ')}; ${gated.swallowed.kick} kicks swallowed for the ${kicks} the bare ear heard`);
      }
    }

    // The band, playing.
    const alone = hear(room(band.pcm), sr);
    for (const [loud, hz] of [[0.1, 90], [0.2, 90], [0.2, 160]]) {
      const pcm = room(band.pcm);
      const knocks = stream('clicks.knock');
      // Heard 30 ms after the knock, a laptop's input latency.
      for (const c of clicks) addClick(pcm, sr, c + 0.03, loud, hz, knocks);
      const bare = hear(pcm, sr);
      const extra = (ts) => ts.filter((t) => !alone.hits.kick.some((a) => Math.abs(a - t) < 0.02));
      check(`${khz}, the band and clicks at ${loud} (${hz} Hz): the fault, kicks the band never played`,
        extra(bare.hits.kick).length >= clicks.length * (loud === 0.2 && hz === 90 ? 0.5 : 0.15),
        `${extra(bare.hits.kick).length} extra kicks for ${clicks.length} clicks; the beat clock ${bare.ticks.length} kicks against ${alone.ticks.length} for the band alone`);
      const gated = hear(pcm, sr, marked());
      const inMoment = (t) => clicks.some((c) => t >= c - 0.05 && t <= c + HAND_HEARD_FOR_S + 0.02);
      const kept = alone.hits.kick.filter((t) => !inMoment(t));
      const lost = kept.filter((t) => !gated.hits.kick.some((g) => Math.abs(g - t) < 0.02));
      check(`${khz}, the band and clicks at ${loud} (${hz} Hz), marked: no kick the band did not play, and every one heard alone outside a click's moment still heard`,
        kept.length >= band.kicks.length * 0.8 && extra(gated.hits.kick).length === 0 && lost.length === 0,
        `${extra(gated.hits.kick).length} extra; ${kept.length - lost.length} of ${kept.length} kept (${alone.hits.kick.length - kept.length} fell in a click's moment); ${gated.swallowed.kick} kicks swallowed`);
      // Matched within 150 ms, as `npm run kicks` scores the clock: a kick
      // the ear did not hear (swallowed in a click's moment) the locked clock
      // fires on its own prediction, up to the Beat Lead ahead.
      const clockExtra = gated.ticks.filter((t) => !alone.ticks.some((a) => Math.abs(a - t) < 0.15));
      const clockLost = alone.ticks.filter((t) => !gated.ticks.some((g) => Math.abs(g - t) < 0.15));
      check(`${khz}, the band and clicks at ${loud} (${hz} Hz), marked: the beat clock fires the band's kicks through the clicks`,
        alone.ticks.length >= band.kicks.length * 0.9 && clockExtra.length <= 2 && clockLost.length <= alone.ticks.length * 0.03,
        `${gated.ticks.length} kicks against ${alone.ticks.length} for the band alone: ${clockExtra.length} not the band's, ${clockLost.length} lost (at most 3%)`);
    }
  }
}

// ── The app ─────────────────────────────────────────────────────────────

/*
  The microphone, stood in for: a stream from a page AudioContext holding a
  quiet room, which knocks (the click above, as samples) on every press and
  release of a mouse, every finger landing and every key going down, at the
  moment the event arrives, the way the laptop's own microphone hears a hand
  on it. It is registered before the app's listeners, in the capture phase,
  and the knock reaches the app's analyser through the stream with whatever
  latency the browser's audio path has. `window.__knock()` knocks with no
  gesture, and stamps when it did (`__knockAt`, the page's seconds).
*/
const ROOM = () => {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const sr = ctx.sampleRate;
  const noise = ctx.createBuffer(1, sr * 2, sr);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = 0.0005 * (Math.random() * 2 - 1); }
  const hiss = ctx.createBufferSource(); hiss.buffer = noise; hiss.loop = true; hiss.connect(dest); hiss.start();
  const click = ctx.createBuffer(1, Math.floor(sr * 0.04), sr);
  { const d = click.getChannelData(0); for (let i = 0; i < d.length; i++) { const s = i / sr; d[i] = 0.2 * (0.6 * (Math.random() * 2 - 1) * Math.exp(-s / 0.0008) + 0.8 * Math.sin(2 * Math.PI * 90 * s) * Math.exp(-s / 0.012)); } }
  const knock = () => { void ctx.resume(); const b = ctx.createBufferSource(); b.buffer = click; b.connect(dest); b.start(); window.__knocks = (window.__knocks ?? 0) + 1; };
  window.__knock = () => { window.__knockAt = performance.now() / 1000; knock(); };
  addEventListener('pointerdown', () => knock(), true);
  addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') knock(); }, true);
  addEventListener('keydown', (e) => { if (!e.repeat) knock(); }, true);
  const gum = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => (c && c.audio && !c.video ? dest.stream : gum(c));
  const query = navigator.permissions?.query?.bind(navigator.permissions);
  if (query) navigator.permissions.query = async (d) => (d?.name === 'microphone' ? { state: 'granted', onchange: null } : query(d));
};

async function app() {
  const { chromium } = await import('playwright');
  const { launchChromium } = await import('./chromium.mjs');
  const { spawn, spawnSync } = await import('node:child_process');
  // On CI the phone's step has just built dist/; anywhere else build it, so
  // a stale build is never what is measured.
  if (!process.env.CI) {
    const b = spawnSync('npm', ['run', 'build'], { stdio: ['ignore', 'ignore', 'inherit'] });
    if (b.status !== 0) { check('the site builds', false, `exit ${b.status}`); return; }
  }
  const PORT = Number(process.env.CLICKS_PORT ?? 4371);
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
  const browser = await launchChromium(chromium, { args: ['--autoplay-policy=no-user-gesture-required'] });
  const hands = (page) => page.evaluate(() => (typeof window.__hands === 'function' ? window.__hands() : null));
  const open = async (screen, source) => {
    const ctx = await browser.newContext(screen.touch
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    await page.addInitScript(([src, room]) => {
      localStorage.setItem('chromaglass-audio-source', src);
      localStorage.setItem('chromaglass-desk-mode', 'perform');
      // eslint-disable-next-line no-new-func
      if (src === 'microphone') new Function(`(${room})()`)();
    }, [source, ROOM.toString()]);
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&play=0`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.__hands === 'function', null, { timeout: 60_000 });
    // The ranges and thresholds learn the room for a few seconds first.
    await page.waitForTimeout(4000);
    return { ctx, page };
  };
  // Each press spaced as a hand would, and past the ear's refractory and the gate.
  const spaced = async (page, n, act) => { for (let i = 0; i < n; i++) { await act(i); await page.waitForTimeout(700); } await page.waitForTimeout(500); };
  /*
    The control: six knocks with no hand on anything, each heard as a kick,
    and how long the knock took to become one. That delay is the stand-in's
    own audio path (two contexts and a stream); a slow one is reported as
    slow here rather than read below as a gate that failed, since a knock
    that came out of it after the window would be heard and nothing else
    would say why.
  */
  const control = async (page, where, label) => {
    const before = await hands(page);
    const delays = [];
    await spaced(page, 6, async () => {
      await page.evaluate(() => window.__knock());
      await page.waitForTimeout(300);
      const h = await hands(page);
      const at = await page.evaluate(() => window.__knockAt);
      if (h.lastKickAt !== null && h.lastKickAt >= at) delays.push(h.lastKickAt - at);
    });
    const after = await hands(page);
    const worst = delays.length ? Math.max(...delays) : NaN;
    check(`${where}: ${label}, knocks with no hand on anything, are heard as kicks, soon enough for the window to mean something`,
      after.kicks - before.kicks >= 4 && worst < 0.15,
      `${after.kicks - before.kicks} kicks for 6 knocks; a knock became a kick ${delays.map((d) => `${Math.round(d * 1000)}`).join(', ')} ms after it (at most 150)`);
    return after;
  };
  const gated = (where, what, h1, h2, presses, extra = '') => check(`${where}: ${what}, and the ear hears no kick`,
    h2.kicks === h1.kicks && h2.swallowed - h1.swallowed >= presses - 1,
    `${h2.kicks - h1.kicks} kicks for ${presses} gestures; ${h2.swallowed - h1.swallowed} kicks swallowed (at least ${presses - 1}); ${h2.marks - h1.marks} marks${extra}`);
  try {
    {
      const where = 'the desk';
      const { ctx, page } = await open({ touch: false }, 'microphone');
      const h0 = await hands(page);
      check(`${where}: the show is on the microphone, and the gate is on for it`, h0?.hearsRoom === true, JSON.stringify(h0));
      const h1 = await control(page, where, 'the control');
      const tools = ['blow', 'press', 'spray', 'finger', 'dropper', 'pour'];
      await spaced(page, tools.length, (i) => page.click(`[data-testid="tool-segmented-${tools[i]}"]`));
      const speed = page.locator('[data-testid="ride-globalSpeed"] input[type=range]');
      const box = (await speed.count()) ? await speed.boundingBox() : null;
      if (box) await spaced(page, 4, (i) => page.mouse.click(box.x + box.width * (0.2 + 0.15 * i), box.y + box.height / 2));
      // Two of the desk's tool keys (W, D), each a knock as it goes down.
      await page.mouse.move(5, 5);
      await spaced(page, 2, (i) => page.keyboard.press(i ? 'd' : 'w'));
      const h2 = await hands(page);
      check(`${where}: the Speed ride is on the desk`, !!box);
      gated(where, 'six tools picked, the Speed ride pressed four times and two tool keys typed', h1, h2, tools.length + (box ? 4 : 0) + 2);
      // And the gate opens again: the same knocks after the hand, heard.
      await control(page, where, 'after the hand');
      await ctx.close();
    }
    {
      const where = 'the phone';
      const { ctx, page } = await open({ touch: true }, 'microphone');
      const phone = await page.evaluate(() => !!document.querySelector('[data-testid="phone-stage"]'));
      const h0 = await hands(page);
      check(`${where}: its own layout, on the microphone, with the gate on`, phone && h0?.hearsRoom === true, `phone-stage ${phone ? 'present' : 'missing'}; ${JSON.stringify(h0)}`);
      const h1 = await control(page, where, 'the control');
      const tools = ['blow', 'press', 'spray', 'finger', 'dropper', 'pour'];
      let tapped = 0;
      const tap = async (id) => {
        const b = await page.locator(`[data-testid="phone-tool-${id}"]`).boundingBox();
        if (b) { await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); tapped++; }
      };
      await spaced(page, tools.length, (i) => tap(tools[i]));
      // The tool in hand, tapped again, opens its Amount (PhoneStage), itself a tap.
      await spaced(page, 1, () => tap(tools.at(-1)));
      const slider = page.locator('[data-testid="phone-amount-slider"] input[type=range]');
      const amount = (await slider.count()) ? await slider.boundingBox() : null;
      if (amount) await spaced(page, 2, (i) => page.touchscreen.tap(amount.x + amount.width * (0.3 + 0.4 * i), amount.y + amount.height / 2));
      const h2 = await hands(page);
      check(`${where}: every tool and the Amount slider were there to tap`, tapped === tools.length + 1 && !!amount, `${tapped} tool taps${amount ? '' : '; no Amount slider'}`);
      gated(where, 'six tools tapped, the last again for its Amount, and the slider twice', h1, h2, tapped + (amount ? 2 : 0));
      await control(page, where, 'after the hand');
      await ctx.close();
    }
    {
      // The band comes down a wire: the hand's moments are not taken from it.
      const where = 'the band';
      const { ctx, page } = await open({ touch: false }, 'simulated');
      const h1 = await hands(page);
      const tools = ['blow', 'press', 'spray', 'finger', 'dropper', 'pour'];
      await spaced(page, tools.length, (i) => page.click(`[data-testid="tool-segmented-${tools[i]}"]`));
      const h2 = await hands(page);
      check(`${where}: the gate is off, six tools picked and nothing swallowed, the band's kicks heard throughout`,
        h1?.hearsRoom === false && h2.swallowed === h1.swallowed && h2.marks - h1.marks >= tools.length && h2.kicks - h1.kicks >= 4,
        `${JSON.stringify(h1)}; then ${h2.kicks - h1.kicks} kicks heard, ${h2.swallowed - h1.swallowed} swallowed, ${h2.marks - h1.marks} marks`);
      await ctx.close();
    }
  } catch (err) {
    check('the run completed', false, String(err?.message ?? err));
  } finally {
    await browser.close();
    stop();
  }
}

if (APP) await app(); else arithmetic();
const bad = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} checks passed`);
process.exit(bad ? 1 : 0);
