import { Clapperboard, Droplets, Square } from 'lucide-react';
import { LIT } from './ui';

/**
 * The video someone loaded, with its two uses (PLAN 14ag): Play shows it
 * through the projector under the dye, Pour lays it into the dish as dye.
 * Either, both or neither, each a toggle lit while it runs.
 *
 * What the owner reported (2026-11-13): "if I load my own background video I
 * can't pour it, only load it to play." The app shipped demo loops and a shelf
 * of public domain cartoons with a Pour and a Film button each, and a file of
 * one's own had neither: Settings' Video file only played it, the desk's
 * "Pour a video…" only poured it, and the two never knew of each other, so the
 * film you loaded could not be poured without choosing it again in another
 * panel. The shelves are gone ("people can figure out their own videos"), and
 * the one video loaded, from either door, is this row's, with both uses.
 *
 * The same row on the desk's Video panel, its Dyes panel and the phone's dye
 * sheet, so `size` is the only difference: the phone's buttons a thumb's
 * height (44 px), the desk's a pointer's. `prefix` keeps ids apart where two
 * of these could be in one page (`npm run layout` counts ids in the page).
 */
export interface VideoShelfProps {
  /** The video loaded, by its name, or null before one is. */
  name: string | null;
  /** Playing through the projector as the film. */
  filming: boolean;
  /** Pouring into the dish as dye. */
  pouring: boolean;
  onFilm: () => void;
  onPour: () => void;
}

export function VideoShelf({ name, filming, pouring, onFilm, onPour, size = 'desk', prefix = '' }: VideoShelfProps & { size?: 'desk' | 'phone'; prefix?: string }) {
  if (!name) return null;
  const phone = size === 'phone';
  const btn = `${phone ? 'h-11 px-3 text-[13px]' : 'h-7 px-2 text-[12px]'} flex shrink-0 items-center gap-1 rounded-md border`;
  const off = 'border-border bg-elevated text-text-2 hover:bg-hover';
  const icon = phone ? 14 : 11;
  return (
    <div className="flex items-center gap-1.5" data-testid={`${prefix}video-loaded`}>
      <div className="min-w-0 flex-1">
        <div className={`truncate ${phone ? 'text-[14px]' : 'text-[12px]'} text-text`} data-testid={`${prefix}video-name`}>{name}</div>
        <div className="truncate text-[11px] text-dim">
          {filming && pouring ? 'playing and pouring' : filming ? 'playing through the dye' : pouring ? 'pouring as dye' : 'loaded'}
        </div>
      </div>
      <button
        onClick={onFilm}
        aria-pressed={filming}
        className={`${btn} ${filming ? LIT : off}`}
        title={filming ? 'Playing through the projector. Click to take it off.' : 'Play it through the projector, under the dye, looping'}
        data-testid={`${prefix}video-film`}
      >
        <Clapperboard size={icon} /> Play
      </button>
      <button
        onClick={onPour}
        aria-pressed={pouring}
        className={`${btn} ${pouring ? LIT : off}`}
        title={pouring ? 'Pouring into the dish. Click to stop.' : 'Pour it into the dish as dye, looping'}
        data-testid={`${prefix}video-pour`}
      >
        {pouring ? <Square size={icon} /> : <Droplets size={icon} />} {pouring ? 'Stop' : 'Pour'}
      </button>
    </div>
  );
}
