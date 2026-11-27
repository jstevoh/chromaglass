import { Clapperboard, Droplets, Lamp, Square } from 'lucide-react';
import { LIT } from './ui';
import { filmAsLamp, filmInLamp } from '../lib/mixer';

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
 *
 * Lamp (PLAN 14ag-3) puts the film under the glass: the video becomes the
 * lamp under the dish, seen through the liquid, the dye filtering its light
 * and the surface bending it (wgsl/plateLamp.ts). The owner chose it as the
 * way a video and the liquid meet (2026-11-14). It is the film's row moved in
 * the mixer's stack (lib/mixer.ts `filmAsLamp`), so the mixer shows it there
 * and its arrows undo it; the switch is here because this row is where the
 * video is, on the desk and the phone alike. It needs the stack to write to,
 * so a page that gives no `onMixOrder` shows Play and Pour only.
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

/** The mixer's stack, for the Lamp switch: the setting's value and how to write it. */
interface LampProps {
  mixOrder?: unknown;
  onMixOrder?: (order: string) => void;
}

export function VideoShelf({ name, filming, pouring, onFilm, onPour, mixOrder, onMixOrder, size = 'desk', prefix = '' }: VideoShelfProps & LampProps & { size?: 'desk' | 'phone'; prefix?: string }) {
  if (!name) return null;
  const lamp = filmInLamp(mixOrder);
  const phone = size === 'phone';
  const btn = `${phone ? 'h-11 px-3 text-[13px]' : 'h-7 px-2 text-[12px]'} flex shrink-0 items-center gap-1 rounded-md border`;
  const off = 'border-border bg-elevated text-text-2 hover:bg-hover';
  const icon = phone ? 14 : 11;
  return (
    <div className="flex items-center gap-1.5" data-testid={`${prefix}video-loaded`}>
      <div className="min-w-0 flex-1">
        <div className={`truncate ${phone ? 'text-[14px]' : 'text-[12px]'} text-text`} data-testid={`${prefix}video-name`}>{name}</div>
        <div className="truncate text-[12px] text-dim">
          {filming && lamp ? (pouring ? 'the lamp, and pouring' : 'the lamp under the dish') : filming && pouring ? 'playing and pouring' : filming ? 'playing through the dye' : pouring ? 'pouring as dye' : 'loaded'}
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
      {onMixOrder && (
        <button
          onClick={() => onMixOrder(filmAsLamp(mixOrder, !lamp))}
          aria-pressed={lamp}
          className={`${btn} ${lamp ? LIT : off}`}
          title={lamp
            ? 'The video is the lamp under the dish, seen through the liquid. Click to lay it over the plate again.'
            : 'Make the video the lamp under the dish: its light comes up through the liquid, the dye filters it and the surface bends it'}
          data-testid={`${prefix}video-lamp`}
        >
          <Lamp size={icon} /> Lamp
        </button>
      )}
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
