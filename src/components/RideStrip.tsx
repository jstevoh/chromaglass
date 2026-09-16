import { useState } from 'react';
import { Check, SlidersHorizontal } from 'lucide-react';
import { LEARNABLE_SETTINGS } from '../lib/midi';
import type { VisualizerSettings } from '../types';

/**
 * The half-dozen controls you actually ride, always out.
 *
 * During a show you cannot open a panel and scroll eighty sliders looking for
 * Turbulence. The settings panel is for building a look; this is for playing
 * one, so it holds only what a hand reaches for between songs and holds it
 * still, in the same place, at a size a hand can find in a dark room.
 *
 * Which six is the operator's choice, from `LEARNABLE_SETTINGS` — the same
 * list MIDI learn offers. That is deliberate rather than convenient: if the
 * desk drew from its own list, the strip and the controller map could disagree
 * about what is rideable, and the first time anyone noticed would be on stage.
 */

/** What the strip starts with: the controls a light show is actually played on. */
export const DEFAULT_RIDE: (keyof VisualizerSettings)[] = [
  'dimmer', 'audioImpact', 'globalSpeed', 'turbulenceScale', 'dyeBudget', 'automateRate',
];

const byKey = new Map(LEARNABLE_SETTINGS.map(s => [s.key, s]));

interface RideStripProps {
  settings: VisualizerSettings;
  keys: (keyof VisualizerSettings)[];
  onChange: (patch: Partial<VisualizerSettings>) => void;
  onKeys: (keys: (keyof VisualizerSettings)[]) => void;
}

export function RideStrip({ settings, keys, onChange, onKeys }: RideStripProps) {
  const [picking, setPicking] = useState(false);

  const toggle = (key: keyof VisualizerSettings) => {
    onKeys(keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key].slice(0, 10));
  };

  return (
    <section data-testid="ride-strip">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] uppercase tracking-[0.25em] text-white/50">On the faders</h2>
        <button
          onClick={() => setPicking(p => !p)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
            picking ? 'bg-white text-black' : 'text-white/50 hover:text-white hover:bg-white/10'
          }`}
          title="Choose which controls are on the strip"
          data-testid="ride-pick"
        >
          <SlidersHorizontal size={13} /> {picking ? 'Done' : 'Choose'}
        </button>
      </div>

      {picking ? (
        <div className="flex flex-col gap-0.5 max-h-[22rem] overflow-y-auto scrollbar-hide" data-testid="ride-picker">
          {LEARNABLE_SETTINGS.map(s => {
            const on = keys.includes(s.key);
            return (
              <button
                key={String(s.key)}
                onClick={() => toggle(s.key)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 min-h-[44px] text-left transition-colors ${
                  on ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                }`}
                data-testid={`ride-pick-${String(s.key)}`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'bg-white border-white text-black' : 'border-white/25'}`}>
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="text-[12px] font-medium">{s.label}</span>
              </button>
            );
          })}
        </div>
      ) : keys.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-white/40">
          Nothing on the strip. <span className="text-white/70">Choose</span> picks what rides here.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {keys.map(key => {
            const spec = byKey.get(key);
            if (!spec) return null;      // a key from an older build
            const raw = settings[key];
            const value = typeof raw === 'number' ? raw : spec.min;
            const pct = Math.round(((value - spec.min) / (spec.max - spec.min)) * 100);
            return (
              <label key={String(key)} className="block py-1" data-testid={`ride-${String(key)}`}>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-[12px] font-semibold text-white/85">{spec.label}</span>
                  <span className="text-[12px] font-mono tabular-nums text-white/55">{pct}%</span>
                </div>
                {/* 44px of grabbable height: a fader you have to aim at is not
                    a fader you can use with your eyes on the wall. */}
                <input
                  type="range"
                  min={spec.min}
                  max={spec.max}
                  step={(spec.max - spec.min) / 200}
                  value={value}
                  onChange={e => onChange({ [key]: Number(e.target.value) } as Partial<VisualizerSettings>)}
                  className="ride-fader w-full h-11 cursor-pointer"
                  aria-label={spec.label}
                />
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
