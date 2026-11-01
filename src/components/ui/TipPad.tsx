import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { VisualizerSettings } from '../../types';
import { keysTilt, onPad, padDot, padTilt, tipGrab, tipLetGo, tipMoved, type TipHold } from '../../lib/tipPad';

/*
  The Tip pad (PLAN 18a-13j, lib/tipPad.ts has the why): the dish from above,
  with a dot. Drag the dot toward an edge and that edge goes down; let go and
  the dish lies back as it was, and the liquid sloshes back past the middle.
  One component for the desk's Tools panel, the Tilt & Rock section and the
  phone's Motion sheet (the phone shares, never forks), each handing it the
  settings and the one way to change them it already has.

  At rest the dot sits where the plate is tipped now: in the middle on a flat
  look, toward the bottom on Lava Lamp (Gravity 1, Tilt Direction 180), and
  following the phone while its Tilt is on. Held, it is under the finger, and
  let go it glides back (the transition), as the dish's level does.

  The arrow keys tip it too, held, for a desk played from the keyboard; a key
  let go, or the pad losing focus, lets the dish go as a lifted finger does.
*/
type TipSettings = Pick<VisualizerSettings, 'plateUpright' | 'tiltDirection' | 'slosh'>;

export function TipPad({ settings, onSetting, size = 96, reach, testId = 'tip-pad' }: {
  settings: Partial<TipSettings>;
  onSetting: (patch: Partial<VisualizerSettings>) => void;
  /** The pad's width in CSS pixels: 96 on the desk, larger under a thumb. */
  size?: number;
  /**
    How far the pointer travels from the middle for the plate stood fully up,
    CSS pixels; the pad's own radius if not given. The desk's keycap-sized pad
    is 44 px across, too little travel for the gentle end, so the hand there
    reaches past the rim (the pointer is held, so it keeps reading) and the
    dot is drawn at the rim.
  */
  reach?: number;
  testId?: string;
}) {
  const r = size / 2;
  const R = Math.max(r, reach ?? r);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onSettingRef = useRef(onSetting);
  onSettingRef.current = onSetting;
  const hold = useRef<TipHold | null>(null);
  const sent = useRef({ upright: -1, direction: -1 });
  const keys = useRef(new Set<string>());
  const [dot, setDot] = useState<{ x: number; y: number } | null>(null);

  const grab = () => {
    if (hold.current) return;
    const g = tipGrab(settingsRef.current);
    hold.current = g.hold;
    sent.current = { upright: -1, direction: -1 };
    if (g.patch) onSettingRef.current(g.patch);
  };
  const tip = (dx: number, dy: number) => {
    const at = onPad(dx, dy, R);
    setDot({ x: (at.x * r) / R, y: (at.y * r) / R });
    const t = padTilt(at.x, at.y, R);
    if (!tipMoved(sent.current, t)) return;
    sent.current = t;
    onSettingRef.current(t.upright > 0 ? { plateUpright: t.upright, tiltDirection: t.direction } : { plateUpright: 0 });
  };
  const letGo = () => {
    keys.current.clear();
    setDot(null);
    if (!hold.current) return;
    onSettingRef.current(tipLetGo(hold.current));
    hold.current = null;
  };
  const letGoRef = useRef(letGo);
  letGoRef.current = letGo;
  // A pad taken off the screen while held (a panel closed, the sheet shut) still lets go.
  useEffect(() => () => letGoRef.current(), []);

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    tip(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>, down: boolean) => {
    if (!e.key.startsWith('Arrow')) return;
    e.preventDefault();
    if (down) keys.current.add(e.key); else keys.current.delete(e.key);
    const k = keysTilt(keys.current, R);
    if (!k) { letGo(); return; }
    grab();
    tip(k.x, k.y);
  };

  const rest = padDot(settings.plateUpright ?? 0, settings.tiltDirection ?? 180, r);
  const at = dot ?? rest;
  const held = dot !== null;
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Tip the dish: drag the dot toward an edge, or hold the arrow keys; let go and it lies flat"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((settings.plateUpright ?? 0) * 100)}
      aria-valuetext={`Gravity ${Math.round((settings.plateUpright ?? 0) * 100)}% toward ${Math.round(settings.tiltDirection ?? 180)} degrees`}
      data-testid={testId}
      data-held={held ? '1' : '0'}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); grab(); fromPointer(e); }}
      onPointerMove={(e) => { if (hold.current && e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e); }}
      onPointerUp={letGo}
      onPointerCancel={letGo}
      onLostPointerCapture={() => { if (keys.current.size === 0) letGo(); }}
      onKeyDown={(e) => onKey(e, true)}
      onKeyUp={(e) => onKey(e, false)}
      onBlur={letGo}
      className="relative flex-none cursor-grab touch-none select-none rounded-full border border-white/15 outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
      style={{
        width: size,
        height: size,
        // The dish lit from beneath: brighter toward the edge it is tipped to, where the liquid piles.
        background: `radial-gradient(circle at ${50 + (at.x / r) * 30}% ${50 + (at.y / r) * 30}%, rgba(139,92,246,.30), rgba(255,255,255,.03) 70%)`,
      }}
    >
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-px w-3/4 -translate-x-1/2 bg-white/10" />
      <span className="pointer-events-none absolute left-1/2 top-1/2 h-3/4 w-px -translate-y-1/2 bg-white/10" />
      <span
        className={`pointer-events-none absolute left-1/2 top-1/2 rounded-full border-2 border-white/80 bg-lit shadow-[0_0_10px_rgba(139,92,246,.8)] ${held ? '' : 'transition-transform duration-300 ease-out'}`}
        style={{ width: size * 0.2, height: size * 0.2, transform: `translate(calc(-50% + ${at.x}px), calc(-50% + ${at.y}px))` }}
      />
    </div>
  );
}
