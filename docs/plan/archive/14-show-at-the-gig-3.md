# Archive: 14. The show at the gig: hearing, timing, speed and the picture on the wall (continued)

The closed items of [`docs/plan/14-show-at-the-gig-3.md`](../14-show-at-the-gig-3.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 14af. The wall's "title bar" chip: it went on asking, and could not be closed (shipped, asked 2026-10-29)

**Shipped** (2026-10-29): the chip says what is wrong in plain words, its button fills the
wall in the Mac app from the app's side, the Mac app counts the window's own full screen as
filling it, and an X hides it for that wall window. `npm run desktop`'s line "the
title-bar chip comes up…". Story in `docs/plan-shipped.md` §14af. Judged on the owner's Mac
in `docs/judging.md` §91.

## 14ad. Any camera, anywhere; the motion camera told apart from the film's Webcam (shipped, asked 2026-10-24)

**Shipped** (2026-10-24): one camera list (`useCameras`, kept current on `devicechange`) and
one picker (`CameraPicker.tsx`) in both places a camera opens, desk and phone alike. Story
in `docs/plan-shipped.md` §14ad (moved 2026-10-29, 19m).

## 14z. A new song: where songs start and end, and the change on the music (asked 2026-10-24)

- ~~**14z-1**~~ (**shipped**): On a New Song opens on Keep (`npm run music`). Story in `docs/plan-shipped.md` §14z-1 (moved 2026-10-29, 19m-2).
- **14z-2** (**shipped**): where a song ends and the next begins, measured on real songs.
  Story in `docs/plan-shipped.md` §14z-2 (moved 2026-10-29, 19m).
- ~~**14z-3**~~ (**shipped**): the change lands on a hit of the new song. Story in `docs/plan-shipped.md` §14z-3 (moved 2026-10-29, 19m-2). Judged on the owner's GPU: `docs/judging.md` §65.

## 14ag. Your own video: played, poured, read and framed; the demo videos gone (shipped, asked 2026-11-13)

Asked by the owner (2026-11-13): "if I load my own background video I can't 'pour' it, only
load it to play. Let's just get rid of the demo videos that can be poured or played. People can
figure out their own videos. Also, I'd like the visuals to be able to react to the video that's
loaded." Then: zoom and move the video on the canvas for different dimensions, and the video's
controls in a panel of their own to work during the show.

**Shipped**: the three demo loops and the nine cartoons are gone (`public/video`, 76 MB;
`lib/cartoons.ts`, `CartoonShelf.tsx`, `FilmShelves.tsx`, `npm run cartoons`; 14ac's shelf). One
video is loaded at a time, by Settings → Video's Video file, the Dyes panel's Pour a video… or the
phone's A video as dye, and its row (`VideoShelf.tsx`) plays it through the projector and pours it
as dye, either or both, on the Video section, the Dyes panel and the phone's dye sheet. The film
sense reads the video pouring when nothing is on the projector, so Film Drive and the film's
patches react to a poured video too. Video Zoom (0.25 to 4), Video Across and Video Up (−1 to 1)
frame the film on the plate, with Fit; zoomed out, the frame stops at its edge (no smeared
border). Film is named Video, and its panel is on the Perform tab's deck. The assistant's `film`
and `pour_file` take `loaded` (the video loaded) in place of `cartoon`; `show_state`'s media says
which video is loaded; the framing is `set`. Check: `npm run myvideo`.

Open, found building it:
