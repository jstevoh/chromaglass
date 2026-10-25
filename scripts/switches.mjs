#!/usr/bin/env node
/**
 * Every switch and every selected state reads on and off, without a GPU.
 *
 *   npm run switches                    # builds, then about three minutes
 *   npm run switches -- --head          # watch it
 *   SWITCHES_SHOTS=dir npm run switches # and a picture of each switch, in both states
 *
 * Reported (the owner, 2026-10-11, with a screenshot of the Record panel):
 * "This switch doesn't look right. Go through all switches and controls and
 * make sure they are clear when things are turned on/off." The switch was
 * Include Audio Track, on: its track is painted `bg-primary`, which is the
 * white of a primary button (#FAFAFA), and its knob is `bg-white`. A white
 * knob on a white track is one white pill; nothing says which end the knob
 * is at, so nothing says on. The panel's own copy under it is the only clue.
 *
 * It was one of eight ways a switch is drawn here. The desk's shared `Toggle`
 * (`ui/index.tsx`) follows the owner's design: on is the accent track with a
 * white knob, off is the `track` grey with a `muted` knob. The Record panel
 * drew its own; four switches in Settings and one on the remote draw a white
 * track when on and a black knob in both states, so when off the black knob
 * sits on a track that is 20% white over a near-black panel (2.0:1); the
 * Track panel draws a fourth kind, in a purple that is not the accent; the
 * Wall panel a fifth that is a white chip. Beyond switches, some controls
 * say on by text colour alone (the mixer's Graded), by a label alone
 * (Macro/Wide), or not at all (the Play screen's Save pill takes `pressed`
 * and ignores it).
 *
 * What this measures, in the browser, from computed styles, on every control
 * that says it has a state (role=switch, aria-pressed, aria-checked,
 * aria-selected, aria-current, role=tab/radio/option) and on any pill with a
 * round knob in it even when it says nothing, on the desk, every Settings
 * section, the panels the palette opens, the phone with each sheet open, the
 * Play screen and the remote:
 *
 *   a switch     the knob against its track at 3:1 or more in both states,
 *                so the knob can be seen at all (the reported one: 1.0:1);
 *                the track on against the track off at ΔE 20 or more, so the
 *                colour says on, not only where the knob is; the track on
 *                being the accent (the design: violet is "selected"); and
 *                the switch saying its state (role=switch or aria-pressed)
 *   a button     on against off at ΔE 20 or more, in the strongest of its
 *                fill, its border, its text, a ring one state has, or any
 *                part inside it (a dot, a tick), each composited over what
 *                is behind it
 *   a group      (tabs, radios, a list with one chosen) the chosen member
 *                against an unchosen one, the same way, read as they are
 *
 * Two measures, because they answer two questions. The knob against its
 * track is an edge against what is next to it: WCAG 1.4.11's 3:1, the
 * contrast a control's parts need against their surround. On against off is
 * two colours a performer must tell apart, which is a colour difference, not
 * an edge: CIE76 ΔE in Lab, where about 2 is the least difference seen at a
 * glance and 100 is black against white. WCAG's ratio is a luminance ratio
 * and blind to hue, so it would call the design's violet wash on a chosen
 * row (ΔE 20 against the grey row) and the violet border round a chosen
 * phone tile (ΔE 50) no change at all, and would call a tab's white label
 * against its neighbours' grey (ΔE 30) a 2.5:1 fail. The design's own cues
 * sit at 20 to 30 and its switches at 70; the reported knob sits at 2. So
 * the bar is 20: what the design's quietest deliberate cue measures.
 *
 * Binary controls are clicked to reach the other state and clicked back;
 * groups are read in place. Transitions are turned off before anything is
 * read, so a colour is never read mid-fade. Native checkboxes (the MIDI
 * panel's, the crash sheet's) are drawn by the browser; they are counted and
 * listed, not held. A control that changes its look with a state it does not
 * say (the dye swatches, the Wall panel's chips, the sequencer's cards) is
 * invisible to this, as it is to a screen reader: saying it is part of the
 * fix, and the floors below are what keep a run that found nothing from
 * passing.
 *
 * And a third (PLAN 35a, 2026-10-24), because ΔE 20 let through the very
 * looks the owner then reported: "I really can't tell what buttons are turned
 * on/off." A chosen tab drawn as a white label among grey ones (ΔE 30), the
 * shared Segmented's chosen item in the active grey (1.19:1 against the
 * panel), a 15% white tint: each is a difference a performer can find by
 * comparing two buttons side by side, and none is one they can read off a
 * single button across a dark room. So on against off is also held as light:
 * the fill's luminance ratio at 3:1 (WCAG 1.4.11, the contrast a state's cue
 * needs), or a ring that only one state has at 3:1 against what is behind it
 * (a colour swatch cannot change its fill; its ring is the cue). Text alone
 * does not count. The design's lit violet is 3.47:1 against the panel; the
 * old chosen segment 1.19:1, a white tint 1.12:1.
 *
 * The bars are stated once in `BARS` and printed at the top of the run. A
 * change to one is a change to a check (`docs/handoff.md`, "Check changes").
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { launchChromium } from './chromium.mjs';

const PORT = Number(process.env.SWITCHES_PORT ?? 4187);
const BASE = `http://localhost:${PORT}/`;
// The plate's resolution does not change a control's colour, and every
// millisecond the software renderer spends on it is one the page is not
// answering (layout.mjs).
const QUERY = 'debug&look=classic&dpr=0.35';
const HEADED = process.argv.includes('--head');
const SHOTS = process.env.SWITCHES_SHOTS || '';

const BARS = {
  /** A knob against its track, either state: WCAG 1.4.11. */
  knob: 3,
  /** On against off, chosen against unchosen: CIE76 ΔE, the strongest channel. */
  difference: 20,
  /** On against off as light: the fill, or a ring only one state has, as a WCAG ratio. Text alone does not count. */
  lift: 3,
  /** A switch's on track is the accent, within this much per channel (0–255). */
  accentTolerance: 8,
  /** Fewer stateful controls than this on a surface and it was not reached: red, not green. */
  minControls: { desk: 150, phone: 50, remote: 4 },
  /**
   * Fewer binary controls than this actually changed state when clicked: the
   * clicks are not landing (a re-render between read and click, a page that
   * stopped answering), and a run that reads one state of everything would
   * otherwise look like a run that read both.
   */
  minFlipped: { desk: 150, phone: 15 },
};

