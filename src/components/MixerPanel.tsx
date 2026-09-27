import { useState, type ReactNode } from 'react';
import { ArrowUp, ArrowDown, ChevronDown, RotateCcw } from 'lucide-react';
import { DEFAULT_SETTINGS, type VisualizerSettings } from '../types';
import { Slider } from './ui';
import {
  MIX_SOURCE_INFO, MIX_GRADES, MIX_CONTROLS, MIX_LAMP, MIX_BLENDS, MIX_BLEND_LABEL, OWN_BLEND,
  blendKey, fadeKey, gradeKey, gradeLabel, mixStack, moveInMix, MIX_FADE_KEYS,
  type MixSource, type MixMover, type MixBlend,
} from '../lib/mixer';
import type { FadeWay } from '../lib/mixFade';
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
 * The blend (PLAN.md §11 step 3) is in the same drawer, over the grade: it is
 * set for a song rather than ridden, like the grade. A row whose blend is not
 * its own says so in its tag, so a film left on Add is seen with the drawer
 * shut; the front plate has none, being the glass the rest is laid on.
 *
 * Each row's take button (PLAN.md §11 step 4, lib/mixFade.ts) sits beside its
 * level, since it is the level's other hand: the fader rides, the button
 * takes the row out over its fade time, in bars, and brings it back to where
 * it was. It says what a press will do ("Fade out", "Cut in" at no bars), and
 * lights while a fade runs, when a press turns it round. The fade time is in
 * the drawer with the blend: set for a song, not ridden.
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
  /**
   * A row's take button pressed. Without it the buttons are not drawn: a take
   * is a timed walk the show runs (App's `fadeRow`), not a patch this panel
   * can send.
   */
  onFade?: (id: MixSource) => void;
  /** The rows fading now, and which way, so a running fade's button is lit. */
  fading?: Partial<Record<MixSource, FadeWay>>;
  testId?: string;
}

/** One line on what each of the four does, for its button's tooltip. */
const BLEND_HINT: Record<Exclude<MixBlend, 'own'>, string> = {
  screen: 'Screen: its light added to what is under it, never past white',
  add: 'Add: its light added, as two projectors on one wall add',
  multiply: 'Multiply: a slide in front of the lens; its dark darkens what is under it',
  key: 'Key: its dark drops out, and only its light parts are laid over',
};

const SPEC = (key: keyof VisualizerSettings) => PIN_RANGE.get(String(key)) ?? { min: 0, max: 1 };

