import { useState, type ReactNode } from 'react';
import { ArrowUp, ArrowDown, ChevronDown, RotateCcw } from 'lucide-react';
import { DEFAULT_SETTINGS, type VisualizerSettings } from '../types';
import { Slider } from './ui';
import {
  MIX_SOURCE_INFO, MIX_GRADES, MIX_CONTROLS, MIX_LAMP, gradeKey, gradeLabel, mixStack, moveInMix,
  type MixSource, type MixMover,
} from '../lib/mixer';
import { PIN_RANGE } from '../lib/deskPins';
import { readSetting } from '../lib/readout';

/**
 * The mixer, drawn: every picture on the wall in one stack (lib/mixer.ts).
 *
 * One component in three places — the Perform desk's Mixer sheet, Settings →
 * Live → Mixer, and the phone's Mix sheet — because a mixer that looked
 * different on each would be three mixers, and the operator would have to
 * learn which one was lying. The phone gets the touch sizes (`touch`), the
 * settings panel adds its desk pin chips (`chips`); nothing else differs.
 *
 * Rows run top to bottom as the stack does on the wall, top first, the way
 * every mixer and every layer list in an editor reads. A row is its name,
 * its place (the arrows), and its level, always in view, because the level
 * is what a hand reaches for mid-song; the grade opens under it on a tap,
 * one row at a time, because four more sliders on every row is a page.
 *
 * Nothing here decides anything: the order's rules (the front plate stays,
 * only the lamp's sources pass it) are `moveInMix`'s, so an arrow that cannot
 * move a row is disabled rather than pressed and ignored.
 *
 * The three that can be the lamp wear a tag saying which side of the glass
 * they are on, because the same row is a different thing on each: the LED
 * ring and the lumia are the lamp under it and a beam over it, and the gel
 * is over the lamp or over the lens. Without the tag a move past the front
 * plate reads as a nudge, and it is the biggest change an arrow makes.
 */
export interface MixerPanelProps {
  settings: VisualizerSettings;
  onSetting: (patch: Partial<VisualizerSettings>) => void;
  /** Whether a film and a logo are loaded; a row with nothing to show says so. */
  hasFilm: boolean;
  hasMark: boolean;
  /** The phone's sizes: a 48-pixel target for every press. */
  touch?: boolean;
  /** The settings panel's pin chips, beside each slider. */
  chips?: (key: keyof VisualizerSettings) => ReactNode;
  testId?: string;
}

const SPEC = (key: keyof VisualizerSettings) => PIN_RANGE.get(String(key)) ?? { min: 0, max: 1 };

