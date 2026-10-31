/**
 * The Live Show's frames, handed over inside the frame task (PLAN.md 37x-4d-6).
 *
 * What was wrong: the stream was black. `LiveEncoder` drew `#liquid-canvas`
 * onto its staging canvas on its own wall clock, a `setTimeout` outside the
 * task that drew the plate, and a WebGPU canvas read after it has been
 * presented answers black rather than an error. Measured by `npm run liveshow`
 * with `--stack` (2026-10-31): the plate read inside its own frame was the
 * film with the wall's keystone, and the Plate source's decoded 1920 x 1080
 * frame (0, 0, 0) in every cell, on SwiftShader and on Metal alike. The
 * projector window (CastDisplay's mirror) and the pad's picture
 * (lib/padPicture.ts) had met the same thing and are copied inside the frame
 * task for it; the stream now is too.
 *
 * So the frame task calls `tapLiveFrame` with each canvas it has just drawn,
 * and the encoder, while it is on air, copies it into its own 2D staging
 * canvases there, which it can read on its own clock whenever a frame is due.
 * The clock stays the encoder's: a stream runs at its own rate whatever the
 * display's refresh, and repeats its last copy when the plate is slower.
 *
 * `kind` names which picture the canvas is: 'plate' is `#liquid-canvas`, the
 * wall as the projector has it; 'stack' is the Mixer stack drawn without the
 * wall's geometry (37x-4d-1, Antigravity's brief 2), whose draw calls this
 * with its own canvas from the same task. One listener at a time: there is
 * one stream. Held here, as padPicture holds its sender, so the visualizer's
 * props do not change when a stream starts.
 */
export type LiveFrameKind = 'plate' | 'stack';
export type LiveFrameListener = (canvas: HTMLCanvasElement | OffscreenCanvas) => void;

let listening: { kind: LiveFrameKind; fn: LiveFrameListener } | null = null;

/** Called by the encoder at start; the function it returns ends the listening. */
export function listenLiveFrames(kind: LiveFrameKind, fn: LiveFrameListener): () => void {
  const me = { kind, fn };
  listening = me;
  return () => { if (listening === me) listening = null; };
}

/** Whether a stream wants this kind of picture now: a draw that exists only for the stream asks before it draws. */
export function liveFrameWanted(kind: LiveFrameKind): boolean { return listening?.kind === kind; }

/** Called by the frame task with a canvas it just drew. Never throws into it: a stream's frame is not worth the show's. */
export function tapLiveFrame(kind: LiveFrameKind, canvas: HTMLCanvasElement | OffscreenCanvas): void {
  if (listening?.kind !== kind) return;
  try { listening.fn(canvas); } catch { /* the next frame tries again */ }
}
