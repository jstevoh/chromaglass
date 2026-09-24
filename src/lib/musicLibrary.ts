/**
 * Music that ships with the show, and the licence that lets it.
 *
 * A room with a projector in it usually has no music ready, and the two ways
 * of getting some — a microphone pointed at the ceiling, or a second tab
 * shared over a video call — are the two that go wrong at the venue. These
 * play from the show's own origin, through the show's own audio element, so
 * the tab that draws the picture is also the tab that makes the sound. That
 * matters for a video call: Chrome can share a *tab's* audio, and only a
 * tab's, so one shared tab then carries both.
 *
 * Served from here rather than linked to where they came from, and the reason
 * is not politeness. A cross-origin audio file without CORS headers feeds the
 * Web Audio analyser silence: the sound plays and the visuals run on a dead
 * signal, which looks exactly like a broken show and is very hard to diagnose
 * in front of a room. Same origin has no such failure.
 *
 * **Every track here must be free of a non-commercial restriction**, because a
 * work summit is a commercial room, and free of a no-derivatives one, because
 * a recorded call that carries the music under moving pictures is arguably an
 * adaptation. In practice that means CC-BY, CC0, or public domain. The licence
 * is carried next to the audio rather than written in a document somewhere, so
 * the credit on screen cannot drift away from what is playing.
 */

export type Track = {
  /** Served from `public/music`, so same-origin and analysable. */
  readonly src: string;
  readonly title: string;
  readonly artist: string;
  /** Seconds, from ffprobe on the file that ships. */
  readonly seconds: number;
  /** What the licence is called on screen. */
  readonly licence: string;
  readonly licenceUrl: string;
  /** Where it came from, so the claim can be checked. */
  readonly source: string;
  /** True when the licence obliges us to name the artist. */
  readonly mustCredit: boolean;
};

/*
  Re-encoded to 96 kbps and loudness-normalised to -18 LUFS, which both
  licences permit — CC-BY allows adaptation with credit, and the public-domain
  pieces carry no restriction at all. Ambient is spectrally smooth and holds up
  at that rate; the originals are 160-200 kbps and would have put 98 MB in the
  repository for music that plays under conversation. Normalising matters more
  than the bitrate here: without it a playlist steps up and down in volume
  between records made years apart.
*/
export const LIBRARY: readonly Track[] = [
  {
    src: '/music/rainy-days.mp3',
    title: 'Live On Rainy Days',
    artist: 'Ananta',
    seconds: 1884,
    licence: 'CC BY 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    source: 'https://archive.org/details/Ananta_Live',
    mustCredit: true,
  },
  {
    src: '/music/ambisphere-c.mp3',
    title: 'AmbiSphere (c)',
    artist: 'Thomas Park',
    seconds: 386,
    licence: 'Public Domain',
    licenceUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
    source: 'https://archive.org/details/ambisphere',
    mustCredit: false,
  },
  {
    src: '/music/ambisphere-d.mp3',
    title: 'AmbiSphere (d)',
    artist: 'Thomas Park',
    seconds: 431,
    licence: 'Public Domain',
    licenceUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
    source: 'https://archive.org/details/ambisphere',
    mustCredit: false,
  },
  {
    src: '/music/ambisphere-e.mp3',
    title: 'AmbiSphere (e)',
    artist: 'Thomas Park',
    seconds: 407,
    licence: 'Public Domain',
    licenceUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
    source: 'https://archive.org/details/ambisphere',
    mustCredit: false,
  },
];

/** Everything in the library, end to end. */
export const librarySeconds = (): number => LIBRARY.reduce((s, t) => s + t.seconds, 0);

/** `1:04:21`, or `6:26` when it is under an hour. */
export const clock = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
           : `${m}:${String(r).padStart(2, '0')}`;
};

/** The track after this one, wrapping, so a set never runs out mid-room. */
export const nextTrack = (src: string): Track => {
  const i = LIBRARY.findIndex(t => t.src === src);
  return LIBRARY[(i + 1 + LIBRARY.length) % LIBRARY.length];
};

/** Whoever has to be named for what is on the shelf, once each. */
export const credits = (): string =>
  [...new Set(LIBRARY.filter(t => t.mustCredit).map(t => `${t.artist} (${t.licence})`))].join(', ');