export function MixerPanel({ settings, onSetting, hasFilm, hasMark, touch = false, chips, onFade, fading = {}, testId = 'mixer' }: MixerPanelProps) {
  const [open, setOpen] = useState<MixSource | null>(null);
  const stack = mixStack(settings.mixOrder);
  const rows = [...stack].reverse();
  const move = (id: MixMover, dir: 1 | -1) => onSetting({ mixOrder: moveInMix(settings.mixOrder, id, dir) });
  const canMove = (id: MixSource, dir: 1 | -1) =>
    id !== 'front' && moveInMix(settings.mixOrder, id, dir) !== mixStack(settings.mixOrder).join(' ');
  const s = settings as unknown as Record<string, number>;
  const lampish = (id: MixSource) => (MIX_LAMP as readonly string[]).includes(id);
  const ownKey = (key: keyof VisualizerSettings) => MIX_CONTROLS.some(c => c.key === key) || MIX_FADE_KEYS.includes(key);
  const blendOf = (id: MixMover): MixBlend => {
    const b = (settings as unknown as Record<string, unknown>)[String(blendKey(id))];
    return (MIX_BLENDS as readonly unknown[]).includes(b) ? b as MixBlend : 'own';
  };
  /** What a row's Own is, said on its button: the back plate's is whichever Blend Mode the look has. */
  const ownIs = (id: MixMover) => id === 'back' ? `the Blend Mode under Multi-Layer Mixer (${settings.blendMode})` : OWN_BLEND[id];

  const blendPicker = (id: MixMover) => {
    const now = blendOf(id);
    return (
      <div className="mb-3" role="radiogroup" aria-label={`${MIX_SOURCE_INFO[id].name}'s blend`} data-testid={`${testId}-${id}-blend`}>
        <div className="mb-1 text-[12px] text-text-2">Blend</div>
        {/*
          Five in a row, tight: in the desk's docked Mixer, the width of the
          rides' column, "Multiply" at the usual spacing was 2 px wider than
          its fifth (`npm run layout`).
        */}
        <div className="grid grid-cols-5 gap-0.5">
          {MIX_BLENDS.map(b => (
            <button
              key={b}
              role="radio"
              aria-checked={now === b}
              onClick={() => onSetting({ [blendKey(id)]: b } as Partial<VisualizerSettings>)}
              title={b === 'own' ? `Its own way in: ${ownIs(id)}` : BLEND_HINT[b]}
              data-testid={`${testId}-${id}-blend-${b}`}
              className={`min-w-0 rounded-md border text-[12px] tracking-tight transition-colors ${touch ? 'h-12' : 'h-7'} ${
                now === b ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-border text-text-2 hover:bg-hover'
              }`}
            >
              {MIX_BLEND_LABEL[b]}
            </button>
          ))}
        </div>
      </div>
    );
  };

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
            step={String(key).endsWith('Hue') ? 1 : String(key).endsWith('Fade') ? 0.5 : 0.01}
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

  /**
   * The take button. What a press does is read the way the fade reads it
   * (`RowFades.wayOf`): a running fade turns round, a row up goes out, a row
   * at nothing comes in.
   */
  const take = (id: MixSource) => {
    const level = s[String(MIX_SOURCE_INFO[id].level)];
    const running = fading[id];
    const way: FadeWay = running ? (running === 'out' ? 'in' : 'out') : (typeof level !== 'number' || level > 0.001 ? 'out' : 'in');
    const bars = s[String(fadeKey(id))];
    const cut = typeof bars === 'number' && bars <= 0;
    const label = `${cut ? 'Cut' : 'Fade'} ${way}`;
    return (
      <button
        onClick={() => onFade?.(id)}
        aria-pressed={!!running}
        aria-label={`${MIX_SOURCE_INFO[id].name}: ${label.toLowerCase()}`}
        title={running ? `Fading ${running}; press to turn it round` : cut ? `${label} at once (its fade time is 0)` : `${label} over its fade time`}
        data-testid={`${testId}-${id}-take`}
        data-way={way}
        className={`mt-1 shrink-0 rounded-md border px-2 text-[12px] transition-colors ${touch ? 'h-12 min-w-[76px]' : 'h-7 min-w-[64px]'} ${
          running ? 'border-accent-border bg-accent-bg text-accent-text' : 'border-border text-text-2 hover:bg-hover'
        }`}
      >
        {label}
      </button>
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
        Top of the list is on top on the wall. What is under the front plate is its lamp; the LED ring and the lumia above it are beams, the gel a filter on the lens. {onFade ? 'Fade takes a row out over its fade time and back. ' : ''}Grade opens a row's blend, fade time and grade.
      </p>
      {rows.map(id => {
        const info = MIX_SOURCE_INFO[id];
        const off = absent(id);
        const isOpen = open === id;
        const under = stack.indexOf(id) < stack.indexOf('front');
        const role = !lampish(id) ? null : under ? 'lamp' : id === 'gel' ? 'lens' : 'beam';
        const blend = id === 'front' ? 'own' : blendOf(id);
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
                <span className={`shrink-0 ${touch ? 'text-[15px]' : 'text-[13px]'} font-medium ${off ? 'text-dim' : 'text-text'}`} data-testid={`${testId}-${id}-name`}>{info.name}</span>
                {/*
                  One tag for where the row sits and how it is laid in ("lamp · add"),
                  not two: on a phone the row's name, two tags, the Grade button and
                  two thumb-sized arrows left "Gel Wheel" about 46 px (the pre-push
                  review), and the name is what the row is found by. So the name
                  keeps its width and the tag gives way: even one tag, "lamp ·
                  multiply", cut "Gel Wheel" by 27 px on a 390 px phone (`npm run phone`).
                */}
                {(role || blend !== 'own') && (
                  <span className="min-w-0 truncate rounded-xs bg-hover px-1.5 py-0.5 text-[11px] text-text-2">
                    {role}{role && blend !== 'own' && ' · '}
                    {blend !== 'own' && <span className="text-accent-text" data-testid={`${testId}-${id}-blendtag`}>{MIX_BLEND_LABEL[blend].toLowerCase()}</span>}
                  </span>
                )}
              </div>
              <button
                onClick={() => setOpen(isOpen ? null : id)}
                aria-expanded={isOpen}
                aria-label={id === 'front' ? `${info.name}'s fade time and grade: brightness, contrast, saturation, hue` : `${info.name}'s blend, fade time and grade`}
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
              <div className="flex items-start gap-2 px-1">
                <div className="min-w-0 flex-1">{slider(info.level, 'Level')}</div>
                {onFade && take(id)}
              </div>
            )}
            {isOpen && (
              <div className="border-t border-border px-1 pt-3" data-testid={`${testId}-${id}-grade`}>
                {id !== 'front' && blendPicker(id)}
                {slider(fadeKey(id), 'Fade time')}
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
