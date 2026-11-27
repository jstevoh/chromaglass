import { useState, useCallback, useEffect, useMemo, type RefObject } from 'react';
import { COLOR_HARMONIES, COLOR_HARMONY_NAMES, PALETTE } from '../constants';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import { publishPalette, setPaletteDoor } from './deskNow';
import {
  PALETTE_RECOLOUR_SECONDS, PICTURE_DYES, PICTURE_LOCK, PICTURE_PALETTE_NAME, hexOf, lockHarmony, paletteOfFile, readPictureDyes, setPictureDyes, type Rgb,
} from '../lib/picturePalette';

/**
 * The palette lock: a colour harmony held across looks and the sequencer, so
 * the music can move everything but the colours. Kept in the browser and
 * re-asserted on the engines once they are up.
 *
 * One of the harmonies can be a picture's (PLAN 43d): "Palette from a
 * picture or video" reads a file's four main colours into the picture dye
 * slots (lib/picturePalette.ts) and locks to them, as "From picture" in the
 * same list as Warm Sunset. Its colours are kept beside the lock, so the
 * entry is still there, and still the same four, after a reload.
 */
interface PaletteLockDeps {
  bothEngines: () => LiquidVisualizerHandle[];
  visualizerRef: RefObject<LiquidVisualizerHandle | null>;
  setToast?: (msg: string) => void;
}

const PICTURE_KEY = 'chromaglass-picture-palette';

/** A palette as the desk and the phone list it: its name and its swatches. */
export type PaletteEntry = { name: string; colours: string[] };

export function usePaletteLock({
  bothEngines, visualizerRef, setToast,
}: PaletteLockDeps) {
  // The picture's dyes, read back before anything asks for the lock, so the slots hold them first.
  const [pictureDyes, setPictureState] = useState<Rgb[] | null>(() => {
    let saved: Rgb[] | null = null;
    try { saved = readPictureDyes(localStorage.getItem(PICTURE_KEY)); } catch { /* private mode */ }
    if (saved) setPictureDyes(saved);
    return saved;
  });
  // ── User palette lock ───────────────────────────────────────────
  const [paletteLock, setPaletteLock] = useState<number | null>(() => {
    const raw = localStorage.getItem('chromaglass-palette-lock');
    const n = raw == null ? NaN : parseInt(raw, 10);
    if (n === PICTURE_LOCK) return pictureDyes ? n : null;
    return Number.isInteger(n) && n >= 0 && n < COLOR_HARMONIES.length ? n : null;
  });
  const selectPalette = useCallback((index: number | null) => {
    setPaletteLock(index);
    try {
      if (index == null) localStorage.removeItem('chromaglass-palette-lock');
      else localStorage.setItem('chromaglass-palette-lock', String(index));
    } catch { /* private mode */ }
    // The lock is the room's, like the mark: the wall's engine and, in Preview, the desk's copy (PLAN.md 8b).
    // Chosen by hand, so the plate already lit takes the colours too, not only
    // the pours to come (PLAN 43d-6); the re-assert below passes no seconds.
    for (const v of bothEngines()) v.setHarmonyLock(lockHarmony(index), PALETTE_RECOLOUR_SECONDS);
  }, []);
  useEffect(() => {
    // Re-assert a persisted lock once the visualizer is mounted
    if (paletteLock != null) visualizerRef.current?.setHarmonyLock(lockHarmony(paletteLock));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * A picture or video file's four main colours as the palette, locked. The
   * same call for the desk and the phone (CLAUDE.md "The phone shares").
   * Null when it took, else why not, also said in a toast.
   */
  const paletteFromFile = useCallback(async (file: Blob | string): Promise<string | null> => {
    try {
      const dyes = await paletteOfFile(file);
      setPictureDyes(dyes);
      const four = Array.from({ length: PICTURE_DYES }, (_, i) => dyes[i % dyes.length]);
      setPictureState(four);
      try { localStorage.setItem(PICTURE_KEY, JSON.stringify(four)); } catch { /* private mode */ }
      selectPalette(PICTURE_LOCK);
      setToast?.(`Palette from ${file instanceof File ? file.name : 'the picture'}`);
      return null;
    } catch (e) {
      const why = e instanceof Error ? e.message : 'that file could not be read';
      setToast?.(`No palette: ${why}`);
      return why;
    }
  }, [selectPalette, setToast]);

  /** Every palette the desk and the phone list, the picture's last once there is one. */
  const palettes = useMemo<PaletteEntry[]>(() => {
    const named = COLOR_HARMONIES.map((h, i) => ({ name: COLOR_HARMONY_NAMES[i], colours: h.map(pi => PALETTE[pi]?.hex ?? '#666') }));
    return pictureDyes ? [...named, { name: PICTURE_PALETTE_NAME, colours: pictureDyes.map(hexOf) }] : named;
  }, [pictureDyes]);

  // The owner's assistant locks it through the same call as the palette picker (PLAN 44k-16, app/deskNow.ts).
  useEffect(() => { publishPalette(paletteLock); }, [paletteLock]);
  useEffect(() => { setPaletteDoor(selectPalette); return () => setPaletteDoor(null); }, [selectPalette]);

  return {
    paletteLock, selectPalette, paletteFromFile, palettes, pictureDyes,
  };
}
