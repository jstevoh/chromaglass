/**
 * The webpage's films: one look each, played to a piece of music that suits it
 * (PLAN.md 34a-6).
 *
 * What was asked (the owner, 2026-10-29): re-record the looks on the webpage,
 * about a minute each, each look with a different kind of music, the cards to
 * animate when a pointer is over them, the films to open larger with their
 * sound, and the same films on the channel. So each look here has three
 * things made from one render: the minute itself, with its music (made by
 * `npm run sitefilms` on a Mac, uploaded to the channel, and played on the
 * page from there), a loop of a few seconds with no sound that the card plays
 * (public/landing/films/<id>.mp4 and .webm), and the loop's first frame as
 * the card's still (public/landing/looks/<id>.webp).
 *
 * Why a short loop on the card and not an animated GIF, which was the first
 * ask: a GIF has 256 colours, and a plate is gradients, so its dye bands into
 * steps; and it is ten to twenty times the bytes of the same seconds as a
 * video (a GIF has no motion compression at all). A muted, looping video is
 * what every browser plays without a gesture, on a phone too, and the still
 * stands in until it plays.
 *
 * Why the minute is played from the channel and not from this site: it is
 * about 100 MB at the quality a plate needs, eight of them, and the channel
 * streams each at the size the visitor's screen and connection can take,
 * where a file from here would be one size for everyone. The page embeds the
 * player from youtube-nocookie.com, which sets no cookie until the visitor
 * presses play. `youtube` is null until the owner has uploaded the film; a
 * card with no film to open is a still that plays its loop, and nothing more.
 *
 * The music. Every piece is Kevin MacLeod's, from incompetech.com, under
 * Creative Commons Attribution 4.0: free to use in a film, commercially and
 * on a channel that earns from it, credited. His terms put the credit in the
 * video's description; here it is also under the player. The track, its
 * file and its checksum are what `npm run sitefilms` fetches and checks,
 * and public/landing/films/SOURCES.md records why each is free to use. A
 * piece is chosen for its kind, so that the eight films show the plate under
 * eight kinds of music, and each film plays the piece from its start, as a
 * listener would hear it, with a fade at the minute.
 */

export interface SiteFilm {
  /** The look, a preset id (src/presets.ts), and the name of its files under public/landing. */
  look: string;
  /** The kind of music, as the film's title says it. */
  genre: string;
  track: {
    title: string;
    artist: string;
    /** The recording's code, from incompetech.com's list: what answers a claim on the channel. */
    isrc: string;
    /**
     * The file's name in the composer's library (`INCOMPETECH` in scripts/sitefilms.mjs, which
     * fetches it on the Mac; the site itself never does, so no address of his is in the site).
     */
    file: string;
    /** Of that file, so a changed file is noticed rather than filmed. */
    sha256: string;
    /** Where the film's minute starts in the piece, in seconds. */
    from: number;
  };
  /** The plate's seed for the render (`?seed=`): the same seed draws the same film. */
  seed: number;
  /** Where in the film the card's loop is taken from, in seconds. */
  loopAt: number;
  /** The film's id on the channel, once it is uploaded. */
  youtube: string | null;
}

const MACLEOD = 'Kevin MacLeod';

export const FILM_SECONDS = 60;
/** The card's loop: this many seconds, the last `LOOP_BLEND_S` of them blended into the first. */
export const LOOP_SECONDS = 6;
export const LOOP_BLEND_S = 1;

export const SITE_FILMS: readonly SiteFilm[] = [
  {
    look: 'ferro-paint', genre: 'dark electronic', seed: 1, loopAt: 30, youtube: null,
    track: { title: 'Ethernight Club', artist: MACLEOD, isrc: 'USUAN2100002', file: 'Ethernight Club.mp3', sha256: '40c13873da38bff6da4e1e8d7e2907e05d4c308d25707aa707f3032bffe74064', from: 0 },
  },
  {
    look: 'aurora-borealis', genre: 'ambient', seed: 1, loopAt: 30, youtube: null,
    track: { title: 'Dreams Become Real', artist: MACLEOD, isrc: 'USUAN1500027', file: 'Dreams Become Real.mp3', sha256: 'a8ea5df5f969ed8d898af7fe07eb4712233f03e9d83f7ebcc88d1c851f3171b0', from: 0 },
  },
  {
    look: 'cell-bloom', genre: 'chillwave', seed: 1, loopAt: 30, youtube: null,
    track: { title: 'Chill Wave', artist: MACLEOD, isrc: 'USUAN1600048', file: 'Chill Wave.mp3', sha256: '7f07fbf89860959ff527f7b74606146dd0b0de263739989a70ce712c7c361614', from: 0 },
  },
  {
    look: 'poster-1969', genre: 'classic rock', seed: 1, loopAt: 30, youtube: null,
    track: { title: 'Twisted', artist: MACLEOD, isrc: 'USUAN1400046', file: 'Twisted.mp3', sha256: '56a2305a7b0356a9e0054fc4d8636a6d86f366578618f7271880136defe7ccda', from: 0 },
  },
  {
    look: 'macro-bead', genre: 'jazz', seed: 1, loopAt: 30, youtube: null,
    track: { title: 'Space Jazz', artist: MACLEOD, isrc: 'USUAN2100030', file: 'Space Jazz.mp3', sha256: '51924be4565a2f101f4daa45998aa4c3577dab05ba5d1067ffb7bc57583ad503', from: 0 },
  },
  {
    look: 'jellyfish-bloom', genre: 'dub', seed: 1, loopAt: 30, youtube: null,
    track: { title: 'Dub Feral', artist: MACLEOD, isrc: 'USUAN1200045', file: 'Dub Feral.mp3', sha256: '0b079ded2a2a9392729a8302cab6bc0d797e63690de60aa9ca6c5a8ae413e34c', from: 0 },
  },
  {
    // Funkorama opens on ten quiet seconds of a lone drum kit; the minute starts where the band comes in.
    look: 'lace-run', genre: 'funk', seed: 1, loopAt: 30, youtube: null,
    track: { title: 'Funkorama', artist: MACLEOD, isrc: 'USUAN1100474', file: 'Funkorama.mp3', sha256: '6be229815d85a0b99382b944d31098b882702c04ac7ad899e44ab7f8ba89b5ad', from: 8 },
  },
  {
    look: 'neon-coral-reef', genre: '80s synth-pop', seed: 1, loopAt: 30, youtube: null,
    track: { title: 'Newer Wave', artist: MACLEOD, isrc: 'USUAN2000024', file: 'Newer Wave.mp3', sha256: 'ef26589e066cc2f60f9523f8a3c17e543f57fc9e1145efc3bc46f7e5db92d0bc', from: 0 },
  },
];

export const LICENCE = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };

/** The credit the composer asks for, word for word (incompetech.com's "Attribution Code"). */
export const creditLines = (f: SiteFilm): string[] => [
  `"${f.track.title}" ${f.track.artist} (incompetech.com)`,
  'Licensed under Creative Commons: By Attribution 4.0 License',
  'http://creativecommons.org/licenses/by/4.0/',
];

export const filmOf = (look: string): SiteFilm | undefined => SITE_FILMS.find((f) => f.look === look);
