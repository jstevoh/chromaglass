// The remote's slider, moved out of RemoteControl.tsx (PLAN 19ai, the size ratchet).
import type { VisualizerSettings } from '../types';
import { PIN_RANGE } from '../lib/deskPins';
import { curveOf, handValueAt, travelOf } from '../lib/midi';

/**
 * Defined at module level on purpose: a component created inside the render
 * body gets a new identity on every state message from the laptop, which
 * remounts the slider under the thumb that is dragging it.
 *
 * The travel is not written here. It is the setting's one range, from the
 * registry every other surface reads: this page had Speed at 0.005–0.6, twice
 * the sheet's top, and the macro zoom stopping at 12 where the sheet goes to
 * 16, so the same thumb position meant a different plate from the phone.
 */
export function Slider({ label, field, step, format, value, connected, onDrag, onChange }: {
  label: string;
  field: keyof VisualizerSettings;
  step: number;
  format?: (v: number) => string;
  value: number | undefined;
  connected: boolean;
  onDrag: (field: keyof VisualizerSettings, dragging: boolean) => void;
  onChange: (field: keyof VisualizerSettings, v: number) => void;
}) {
  const { min, max } = PIN_RANGE.get(String(field)) ?? { min: 0, max: 1 };
  const current = value ?? min;
  // The same bent travel as the desk and a MIDI fader — Speed's is cubed, so
  // the slow end where the looks live gets the bottom third of a throw that
  // is shorter here than anywhere else. See `curveOf` in `lib/midi.ts`.
  const curve = curveOf(field);
  const at = curve === 1 ? current : travelOf(current, min, max, curve);
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">{label}</span>
        <span className="font-mono text-xs text-white/40">{format ? format(current) : current.toFixed(2)}</span>
      </div>
      <input
        id={`remote-${String(field)}`}
        type="range"
        min={curve === 1 ? min : 0}
        max={curve === 1 ? max : 1}
        step={curve === 1 ? step : 0.001}
        value={at}
        disabled={!connected}
        onPointerDown={() => onDrag(field, true)}
        onPointerUp={() => onDrag(field, false)}
        onPointerCancel={() => onDrag(field, false)}
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          if (curve === 1) { onChange(field, raw); return; }
          onChange(field, handValueAt(raw, min, max, curve));
        }}
        className="remote-slider h-10 w-full cursor-pointer disabled:opacity-30 md:h-12"
        style={{ ['--fill' as string]: `${(curve === 1 ? (current - min) / (max - min) : at) * 100}%` }}
      />
    </div>
  );
}
