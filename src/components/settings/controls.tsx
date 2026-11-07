import React from 'react';
import { VisualizerSettings } from '../../types';
import { curveOf, handValueAt, travelOf } from '../../lib/midi';
import { PIN_RANGE, type DeskSurface } from '../../lib/deskPins';
import { LIT } from '../ui';
import { PaceTrack } from '../ui/Pace';
import { readSetting } from '../../lib/readout';
import { helpFor } from '../../lib/controlHelp';
import { useControlTip } from '../ui/ControlTip';

/*
  The two controls every section draws (PLAN 19ai-9, moved from SettingsPanel.tsx
  verbatim): the pin chips that put a control on a desk, and the slider that
  carries them. Here rather than in a section's file because all ten use them.
*/

/**
 * Pinning a control onto a desk.
 *
 * Every slider in this panel offers two chips: put me on Perform, put me on
 * Design. It is two buttons rather than a menu because in a dark room a menu
 * is two clicks and a guess, and it is on the control itself rather than in a
 * list somewhere because the moment you want a fader out where you can reach
 * it is the moment you are looking at it.
 *
 * Passed through a context rather than a prop, because it has to reach
 * eighty-six call sites and threading it would have meant eighty-six edits
 * every time the shape changed.
 */
export interface PinApi {
  perform: (keyof VisualizerSettings)[];
  design: (keyof VisualizerSettings)[];
  onPin: (desk: DeskSurface, key: keyof VisualizerSettings, on: boolean) => void;
}
export const PinContext = React.createContext<PinApi | null>(null);

export function PinChips({ settingKey }: { settingKey: keyof VisualizerSettings }) {
  const api = React.useContext(PinContext);
  if (!api) return null;
  // Only what a desk can actually draw. A chip on a control the strip would
  // drop on the next reload is a button that lies.
  if (!PIN_RANGE.has(String(settingKey))) return null;
  const chip = (desk: DeskSurface, letter: string, name: string) => {
    const on = (desk === 'perform' ? api.perform : api.design).includes(settingKey);
    return (
      <button
        key={desk}
        onClick={() => api.onPin(desk, settingKey, !on)}
        aria-pressed={on}
        title={on ? `On ${name}. Click to take it off.` : `Put this on ${name}`}
        aria-label={`${on ? 'Remove from' : 'Add to'} ${name}`}
        data-testid={`pin-${desk}-${String(settingKey)}`}
        className={`h-[22px] w-[22px] shrink-0 rounded-[4px] border text-[11px] font-bold leading-none transition-colors ${
          on
            ? LIT
            : 'border-white/15 text-white/25 hover:border-white/40 hover:text-white/70'
        }`}
      >
        {letter}
      </button>
    );
  };
  return (
    <span className="flex items-center gap-1" data-testid={`pins-${String(settingKey)}`}>
      {chip('perform', 'P', 'the Perform desk')}
      {chip('design', 'D', 'the Design bench')}
    </span>
  );
}

/**
 * A labelled range. Lives outside the panel: defined inside it, it was a new
 * component type on every render, so every slider remounted on every change
 * and a drag died after its first step. `disabled` is the reason the control
 * cannot do anything with the current settings; it is shown greyed with that
 * reason as its tooltip.
 */
/**
 * `curve` bends the travel without touching the value.
 *
 * A control whose useful range is all at one end is a control with no
 * resolution where it is played. Speed is the case: thirty of thirty-two
 * looks sit in the bottom 27% of its 0–0.3 range, and the median at 10% of
 * the way along, so the whole of the plate's usable tempo was a centimetre of
 * the throw. At `curve: 3` half the travel is 0.0375 and the slow end gets
 * the bottom third.
 *
 * The stored setting is unchanged — only where the handle sits for it — so
 * looks, patches and song cues written before this mean exactly what they
 * meant. The curve comes from `LEARNABLE_SETTINGS` so the phone, a MIDI
 * fader and its LED ring all bend the same way; see `curveOf` in `midi.ts`.
 */
export const Slider = ({ label, value, min, max, step, onChange, icon: Icon, disabled, settingKey }: { label: string; value: number | undefined; min: number; max: number; step: number; onChange: (v: number) => void; icon?: React.ComponentType<{ size?: number }>; disabled?: string | false; settingKey?: keyof VisualizerSettings }) => {
  const safeValue = value ?? 0;
  const curve = settingKey ? curveOf(settingKey) : 1;
  // What the control does, as the desk's hover card says it (PLAN.md 8j); a
  // tap on the name opens it where there is no hover.
  const line = helpFor(settingKey);
  const tip = useControlTip({ name: label, help: line, value: disabled ? undefined : readSetting(String(settingKey ?? ''), safeValue, min, max), disabled: !!disabled });
  return (
    <div ref={el => { tip.anchor.current = el; }} {...tip.bind} className={`mb-3 flex min-w-0 flex-col gap-1 ${disabled ? 'opacity-35' : ''}`} title={disabled || undefined} data-disabled={disabled ? 'true' : undefined} data-slider="">
      {tip.card}
      <div className="flex items-center justify-between gap-2">
        {/*
          The rail beside this pane is sentence case and so is every control
          on both desks; only in here was a control's own name shouted. Two
          type conventions touching each other reads as two different
          programs, and the shouting one was the one describing eighty
          controls. Section headings keep their uppercase eyebrow, which the
          rail's category headers share — that is a level, not a label.
        */}
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-text-2">
          {Icon && <Icon size={14} />}
          <span
            className={`truncate ${line ? '[@media(pointer:coarse)]:underline [@media(pointer:coarse)]:decoration-dotted [@media(pointer:coarse)]:decoration-white/25 [@media(pointer:coarse)]:underline-offset-4' : ''}`}
            onClick={line ? tip.toggle : undefined}
          >{label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {settingKey && <PinChips settingKey={settingKey} />}
          {/*
            And the same reading as the desk, from the same function. This
            printed `toFixed(2)` on everything, so the Dimmer said 100% on the
            desk and 1.00 here — one control disagreeing with itself across two
            screens — and `0.02` for a speed that rides 0.005 to 0.3 told you
            nothing at all.
          */}
          <span className="min-w-[44px] rounded-md bg-white/[0.06] px-1.5 py-0.5 text-center font-mono text-[11.5px] font-medium tabular-nums text-text">
            {disabled ? disabled : readSetting(String(settingKey ?? ''), safeValue, min, max)}
          </span>
        </div>
      </div>
      <PaceTrack settingKey={settingKey} at={Math.max(0, Math.min(1, (curve === 1 ? (safeValue - min) / Math.max(1e-9, max - min) : travelOf(safeValue, min, max, curve))))}>
        <input
          type="range"
          min={curve === 1 ? min : 0}
          max={curve === 1 ? max : 1}
          step={curve === 1 ? step : 0.001}
          value={curve === 1 ? safeValue : travelOf(safeValue, min, max, curve)}
          disabled={!!disabled}
          aria-label={label}
          onChange={(e) => {
            const raw = parseFloat(e.target.value);
            if (curve === 1) { onChange(raw); return; }
            // Three figures, not the setting's step: see handValueAt.
            onChange(handValueAt(raw, min, max, curve));
          }}
          className="set-range"
          style={{ '--fill': `${Math.round(100 * (curve === 1 ? (safeValue - min) / Math.max(1e-9, max - min) : travelOf(safeValue, min, max, curve)))}%` } as React.CSSProperties}
        />
      </PaceTrack>
    </div>
  );
};