export function MixerPanel({ settings, onSetting, hasFilm, hasMark, touch = false, chips, testId = 'mixer' }: MixerPanelProps) {
  const [open, setOpen] = useState<MixSource | null>(null);
  const stack = mixStack(settings.mixOrder);
  const rows = [...stack].reverse();
  const move = (id: MixMover, dir: 1 | -1) => onSetting({ mixOrder: moveInMix(settings.mixOrder, id, dir) });
  const canMove = (id: MixSource, dir: 1 | -1) =>
    id !== 'front' && moveInMix(settings.mixOrder, id, dir) !== mixStack(settings.mixOrder).join(' ');
  const s = settings as unknown as Record<string, number>;
  const lampish = (id: MixSource) => (MIX_LAMP as readonly string[]).includes(id);
  const ownKey = (key: keyof VisualizerSettings) => MIX_CONTROLS.some(c => c.key === key);

  /** Why a row has nothing on the wall right now, or null when it does. */
  const absent = (id: MixSource): { why: string; fix?: { label: string; patch: Partial<VisualizerSettings> } } | null => {
    if (id === 'led' && !settings.ledPlatform) return { why: 'Off in this look.', fix: { label: 'Turn on', patch: { ledPlatform: true } } };
    if (id === 'back' && (settings.layerCount ?? 1) < 2) return { why: 'This look has one plate.', fix: { label: 'Add it', patch: { layerCount: 2 } } };
    if (id === 'film' && !hasFilm) return { why: 'No film loaded. Settings → Film loads a reel, a window or the camera.' };
    if (id === 'mark' && !hasMark) return { why: 'No logo loaded. Settings → Logo & Titles loads one.' };
    return null;
  };

  const slider = (key: keyof VisualizerSettings, label: string) => {
    const spec = SPEC(key);
    const raw = s[String(key)];
    // A laptop on an older build sends the remote no mixer keys at all; the
    // control then reads at rest (a level of 1, no grade), not at its bottom,
    // or the first touch would send a 0% level or a -180° hue.
    const fallback = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[String(key)];
    const rest = typeof fallback === 'number' ? fallback : spec.min;
    const v = typeof raw === 'number' ? raw : rest;
    return (
      <div className="flex items-start gap-2" key={String(key)}>
        <div className="min-w-0 flex-1">
          <Slider
            label={label}
            value={v}
            min={spec.min}
            max={spec.max}
            step={String(key).endsWith('Hue') ? 1 : 0.01}
            display={readSetting(String(key), v, spec.min, spec.max)}
            onChange={n => onSetting({ [key]: n } as Partial<VisualizerSettings>)}
            midiKey={`setting:${String(key)}`}
            touch={touch}
            testId={`${testId}-${String(key)}`}
          />
        </div>
        {/*
          Pin chips only on the mixer's own controls. A row whose level is a
          setting with a slider of its own elsewhere in Settings (Film Mix,
          Logo Opacity, Gel Wheel, Lumia) keeps its pin there: two chips for
          one setting on one sheet is a control drawn twice (`npm run layout`).
        */}
        {chips && ownKey(key) && <div className="pt-0.5">{chips(key)}</div>}
      </div>
    );
  };

  const arrow = (id: MixSource, dir: 1 | -1) => {
    const Icon = dir > 0 ? ArrowUp : ArrowDown;
    const ok = canMove(id, dir);
    const name = MIX_SOURCE_INFO[id].name;
    return (
      <button
        onClick={() => { if (ok) move(id as MixMover, dir); }}
        disabled={!ok}
        aria-label={`${name} ${dir > 0 ? 'up' : 'down'} the stack`}
        title={id === 'front' ? 'The front plate is the glass the lamp shines through; the rest stack on it'
          : ok ? `Move ${name} ${dir > 0 ? 'up' : 'down'}` : dir < 0 && !lampish(id) ? 'Only the LED ring, the gel and the lumia go under the front plate' : undefined}
        data-testid={`${testId}-${id}-${dir > 0 ? 'up' : 'down'}`}
        className={`flex items-center justify-center rounded-md text-text-2 transition-colors disabled:opacity-25 enabled:hover:bg-hover enabled:active:bg-active ${
          touch ? 'h-12 w-12' : 'h-7 w-7'
        }`}
      >
        <Icon size={touch ? 18 : 14} />
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <p className={`${touch ? 'text-[13px]' : 'text-[12px]'} leading-snug text-muted`}>
        Top of the list is on top on the wall. What is under the front plate is its lamp; the LED ring and the lumia above it are beams, the gel a filter on the lens.
      </p>
      {rows.map(id => {
        const info = MIX_SOURCE_INFO[id];
        const off = absent(id);
        const isOpen = open === id;
        const under = stack.indexOf(id) < stack.indexOf('front');
        const role = !lampish(id) ? null : under ? 'lamp' : id === 'gel' ? 'lens' : 'beam';
        const graded = MIX_GRADES.some(g => {
          const c = MIX_CONTROLS.find(m => m.key === gradeKey(id, g));
          return c && s[String(c.key)] !== undefined && s[String(c.key)] !== c.none;
        });
        return (
          <div
            key={id}
            className={`rounded-lg border ${isOpen ? 'border-border-strong bg-elevated' : 'border-border'} px-2 pb-1 pt-1`}
            data-testid={`${testId}-row-${id}`}
            data-row={id}
          >
            {/*
              The name, then the grade's own button, then the arrows: the grade
              says "Grade" rather than being a third chevron beside two arrows,
              which read as three ways to move the row.
            */}
            <div className="flex items-center gap-1">
              <div className={`flex min-w-0 flex-1 items-center gap-2 px-1 ${touch ? 'min-h-[48px]' : 'min-h-[32px]'}`} title={info.hint}>
                <span className={`truncate ${touch ? 'text-[15px]' : 'text-[13px]'} font-medium ${off ? 'text-dim' : 'text-text'}`}>{info.name}</span>
                {role && <span className="shrink-0 rounded-xs bg-hover px-1.5 py-0.5 text-[11px] text-text-2">{role}</span>}
              </div>
              <button
                onClick={() => setOpen(isOpen ? null : id)}
                aria-expanded={isOpen}
                aria-label={`${info.name}'s grade: brightness, contrast, saturation, hue`}
                className={`flex shrink-0 items-center gap-1 rounded-md px-2 text-[12px] transition-colors hover:bg-hover ${
                  touch ? 'h-12' : 'h-7'
                } ${graded ? 'text-accent-text' : 'text-text-2'}`}
                data-testid={`${testId}-${id}-open`}
              >
                {graded ? 'Graded' : 'Grade'}
                <ChevronDown size={13} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {id !== 'front' && arrow(id, 1)}
              {id !== 'front' && arrow(id, -1)}
            </div>
            {off ? (
              <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
                <span className="text-[12px] leading-snug text-dim">{off.why}</span>
                {off.fix && (
                  <button
                    onClick={() => onSetting(off.fix!.patch)}
                    className={`shrink-0 rounded-md border border-border px-3 text-[12px] text-text-2 hover:bg-hover ${touch ? 'h-12' : 'h-7'}`}
                    data-testid={`${testId}-${id}-fix`}
                  >
                    {off.fix.label}
                  </button>
                )}
              </div>
            ) : (
              <div className="px-1">{slider(info.level, 'Level')}</div>
            )}
            {isOpen && (
              <div className="border-t border-border px-1 pt-3" data-testid={`${testId}-${id}-grade`}>
                {MIX_GRADES.map(g => slider(gradeKey(id, g), gradeLabel(g)))}
                <button
                  onClick={() => onSetting(Object.fromEntries(MIX_GRADES.map(g => {
                    const c = MIX_CONTROLS.find(m => m.key === gradeKey(id, g))!;
                    return [c.key, c.none];
                  })) as Partial<VisualizerSettings>)}
                  disabled={!graded}
                  className={`mb-2 flex w-full items-center justify-center gap-2 rounded-md border border-border text-[12px] text-text-2 disabled:opacity-40 enabled:hover:bg-hover ${touch ? 'h-12' : 'h-8'}`}
                  data-testid={`${testId}-${id}-reset`}
                >
                  <RotateCcw size={13} /> Reset {info.name}'s grade
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