/** The settings sections, as the palette lists them (`lib/settingsMap.ts`): id and the name typed to find it. */
const SETTINGS_SECTIONS = [['master', 'Master'], ['mixer', 'Mixer'], ['audio-input', 'Sound'], ['room', 'Motion camera'],
  ['film', 'Film'], ['patches', 'Patches'], ['midi', 'Controller'], ['look', 'Light Show Look'], ['show', 'Show'],
  ['kaleidoscope', 'Kaleidoscope'], ['lamp', 'Lamp & Light'], ['stock', 'Film Stock'], ['camera', 'Lens'],
  ['macro', 'Macro Closeup'], ['automation', 'Automation'], ['squish', 'Squish Plate'], ['physics', 'Fluid Physics'],
  ['liquids', 'Liquids'], ['interaction', 'Manual Interaction'], ['projectors', 'Wall'], ['mapping', 'Mapping'],
  ['mark', 'Logo & Titles'], ['layers', 'Plates & LED'], ['simulation', 'Simulation']];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const notes = [];
async function serve() {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview',
    '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  await new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
    proc.stdout.on('data', d => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
    proc.stderr.on('data', d => { notes.push(String(d).trim()); });
    proc.on('exit', c => {
      clearTimeout(bail);
      reject(new Error(`preview exited ${c}${notes.length ? `: ${notes.join(' ').slice(0, 200)}` : ''}`));
    });
  });
  return proc;
}
const stopServer = (proc) => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); } };

