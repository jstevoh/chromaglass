/*
  The cartoons that ship with the app (PLAN 14ab-2).

  The owner asked, 2026-10-24, for "a couple videos for inclusion into the app,
  things that can run in the background and be used for visualizations, like
  Silly Symphonies, The Skeleton Dance, and other early animations", and then:
  "I don't want a short loop, I want the extended cartoon looped." So each one
  is the whole cartoon, with only its title cards and end card cut, playing on
  a loop. Each one can be poured into the dish as dye (the video pour, which
  reads the picture's light as colour and its motion as a push), or played
  through the projector as the film the dye is laid over (the same film as
  Settings' Load loop, by address). The shelf is `CartoonShelf.tsx`.

  Every one is in the public domain in the United States. Where each print came
  from, why it is free, and what still is not (Mickey Mouse is Disney's
  trademark; a later version of a character is not this one) is written
  down in `public/video/cartoons/SOURCES.md`, beside the files. A cartoon
  is added there before it is added here.

  The files are small on purpose. They are silent H.264 MP4s, the one format
  every browser and every iPhone plays, 384 px wide, in grey, at 24 frames a
  second. The grain is smoothed out before encoding: grain pours as a sparkle
  of dye in every cell, and it costs bits besides. A file is asked for
  only when someone picks it, never at load (they are not under `/assets/`,
  so the service worker leaves them alone too), and it starts playing before
  it has all arrived: the index is at the front of the file (`+faststart`),
  and the video is given the address, not a downloaded copy. So the app
  opens exactly as fast as it did (PLAN 14v), and the whole shelf is 21 MB
  on the host (`npm run cartoons` holds each under 10 MB and the four under 25).
*/

export interface Cartoon {
  id: string;
  title: string;
  year: number;
  /** Who made it, as the credits say. */
  by: string;
  /** Under `public/`, so served from the app's own origin: a same-origin video can be read back into the plate, a cross-origin one cannot. */
  src: string;
  /** Running time of the loop in seconds, as encoded. */
  seconds: number;
}

export const CARTOONS: readonly Cartoon[] = [
  { id: 'skeleton-dance', title: 'The Skeleton Dance', year: 1929, by: 'Walt Disney, Ub Iwerks', src: '/video/cartoons/skeleton-dance.mp4', seconds: 308 },
  { id: 'steamboat-willie', title: 'Steamboat Willie', year: 1928, by: 'Walt Disney, Ub Iwerks', src: '/video/cartoons/steamboat-willie.mp4', seconds: 418 },
  { id: 'swing-you-sinners', title: 'Swing You Sinners!', year: 1930, by: 'Max and Dave Fleischer', src: '/video/cartoons/swing-you-sinners.mp4', seconds: 448 },
  { id: 'tantalizing-fly', title: 'The Tantalizing Fly', year: 1919, by: 'Max Fleischer', src: '/video/cartoons/tantalizing-fly.mp4', seconds: 199 },
];

export const CARTOON_BY_ID: ReadonlyMap<string, Cartoon> = new Map(CARTOONS.map(c => [c.id, c]));

/** "5:08", the length printed beside a title. */
export const runningTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
