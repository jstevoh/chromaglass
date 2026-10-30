import { Clapperboard, Droplets, Square } from 'lucide-react';
import { CARTOONS, runningTime } from '../lib/cartoons';
import { LIT } from './ui';

/**
 * The cartoons that ship with the app (lib/cartoons.ts), each with its two
 * uses: Pour lays it into the dish as dye, Film plays it through the
 * projector under the dye. One cartoon can be pouring while another (or the
 * same one) is the film; the row says which, and Stop ends the pour.
 *
 * The same rows on the desk's Dye panel, in the phone's dye sheet and in
 * Settings' Film section, so `size` is the only difference: the phone's
 * buttons are a thumb's height (44 px), the desk's and Settings' a pointer's.
 *
 * Settings' Film section was left without them at first, on the reasoning
 * that the desk shows the Dye panel anyway and `npm run layout` holds that no
 * control is on the screen twice. The owner then went looking for the
 * cartoons where films are (Settings → Film, 2026-10-29), found only the
 * three demo loops, and took them to be gone. Settings is a window over the
 * desk, so the two shelves are never both in view; the ids in Settings carry
 * `film-` in front so the layout check, which counts ids in the whole page
 * and not what can be seen, still tells a real duplicate from these.
 */
export interface CartoonShelfProps {
  /** The cartoon pouring as dye, or null. */
  pouring: string | null;
  /** The cartoon playing as the film, or null. */
  filming: string | null;
  onPour: (id: string) => void;
  onFilm: (id: string) => void;
  onStopPour: () => void;
}

export function CartoonShelf({ pouring, filming, onPour, onFilm, onStopPour, size = 'desk' }: CartoonShelfProps & { size?: 'desk' | 'phone' | 'settings' }) {
  const phone = size === 'phone';
  const pre = size === 'settings' ? 'film-' : '';
  const btn = `${phone ? 'h-11 px-3 text-[13px]' : 'h-7 px-2 text-[12px]'} flex shrink-0 items-center gap-1 rounded-md border`;
  const off = 'border-border bg-elevated text-text-2 hover:bg-hover';
  // Lit while in use (PLAN 35a): the violet wash this was read 1.16:1 against
  // the grey button beside it, a difference found by comparing, not seen.
  const on = LIT;
  return (
    <div className="flex flex-col gap-1" data-testid={`cartoons-${size}`}>
      {CARTOONS.map(c => (
        <div key={c.id} className="flex items-center gap-1.5" data-testid={`${pre}cartoon-${c.id}`}>
          <div className="min-w-0 flex-1">
            <div className={`truncate ${phone ? 'text-[14px]' : 'text-[12px]'} text-text`}>{c.title}</div>
            <div className="truncate text-[11px] text-dim">{c.year} · {runningTime(c.seconds)}{c.colour ? ' · colour' : ''}</div>
          </div>
          {pouring === c.id ? (
            <button onClick={onStopPour} aria-pressed className={`${btn} ${on}`} title="Pouring into the dish. Click to stop." data-testid={`${pre}cartoon-stop-${c.id}`}>
              <Square size={phone ? 14 : 11} /> Stop
            </button>
          ) : (
            <button onClick={() => onPour(c.id)} aria-pressed={false} className={`${btn} ${off}`} title="Pour it into the dish as dye, looping" data-testid={`${pre}cartoon-pour-${c.id}`}>
              <Droplets size={phone ? 14 : 11} /> Pour
            </button>
          )}
          <button
            onClick={() => onFilm(c.id)}
            aria-pressed={filming === c.id}
            className={`${btn} ${filming === c.id ? on : off}`}
            title="Play it through the projector as the film, looping (Film Mix sets how much shows)"
            data-testid={`${pre}cartoon-film-${c.id}`}
          >
            <Clapperboard size={phone ? 14 : 11} /> Film
          </button>
        </div>
      ))}
    </div>
  );
}
