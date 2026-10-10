import type { CSSProperties } from 'react';
import { curveOf, handValueAt, travelOf } from '../../lib/midi';
import type { VisualizerSettings } from '../../types';

/*
  The touch slider (Desk v2's design system, "Touch slider"): one row 44
  tall, the name on the left at a fixed 84 so a column of them lines up, the
  track and its 32 px thumb in the middle, the value on the right in mono.
  "Used for every rideable value on phone/iPad."

  The ride Slider (ui/index.tsx) stacks its name and value over the track,
  which is right in a desk's narrow column and costs a row and a half on a
  phone sheet where six of them have to fit above the looks. This is the
  same control laid on its side: the same `ride-slider is-touch` input, and
  the same travel. A setting with a curve (Speed's is 3: thirty of the looks
  sit in the bottom quarter of its range) bends here exactly as it does on
  the desk and a MIDI fader, read from `curveOf` by the setting's own key,
  so a thumb at the middle of Play's Speed is the speed at the middle of the
  desk's.

  `glass`: over a live plate the track is the design's 14% white, not the
  solid surfaces' grey, which vanished against a dark plate. Set as the
  variable the track's gradient already reads, so the CSS stays one rule.
*/
export function TouchSlider({ label, value, min, max, setting, onChange, display, glass, testId }: {
  label: string;
  value: number; min: number; max: number;
  /** The setting it rides, for its curve. */
  setting?: keyof VisualizerSettings;
  onChange: (v: number) => void;
  display: string;
  glass?: boolean;
  testId?: string;
}) {
  const curve = setting ? curveOf(setting) : 1;
  const at = Math.max(0, Math.min(1, travelOf(value, min, max, curve)));
  const style = { '--fill': `${at * 100}%`, ...(glass ? { '--color-track': 'rgba(255,255,255,.14)' } : {}) } as CSSProperties;
  return (
    <div className="flex h-11 items-center gap-3" data-testid={testId}>
      <span className="w-[84px] shrink-0 truncate text-[14px] font-medium text-text-2">{label}</span>
      <input
        type="range"
        min={0} max={1} step={0.001}
        value={at}
        onChange={e => onChange(handValueAt(Number(e.target.value), min, max, curve))}
        aria-label={label}
        className="ride-slider is-touch min-w-0 flex-1"
        style={style}
      />
      <span className="w-11 shrink-0 text-right font-mono text-[12px] text-muted">{display}</span>
    </div>
  );
}
