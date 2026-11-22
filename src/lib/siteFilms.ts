/**
 * The webpage's films: six records from before 1926, each played by one of
 * the app's looks for the whole of the record (PLAN.md 34a-6).
 *
 * What was asked (the owner, 2026-10-29): films of the looks on the webpage,
 * each to a different kind of music, the cards to animate when a pointer is
 * over them, the films to open larger with their sound, and the same films on
 * the channel. Then (the owner, 2026-11-08), on seeing the films the app made
 * of six 1920s records once its ear could hear a beat without a kick drum
 * (PLAN.md 14d-2): those films, on the website and on the channel.
 *
 * So each film here is three things made from one render: the whole record
 * with the plate playing it (the app's own Song film, made by `npm run
 * sitefilms` on a Mac, uploaded to the channel by the owner, and played on
 * the page from there), a loop of a few seconds with no sound that the card
 * plays (public/landing/films/<id>.mp4 and .webm), and the loop's first frame
 * as the card's still (public/landing/films/<id>.webp). They sit in a row of
 * their own under the page's gallery of looks, which keeps its stills: the
 * gallery shows the eight looks a visitor is sold on, and these show what the
 * plate does with a song from start to finish.
 *
 * Why a short loop on the card and not an animated GIF, which was the first
 * ask: a GIF has 256 colours, and a plate is gradients, so its dye bands into
 * steps; and it is ten to twenty times the bytes of the same seconds as a
 * video (a GIF has no motion compression at all). A muted, looping video is
 * what every browser plays without a gesture, on a phone too, and the still
 * stands in until it plays.
 *
 * Why the film is played from the channel and not from this site: each is
 * 100 to 160 MB at the quality a plate needs, and the channel streams each at
 * the size the visitor's screen and connection can take, where a file from
 * here would be one size for everyone. The page embeds the player from
 * youtube-nocookie.com, which sets no cookie until the visitor presses play.
 * `youtube` is null until the owner has uploaded the film; a card with no
 * film to open is a still that plays its loop, and nothing more.
 *
 * The music. Every record here was published in the United States before
 * 1926, and so is in the public domain there, the 1925 one since 1 January
 * 2026 and the older ones before it (17 U.S.C. § 1401(a)(2)(B), the Music
 * Modernization Act's schedule for recordings fixed before 1972: (i) for those
 * published before 1923, (ii) for 1923 to 1946, each 100 years after it was
 * published): the recording, and the song under it, which
 * is older still. The transfers are the Great 78 Project's, digitised from the
 * original shellac and published by the Internet Archive; the archive item,
 * the file and its checksum are what `npm run sitefilms` fetches and checks,
 * and public/landing/films/SOURCES.md records why each is free to use and
 * what was done to it (a trim of the run-in groove and run-out, a short fade
 * at each end, nothing else). A label's later remaster of the same take may
 * still be matched by the channel's claim system; SOURCES.md is the answer to
 * such a claim. Why these six: one record for each kind of music a 1920s
 * listener had (hot jazz, opera, solo piano, a dance band, New Orleans jazz,
 * the blues), each given the look whose motion suits it.
 */