/*
  The probe, installed on each page as `window.__sw`. Colours are parsed by
  painting them on a 1×1 canvas over black and over white: the two readings
  give the colour and its alpha for any syntax Chromium accepts (Tailwind v4
  writes `color-mix()` and oklch, which no regex should be asked to read).
  A reading is the element's fill, border and text, each composited over
  what is behind it (every ancestor's background, bottom up), plus the same
  for up to sixteen parts inside it and the strongest ring round it.
*/
const PROBE = `(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const paint = (fill, under) => {
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = under; cx.fillRect(0, 0, 1, 1);
    cx.fillStyle = fill; cx.fillRect(0, 0, 1, 1);
    return cx.getImageData(0, 0, 1, 1).data;
  };
  const parse = (s) => {
    if (!s || s === 'transparent' || s === 'none') return [0, 0, 0, 0];
    const b = paint(s, '#000'), w = paint(s, '#fff');
    const a = 1 - ((w[0] - b[0]) + (w[1] - b[1]) + (w[2] - b[2])) / (3 * 255);
    if (a <= 0.004) return [0, 0, 0, 0];
    return [b[0] / a, b[1] / a, b[2] / a, Math.min(1, a)];
  };
  const over = (top, under) => [0, 1, 2].map(i => top[3] * top[i] + (1 - top[3]) * under[i]);
  const behind = (el) => {
    const chain = []; for (let p = el.parentElement; p; p = p.parentElement) chain.push(p);
    let c = [0, 0, 0];
    for (let i = chain.length - 1; i >= 0; i--) {
      const col = parse(getComputedStyle(chain[i]).backgroundColor);
      if (col[3] > 0) c = over(col, c);
    }
    return c;
  };
  const colours = (s) => (s.match(/(rgba?\\([^)]*\\)|color\\([^)]*\\)|oklch\\([^)]*\\)|oklab\\([^)]*\\)|#[0-9a-fA-F]{3,8})/g) || []);
  const rect = (el) => el.getBoundingClientRect();
  const visible = (el) => {
    const r = rect(el); if (r.width < 3 || r.height < 3) return false;
    for (let p = el; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') return false; }
    return true;
  };
  const one = (el, under) => {
    const cs = getComputedStyle(el);
    const op = parseFloat(cs.opacity); const alpha = isFinite(op) ? op : 1;
    const bgc = parse(cs.backgroundColor); bgc[3] *= alpha;
    const fill = over(bgc, under);
    const bw = parseFloat(cs.borderTopWidth) || 0;
    const bc = parse(cs.borderTopColor); bc[3] *= alpha;
    const border = bw > 0 && bc[3] > 0.004 ? over(bc, under) : null;
    const tc = parse(cs.color); tc[3] *= alpha;
    const hasText = !!(el.textContent || '').trim() || !!el.querySelector('svg') || el.tagName === 'svg';
    const text = hasText ? over(tc, fill) : null;
    const rings = cs.boxShadow !== 'none' ? colours(cs.boxShadow) : [];
    if (cs.outlineStyle !== 'none' && (parseFloat(cs.outlineWidth) || 0) > 0) rings.push(cs.outlineColor);
    const ring = rings.map(parse).filter(c => c[3] > 0.004).map(c => over(c, under));
    return { fill, border, text, ring, painted: bgc[3] > 0.004 };
  };
  const measure = (el) => {
    const under = behind(el);
    const self = one(el, under);
    const parts = [];
    const r0 = rect(el); const area0 = Math.max(1, r0.width * r0.height);
    for (const d of el.querySelectorAll('*')) {
      if (parts.length >= 16) break;
      if (!visible(d)) continue;
      const rd = rect(d);
      parts.push({ ...one(d, behind(d)), share: (rd.width * rd.height) / area0 });
    }
    return { ...self, under, parts };
  };
  const radius = (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  const isPill = (el) => {
    const r = rect(el); if (r.width < 24 || r.height < 12 || r.height > 40) return false;
    const k = r.width / r.height; if (k < 1.5 || k > 2.6) return false;
    if (radius(el) < r.height / 2 - 1.5) return false;
    if ((el.textContent || '').trim()) return false;
    return parse(getComputedStyle(el).backgroundColor)[3] > 0.004;
  };
  const isKnob = (el, track) => {
    const r = rect(el), t = rect(track);
    return Math.abs(r.width - r.height) <= 2 && r.width >= 0.55 * t.height && r.width <= t.height && radius(el) >= r.width / 2 - 1.5;
  };
  const trackOf = (el) => isPill(el) ? el : [...el.querySelectorAll('*')].find(isPill) || null;
  const knobOf = (track) => [...track.querySelectorAll('*')].find(k => isKnob(k, track)) || null;
  const STATE_SEL = '[role="switch"],[aria-pressed],[aria-checked],[aria-selected],[aria-current],[role="tab"],[role="radio"],[role="option"],input[type="checkbox"],input[type="radio"]';
  const stateAttr = (el) => {
    if (el.tagName === 'INPUT') return 'checked';
    for (const a of ['aria-checked', 'aria-pressed', 'aria-selected', 'aria-current']) if (el.hasAttribute(a)) return a;
    return null;
  };
  const stateOf = (el, track) => {
    const a = stateAttr(el);
    if (a === 'checked') return el.checked;
    if (a) { const v = el.getAttribute(a); return v === 'true' || (a === 'aria-current' && v !== 'false' && v !== ''); }
    if (track) { const k = knobOf(track); if (k) { const kr = rect(k), tr = rect(track); return kr.left + kr.width / 2 > tr.left + tr.width / 2; } }
    return null;
  };
  const label = (el) => (el.dataset.testid || el.getAttribute('aria-label') || el.title || (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40) || el.tagName.toLowerCase());
  const keyOf = (el) => {
    const up = []; for (let p = el.parentElement; p && up.length < 2; p = p.parentElement) if (p.dataset.testid) up.push(p.dataset.testid);
    return label(el) + '|' + (stateAttr(el) || el.getAttribute('role') || 'pill') + '|' + up.join('/');
  };
  /*
    A group is read in place: tabs, radios, options, aria-selected and
    aria-current, and a run of three or more aria-pressed siblings of which
    exactly one is pressed (the phone's tools, its looks list). Two pins of
    which either may be on are two switches, not a group. The unchosen
    members may carry the attribute as false or not carry it at all (the
    settings' nav rows say aria-current only on the current one), so the
    siblings are the parent's children of the same tag.
  */
  const groupSiblings = (el) => {
    const a = stateAttr(el); const role = el.getAttribute('role');
    const scope = el.closest('[role="tablist"],[role="radiogroup"]') || el.parentElement;
    // A member is a child of the scope of the same tag as this one, or, when
    // the scope wraps each member (the segmented control puts each tab in a
    // span), the stateful element inside the wrapper.
    const kin = (s) => [...s.children].map(c => stateAttr(c) || c.tagName === el.tagName ? c : c.querySelector(STATE_SEL))
      .filter(c => c && c !== el && c.tagName === el.tagName && visible(c));
    let sibs = kin(scope);
    if (!sibs.length && scope.parentElement) sibs = kin(scope.parentElement);
    if (['aria-selected', 'aria-current'].includes(a) || ['tab', 'radio', 'option'].includes(role) || el.type === 'radio') return sibs.length ? sibs : null;
    if (a === 'aria-pressed' && sibs.length >= 2) {
      const all = [el, ...sibs];
      if (all.every(s => s.getAttribute('aria-pressed') != null) && all.filter(s => stateOf(s, null)).length === 1) return sibs;
    }
    return null;
  };
  const els = [];
  // What was measured on this page already: the desk's header is on screen
  // for every Settings section, and is read once.
  const seen = new Set();
  const groupKey = (el, sibs) => {
    const scope = el.closest('[role="tablist"],[role="radiogroup"]') || el.parentElement;
    const members = [el, ...sibs].map(label).sort();
    return (scope.dataset.testid || members[0]) + '|group|' + members.length;
  };
  const enumerate = () => {
    els.length = 0;
    const out = [];
    const push = (el, kind, track) => {
      const sibs = kind === 'native' ? null : groupSiblings(el);
      const key = sibs ? groupKey(el, sibs) : keyOf(el);
      if (seen.has(key)) return; seen.add(key);
      const i = els.push(el) - 1;
      const item = { i, key, kind, label: label(el), testid: el.dataset.testid || '', disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true', on: stateOf(el, track), said: !!stateAttr(el) };
      if (sibs) {
        item.kind = 'group';
        const all = [el, ...sibs];
        const on = all.find(s => stateOf(s, null));
        const off = all.find(s => !stateOf(s, null));
        item.on = !!on;
        item.group = key.split('|')[0];
        item.label = on ? label(on) : label(el);
        item.testids = all.map(s => s.dataset.testid).filter(Boolean);
        // Greyed only when every member is: one locked option is not the group.
        item.disabled = all.every(s => !!s.disabled || s.getAttribute('aria-disabled') === 'true');
        if (on && off) { item.a = measure(on); item.b = measure(off); item.pair = label(off); item.i = els.push(on) - 1; item.j = els.push(off) - 1; }
      }
      out.push(item);
    };
    for (const el of document.querySelectorAll(STATE_SEL)) {
      if (!visible(el)) continue;
      if (el.tagName === 'INPUT') { push(el, 'native', null); continue; }
      const track = trackOf(el);
      push(el, track && knobOf(track) ? 'switch' : 'button', track);
    }
    for (const b of document.querySelectorAll('button,[role="button"]')) {
      if (!visible(b) || b.closest(STATE_SEL)) continue;
      const track = trackOf(b);
      if (track && knobOf(track)) push(b, 'switch', track);
    }
    return out;
  };
  /*
    The element read or clicked, found again by its test id when a re-render
    replaced it. A control that says a state now includes the desk's Choose
    buttons (which ride here, which are on the recipe), and pressing one and
    pressing it back remounts the panel under it: the Evolve switch read before
    was a node no longer in the page, and a click on it changed nothing.
  */
  const live = (i) => {
    let el = els[i];
    if (!el.isConnected && el.dataset.testid) {
      // Only an id that names one control: two with one id (the remote's
      // Blackouts) would be a click on whichever came first.
      const again = document.querySelectorAll('[data-testid="' + el.dataset.testid + '"]');
      if (again.length === 1) els[i] = el = again[0];
    }
    return el;
  };
  const read = (i) => {
    const el = live(i); const track = trackOf(el);
    const r = { on: stateOf(el, track), body: measure(el) };
    if (track) { r.track = measure(track); const k = knobOf(track); if (k) r.knob = measure(k); }
    return r;
  };
  const click = (i) => { const el = live(i); el.scrollIntoView({ block: 'center' }); el.click(); };
  const accent = () => parse(getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#8B5CF6');
  const token = (n) => parse(getComputedStyle(document.documentElement).getPropertyValue('--color-' + n).trim() || '#000');
  /** The colours an on may be drawn in: lit, live (red), ok (green) and the accent a switch's track is. */
  const onColours = () => ['lit', 'live', 'ok', 'accent'].map(n => ({ n, c: token(n) }));
  window.__sw = { enumerate, read, click, accent, onColours, els };
})();`;

