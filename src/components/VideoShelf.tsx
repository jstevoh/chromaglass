import { useEffect, useRef } from 'react';
import { Camera, Disc3, Droplets, Film, Lamp, MonitorPlay, Square, SquareStack } from 'lucide-react';
import { LIT } from './ui';
import { filmPlaceOf, filmPlacePatch, type FilmPlace } from '../lib/mixer';
import type { VisualizerSettings } from '../types';

/**
 * The video coming in, and what it is doing (PLAN 14ag, 14ag-9): which input
 * it is, a small live picture of it, where it shows (over the plate, as the
 * lamp under the dish, or as the spinning LED platform) and whether it pours
 * into the dish as dye.
 *
 * What the owner reported (2026-11-27), after a night with the camera on:
 * "It is generally hard to understand and control what is on screen", and "I
 * want to bring back the ability to pour the video on as well as playing it
 * as a plate, as the light, or as the spinning led light background". This
 * row was the video file's alone (Play, Lamp, Pour, 14ag): with the camera on
 * the plate it went on naming the file loaded earlier with its Play unlit,
 * the camera could not be poured or put under the dish from here, and
 * nothing showed what the camera was actually seeing, so the plate's picture
 * could not be told from what was coming in. Now the row is the input on
 * the plate (a camera or a window while one is on, else the file loaded),
 * with the same four uses for each:
 *
 * - Plate, Lamp and LED ring are where it shows, one at a time, the one lit.
 *   They are one setting each already, not a new mode: Plate and Lamp are
 *   the film's row in the mixer's stack (`filmAsLamp`), so the mixer shows
 *   them and its arrows undo them; LED ring is `filmRing` (the ring's shader
 *   reads the picture in place of its wheel of colour, wgsl/plateLamp.ts).
 *   Pressing the lit one again: Plate takes the video off, Lamp and LED ring
 *   lay it over the plate again, as Lamp did before.
 * - Pour, beside them, lays it into the dish as dye, frame by frame, with its
 *   motion as the liquid's (lib/videoFlow.ts), for a camera as for a file.
 *
 * The same row on the desk's Video panel, its Dyes panel and the phone's dye
 * sheet, so `size` is the only difference: the phone's buttons a thumb's
 * height (44 px), the desk's a pointer's. `prefix` keeps ids apart where two
 * of these could be in one page (`npm run layout` counts ids in the page).
 */
export interface VideoShelfProps {
  /** The input's name (the file's, the camera's), or null when there is none. */
  name: string | null;
  /** What the input is. */
  kind?: 'file' | 'camera' | 'window';
  /** Showing on the plate (anywhere: over it, in the lamp, on the ring). */
  filming: boolean;
  /** Pouring into the dish as dye. */
  pouring: boolean;
  /** What else pours, by its name, when not this input (a file poured before the camera went on); Pour swaps to this one. */
  pourName?: string | null;
  onFilm: () => void;
  onPour: () => void;
  /** The picture to show in the row's little screen, read each tenth of a second; null shows none. */
  preview?: () => HTMLVideoElement | null;
}

/** Where it shows: the settings it is read from, and how to write them. */
interface PlaceProps {
  mixOrder?: unknown;
  filmRing?: number;
  onPlace?: (patch: Partial<VisualizerSettings>) => void;
}

/*
  The little screen: the input as it arrives, before the plate does anything
  to it. Drawn from the film's own <video> (or the pour's) into a canvas a few
  times a second, not by a second <video> of its own, so a file is not
  decoded twice and the picture is the very frame the plate is reading.
*/
function Preview({ get, phone, testId }: { get: () => HTMLVideoElement | null; phone: boolean; testId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const c = ref.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx || document.hidden) return;
      const v = get();
      if (!v || v.readyState < 2 || !v.videoWidth) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height); return; }
      // Cover-fit, as the plate fits it at Video Zoom 1.
      const s = Math.max(c.width / v.videoWidth, c.height / v.videoHeight);
      const w = v.videoWidth * s, h = v.videoHeight * s;
      try { ctx.drawImage(v, (c.width - w) / 2, (c.height - h) / 2, w, h); } catch { /* not readable yet */ }
    };
    draw();
    const t = setInterval(draw, 100);
    return () => clearInterval(t);
  }, [get]);
  return (
    <canvas
      ref={ref}
      width={phone ? 112 : 80}
      height={phone ? 63 : 45}
      className={`${phone ? 'h-[63px] w-[112px]' : 'h-[45px] w-[80px]'} shrink-0 rounded border border-border bg-black`}
      aria-label="What the video input is showing now"
      data-testid={testId}
    />
  );
}

