/**
 * The webpage's films: six pieces of modern ambient music, each played whole
 * by one of the app's looks (PLAN.md 34a-6, 34a-6d), and the channel's longer
 * films, a whole album with a look for each piece.
 *
 * What was asked (the owner, 2026-10-29): films of the looks on the webpage,
 * each to a different kind of music, the cards to animate when a pointer is
 * over them, the films to open larger with their sound, and the same films on
 * the channel. Then (2026-11-08) six 1920s records, the films the app made
 * once its ear could hear a beat without a kick drum (PLAN.md 14d-2). Then
 * (2026-11-21): "we need to move all of the demo videos off of the old
 * recordings. The quality is just too low", to modern ambient music by
 * artists not used before. A 78 transfer is a 1920s acoustic or early
 * electric recording, cut to shellac and played back through a stylus: about
 * 4 kHz of top end, the surface's hiss under every bar, and a dynamic range
 * a modern master has three times of. The plate was hearing the hiss as much
 * as the music, and a visitor hears the hiss before the plate. A modern
 * ambient master is the opposite: full range, no noise floor, slow swells a
 * liquid can follow, which is what a liquid light show is played to.
 *
 * Whose music, and why it is free to use (public/landing/films/SOURCES.md
 * has each page and its licence line as it read on 2026-11-21). Every piece
 * is under Creative Commons Attribution 4.0, CC BY: commercial use allowed, a
 * monetised channel and a product's own webpage included, so long as the
 * credit is given, in the words its composer asks for. No NonCommercial and
 * no NoDerivatives licence is used: a film is a derivative (picture set to
 * the music), and the channel and the page sell the app.
 *
 *   - Scott Buckley's library (scottbuckley.com.au), for the webpage's six:
 *     cinematic and electronic ambient, mastered at 320 kb/s. He registers
 *     his own music with the channel's claim system, and his system skips a
 *     video whose description names him; so every description carries his
 *     credit line, word for word, and a claim that comes anyway is released
 *     with his form (SOURCES.md links it).
 *   - Chris Zabriskie's album Cylinders (2014), for the channel's long film:
 *     nine slow pieces for piano and synthesiser. He does not use the claim
 *     system ("If you receive a copyright claim on my music, it did not come
 *     from me"), and asks for the credit in the work itself where it can be,
 *     which the long film's description and its chapters give.
 *
 * So each film here is three things made from one render: the whole piece
 * with the plate playing it (the app's own Song film, made by `npm run
 * sitefilms` on a Mac, uploaded to the channel, and played on the page from
 * there), a loop of a few seconds with no sound that the card plays
 * (public/landing/films/<id>.mp4 and .webm), and the loop's first frame as
 * the card's still (public/landing/films/<id>.webp). They sit in a row of
 * their own under the page's gallery of looks, which keeps its stills: the
 * gallery shows the eight looks a visitor is sold on, and these show what the
 * plate does with a piece of music from start to finish.
 *
 * Why a short loop on the card and not an animated GIF, which was the first
 * ask: a GIF has 256 colours, and a plate is gradients, so its dye bands into
 * steps; and it is ten to twenty times the bytes of the same seconds as a
 * video (a GIF has no motion compression at all). A muted, looping video is
 * what every browser plays without a gesture, on a phone too, and the still
 * stands in until it plays.
 *
 * Why the film is played from the channel and not from this site: each is
 * 100 to 300 MB at the quality a plate needs, and the channel streams each at
 * the size the visitor's screen and connection can take, where a file from
 * here would be one size for everyone. The page embeds the player from
 * youtube-nocookie.com, which sets no cookie until the visitor presses play.
 * `youtube` is null until the film is on the channel; a card with no film to
 * open is a still that plays its loop, and nothing more.
 *
 * Why these six: each piece is given the look whose motion suits it, the six
 * looks the 1920s row had, so the row still shows the same range of the app
 * (a burst, a flare, a galaxy, a curtain of light, a reef, a dark room), and
 * the pieces span what the library has: electronica that pulses, an
 * orchestral swell, a slow drone. The 1920s films stay on the channel as they
 * were; they are no longer what the page or the TV app shows.
 */

