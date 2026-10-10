/**
 * The intro: ChromaGlass's mark over the plate while the show opens.
 *
 * What was asked: an intro on the first load that covers the latency of what
 * loads behind it. What it covers, measured in PLAN.md 14v: on a cold shader
 * cache the desk is up within a second and the plate then sits black on its
 * starting frame for nine to seventeen seconds on CI's Mac while the opening's
 * pipelines compile (`npm run startup`), and for the second or two of the
 * download before that the page is a black rectangle (`main.tsx`'s Loading).
 *
 * So the intro is drawn by the page itself, in `index.html`, styled there,
 * and painted on the first paint, before any of the app has arrived: a video
 * would have been one more download in front of the show it is covering for.
 * It moves only by transform and opacity, which the compositor runs on its
 * own thread, because the page's thread is held for seconds while Chromium
 * starts the GPU. Once the app is up the plate's frame takes it in
 * (`adoptIntro`), so on the desk it sits in the preview's hole and never over
 * the controls, and on the phone it sits under the dock. It leaves on the
 * plate's first frame (`introPlateFrame`), cross-fading into it: it never
 * holds the plate back, it is only ever up while there is nothing to see.
 *
 * It starts still, and moves once the opening's render pipelines are built
 * (`introMove`, from `Quiet` in `gpu/prepare.ts`). What was reported: the
 * Mac's `npm run startup` went red on "no stop in the opening" on about half
 * of 10 October's runs, across PRs that never touched the opening (2.17 and
 * 2.57 s against a 2 s bar). What was measured: over the open shard's 176
 * runs from 27 September, the show's longest wait for a frame was a median
 * 0.53 s (p90 0.78) on the 57 before this intro merged, and 1.73 s (p90
 * 2.20, 19 of 119 over two seconds) on every one since; in the same hour the
 * GPU device went from a median 0.09 s to be given to 1.63 s. A moving
 * picture is a new frame for the compositor to present every sixtieth of a
 * second, and it presents through the GPU process, which on a cold Mac is
 * busy for seconds starting the device and then compiling the opening's
 * first pipelines; the frame waits there, and so does the next, and so does
 * the device itself. Held still, a frame has nothing new in it and needs
 * nothing of the GPU process. On CI's Mac, three cold openings each way
 * (PR #335's trials): as it was, 2.35, 2.13 and 2.32 s without a frame;
 * still from the first paint, 1.18, 0.85 and 0.92 s; without the intro at
 * all, 0.47, 0.47 and 0.82 s; without its colour pools but moving, 1.93,
 * 2.33 and 2.17 s, so it is the motion and not what moves. Holding it still
 * only around the render compiles (#283) had caught the second half of
 * that and not the first. On a warm machine the device comes at once and
 * the compiles are the cache's, so it starts turning within a second or so;
 * cold, it is a still mark for the few seconds the GPU is busy, where moving
 * it froze anyway, in stops nobody chose.
 *
 * Never on the remote or a cast (the projector's window and the network
 * display are casts): `index.html` hides it there before the first paint.
 * Never a target either (`pointer-events: none`): a press reaches whatever is
 * under it, and a press on the plate, or any key, takes it away early.
 *
 * `window.__cgIntro` keeps its times, from the page's start, for
 * `npm run intro` and `npm run startup` to read. When it first showed is not
 * kept: it is in the page from its first frame, which `npm run intro` reads
 * from outside.
 */

export type IntroOut = 'plate' | 'failure' | 'skip' | 'slow' | 'elsewhere' | 'cap';

interface IntroRecord {
  /** When the plate's frame took it in. */
  adopted?: number;
  /** When it began to leave, and why. */
  out?: number;
  reason?: IntroOut;
  /** When it was gone from the page. */
  gone?: number;
  /** The stretches it was held still while the opening's render pipelines compiled, [from, to] (`introStill`). */
  still?: [number, number | null][];
}

/**
 * The longest it stays. Past this a plate that has not drawn is not opening,
 * and whatever the app says about it (the failure screen, the lost device's
 * caption) matters more than a picture. CI's Mac has taken up to seventeen
 * seconds to a first step on an empty shader cache (PLAN.md 14v).
 */
const CAP_MS = 60_000;
/** The fade's length in `index.html` (`transition: opacity 0.9s`), and a little over. */
const FADE_MS = 1000;

const record: IntroRecord = {};
let out = false;
/** Takes down what `installIntro` put up: the cap's timer and the skip's listeners. */
let leaving: () => void = () => {};

function node(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('cg-intro');
}

/**
 * Start watching for the reasons to leave. Called once, by `main.tsx`, before
 * the app is imported: the slow download is when a key or a tap most wants
 * to be heard.
 */
