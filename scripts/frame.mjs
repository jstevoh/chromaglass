/**
 * One way to photograph the plate, whichever engine drew it
 * (docs/webgpu-plan.md, P5).
 *
 * A presented WebGPU canvas cannot be copied out with `drawImage`: it answers
 * black, which is not an error and not distinguishable from a black plate —
 * the worst kind of wrong reading, because every check that takes it goes on
 * to measure nothing and say so confidently. So the frame is photographed by
 * the stage instead, in the task that draws it, through
 * `chromaglassDebug().grabFrame`.
 *
 * Every harness that reads pixels uses this, so there is one implementation of
 * the difference rather than one per harness.
 */

/**
 * There is one engine (docs/webgpu-plan.md, P7), so a harness no longer
 * chooses: these two are kept as the seam where a second one would arrive,
 * and they say the same thing every time.
 */
export const engineName = () => 'webgpu';

/** Nothing: the app has no renderer flag any more. */
export const engineQuery = () => '';

/**
 * Is this label a GPU solver's?
 *
 * Five harnesses had `/^GPU/` written into them, and the stage says
 * `WebGPU`, so each of them decided in turn that a run on the port was a run
 * on the CPU fallback — `bench` recorded every rung it reached as one it
 * never reached, `bubbles` refused to start, and `shots` printed "software
 * rasterisation — these will not look like the app on a real machine" over
 * pictures taken on an M4. Use this, not a prefix test of your own; the
 * fifth one was found two sweeps after the first four.
 */
export const isGpuEngine = (label) => /^(GPU|WebGPU)\b/.test(label ?? '');


/**
 * Install `window.__cgFrame(w, h)` for every navigation on this page. It
 * answers with the plate scaled to `w`×`h` as a flat RGBA array, or null if
 * there is no canvas yet.
 *
 * A FLAT ARRAY — not an ImageData, and not `{ data }`. Two harnesses read
 * `f.data` off it, got undefined, and treated that as "no frame to judge":
 * `evolve`'s flatness check, the one written to catch a plate that has gone
 * to a single colour, skipped every frame it ever took and reported "0 of
 * them flat" for months while the fault it was looking for was on screen.
 * If you cannot read the plate, fail — never return a value that a check
 * will read as consent.
 */