/** A piece of music a film plays, and where it was taken from. */
export interface Music {
  title: string;
  artist: string;
  /** The album, where the piece is one of an album's. */
  album?: string;
  /** The year it was published. */
  year: number;
  /** The composer's own page for it, which states its licence: the credit links here. */
  page: string;
  /** The file itself, as the composer publishes it: what `npm run sitefilms` fetches, on a Mac, never the site. */
  file: string;
  /** Of that file, so a changed file is noticed rather than filmed. */
  sha256: string;
  /** Where the music starts in the file, past any silence at its head, in seconds. */
  from: number;
  /** How long the music is from there, to just past its last sound, in seconds. */
  seconds: number;
}

export interface SiteFilm {
  /** The film's name in the page and its files under public/landing/films. */
  id: string;
  /** The look that plays it, a preset id (src/presets.ts). */
  look: string;
  /** The look's name as the app shows it (its preset's `name`; `npm run landingfilms` holds the two the same). Here so the page needn't load the presets. */
  lookName: string;
  /** The kind of music and its year, as the card's label says it. */
  kind: string;
  music: Music;
  /** The plate's seed for the render (`?seed=`): the same seed draws the same film. */
  seed: number;
  /** Where in the film the card's loop is taken from, in seconds. */
  loopAt: number;
  /** The film's id on the channel, once the owner has uploaded it. */
  youtube: string | null;
}

/** The card's loop: this many seconds, the last `LOOP_BLEND_S` of them blended into the first. */
export const LOOP_SECONDS = 6;
export const LOOP_BLEND_S = 1;
/** The film's music: a short fade in, so it never clicks in, and a longer one out past the last sound. */
export const FADE_IN_S = 0.15;
export const FADE_OUT_S = 1.2;

export const SITE_FILMS: readonly SiteFilm[] = [
  {
    id: 'effervescence', look: 'splodascope', lookName: 'Splodascope', kind: 'Ambient electronica, 2023', seed: 1, loopAt: 120, youtube: 'qCgjkGwye7g',
    music: {
      title: 'Effervescence', artist: 'Scott Buckley', year: 2023, page: 'https://www.scottbuckley.com.au/library/effervescence/',
      file: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2023/07/Effervescence.mp3',
      sha256: '215ff6ec113abbcfa3258028af322f651a40cf1102996b347dde873379b42674', from: 0.45, seconds: 411.05,
    },
  },
  {
    id: 'hymn-to-the-dawn', look: 'solar-flare', lookName: 'Solar Flare', kind: 'Orchestral ambient, 2022', seed: 1, loopAt: 180, youtube: null,
    music: {
      title: 'Hymn to the Dawn', artist: 'Scott Buckley', year: 2022, page: 'https://www.scottbuckley.com.au/library/hymn-to-the-dawn/',
      file: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2022/11/HymnToTheDawn.mp3',
      sha256: 'a7797ccc8cae700d9b0f07fc31e13424da00e406a154e308afe5d272c29aec6b', from: 1.75, seconds: 416.6,
    },
  },
  {
    id: 'distant-sun', look: 'galaxy', lookName: 'Galaxy', kind: 'Space ambient, 2019', seed: 1, loopAt: 90, youtube: 'ihrJ3K7UiWA',
    music: {
      title: 'The Distant Sun', artist: 'Scott Buckley', year: 2019, page: 'https://www.scottbuckley.com.au/library/the-distant-sun/',
      file: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/07/sb_monomyth_1_thedistantsun.mp3',
      sha256: 'd36718692cbc0fddb36700dc754b90a5205495d3b89eb0b3ab8f4af0cbf6c57e', from: 1.0, seconds: 219.8,
    },
  },
  {
    id: 'permafrost', look: 'aurora-borealis', lookName: 'Aurora Borealis', kind: 'Neoclassical ambient, 2022', seed: 1, loopAt: 150, youtube: 'EaETAQuSdS0',
    music: {
      title: 'Permafrost', artist: 'Scott Buckley', year: 2022, page: 'https://www.scottbuckley.com.au/library/permafrost/',
      file: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2022/08/Permafrost.mp3',
      sha256: '9585b9825339e7bd421db06368695bab7bc726e98611c7e15cd7d4dfc0c539ab', from: 1.1, seconds: 446.8,
    },
  },
  {
    id: 'undertow', look: 'neon-coral-reef', lookName: 'Neon Coral Reef', kind: 'Drifting ambient, 2019', seed: 1, loopAt: 100, youtube: '_Vt8IcljL3g',
    music: {
      title: 'Undertow', artist: 'Scott Buckley', year: 2019, page: 'https://www.scottbuckley.com.au/library/undertow/',
      file: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_undertow.mp3',
      sha256: '4652007dad67295f1f5c87c8cbc8e2df1a530e7671266a29f693a084375d3910', from: 0.5, seconds: 248.0,
    },
  },
  {
    id: 'machina', look: 'velvet-underground', lookName: 'Velvet Underground', kind: 'Dark ambient electronica, 2019', seed: 1, loopAt: 120, youtube: 'MBN1oGpenZ0',
    music: {
      title: 'Machina', artist: 'Scott Buckley', year: 2019, page: 'https://www.scottbuckley.com.au/library/machina/',
      file: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/12/sb_machina.mp3',
      sha256: '72f479c583fd1cb894584c51d4fb9b33200b098bd1b13195bd41d29586d9d344', from: 0, seconds: 290.0,
    },
  },
];

