/**
 * One way to photograph the plate, whichever engine drew it
 * (docs/webgpu-plan.md, P5).
 *
 * A WebGL canvas keeps its drawing buffer and can be copied straight out with
 * `drawImage`. A presented WebGPU canvas cannot: it answers black, which is
 * not an error and not distinguishable from a black plate — the worst kind of
 * wrong reading, because every check that takes it goes on to measure nothing
 * and say so confidently. On that path the frame is photographed by the stage
 * instead, in the task that draws it, through `chromaglassDebug().grabFrame`.
 *
 * Every harness that reads pixels uses this, so there is one implementation of
 * the difference rather than one per harness.
 */

/** `&renderer=webgpu` when the environment asks for it, else nothing. */
export const engineQuery = (env = process.env) => {
  const want = env.CG_RENDERER ?? env.QA_RENDERER ?? '';
  return want ? `&renderer=${encodeURIComponent(want)}` : '';
};

/**
 * Is this label a GPU solver's?
 *
 * Three harnesses had `/^GPU/` written into them, and the stage says
 * `WebGPU`, so each of them decided in turn that a run on the port was a run
 * on the CPU fallback — `bench` recorded every rung it reached as one it
 * never reached, and `bubbles` refused to start.
 */
export const isGpuEngine = (label) => /^(GPU|WebGPU)\b/.test(label ?? '');

/** Which engine this run is asking for, for a harness's own header line. */
export const engineName = (env = process.env) => env.CG_RENDERER ?? env.QA_RENDERER ?? 'webgl';

/**
 * Install `window.__cgFrame(w, h)` for every navigation on this page. It
 * answers with the plate scaled to `w`×`h` as a flat RGBA array, or null if
 * there is no canvas yet.
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
      try { g = await grab(); } catch (e) { note.threw = String(e).slice(0, 120); }
      if (!g) { window.__cgFrameLast = { ...note, got: 'nothing' }; return null; }
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
      // A presented WebGPU canvas answers this with black, so a run that
      // lands here under the flag is reading nothing and should say so.
      ctx.drawImage(canvas, 0, 0, w, h);
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
      try { g = await grab(); } catch (e) { note.threw = String(e).slice(0, 120); }
      if (!g) { window.__cgFrameLast = { ...note, got: 'nothing' }; return null; }
      for (let i = 3; i < g.pixels.length; i += 4) g.pixels[i] = 255;
      image = new ImageData(new Uint8ClampedArray(g.pixels), g.width, g.height);
      note.size = [g.width, g.height];
    } else {
      const copy = document.createElement('canvas');
      copy.width = canvas.width; copy.height = canvas.height;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      image = copy.getContext('2d').getImageData(0, 0, copy.width, copy.height);
      note.size = [copy.width, copy.height];
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