const KIND_ICON = { file: Film, camera: Camera, window: MonitorPlay } as const;

/** In words, what the input is doing now: the row's second line. */
export function videoDoing(filming: boolean, place: FilmPlace, pouring: boolean, otherPour?: string | null): string {
  const shown = !filming ? '' : place === 'lamp' ? 'the lamp under the dish' : place === 'ring' ? 'the spinning LED ring' : 'over the plate';
  const pour = pouring ? 'pouring as dye' : otherPour ? `${otherPour} still pouring` : '';
  if (shown && pour) return `${shown}, and ${pour}`;
  return shown || pour || 'loaded, not showing';
}

export function VideoShelf({ name, kind = 'file', filming, pouring, pourName, onFilm, onPour, preview, mixOrder, filmRing, onPlace, size = 'desk', prefix = '' }: VideoShelfProps & PlaceProps & { size?: 'desk' | 'phone'; prefix?: string }) {
  if (!name) return null;
  const place = filmPlaceOf(mixOrder, filmRing);
  const phone = size === 'phone';
  const btn = `${phone ? 'h-11 px-3 text-[13px]' : 'h-7 px-2 text-[12px]'} flex shrink-0 items-center gap-1 rounded-md border`;
  const off = 'border-border bg-elevated text-text-2 hover:bg-hover';
  const icon = phone ? 14 : 11;
  const Kind = KIND_ICON[kind];
  /*
    Where it shows. Pressing a place that is not lit puts it there and starts
    the video if it was not showing; pressing the lit one undoes it (Plate:
    off; Lamp or LED ring: back over the plate). Without `onPlace` (a page
    that cannot write the mixer) only Plate is drawn, as Play was.
  */
  const go = (to: FilmPlace) => {
    if (filming && place === to) {
      if (to === 'plate') onFilm(); else onPlace?.(filmPlacePatch(mixOrder, 'plate'));
      return;
    }
    if (onPlace && place !== to) onPlace(filmPlacePatch(mixOrder, to));
    if (!filming) onFilm();
  };
  const places: [FilmPlace, string, typeof Lamp, string, string, string][] = [
    ['plate', 'Plate', SquareStack, 'video-film', 'Show it over the plate, through the dye. Click again to take it off.', 'Showing over the plate. Click to take it off.'],
    ['lamp', 'Lamp', Lamp, 'video-lamp', 'Make it the lamp under the dish: its light comes up through the liquid, the dye filters it and the surface bends it', 'The lamp under the dish. Click to lay it over the plate again.'],
    ['ring', 'LED ring', Disc3, 'video-ring', 'Put it on the spinning LED platform under the dish: the picture turns with LED Rotation Speed and lights the glass from below', 'On the spinning LED ring. Click to lay it over the plate again.'],
  ];
  return (
    <div className="flex flex-col gap-1.5" data-testid={`${prefix}video-loaded`}>
      <div className="flex items-center gap-2">
        {preview && <Preview get={preview} phone={phone} testId={`${prefix}video-preview`} />}
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-1 truncate ${phone ? 'text-[14px]' : 'text-[12px]'} text-text`}>
            <Kind size={icon} className="shrink-0 text-dim" />
            <span className="truncate" data-testid={`${prefix}video-name`}>{name}</span>
          </div>
          <div className={`${phone ? 'text-[13px]' : 'text-[12px]'} leading-snug text-text-2`} data-testid={`${prefix}video-doing`}>
            {videoDoing(filming, place, pouring, pourName)}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Where the video shows">
        {places.filter(([id]) => id === 'plate' || onPlace).map(([id, label, Icon, testId, tipOff, tipOn]) => {
          const lit = filming && place === id;
          return (
            <button
              key={id}
              onClick={() => go(id)}
              aria-pressed={lit}
              className={`${btn} ${lit ? LIT : off}`}
              title={lit ? tipOn : tipOff}
              data-testid={`${prefix}${testId}`}
            >
              <Icon size={icon} /> {label}
            </button>
          );
        })}
        <button
          onClick={onPour}
          aria-pressed={pouring}
          className={`${btn} ml-auto ${pouring ? LIT : off}`}
          title={pouring ? 'Pouring into the dish. Click to stop.' : 'Pour it into the dish as dye: each frame laid in, its motion stirring the liquid'}
          data-testid={`${prefix}video-pour`}
        >
          {pouring ? <Square size={icon} /> : <Droplets size={icon} />} {pouring ? 'Stop' : 'Pour'}
        </button>
      </div>
    </div>
  );
}