/**
 * The licence every piece here is under. `npm run landingfilms` holds each
 * piece's page to it, and SOURCES.md records the line each page carries.
 */
export const LICENCE = {
  name: 'CC BY 4.0',
  long: 'Creative Commons Attribution 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
};

/**
 * The credit, a line each, as the channel's description and SOURCES.md give
 * it: in the words the composer asks for. Scott Buckley's own line is "[Track
 * Title] by Scott Buckley – released under CC-BY 4.0. www.scottbuckley.com.au",
 * and his claim system reads the description for his name; Chris Zabriskie's
 * is the title, "From the album", and the licence's long name.
 */
export const creditOf = (m: Music): string[] => m.artist === 'Scott Buckley'
  ? [`${m.title} by Scott Buckley – released under CC-BY 4.0. www.scottbuckley.com.au`, m.page, `Licence: ${LICENCE.url}`]
  : [`"${m.title}" by ${m.artist}`, ...(m.album ? [`From the album ${m.album}`] : []), `Licensed under ${LICENCE.long}: ${LICENCE.url}`, m.page];

export const creditLines = (f: SiteFilm): string[] => creditOf(f.music);

/**
 * The channel's long films: a whole album, a look for each piece, cut
 * together into one film with a chapter at each piece (`npm run sitefilms --
 * --album <id>`). The owner, 2026-11-21, on the shortlist: Buckley for the
 * webpage's films and Zabriskie for the longer pieces on the channel. These
 * are not on the webpage: a 37-minute film is for the channel, where a
 * listener leaves it playing.
 */
export interface AlbumPiece { look: string; lookName: string; seed: number; music: Music }
export interface ChannelAlbum { id: string; title: string; artist: string; year: number; page: string; pieces: readonly AlbumPiece[]; youtube: string | null }

