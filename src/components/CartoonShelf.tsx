import { Clapperboard, Droplets, Square } from 'lucide-react';
import { CARTOONS, runningTime } from '../lib/cartoons';
import { LIT } from './ui';

/**
 * The cartoons that ship with the app (lib/cartoons.ts), each with its two
 * uses: Pour lays it into the dish as dye, Film plays it through the
 * projector under the dye. One cartoon can be pouring while another (or the
 * same one) is the film; the row says which, and Stop ends the pour.
 *
 * The same rows on the desk's Dye panel and in the phone's dye sheet, so
 * `size` is the only difference: the phone's buttons are a thumb's height
 * (44 px), the desk's a pointer's. Not also in Settings' Film section: the
 * desk shows that beside the Dye panel, and `npm run layout` holds that no
 * control is on the screen twice.
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

export function CartoonShelf({ pouring, filming, onPour, onFilm, onStopPour, size = 'desk' }: CartoonShelfProps & { size?: 'desk' | 'phone' }) {
  const phone = size === 'phone';
  const btn = `${phone ? 'h-11 px-3 text-[13px]' : 'h-7 px-2 text-[12px]'} flex shrink-0 items-center gap-1 rounded-md border`;
  const off = 'border-border bg-elevated text-text-2 hover:bg-hover';
  // Lit while in use (PLAN 35a): the violet wash this was read 1.16:1 against
  // the grey button beside it, a difference found by comparing, not seen.
  const on = LIT;
  return (
    <div className="flex flex-col gap-1" data-testid={`cartoons-${size}`}>
      {CARTOONS.map(c => (
        <div key={c.id} className="flex items-center gap-1.5" data-testid={`cartoon-${c.id}`}>
          <div className="min-w-0 flex-1">
            <div className={`truncate ${phone ? 'text-[14px]' : 'text-[12px]'} text-text`}>{c.title}</div>
            <div className="truncate text-[11px] text-dim">{c.year} · {runningTime(c.seconds)}</div>
          </div>
          {pouring === c.id ? (
            <button onClick={onStopPour} aria-pressed className={`${btn} ${on}`} title="Pouring into the dish. Click to stop." data-testid={`cartoon-stop-${c.id}`}>
              <Square size={phone ? 14 : 11} /> Stop
            </button>
          ) : (
            <button onClick={() => onPour(c.id)} aria-pressed={false} className={`${btn} ${off}`} title="Pour it into the dish as dye, looping" data-testid={`cartoon-pour-${c.id}`}>
              <Droplets size={phone ? 14 : 11} /> Pour
            </button>
          )}
          <button
            onClick={() => onFilm(c.id)}
            aria-pressed={filming === c.id}
            className={`${btn} ${filming === c.id ? on : off}`}
            title="Play it through the projector as the film, looping (Film Mix sets how much shows)"
            data-testid={`cartoon-film-${c.id}`}
          >
            <Clapperboard size={phone ? 14 : 11} /> Film
          </button>
        </div>
      ))}
    </div>
  );
}
