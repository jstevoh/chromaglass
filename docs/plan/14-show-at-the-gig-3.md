# 14. The show at the gig: hearing, timing, speed and the picture on the wall (continued)

Part 3 of 3 of §14; it begins at 14ad (14af sits before it). The section starts in `14-show-at-the-gig.md`.

## 14af. The wall's "title bar" chip: it went on asking, and could not be closed (shipped, asked 2026-10-29)

**Shipped** (2026-10-29): the chip says what is wrong in plain words, its button fills the
wall in the Mac app from the app's side, the Mac app counts the window's own full screen as
filling it, and an X hides it for that wall window. `npm run desktop`'s line "the
title-bar chip comes up…". Story in `docs/plan-shipped.md` §14af. Judged on the owner's Mac
in `docs/judging.md` §91.

- **14af-1** (S) *A wall on the laptop's own screen.* With no projector, Send to wall puts the
  window beside the desk, and filling it covers the desk; the chip asks anyway. Ask the
  window's screen (Window Management's `getScreenDetails`, which `useCastSession` already
  uses to place it) and, when it is the desk's screen, say "the wall is on this screen"
  rather than ask for full screen.
- **14af-2** (S) *In Chrome the green button still keeps the chip up, rightly or not.*
  `CastHint` says Chrome keeps a popup's title bar in the OS's full screen, so in a browser
  only the page's own full screen counts. Measure that on the Mac (a popup in green-button
  full screen: is there a bar over the wall?) and, if there is none, count it there as the
  Mac app now does.

## 14ad. Any camera, anywhere; the motion camera told apart from the film's Webcam (shipped, asked 2026-10-24)

**Shipped** (2026-10-24): one camera list (`useCameras`, kept current on `devicechange`) and
one picker (`CameraPicker.tsx`) in both places a camera opens, desk and phone alike. Story
in `docs/plan-shipped.md` §14ad (moved 2026-10-29, 19m).

- **14ad-1** (S) *The audio input does not come back either* (14g's first half): the same
  `devicechange` reopen, for the sound's input.
- **14ad-2** (S) *Room Drive and Room Impact keep the old word.* The section is Motion
  camera; its two masters (and the patch source "Room") still say Room. Rename with
  phase 3's one-home-per-setting pass, where the Drive/Impact pairs are settled, rather than
  churn the patch bay's names twice.
- **14ad-3** (S) *The browser keeps camera names back until one has been allowed.* Before
  that the pickers list "Default camera" only, with a line saying why. A "find my cameras"
  button that asks once and closes the camera at once would list them sooner.

## 14z. A new song: where songs start and end, and the change on the music (asked 2026-10-24)

The owner: song detection does not work well enough to ship. It does not catch where
songs begin and end, and it does not change the look at the right moment. What it is
today (`songBoundary.ts`, `useSongChange.ts`): it fires after 1.8 s of quiet that
follows at least 20 s of song, or when song ID names a different track, which it asks
every 12 to 35 s. A crossfade or a gapless set never reads as quiet, so it is never
caught; a quiet bridge can be. It samples at the App's render rate, not the ear's
(14u), the hung `busyRef` can switch the end-of-song half off for the session (14s),
and the change is a fixed 2 s fade wherever it lands (`App.tsx`, the On a New Song
effect). `npm run music` only feeds it synthetic level traces.

- ~~**14z-1**~~ (**shipped**): On a New Song opens on Keep (`npm run music`). Story in `docs/plan-shipped.md` §14z-1 (moved 2026-10-29, 19m-2).
- **14z-2** (**shipped**): where a song ends and the next begins, measured on real songs.
  Story in `docs/plan-shipped.md` §14z-2 (moved 2026-10-29, 19m).
- ~~**14z-3**~~ (**shipped**): the change lands on a hit of the new song. Story in `docs/plan-shipped.md` §14z-3 (moved 2026-10-29, 19m-2). Judged on the owner's GPU: `docs/judging.md` §65.
- **14z-4**: once the owner has judged §65 with their own music, On a New Song opens on
  New preset again (the `music` check's default line moves with it).
- **14z-5**: the room tracker seeds its floor on the analyser's first frame, and an analyser
  with nothing through it yet hands it digital silence (-140): the floor then climbs about a
  tenth of a decibel a second, so every room reads as "sound" for minutes. Measured in
  `npm run songends`: the old gap rule with a tracker seeded that way caught 0 of 56 joins.
  The boundary no longer leans on it, but the analyser's window (the visuals' calibration)
  and the gate still do: seed from the first frame with sound in it (the render's side of
  the same seeding is under 28e's leftovers). Check that the
  calibrated window then settles on the room within its calibration time, in `ears`.
- **14z-6**: a song the show has never heard waits for the recognition service's 35 s
  re-check when it crossfades in. Ask the service sooner when the sound's character shifts
  (a candidate, not a change: the measured shifts inside songs make it a poor trigger for
  the look, a fair one for a question), within its quota. And a live band: applause and
  talk between songs are neither quiet nor a new song's sound, so the boundary waits for
  the next song's own decay; hear applause as a gap (broadband, no pitch, no beat).
  And a room that fills up late in a song: the floor looks back a minute and climbs a
  decibel a second, so a gap at a room 18 dB louder than it was is heard only once the room
  has been that loud for about 80 s (with the room rising 35 s before the gap, 1 of 8
  caught; `songends`' gap2rise gives it 95 s). Follow the floor faster without hearing a
  quiet passage as the room.

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

- **14ag-1** (S) *The pour is not framed.* Video Zoom and the slides move the projector's frame;
  the pour still lays the whole frame stretched over the square dish (`videoSample` in
  `wgsl/splat.ts`, `pourVideoFrameCpu`), so a 16:9 clip pours squashed. Give the pour the same
  cover-fit and framing, in the sample pass's uv.
- **14ag-2** (S) *The video's own sound as a source.* "React to the video" could also mean its
  soundtrack: a Video entry in Sound's Source that plays the loaded file's audio into the ear.
  The film and the pour are muted today. Ask the owner before building.
- **14ag-3** (M) *Blending video and liquid the way a real show does.* Four ways were put to the
  owner (2026-11-13): the video as the lamp under the dish (refracted by the oil's thickness,
  filtered by the dye, Beer–Lambert), the video poured as ink that the flow carries and thins,
  the video's brightness as heat (buoyant and Marangoni currents from the picture's light), and
  its motion stirring harder. Built in the order the owner picks; each as physics in the solver
  or the light path, none as a shader overlay.
- **14ag-4** (S) *The framing's pixels have no check.* `npm run myvideo` holds the controls and
  their settings, not where the frame lands: on software WebGPU the app's plate was still
  rebuilding thirty seconds in, so a corner read there measured nothing. Give the lab a film
  texture (the plate shader's `filmFrame` is the same code) and read a corner at Zoom 1 and
  0.25, and the edge with Across at 1. Until then the owner judges it (`docs/judging.md`).