const NO_FADE = '*, *::before, *::after { transition: none !important; animation-duration: 0s !important; }';

// ── Colour arithmetic, node side ──────────────────────────────────────
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { if (!a || !b) return 0; const x = lum(a) + 0.05, y = lum(b) + 0.05; return x > y ? x / y : y / x; };
/** sRGB → CIE Lab (D65), for CIE76 ΔE: the Euclidean distance in Lab. */
const lab = ([r, g, b]) => {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 1.0;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const dE = (a, b) => { if (!a || !b) return 0; const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const hex = (c) => c ? '#' + c.slice(0, 3).map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('') : '-';
const fmt = (x) => x == null ? '-' : x.toFixed(x >= 10 ? 0 : 1);
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Two readings of a control (on and off, or chosen and unchosen): the strongest channel that tells them apart, as ΔE. */
function difference(a, b, { parts = true } = {}) {
  const chan = (p, q) => {
    const fill = dE(p.fill, q.fill);
    const border = p.border && q.border ? dE(p.border, q.border) : (p.border ? dE(p.border, q.fill) : (q.border ? dE(q.border, p.fill) : null));
    const text = p.text && q.text ? dE(p.text, q.text) : null;
    return { fill, border, text };
  };
  const own = chan(a, b);
  // A ring one state has and the other lacks, against the surround.
  const ringOf = (p) => Math.max(0, ...p.ring.map(c => dE(c, a.under)));
  const ring = a.ring.length || b.ring.length ? Math.abs(ringOf(a) - ringOf(b)) : null;
  // The parts inside, paired by position: for one control read twice. Two
  // members of a group have their own content (a liquid tile's own bottle
  // swatch), which would tell them apart whatever their state, so for a
  // group the parts are reported and not counted.
  let part = null;
  const n = Math.min(a.parts.length, b.parts.length);
  for (let i = 0; i < n; i++) { const c = chan(a.parts[i], b.parts[i]); part = Math.max(part ?? 0, c.fill, c.border ?? 0, c.text ?? 0); }
  const counted = [own.fill, own.border ?? 0, own.text ?? 0, ring ?? 0, parts ? (part ?? 0) : 0];
  const best = Math.max(...counted);
  const by = ['fill', 'border', 'text', 'ring', 'a part inside'][counted.indexOf(best)];
  return { best, by, ...own, ring, part };
}

/**
 * Two readings as light rather than colour: the fill's luminance ratio, or a
 * ring one of them has and the other lacks against what is behind it. For a
 * control read twice the parts inside count too (a dot, a tick, a lit chip
 * inside a row); across two members of a group they do not, as above.
 */
function lift(a, b, { parts = true } = {}) {
  /*
    A fill counts only the right way round and in a colour that means on: the
    on fill brighter than the off one, and within the tolerance of lit, live,
    ok or the accent (the skeptic's, 2026-10-24: a ratio is symmetric, so a
    button dark when on and white when off, or an amber chosen fill, would
    pass on light alone). A part inside counts only if it is at least
    PART_SHARE of the control, so a 3 px dot does not carry the cue.
  */
  const meansOn = (c) => onColours.some(({ c: t }) => Math.max(...[0, 1, 2].map(k => Math.abs(c[k] - t[k]))) <= BARS.accentTolerance);
  const counts = (p, q) => lum(p) > lum(q) && meansOn(p) ? ratio(p, q) : 1;
  const fill = counts(a.fill, b.fill);
  const ringOf = (p) => Math.max(1, ...p.ring.map(c => ratio(c, p.under)));
  const ring = a.ring.length && !b.ring.length ? ringOf(a) : (b.ring.length && !a.ring.length ? ringOf(b) : 1);
  let part = 1;
  if (parts) for (let i = 0; i < Math.min(a.parts.length, b.parts.length); i++) {
    if (a.parts[i].share >= PART_SHARE) part = Math.max(part, counts(a.parts[i].fill, b.parts[i].fill));
  }
  const best = Math.max(fill, ring, part);
  return { best, by: best === fill ? 'fill' : best === ring ? 'ring' : 'a part inside', fill, ring, part, raw: ratio(a.fill, b.fill) };
}
/** The least share of a control's area a part inside must cover for its fill to carry the cue. */
const PART_SHARE = 0.15;
/** Read once from the page: the colours an on may be drawn in. */
let onColours = [];
const ratioOf = (x) => `${x.toFixed(2)}:1`;
/** Disabled groups whose light was not held (see the group's reading). */
const dimmed = [];

const rows = [];
const surfaceCounts = { desk: 0, phone: 0, remote: 0 };
const surfaceFlips = { desk: 0, phone: 0, remote: 0 };
const sectionsReached = [];
const named = new Set();

async function visit(page, where, surface, opts = {}) {
  const items = await page.evaluate(() => window.__sw.enumerate());
  const accent = await page.evaluate(() => window.__sw.accent());
  onColours = await page.evaluate(() => window.__sw.onColours());
  surfaceCounts[surface] += items.length;
  let flipped = 0;
  const detailOf = (j, a, b) => `fill ${hex(a.fill)}/${hex(b.fill)} ${fmt(j.fill)}, border ${fmt(j.border)}, text ${fmt(j.text)}, ring ${fmt(j.ring)}, inside ${fmt(j.part)}`;
  for (const it of items) {
    for (const id of it.testids ?? [it.testid]) if (id) named.add(id);
    if (it.kind === 'native') { rows.push({ where, label: it.label, kind: 'native', verdict: 'exempt' }); continue; }
    if (it.kind === 'group') {
      if (!it.a || !it.b) { rows.push({ where, label: it.group, kind: 'group', verdict: 'unmeasured', note: it.on ? 'no unchosen member beside it' : 'none chosen here' }); continue; }
      let j = difference(it.a, it.b, { parts: false });
      let ok = j.best >= BARS.difference;
      let how = `against ${it.pair}`;
      let l = lift(it.a, it.b, { parts: false });
      let lit = l.best >= BARS.lift;
      // A group whose cue is a part inside (the Play screen's look tiles ring
      // their swatch) cannot be read across two members, each with its own
      // content. So the choice is moved to the other member and the chosen
      // one is read again, unchosen: the same element in both states, where
      // its parts do count. Put back afterwards.
      if ((!ok || !lit) && !it.disabled) {
        const before = await scrims(page);
        try {
          await page.evaluate(k => window.__sw.click(k), it.j);
          const moved = await changed(page, it.i, true);
          if (moved && moved.on === false) {
            const twice = difference(it.a, moved.body, { parts: true });
            if (!ok && twice.best >= BARS.difference) { j = twice; ok = true; how = 'read chosen, then unchosen'; }
            const twiceLit = lift(it.a, moved.body, { parts: true });
            if (!lit && twiceLit.best >= BARS.lift) { l = twiceLit; lit = true; }
            await page.evaluate(k => window.__sw.click(k), it.i);
            await changed(page, it.i, false);
          }
        } catch { /* the choice would not move: the in-place reading stands */ }
        for (const id of (await scrims(page)).filter(x => !before.includes(x))) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); if ((await scrims(page)).includes(id)) await tap(page, id); }
      }
      check(`${where}: ${it.group}: ${it.label} (chosen) ${how}: ΔE ${fmt(j.best)} by ${j.by}`, ok, detailOf(j, it.a, it.b));
      // A group greyed out as a whole (the remote's, until a laptop is
      // connected) is dimmed on purpose, chosen and unchosen alike; its light
      // is read where it is enabled, and the run says how many it skipped.
      if (it.disabled && !lit) { dimmed.push(`${where}: ${it.group}`); lit = true; }
      else check(`${where}: ${it.group}: ${it.label} (chosen) lights against ${it.pair}: ${ratioOf(l.best)} by ${l.by}`, lit, `fill ${hex(it.a.fill)}/${hex(it.b.fill)} ${ratioOf(l.fill)}, ring ${ratioOf(l.ring)}`);
      rows.push({ where, label: it.group, kind: 'group', verdict: ok && lit ? 'ok' : 'FAIL', best: j.best, by: j.by, lift: l.best });
      continue;
    }
    // A binary control: read it, flip it, read it again, put it back. A
    // click can open a sheet over the desk (a status dot opens the sound
    // panel); whatever it opened is closed again before the next control.
    const first = await page.evaluate(i => window.__sw.read(i), it.i);
    let second = null;
    if (SHOTS && it.kind === 'switch') await shoot(page, it, first.on);
    if (!it.disabled) {
      const before = await scrims(page);
      try {
        await page.evaluate(i => window.__sw.click(i), it.i);
        second = await changed(page, it.i, first.on);
        if (second && SHOTS && it.kind === 'switch') await shoot(page, it, second.on);
        await page.evaluate(i => window.__sw.click(i), it.i);
        if (second) await changed(page, it.i, second.on);
      } catch { second = null; }
      const after = await scrims(page);
      for (const id of after.filter(x => !before.includes(x))) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        if ((await scrims(page)).includes(id)) { await tap(page, id); await page.waitForTimeout(300); }
      }
    }
    if (second) flipped++;
    const on = first.on === true ? first : (first.on === false ? second : (second?.on === true ? second : null));
    const off = first.on === false ? first : (first.on === true ? second : (second?.on === false ? second : null));
    const name = `${where}: ${it.label}`;
    if (it.kind === 'switch') {
      const detail = [];
      let ok = true;
      for (const [n, s] of [['on', on], ['off', off]]) {
        if (!s?.track || !s?.knob) continue;
        const r = ratio(s.knob.fill, s.track.fill);
        detail.push(`knob ${n} ${hex(s.knob.fill)} on ${hex(s.track.fill)} ${r.toFixed(1)}:1`);
        if (r < BARS.knob) ok = false;
      }
      if (on?.track && off?.track) {
        const d = dE(on.track.fill, off.track.fill);
        detail.push(`track on ${hex(on.track.fill)} / off ${hex(off.track.fill)} ΔE ${fmt(d)}`);
        if (d < BARS.difference) ok = false;
      } else {
        // A switch that will not flip is a switch this cannot read: red, so a
        // run whose clicks stopped landing is not a green one. Disabled is
        // the one excuse (the remote's, until a laptop is connected).
        if (!it.disabled) ok = false;
        detail.push(`${on ? 'off' : 'on'} state not reached${it.disabled ? ' (disabled here)' : ' (did not change on click)'}`);
      }
      if (on?.track) {
        const want = [0, 1, 2].map(k => accent[3] * accent[k] + (1 - accent[3]) * on.track.under[k]);
        const d = Math.max(...[0, 1, 2].map(k => Math.abs(on.track.fill[k] - want[k])));
        if (d > BARS.accentTolerance) { ok = false; detail.push(`on track is not the accent (${hex(accent)})`); }
      }
      if (!it.said) { ok = false; detail.push('says no state (no role=switch, aria-checked or aria-pressed)'); }
      check(`${name} (switch)`, ok, detail.join('; '));
      rows.push({ where, label: it.label, kind: 'switch', verdict: ok ? 'ok' : 'FAIL', note: detail.join('; ') });
    } else {
      if (!on || !off) {
        rows.push({ where, label: it.label, kind: 'button', verdict: 'unmeasured', note: `${on ? 'off' : 'on'} state not reached${it.disabled ? ' (disabled here)' : ' (did not change on click)'}` });
        continue;
      }
      const j = difference(on.body, off.body);
      const ok = j.best >= BARS.difference;
      check(`${name}: on against off ΔE ${fmt(j.best)} by ${j.by}`, ok, detailOf(j, on.body, off.body));
      const l = lift(on.body, off.body);
      const lit = l.best >= BARS.lift;
      check(`${name}: on lights against off ${ratioOf(l.best)} by ${l.by}`, lit, `fill ${hex(on.body.fill)}/${hex(off.body.fill)} ${ratioOf(l.fill)}, ring ${ratioOf(l.ring)}, inside ${ratioOf(l.part)}`);
      rows.push({ where, label: it.label, kind: 'button', verdict: ok && lit ? 'ok' : 'FAIL', best: j.best, by: j.by, lift: l.best });
    }
  }
  surfaceFlips[surface] += flipped;
  console.log(`      ${where}: ${items.length} new controls, ${flipped} flipped`);
  return items.length;
}