const CYLINDERS = 'https://chriszabriskie.bandcamp.com/album/cylinders';
export const CHANNEL_ALBUMS: readonly ChannelAlbum[] = [
  {
    id: 'cylinders', title: 'Cylinders', artist: 'Chris Zabriskie', year: 2014, page: CYLINDERS, youtube: null,
    // The files are the Free Music Archive's, kept by the Internet Archive
    // (item Cylinders-15736): the album as its composer released it for free
    // in 2014, VBR MP3 at about 330 kb/s, each checksummed here on
    // 2026-11-21. The files start on the music and end on it, but for the
    // last, which ends on fifteen seconds of silence; that is cut.
    pieces: [
      { look: 'chemical-clock', lookName: 'Chemical Clock', seed: 1, music: { title: 'Cylinder One', artist: 'Chris Zabriskie', album: 'Cylinders', year: 2014, page: CYLINDERS, file: 'https://archive.org/download/Cylinders-15736/Chris_Zabriskie_-_01_-_Cylinder_One.mp3', sha256: '13ff79d392fb763722fc4b18a45a5af1c43b7a781248ca99f537adbf6e8ccb9e', from: 0, seconds: 176.1 } },
      { look: 'jellyfish-bloom', lookName: 'Jellyfish Bloom', seed: 1, music: { title: 'Cylinder Two', artist: 'Chris Zabriskie', album: 'Cylinders', year: 2014, page: CYLINDERS, file: 'https://archive.org/download/Cylinders-15736/Chris_Zabriskie_-_02_-_Cylinder_Two.mp3', sha256: 'fc6a97f8a1e47d22793819b73a0c4e2fb0969ffe6e064eaea2b3e6c0ce3f30ad', from: 0, seconds: 227.8 } },
      { look: 'soap-film', lookName: 'Soap Film', seed: 1, music: { title: 'Cylinder Three', artist: 'Chris Zabriskie', album: 'Cylinders', year: 2014, page: CYLINDERS, file: 'https://archive.org/download/Cylinders-15736/Chris_Zabriskie_-_03_-_Cylinder_Three.mp3', sha256: '38c3086624f0701ae307d28e348bb5cf9c79445e9f754b6aa8d6f8f6cb89b9ec', from: 0, seconds: 166.3 } },
      { look: 'oil-and-water', lookName: 'Oil & Water', seed: 1, music: { title: 'Cylinder Four', artist: 'Chris Zabriskie', album: 'Cylinders', year: 2014, page: CYLINDERS, file: 'https://archive.org/download/Cylinders-15736/Chris_Zabriskie_-_04_-_Cylinder_Four.mp3', sha256: 'b3a5336119cdf22597d080cab8ba74dce6f0bebbe7638d2eff490a232c06eeb5', from: 0, seconds: 176.7 } },
      { look: 'milk-marble', lookName: 'Milk Marbling', seed: 1, music: { title: 'Cylinder Five', artist: 'Chris Zabriskie', album: 'Cylinders', year: 2014, page: CYLINDERS, file: 'https://archive.org/download/Cylinders-15736/Chris_Zabriskie_-_05_-_Cylinder_Five.mp3', sha256: '6b890b6ec072453f86aac5f3175df496dbeaf4591d42ceaf75f2681acf8b08d0', from: 0, seconds: 173.5 } },
      { look: 'fractal-dream', lookName: 'Fractal Dream', seed: 1, music: { title: 'Cylinder Six', artist: 'Chris Zabriskie', album: 'Cylinders', year: 2014, page: CYLINDERS, file: 'https://archive.org/download/Cylinders-15736/Chris_Zabriskie_-_06_-_Cylinder_Six.mp3', sha256: '95d4d22ad284ffd07c3df0d80a92afb699da3d98d9c1202d4006ba50cff67e35', from: 0, seconds: 105.6 } },
      { look: 'lava-lamp', lookName: 'Lava Lamp', seed: 1, music: { title: 'Cylinder Seven', artist: 'Chris Zabriskie', album: 'Cylinders', year: 2014, page: CYLINDERS, file: 'https://archive.org/download/Cylinders-15736/Chris_Zabriskie_-_07_-_Cylinder_Seven.mp3', sha256: 'b065596eeca06a82aabc6a46cd7446e56d62ff5fa761abf92d8147a3c3adde96', from: 0, seconds: 532.2 } },
      { look: 'galaxy', lookName: 'Galaxy', seed: 1, music: { title: 'Cylinder Eight', artist: 'Chris Zabriskie', album: 'Cylinders', year: 2014, page: CYLINDERS, file: 'https://archive.org/download/Cylinders-15736/Chris_Zabriskie_-_08_-_Cylinder_Eight.mp3', sha256: '4f980cf97608dd9f0c7dbed8a9742d0083584767b2e8338ac50514ca0700129a', from: 0, seconds: 338.9 } },
      { look: 'aurora-borealis', lookName: 'Aurora Borealis', seed: 1, music: { title: 'Cylinder Nine', artist: 'Chris Zabriskie', album: 'Cylinders', year: 2014, page: CYLINDERS, file: 'https://archive.org/download/Cylinders-15736/Chris_Zabriskie_-_09_-_Cylinder_Nine.mp3', sha256: '108c6a8babb1d088787d59442412a5bb50506c787892e5f8099a2b714dc659b7', from: 0, seconds: 308.5 } },
    ],
  },
];

export const filmOf = (id: string): SiteFilm | undefined => SITE_FILMS.find((f) => f.id === id);