export const installFrameReader = (page) => page.addInitScript(() => {
  /**
   * What the last read did, for a check that got an answer it did not like.
   * A black frame and a frame that could not be read at all look identical
   * once they are an array of zeros, and the difference is the whole
   * diagnosis.
   */
  window.__cgFrameLast = null;

  window.__cgFrame = async (w, h) => {
    const canvas = document.querySelector('#liquid-canvas') ?? document.querySelector('canvas');
    if (!canvas) { window.__cgFrameLast = { via: 'no canvas' }; return null; }
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    const dbg = window.chromaglassDebug?.();
    const grab = dbg?.grabFrame;
    const note = { via: grab ? 'grabFrame' : 'drawImage', engine: dbg?.engine ?? null };
    if (grab) {
      let g = null;
      // A decline is waited out rather than measured; see `__cgShot` below
      // for why a frame the stage did not paint reads as a black plate.
      for (let tries = 0; tries < 8; tries++) {
        g = null;
        try { g = await grab(); } catch (e) { note.threw = String(e).slice(0, 120); break; }
        if (!g || g.painted !== false) break;
        note.declined = (note.declined ?? 0) + 1;
        await new Promise((done) => requestAnimationFrame(done));
      }
      if (!g) { window.__cgFrameLast = { ...note, got: 'nothing' }; return null; }
      if (g.painted === false) {
        window.__cgFrameLast = { ...note, got: 'the stage declined to paint every frame asked for' };
        return null;
      }
      note.size = [g.width, g.height];
      // The canvas is opaque by configuration (`alphaMode: 'opaque'`), so
      // what the shader happened to leave in alpha is not part of the
      // picture — and a zero there would make `drawImage` composite the
      // whole frame away to nothing, which reads exactly like a black plate.
      let minA = 255, maxA = 0, lit = 0;
      for (let i = 3; i < g.pixels.length; i += 4) {
        if (g.pixels[i] < minA) minA = g.pixels[i];
        if (g.pixels[i] > maxA) maxA = g.pixels[i];
        g.pixels[i] = 255;
      }
      for (let i = 0; i < g.pixels.length; i += 4) {
        if (Math.max(g.pixels[i], g.pixels[i + 1], g.pixels[i + 2]) > 8) lit++;
      }
      note.alpha = [minA, maxA];
      note.lit = +(lit / (g.pixels.length / 4)).toFixed(3);
      const full = document.createElement('canvas');
      full.width = g.width; full.height = g.height;
      full.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(g.pixels), g.width, g.height), 0, 0);
      ctx.drawImage(full, 0, 0, w, h);
    } else {
      // No `grabFrame` means the show has not started yet, or the debug hook
      // is off. Reading the canvas directly answers black on this engine, so
      // it is left for the caller's account to report rather than quietly
      // producing a frame that means nothing.
      window.__cgFrameLast = { ...note, got: 'no grabFrame — nothing to read' };
      return null;
    }
    const data = [...ctx.getImageData(0, 0, w, h).data];
    let scaled = 0;
    for (let i = 0; i < data.length; i += 4) scaled += (data[i] + data[i + 1] + data[i + 2]) / 3;
    note.scaled = +(scaled / (data.length / 4) / 255).toFixed(4);
    window.__cgFrameLast = note;
    return data;
  };
  /**
   * The plate at its own size, kept in the page as `ImageData` under
   * `window.__shots[slot]`.
   *
   * Some harnesses compare whole frames and do the arithmetic in the page,
   * because what crosses the wire otherwise is two million numbers. They get
   * the same engine-awareness as `__cgFrame` and the same account of the
   * read; what they keep is the picture itself.
   */
  window.__cgShot = async (slot) => {
    const canvas = document.querySelector('#liquid-canvas') ?? document.querySelector('canvas');
    if (!canvas) { window.__cgFrameLast = { via: 'no canvas' }; return null; }
    const dbg = window.chromaglassDebug?.();
    const grab = dbg?.grabFrame;
    const note = { via: grab ? 'grabFrame' : 'drawImage', engine: dbg?.engine ?? null, slot };
    let image;
    if (grab) {
      let g = null;
      /*
        A frame the stage declined to paint is not a black picture. It is no
        picture.

        The painter has a frame or two with nothing to draw from while a rung
        change disposes one solver and builds the next, and it returns false
        for those. A decline leaves the frame's target exactly as it was
        acquired, so a grab taken then reads every channel zero — and a wall
        harness measuring it calls that a black plate, which is the one thing
        it exists to catch. That was `npm run wall` failing about once in a
        few runs on a slow machine, on the corner-pin check, with the frame
        before and the frame after both fine.

        So a decline is waited out rather than measured. This is not retrying
        until the picture is bright enough — nothing here looks at the
        pixels. The stage is *saying* it did not draw, and a genuinely black
        plate still comes back on the first try, painted, and is measured as
        black.
      */
      for (let tries = 0; tries < 8; tries++) {
        g = null;
        try { g = await grab(); } catch (e) { note.threw = String(e).slice(0, 120); break; }
        if (!g || g.painted !== false) break;
        note.declined = (note.declined ?? 0) + 1;
        await new Promise((done) => requestAnimationFrame(done));
      }
      if (!g) { window.__cgFrameLast = { ...note, got: 'nothing' }; return null; }
      if (g.painted === false) {
        window.__cgFrameLast = { ...note, got: 'the stage declined to paint every frame asked for' };
        return null;
      }
      for (let i = 3; i < g.pixels.length; i += 4) g.pixels[i] = 255;
      image = new ImageData(new Uint8ClampedArray(g.pixels), g.width, g.height);
      note.size = [g.width, g.height];
    } else {
      window.__cgFrameLast = { ...note, got: 'no grabFrame — nothing to read' };
      return null;
    }
    let lit = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      if (Math.max(image.data[i], image.data[i + 1], image.data[i + 2]) > 8) lit++;
    }
    note.lit = +(lit / (image.data.length / 4)).toFixed(3);
    window.__cgFrameLast = note;
    (window.__shots ??= {})[slot] = image;
    return { w: image.width, h: image.height };
  };
});

/** What the last read did — the reader's own account, for a failing check. */
export const lastFrameRead = (page) => page.evaluate(() => window.__cgFrameLast);

/** The plate, scaled, from a harness's side. */
export const frameOf = (page, w, h) => page.evaluate(([a, b]) => window.__cgFrame(a, b), [w, h]);

/**
 * Wait until the show has opened: the debug hook is there and the lead plate
 * has stepped. Seconds waited, or null if it never did within `timeout` ms.
 *
 * The show opens once its pipelines are built (`src/gpu/prepare.ts`), which on
 * a Mac with a cold shader cache is several seconds after load: nine on a CI
 * runner. A harness that waited a fixed eight seconds from load and then
 * asked for `chromaglassDebug()` found nothing there on the first run of its
 * shard (`npm run fx`, "stale bundle", run 36253622675). Before that change
 * the hook was there early and the plate froze under it instead, for the
 * same nine seconds. This waits for the show, and the harness's own settle
 * time then counts from a show that is running.
 */
export const waitForShow = (page, timeout = 60_000) => page.evaluate(async (ms) => {
  const t0 = performance.now();
  const open = () => (window.chromaglassDebug?.()?.fluids?.[0]?.stepIndex ?? 0) > 0;
  while (!open() && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 100));
  return open() ? (performance.now() - t0) / 1000 : null;
}, timeout);
