import { useSyncExternalStore } from 'react';
import { lookStill } from './lookStills';

/**
 * The picture on a look's chip (PLAN 34b-6): what the look looks like, small
 * and round, so a list of fifty looks fits in a panel instead of fifty rows.
 *
 * What was asked (the owner, 2026-11-27): the preset lists took up a ton of
 * room, each row a coloured slide mount beside a name; a round chip showing a
 * sample of each look on the canvas, its name on hover or a long press.
 *
 * Where each picture comes from, and why none of them is live:
 *
 *   - A look that ships has its plate still already, `public/looks/<id>.webp`,
 *     rendered once by `npm run lookstills` through the lab's real solver and
 *     plate shader (PLAN 34b-1). It costs the show nothing: a 20 KB file the
 *     browser caches like any picture.
 *   - A look the performer saved has no file on disk, so it is photographed
 *     from the plate once, when it has been on the glass a few seconds
 *     (app/useLookThumbCapture.ts), shrunk to a 96 px square and kept here in
 *     the browser. One readback per look per machine, ever; never again while
 *     the thumb is kept.
 *
 * A live picture (forty small canvases drawing the plate, or the plate read
 * back every few frames to feed them) was the obvious thing and the wrong
 * one: the owner's standing ask is low jitter, and a readback is a stall the
 * frame loop pays for. Kept, it is one data URL per look and a plain <img>.
 *
 * Until a saved look has been photographed its chip shows the look's two
 * dyes (the swatch the old slide mount showed), so nothing is ever blank.
 */

export const LOOK_THUMBS_KEY = 'chromaglass-look-thumbs';
/** The kept thumb's side, px: twice the desk chip's 40 so it stays sharp on a Retina screen. */
export const THUMB_PX = 96;
/** How many saved looks' thumbs are kept: a 96 px WebP is 3–6 KB, so this is under 1 MB of storage. */
const THUMB_CAP = 160;

let thumbs: Record<string, string> = read();
const listeners = new Set<() => void>();

function read(): Record<string, string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOOK_THUMBS_KEY) : null;
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v as Record<string, string> : {};
  } catch { return {}; }
}

/** The picture for a look's chip: its shipped still, its kept thumb, or null (show the swatch). */
export function lookThumb(id: string | null | undefined): string | null {
  if (!id) return null;
  return lookStill(id) ?? thumbs[id] ?? null;
}

/** Whether a saved look still wants its photograph taken. */
export function needsThumb(id: string | null | undefined): boolean {
  return !!id && !lookStill(id) && !thumbs[id];
}

/** Keep a look's thumb (a data URL) and tell every chip showing it. */
export function rememberThumb(id: string, dataUrl: string): void {
  const next = { ...thumbs, [id]: dataUrl };
  const ids = Object.keys(next);
  for (const old of ids.slice(0, Math.max(0, ids.length - THUMB_CAP))) delete next[old];
  thumbs = next;
  try { localStorage.setItem(LOOK_THUMBS_KEY, JSON.stringify(next)); } catch { /* storage full or private: kept for this session */ }
  for (const fn of listeners) fn();
}

/** Forget a deleted look's thumb. */
export function forgetThumb(id: string): void {
  if (!(id in thumbs)) return;
  const next = { ...thumbs };
  delete next[id];
  thumbs = next;
  try { localStorage.setItem(LOOK_THUMBS_KEY, JSON.stringify(next)); } catch { /* as above */ }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** A chip's picture, re-rendering when a saved look's thumb arrives. */
export function useLookThumb(id: string | null | undefined): string | null {
  const snapshot = useSyncExternalStore(subscribe, () => thumbs, () => thumbs);
  return id ? (lookStill(id) ?? snapshot[id] ?? null) : null;
}

/**
 * A frame of the plate (RGBA rows from the top, as `WebGPUStage.grabFrame`
 * gives it) made into a round chip's thumb: the middle square of the picture,
 * where a look's character is (the rim and the projector's corners are the
 * same black in every look), averaged down to THUMB_PX in 2×2 samples per
 * thumb pixel, so the solver's grain does not alias into speckle. Reads only
 * THUMB_PX² × 4 of the frame's pixels, not all two million.
 */
export function thumbFromFrame(frame: { width: number; height: number; pixels: Uint8Array }): string | null {
  const { width, height, pixels } = frame;
  if (!width || !height || typeof document === 'undefined') return null;
  const side = Math.floor(Math.min(width, height) * 0.8);
  const x0 = Math.floor((width - side) / 2), y0 = Math.floor((height - side) / 2);
  const out = new ImageData(THUMB_PX, THUMB_PX);
  const step = side / THUMB_PX;
  for (let y = 0; y < THUMB_PX; y++) {
    for (let x = 0; x < THUMB_PX; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const px = Math.min(width - 1, x0 + Math.floor((x + 0.25 + sx * 0.5) * step));
          const py = Math.min(height - 1, y0 + Math.floor((y + 0.25 + sy * 0.5) * step));
          const s = (py * width + px) * 4;
          r += pixels[s]; g += pixels[s + 1]; b += pixels[s + 2];
        }
      }
      const d = (y * THUMB_PX + x) * 4;
      out.data[d] = r >> 2; out.data[d + 1] = g >> 2; out.data[d + 2] = b >> 2; out.data[d + 3] = 255;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = THUMB_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(out, 0, 0);
  const url = canvas.toDataURL('image/webp', 0.8);
  // A browser that cannot write WebP hands back a PNG, three times the size: still fine at 96 px.
  return url.startsWith('data:image/') ? url : null;
}
