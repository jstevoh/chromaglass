import { useCallback, useEffect, useRef, useState } from 'react';
import { randomLook, stepLook, TV_PICK_MS, type TvLook } from '../lib/tvLooks';

/**
 * The TV's remote picks the look (PLAN 12-tv-remote), on the `/tv` page
 * (TvDisplay.tsx), which still draws nothing: the Mac plays the preset and
 * the TV goes on showing the Mac's plate as video.
 *
 * The keys are a TV remote's, as the Android TV WebView hands them to the
 * page: the D-pad's left and right step to the previous and next preset in
 * the laptop's order; OK (Enter) plays a random one that is not the one
 * playing; up, down or Menu opens the list, where up and down move, OK
 * plays and Back (Escape, sent by the app) closes it. A remote's own
 * previous and next track buttons step as left and right do. A held button
 * repeats; repeats are ignored, so holding right moves one look, not ten.
 *
 * The phone version is the same page on a phone or tablet propped up as a
 * second screen (TvDisplay's own phone version): it has no keys, so a tap on
 * the picture brings up a bar of the same four, Previous, Random, Next and
 * Looks, which fades after a few seconds untouched. The bar never shows on
 * a TV, which has no pointer to tap with, so it never covers the picture there.
 *
 * What it says: the look that is coming, at the press, and the look that is
 * playing once the laptop says so (the next `tv-looks`), in a line at the top
 * that fades. The bottom line stays TvDisplay's (live, films, refusals).
 *
 * Why the step counts from the last pick and not only from what the laptop
 * last said is live: two presses of right, a second apart, should move two
 * looks even when the laptop's state has not come back between them.
 */

interface Props {
  presets: readonly TvLook[];
  active: string | null;
  /** The remote acts only while the TV is in the show (looking or live), never on a refusal or the films. */
  enabled: boolean;
  /** Hand the relay a pick. */
  pick: (presetId: string) => void;
  /** OK's first job in a TV's own browser: full screen. True if it asked for it, so the press stops there. */
  fullScreenFirst: () => boolean;
}

/** How long the line at the top stays, and how long the phone's bar stays untouched. */
const NOTE_MS = 3500;
const BAR_MS = 5000;