export function installIntro(show: boolean): void {
  try { (window as unknown as { __cgIntro?: IntroRecord }).__cgIntro = record; } catch { /* a frozen window */ }
  const el = node();
  if (!el) return;
  if (!show) { introOut('elsewhere'); return; }
  // Still since the first paint (`index.html` starts it so): kept from 0,
  // the page's start, until `introMove` lets it go.
  if (el.classList.contains('cg-still')) (record.still ??= []).push([0, null]);
  const cap = setTimeout(() => introOut('cap'), Math.max(0, CAP_MS - performance.now()));
  const skip = (e: Event) => {
    if (out) return;
    if (e instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) return;
    if (e instanceof PointerEvent) {
      // A press on the desk is the desk's, and leaves the plate's intro up:
      // only a press on the intro itself, where it shows, takes it away.
      const r = node()?.getBoundingClientRect();
      if (!r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    }
    introOut('skip');
  };
  window.addEventListener('keydown', skip, { capture: true });
  window.addEventListener('pointerdown', skip, { capture: true, passive: true });
  leaving = () => {
    clearTimeout(cap);
    window.removeEventListener('keydown', skip, { capture: true });
    window.removeEventListener('pointerdown', skip, { capture: true });
  };
}

/**
 * Into the plate's frame, from over the window.
 *
 * Moving a node restarts its CSS animations, so each one is put back where it
 * was: the swirl turning on from where it had got to, rather than jumping
 * back to the start as the desk appears.
 */
export function adoptIntro(slot: HTMLElement | null): void {
  const el = node();
  if (!el || !slot || out || el.parentElement === slot) return;
  const at = new Map<Element, number>();
  for (const a of el.getAnimations({ subtree: true })) {
    const t = a.currentTime;
    const target = (a.effect as KeyframeEffect | null)?.target;
    if (target && typeof t === 'number') at.set(target, t);
  }
  slot.appendChild(el);
  el.classList.add('cg-in-plate');
  for (const a of el.getAnimations({ subtree: true })) {
    const target = (a.effect as KeyframeEffect | null)?.target;
    const t = target ? at.get(target) : undefined;
    if (t !== undefined) a.currentTime = t;
  }
  record.adopted = performance.now();
}

/** Fade out and then leave the page. Once; every later call is nothing. */
export function introOut(reason: IntroOut): void {
  if (out) return;
  out = true;
  leaving();
  record.out = performance.now();
  record.reason = reason;
  const el = node();
  if (!el) return;
  const gone = () => { if (el.isConnected) { el.remove(); record.gone = performance.now(); } };
  // Nowhere to fade from: the remote or a cast never showed it.
  if (reason === 'elsewhere' || getComputedStyle(el).display === 'none') { gone(); return; }
  el.classList.add('cg-out');
  el.addEventListener('transitionend', gone, { once: true });
  setTimeout(gone, FADE_MS);
}

/**
 * The plate's frame loop, after each draw: the first frame drawn after the
 * plate has stepped (or, with the show paused, the first frame drawn at all)
 * is what the intro was covering for. A plain read until then, nothing after.
 */
export function introPlateFrame(stepped: boolean): void {
  if (!out && stepped) introOut('plate');
}

/**
 * Held still while the opening's render pipelines compile (`Quiet` in
 * `gpu/prepare.ts` says why: a moving intro there stopped the page's frames
 * for as long as the display compiled). Paused, not hidden: the picture
 * stays exactly where it was and moves on from there. The first opening
 * finds it still already, from the first paint (the top of this file says
 * why); a later one, a lost device's replacement, holds it here.
 *
 * The promise resolves once the page has drawn two frames with it paused,
 * so the last moving frame is presented before the compile is asked for,
 * and never later than a fifth of a second: a hidden tab draws no frames,
 * and the opening must not wait on one. Nothing to hold (gone, leaving, or
 * never shown) resolves at once.
 */
export function introStill(): Promise<void> {
  const el = node();
  if (out || !el || el.classList.contains('cg-still')) return Promise.resolve();
  el.classList.add('cg-still');
  (record.still ??= []).push([performance.now(), null]);
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 200);
    requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
  });
}

/** And moving again. */
export function introMove(): void {
  const el = node();
  if (!el?.classList.contains('cg-still')) return;
  el.classList.remove('cg-still');
  const last = record.still?.[record.still.length - 1];
  if (last && last[1] === null) last[1] = performance.now();
}

/** Whether the intro is still up (not yet leaving). */
export function introUp(): boolean {
  return !out && node() !== null;
}