/**
 * The control's reading once its state is not `was`: polled, since a click
 * re-renders on React's schedule, not on a timer. Null when it never changes
 * (a momentary button, a control whose click did not land), after 400 ms.
 */
async function changed(page, i, was) {
  const until = Date.now() + 400;
  while (Date.now() < until) {
    const r = await page.evaluate(i => window.__sw.read(i), i);
    if (r.on !== was) return r;
    await page.waitForTimeout(25);
  }
  return null;
}

async function shoot(page, it, state) {
  const h = await page.evaluateHandle(i => window.__sw.els[i], it.i).catch(() => null);
  const el = h?.asElement();
  if (!el) return;
  await el.screenshot({ path: `${SHOTS}/${slug(it.testid || it.label)}-${state === true ? 'on' : state === false ? 'off' : 'x'}.png` }).catch(() => {});
}

async function open(url, viewport) {
  const ctx = await browser.newContext(viewport);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url, { waitUntil: 'load' }));
  await page.waitForTimeout(1200);
  await page.addStyleTag({ content: NO_FADE });
  await page.evaluate(PROBE);
  return page;
}

const count = async (page, testId) => page.getByTestId(testId).count();
/** A click from inside the page: it lands whatever a scrim thinks; this is a colour check, not a reach check (layout.mjs is that). */
const tap = (page, testId) => page.evaluate(id => { const el = document.querySelector(`[data-testid="${id}"]`); if (el) el.click(); return !!el; }, testId);
const scrims = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid$="scrim"]')].map(e => e.dataset.testid));
const appears = async (page, testId, tries = 15) => {
  for (let i = 0; i < tries; i++) { if (await count(page, testId)) return true; await page.waitForTimeout(200); }
  return false;
};