export default function TvRemote({ presets, active, enabled, pick, fullScreenFirst }: Props) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [bar, setBar] = useState(false);
  const pendingRef = useRef<string | null>(null);
  const lastPickRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((text: string) => {
    setNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  }, []);

  // The laptop's word on what is live: the pick has landed (or another hand
  // changed it), so steps count from here again.
  const shownRef = useRef<string | null>(null);
  useEffect(() => {
    pendingRef.current = null;
    if (active && active !== shownRef.current && shownRef.current !== null) {
      const p = presets.find(x => x.id === active);
      if (p) say(`Now playing: ${p.name}`);
    }
    shownRef.current = active ?? '';
  }, [active, presets, say]);

  const send = useCallback((look: TvLook | null, how: string) => {
    if (!look) return;
    const now = Date.now();
    if (now - lastPickRef.current < TV_PICK_MS) return;   // the relay would drop it too
    lastPickRef.current = now;
    pendingRef.current = look.id;
    pick(look.id);
    say(`${how}: ${look.name}`);
  }, [pick, say]);

  const from = () => pendingRef.current ?? active;
  const next = () => send(stepLook(presets, from(), 1), 'Next');
  const prev = () => send(stepLook(presets, from(), -1), 'Previous');
  const random = () => send(randomLook(presets, from()), 'Random');

  const openList = useCallback(() => {
    const i = presets.findIndex(p => p.id === (pendingRef.current ?? active));
    setAt(Math.max(0, i));
    setOpen(true);
  }, [presets, active]);

  // A list open on a refusal or the films has nothing to pick for.
  useEffect(() => { if (!enabled) setOpen(false); }, [enabled]);
  // The Android TV app's Back closes the list rather than leaving the show
  // (androidtv/.../MainActivity.java dispatchKeyEvent), so it is told.
  useEffect(() => {
    try { window.ChromaglassTv?.menu?.(open); } catch { /* an older app */ }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-row="${at}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, at]);

  // The keys. Read through a ref so the listener is added once and always sees this render.
  const keysRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keysRef.current = (e: KeyboardEvent) => {
    const k = e.key;
    if (open) {
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        if (presets.length) setAt(a => (a + (k === 'ArrowDown' ? 1 : -1) + presets.length) % presets.length);
      } else if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        if (e.repeat) return;
        const p = presets[at];
        setOpen(false);
        if (p && p.id !== (pendingRef.current ?? active)) send(p, 'Playing');
      } else if (k === 'Escape' || k === 'Backspace' || k === 'ContextMenu' || k === 'GoBack' || k === 'BrowserBack') {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      if (fullScreenFirst()) return;
      if (enabled) random();
      return;
    }
    if (!enabled) return;
    if (k === 'ArrowRight' || k === 'MediaTrackNext') { e.preventDefault(); if (!e.repeat) next(); }
    else if (k === 'ArrowLeft' || k === 'MediaTrackPrevious') { e.preventDefault(); if (!e.repeat) prev(); }
    else if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ContextMenu') { e.preventDefault(); if (!e.repeat) openList(); }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keysRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // The phone's bar: up on a tap of the picture, gone after BAR_MS untouched.
  const poke = useCallback(() => {
    setBar(true);
    if (barTimer.current) clearTimeout(barTimer.current);
    barTimer.current = setTimeout(() => setBar(false), BAR_MS);
  }, []);
  useEffect(() => {
    const on = (e: PointerEvent) => { if (e.pointerType === 'touch' || e.pointerType === 'mouse' || e.pointerType === 'pen') poke(); };
    window.addEventListener('pointerdown', on);
    return () => window.removeEventListener('pointerdown', on);
  }, [poke]);
  useEffect(() => () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    if (barTimer.current) clearTimeout(barTimer.current);
  }, []);

  // A press on the bar or the list is not a tap on the picture (TvDisplay's full screen).
  const own = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); poke(); fn(); };
  const btn = 'rounded-full bg-white/15 active:bg-white/30 text-white px-4 py-3 text-sm font-medium min-w-0 flex-1 whitespace-nowrap';

  return (
    <>
      {note && (
        <div
          data-testid="tv-note"
          className="absolute top-0 left-0 right-0 px-[4vw] pt-[4vh] pb-[6vh] text-white/90 text-center pointer-events-none"
          style={{ fontSize: 'clamp(14px, 2vw, 32px)', background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0))' }}
        >
          {note}
        </div>
      )}
      {enabled && bar && !open && (
        <div
          data-testid="tv-bar"
          className="absolute z-10 left-0 right-0 bottom-[12vh] mx-auto flex gap-2 px-4 w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className={btn} data-testid="tv-prev" onClick={own(prev)}>◀ Previous</button>
          <button type="button" className={btn} data-testid="tv-random" onClick={own(random)}>Random</button>
          <button type="button" className={btn} data-testid="tv-next" onClick={own(next)}>Next ▶</button>
          <button type="button" className={btn} data-testid="tv-open" onClick={own(openList)}>Looks</button>
        </div>
      )}
      {open && (
        <div
          data-testid="tv-looks"
          className="absolute z-10 inset-y-0 right-0 w-full sm:w-[min(40vw,520px)] bg-black/85 text-white flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-[3vw] sm:px-6 pt-[4vh] pb-3">
            <span className="font-semibold" style={{ fontSize: 'clamp(16px, 2vw, 30px)' }}>Looks</span>
            <button type="button" className="rounded-full bg-white/15 px-4 py-2 text-sm" data-testid="tv-close" onClick={own(() => setOpen(false))}>Close</button>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain pb-[4vh]">
            {presets.map((p, i) => (
              <div
                key={p.id}
                data-row={i}
                data-testid="tv-look"
                data-id={p.id}
                data-at={i === at ? 'true' : undefined}
                className={`px-[3vw] sm:px-6 py-3 cursor-pointer truncate ${i === at ? 'bg-white/25' : ''} ${p.id === active ? 'font-semibold' : 'opacity-80'}`}
                style={{ fontSize: 'clamp(15px, 1.7vw, 26px)' }}
                onClick={own(() => { setOpen(false); if (p.id !== (pendingRef.current ?? active)) send(p, 'Playing'); })}
              >
                {p.id === active ? '● ' : ''}{p.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
