/**
 * The films a TV plays when there is no show to play (PLAN 12-tv-2f): the six
 * pieces of modern ambient music the looks filmed for the webpage and the
 * channel (src/lib/siteFilms.ts), whole, one after another. They were six
 * 1920s records until 2026-11-21 (the owner: "The quality is just too low";
 * PLAN 34a-6d); the old files stay in the release, so a TV still running an
 * older build of the app still finds its films.
 *
 * What was asked (the owner, 2026-11-14): "I don't like the visuals that we
 * have as samples. Can we play the YouTube videos as samples? If not YouTube,
 * let's get much better and longer samples." The samples were the press
 * page's two clips, twenty seconds each of two looks to Kevin MacLeod's
 * music, made on 2026-10-29 before the solver learned most of what it now
 * does; the channel's films are the plate playing a whole piece each, three
 * and a half to seven and a half minutes, about thirty-four minutes in all.
 *
 * Why the channel's own files and not the channel's player. A TV app has no
 * browser, and YouTube's embedded player inside an Android WebView refuses to
 * play for many apps ("video unavailable", or an error for an embed with no
 * referrer it trusts), may put an advert in front of the film, and cannot be
 * driven from the remote without YouTube's own TV app. The masters are ours:
 * the same file that was uploaded to the channel (the sitefilms script on a
 * Mac, PLAN 34a-6), so what the TV plays is what the channel shows, with no
 * advert and no account, in the platform's own video player.
 *
 * Where they are served from. Each master is 100 to 300 MB, the six well
 * over a gigabyte together, which is too much for the
 * repository (every clone would carry it forever) and too much for the site's
 * hosting to stream to every TV. So the files are a release of this
 * repository (`TV_FILMS_RELEASE`, a pre-release, so the Mac app's updater,
 * which reads the latest release, never sees it), uploaded by `npm run
 * tvfilms` on the Mac that rendered them, and the site's address for each,
 * `https://chromaglass.art/films/<id>.mp4`, is a redirect to it
 * (firebase.json). The TV app and the TV page name only the site's address,
 * so the films can move to other storage with one line of firebase.json and
 * no new app on any TV.
 *
 * The music. Every piece is Scott Buckley's, under Creative Commons
 * Attribution 4.0 (public/landing/films/SOURCES.md, with the site's films,
 * has each page): free to show anywhere, a product's own TV app included, so
 * long as it is credited. So the TV says what is playing, whose it is and
 * under what licence, as the channel's description does.
 */

export interface TvFilm {
  /** The film's file, `<id>.mp4`, in the release and under /films/ on the site; the channel's film id in `src/lib/siteFilms.ts`. */
  id: string;
  /** The look that plays it, as the app names it. */
  look: string;
  title: string;
  performer: string;
  /** The year the piece was published. */
  year: number;
}

/** The release of this repository that holds the films (firebase.json redirects /films/ to it). */
export const TV_FILMS_RELEASE = 'tv-films-1';
/** Where the site serves them: a redirect to the release. */
export const TV_FILMS_ORIGIN = 'https://chromaglass.art';
export const TV_FILMS_PATH = '/films/';

export const TV_FILMS: readonly TvFilm[] = [
  { id: 'effervescence', look: 'Splodascope', title: 'Effervescence', performer: 'Scott Buckley', year: 2023 },
  { id: 'hymn-to-the-dawn', look: 'Solar Flare', title: 'Hymn to the Dawn', performer: 'Scott Buckley', year: 2022 },
  { id: 'distant-sun', look: 'Galaxy', title: 'The Distant Sun', performer: 'Scott Buckley', year: 2019 },
  { id: 'permafrost', look: 'Aurora Borealis', title: 'Permafrost', performer: 'Scott Buckley', year: 2022 },
  { id: 'undertow', look: 'Neon Coral Reef', title: 'Undertow', performer: 'Scott Buckley', year: 2019 },
  { id: 'machina', look: 'Velvet Underground', title: 'Machina', performer: 'Scott Buckley', year: 2019 },
];

/** The site's address for a film. */
export const tvFilmUrl = (f: TvFilm): string => `${TV_FILMS_ORIGIN}${TV_FILMS_PATH}${f.id}.mp4`;