const server = await serve();
const browser = await launchChromium(chromium, { headless: !HEADED });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const started = Date.now();

try {
  console.log(`bars: knob against track ${BARS.knob}:1 (WCAG 1.4.11); on against off ΔE ${BARS.difference} (CIE76) and ${BARS.lift}:1 in light (fill or ring); a switch's on track is the accent (±${BARS.accentTolerance}); at least ${JSON.stringify(BARS.minControls)} controls`);

  // ── The desk ────────────────────────────────────────────────────────
  const desk = await open(`${BASE}?${QUERY}`, { viewport: { width: 1440, height: 900 } });
  const palette = async (query, rowId) => {
    await desk.keyboard.press('Control+k');
    if (!await appears(desk, 'palette-input', 10)) return false;
    await desk.getByTestId('palette-input').fill(query);
    await desk.waitForTimeout(150);
    if (!await appears(desk, `palette-row-${rowId}`, 10)) { await desk.keyboard.press('Escape'); return false; }
    await tap(desk, `palette-row-${rowId}`);
    await desk.waitForTimeout(500);
    return true;
  };
  // Each layout of the desk, by its tab (the desk opens on Build, so the
  // first is tapped like the rest rather than assumed).
  for (const [mode, name] of [['design', 'Build'], ['perform', 'Gig'], ['loadin', 'Load-in'], ['sequence', 'Sequence'], ['sound', 'Sound']]) {
    if (!await tap(desk, `mode-segmented-${mode}`)) { console.log(`      desk ${name}: no tab`); continue; }
    await desk.waitForTimeout(400);
    await visit(desk, `desk ${name}`, 'desk');
  }
  await tap(desk, 'mode-segmented-perform');
  for (const [id, name] of SETTINGS_SECTIONS) {
    const opened = await palette(`Settings: ${name}`, `settings-${id}`)
      && await appears(desk, `settings-nav-${id}`, 10)
      && await desk.locator(`[data-testid="settings-nav-${id}"][aria-current]`).count() > 0;
    if (!opened) { console.log(`      settings ${id}: not reached`); continue; }
    sectionsReached.push(id);
    await visit(desk, `settings ${id}`, 'desk');
  }
  await desk.keyboard.press('Escape');
  for (const [row, name, landmark] of [['open-midi', 'MIDI', 'midi-soft'], ['open-songs', 'Songs', 'songs-follow'], ['open-seq', 'Sequences', 'seq-export'], ['open-stage', 'Stage', null], ['record-studio', 'Record', 'record-audio-toggle']]) {
    const opened = await palette(name, row) && (!landmark || await appears(desk, landmark, 10));
    check(`${name} opened from the palette`, opened);
    if (!opened) continue;
    await visit(desk, name, 'desk');
    await desk.keyboard.press('Escape');
    await desk.waitForTimeout(300);
  }
  if (await count(desk, 'crash-report-button')) {
    await tap(desk, 'crash-report-button');
    check('the crash report opened', await appears(desk, 'crash-with-shot', 10));
    await visit(desk, 'Crash report', 'desk');
    await desk.keyboard.press('Escape');
  }
  await desk.context().close();

  // ── The phone ───────────────────────────────────────────────────────
  const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const phone = await open(`${BASE}?${QUERY}&play=0`, PHONE);
  await visit(phone, 'phone stage', 'phone');
  for (const sheet of ['dye', 'looks', 'sound', 'play', 'mix', 'more']) {
    if (!await count(phone, `phone-open-${sheet}`)) { console.log(`      phone ${sheet}: no opener`); continue; }
    await tap(phone, `phone-open-${sheet}`);
    await phone.waitForTimeout(500);
    await visit(phone, `phone ${sheet}`, 'phone');
    await tap(phone, 'phone-sheet-scrim');
    await phone.waitForTimeout(400);
  }
  await phone.context().close();
  const play = await open(`${BASE}play?${QUERY}`, PHONE);
  await visit(play, 'phone Play', 'phone');
  if (await tap(play, 'play-handle')) {
    await play.waitForTimeout(500);
    await visit(play, 'phone Play sheet', 'phone');
  }
  await play.context().close();

  // ── The remote ──────────────────────────────────────────────────────
  const remote = await open(`${BASE}?remote&${QUERY}`, PHONE);
  await visit(remote, 'remote draw', 'remote');
  if (await count(remote, 'draw-controls')) {
    await tap(remote, 'draw-controls');
    await remote.waitForTimeout(500);
    await visit(remote, 'remote controls', 'remote');
  }
  await remote.context().close();

  // ── Was anything measured at all ────────────────────────────────────
  check(`every Settings section reached: ${sectionsReached.length}/${SETTINGS_SECTIONS.length}`, sectionsReached.length === SETTINGS_SECTIONS.length,
    SETTINGS_SECTIONS.map(([id]) => id).filter(id => !sectionsReached.includes(id)).join(' ') || '');
  for (const [s, min] of Object.entries(BARS.minControls)) {
    check(`${s}: at least ${min} stateful controls found`, surfaceCounts[s] >= min, `${surfaceCounts[s]}`);
  }
  for (const [s, min] of Object.entries(BARS.minFlipped)) {
    check(`${s}: at least ${min} controls changed state when clicked`, surfaceFlips[s] >= min, `${surfaceFlips[s]}`);
  }
  for (const id of ['record-audio-toggle', 'song-detection-toggle', 'flash-limit-master', 'toggle-evolve', 'mode-segmented-perform', 'phone-open-dye', 'play-follow']) {
    check(`${id} was among them`, named.has(id));
  }

  const failed = rows.filter(r => r.verdict === 'FAIL');
  const exempt = rows.filter(r => r.verdict === 'exempt').length;
  const unmeasured = rows.filter(r => r.verdict === 'unmeasured');
  console.log(`\n${rows.length} controls in ${((Date.now() - started) / 1000).toFixed(0)}s: ${rows.filter(r => r.verdict === 'ok').length} ok, ${failed.length} under the bar, ${unmeasured.length} with one state unreachable here, ${exempt} native (browser-drawn, exempt)`);
  for (const r of unmeasured) console.log(`      ? ${r.where}: ${r.label} — ${r.note}`);
  for (const d of dimmed) console.log(`      ~ ${d}: disabled here, its light not held`);
} finally {
  await browser.close();
  stopServer(server);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — failed: ${failed.length}` : ''}`);
process.exit(failed.length ? 1 : 0);