export interface SiteFilm {
  /** The film's name in the page and its files under public/landing/films. */
  id: string;
  /** The look that plays it, a preset id (src/presets.ts). */
  look: string;
  /** The look's name as the app shows it (its preset's `name`; `npm run landingfilms` holds the two the same). Here so the page needn't load the presets. */
  lookName: string;
  /** The kind of music and its year, as the card's label says it. */
  kind: string;
  record: {
    title: string;
    performer: string;
    composer: string;
    /** The label, the catalogue number where it is known, and when it was published. */
    published: string;
    /** The Internet Archive item the transfer comes from (archive.org/details/<item>). */
    item: string;
    /** The file's name in that item: what `npm run sitefilms` fetches, on a Mac, never the site. */
    file: string;
    /** Of that file, so a changed file is noticed rather than filmed. */
    sha256: string;
    /** Where the music starts in the file, past the run-in groove, in seconds. */
    from: number;
    /** How long the music is from there, to just past its last note, in seconds. */
    seconds: number;
  };
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
/** The film's music: a short fade in past the groove, and a longer one out past the last note. */
export const FADE_IN_S = 0.15;
export const FADE_OUT_S = 1.2;

export const SITE_FILMS: readonly SiteFilm[] = [
  {
    id: 'wolverines', look: 'splodascope', lookName: 'Splodascope', kind: 'Hot jazz, 1924', seed: 1, loopAt: 70, youtube: 'j7afUdmWi2c',
    record: {
      title: 'Riverboat Shuffle', performer: 'The Wolverine Orchestra, with Bix Beiderbecke',
      composer: 'Hoagy Carmichael, Dick Voynow and Irving Mills', published: 'Gennett 5454, 1924',
      item: '78_riverbeat-shuffle_wolverine-orchestra-carmichael_gbia0009181a',
      file: 'Riverbeat Shuffle - Wolverine Orchestra - Carmichael.flac',
      sha256: '6645df2fa4625ca5f2b716eaa0605e854d65534da05182cd2b1655bd428a98df', from: 0.4, seconds: 156.53,
    },
  },
  {
    id: 'caruso', look: 'solar-flare', lookName: 'Solar Flare', kind: 'Opera, 1907', seed: 1, loopAt: 100, youtube: '9N4GEV-z2KE',
    record: {
      title: 'Vesti la giubba', performer: 'Enrico Caruso',
      composer: 'Ruggero Leoncavallo, from Pagliacci (1892)', published: 'Victor 88061, 1907',
      item: '78_pagliacci-vesti-la-giubba-on-with-the-play-act-1_enrico-caruso-ruggiero-leonc_gbia0276270a',
      file: 'Pagliacci - Vesti la giubba (On With the P - Enrico Caruso.flac',
      sha256: 'b2b2b9e970ba2513c86df1f4c95064124ac5f35d12ba67bd08b5600726b86c92', from: 4.3, seconds: 183.33,
    },
  },
  {
    id: 'rachmaninoff', look: 'galaxy', lookName: 'Galaxy', kind: 'Solo piano, 1921', seed: 1, loopAt: 110, youtube: '6SIl6gNhcpE',
    record: {
      title: 'Prelude in C-sharp minor, Op. 3 No. 2', performer: 'Sergei Rachmaninoff',
      composer: 'Sergei Rachmaninoff (1892)', published: 'Victor 66016, 1921',
      item: '78_prelude-in-c-sharp-minor_sergei-rachmaninoff-rachmaninoff_gbia0170391a',
      file: 'Prelude in C Sharp Minor - Sergei Rachmaninoff.flac',
      sha256: 'c8dcaead7c958de71770815a6e276af042ffd38afb7bbafa0dc508def578826e', from: 0.9, seconds: 210.13,
    },
  },
  {
    id: 'whiteman', look: 'aurora-borealis', lookName: 'Aurora Borealis', kind: 'Dance band, 1920', seed: 1, loopAt: 30, youtube: 'WbqOB_OeEoM',
    record: {
      title: 'Whispering', performer: 'Paul Whiteman and His Ambassador Orchestra',
      composer: 'John Schonberger, Richard Coburn and Vincent Rose', published: 'Victor 18690, 1920',
      item: '78_whispering_paul-whiteman-and-his-ambassador-orchestra-schonberger_gbia0120433a',
      file: 'Whispering - Paul Whiteman and His Ambassador Orchestra.flac',
      sha256: '92f1c2b8d5348cdad288644624e0ea7bf95df036b35e1feba86400720cf9be47', from: 5.3, seconds: 194.01,
    },
  },
  {
    id: 'oliver', look: 'neon-coral-reef', lookName: 'Neon Coral Reef', kind: 'New Orleans jazz, 1923', seed: 1, loopAt: 90, youtube: 'nIzxLuUu8tk',
    record: {
      title: 'Tears', performer: "King Oliver's Creole Jazz Band, with Louis Armstrong",
      composer: 'Lil Hardin and Louis Armstrong', published: 'OKeh, 1923',
      item: '78_tears_king-olivers-jazz-band-hardin-armstrong-joe-oliver-louis-armstrong-johnny-do_gbia0001053a',
      file: "Tears - King Oliver's Jazz Band - Hardin.flac",
      sha256: 'f6ee2e113db24fdba13a87fe2a3922d434c823fcb4cf88b46664e2fb10b52c65', from: 2.9, seconds: 194.78,
    },
  },
  {
    id: 'bessie', look: 'velvet-underground', lookName: 'Velvet Underground', kind: 'Blues, 1925', seed: 1, loopAt: 60, youtube: 'ij4wuO7HQH8',
    record: {
      title: 'Careless Love Blues', performer: 'Bessie Smith, with Louis Armstrong, Fletcher Henderson and Charlie Green',
      composer: 'Traditional, arranged by W. C. Handy', published: 'Columbia 14083-D, 1925',
      item: '78_careless-love-blues_bessie-smith-w-c-handy-fletcher-henderson-l-armstrong-c-green_gbia3043091a',
      file: 'CARELESS LOVE BLUES - BESSIE SMITH - W. C. Handy.flac',
      sha256: '8411eb9c3a059c73403e4b6033fc42837c7c47e58dfb4c0275644586ec68c931', from: 3.3, seconds: 205.55,
    },
  },
];

/** Why the music is free to use, in the words the credit under the player and the channel's description use. */
export const PUBLIC_DOMAIN = {
  name: 'public domain in the US',
  why: 'Published in the United States before 1926, and so in the public domain there.',
  transfer: 'Transfer from the original 78 by the Great 78 Project, via the Internet Archive.',
};

export const archiveUrl = (f: SiteFilm): string => `https://archive.org/details/${f.record.item}`;

/** The credit, a line each, as the channel's description and SOURCES.md give it. */
export const creditLines = (f: SiteFilm): string[] => [
  `"${f.record.title}", ${f.record.performer}`,
  `Composed by ${f.record.composer}. ${f.record.published}.`,
  PUBLIC_DOMAIN.why,
  `${PUBLIC_DOMAIN.transfer} ${archiveUrl(f)}`,
];

export const filmOf = (id: string): SiteFilm | undefined => SITE_FILMS.find((f) => f.id === id);
