import { Clapperboard, Droplets } from 'lucide-react';
import { CartoonShelf, type CartoonShelfProps } from './CartoonShelf';
import { Tag, LIT } from './ui';

/** The loops that ship in public/video, for the Film section's demo rows. A loop is known by its title, which is the name of the File it is handed over as. */
const DEMO_LOOPS = [
  { id: 'ring', src: '/video/spinning-ring.webm', title: 'Spinning Ring (Transparent WebM)' },
  { id: 'particles', src: '/video/pulsing-particles.webm', title: 'Pulsing Particles (Transparent WebM)' },
  { id: 'orb', src: '/video/pulsing-orb.webm', title: 'Pulsing Orb (Transparent WebM)' },
] as const;

/**
 * Settings → Film's two shelves, under its source picker: the demo loops and
 * the public domain cartoons, each row with Film (the projector's film) and
 * Pour (into the dish as dye). Out of `SettingsPanel.tsx`, which is past the
 * size it may grow to (`npm run sizes`), when the cartoons joined the loops.
 * Settings leaves `cartoons` out on a docked Film panel; the comment on
 * them below says why.
 */
export function FilmShelves({ filmSource, filmName, pourName, onFilmFile, onFilmClear, onPourVideo, onStopPourVideo, cartoons }: {
  filmSource: string;
  filmName: string | null;
  pourName: string | null;
  onFilmFile?: (f: File) => void;
  onFilmClear?: () => void;
  onPourVideo?: (f: File) => void;
  onStopPourVideo?: () => void;
  cartoons?: CartoonShelfProps;
}) {
  return (
    <>
    {/*
      The demo loops, each with its two uses as the cartoon shelf has
      them: Film plays it as the source above, Pour lays it into the
      dish as dye. The whole row was a button that filmed it, with Pour
      as Dye a span inside it and Load Film a span that did nothing of
      its own (a click on it fell through to the row), and nothing said
      which loop was playing. Now each use is its own button, lit while
      that loop is doing it, and the one filming says so.
    */}
    <div className="mt-3 flex flex-col gap-1" data-testid="film-demos">
      <span className="mb-1 text-[11px] font-medium uppercase tracking-wider text-white/50">Demo loops</span>
      {DEMO_LOOPS.map(v => {
        const filming = filmSource === 'file' && filmName === v.title;
        const pouring = pourName === v.title;
        const fetchAs = async (use: (f: File) => void) => {
          try {
            const blob = await (await fetch(v.src)).blob();
            use(new File([blob], v.title, { type: 'video/webm' }));
          } catch (e) { console.error('Failed to load demo video', e); }
        };
        const btn = 'flex h-8 shrink-0 items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium transition-colors';
        const off = 'border-white/15 text-text-2 hover:bg-white/10';
        return (
          <div key={v.src} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5" data-testid={`film-demo-${v.id}`}>
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{v.title}</span>
            {filming && <Tag tone="next">playing as film</Tag>}
            <button
              aria-pressed={filming}
              onClick={() => (filming ? onFilmClear?.() : fetchAs(f => onFilmFile?.(f)))}
              className={`${btn} ${filming ? LIT : off}`}
              title={filming ? 'Playing as the film. Click to take it off.' : 'Play it through the projector as the film, looping (Film Mix sets how much shows)'}
              data-testid={`film-demo-film-${v.id}`}
            >
              <Clapperboard size={11} /> Film
            </button>
            <button
              aria-pressed={pouring}
              onClick={() => (pouring ? onStopPourVideo?.() : fetchAs(f => onPourVideo?.(f)))}
              className={`${btn} ${pouring ? LIT : off}`}
              title={pouring ? 'Pouring into the dish. Click to stop.' : 'Pour it into the dish as dye, looping'}
              data-testid={`film-demo-pour-${v.id}`}
            >
              <Droplets size={11} /> Pour
            </button>
          </div>
        );
      })}
    </div>

    {/*
      The cartoons, under the loops: whole public domain films from
      1919 to 1939, the same shelf as the desk's Dye panel and the
      phone's dye sheet, with the same two uses. Not on the docked Film
      panel: on a desk the Dye panel already holds them, and a panel
      docked beside it would put them on the screen twice.
    */}
    {cartoons && (
      <div className="mt-3 flex flex-col gap-1" data-testid="film-cartoons">
        <span className="mb-1 text-[11px] font-medium uppercase tracking-wider text-white/50">Public domain cartoons</span>
        <CartoonShelf {...cartoons} size="settings" />
      </div>
    )}
    </>
  );
}
