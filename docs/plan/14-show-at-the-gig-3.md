# 14. The show at the gig: hearing, timing, speed and the picture on the wall (continued)

Part 3 of 3 of §14; it begins at 14ad (14af sits before it). The section starts in `14-show-at-the-gig.md`.

## 14af. The wall's "title bar" chip: it went on asking, and could not be closed (shipped, asked 2026-10-29)
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
- **14ag-1** (S) *The pour is not framed.* Video Zoom and the slides move the projector's frame;
  the pour still lays the whole frame stretched over the square dish (`videoSample` in
  `wgsl/splat.ts`, `pourVideoFrameCpu`), so a 16:9 clip pours squashed. Give the pour the same
  cover-fit and framing, in the sample pass's uv.
- **14ag-2** (S) *The video's own sound as a source.* "React to the video" could also mean its
  soundtrack: a Video entry in Sound's Source that plays the loaded file's audio into the ear.
  The film and the pour are muted today. Ask the owner before building.
- **14ag-3** (M) *The video as the lamp under the dish.* Shipped 2026-11-21 (`docs/plan-shipped.md`
  14ag-3): the film can go under the front plate, where it is a picture in the lamp house, seen
  through the liquid (Lamp on the video's row, desk and phone). Check: `npm run videolamp`.
- **14ag-5** (S) *How far under the liquid the picture is.* `VIDEO_LAMP_DEPTH_M` (2 cm, in
  `wgsl/plateLamp.ts`) sets how strongly the liquid's lenses bend the video under it: a drop's
  power over the picture grows with the gap. A constant today; a Lamp Depth slider (0 to 10 cm,
  MIDI, desk and phone, a default that keeps 2 cm) if the owner wants the lenses stronger or calmer
  after judging (`docs/judging.md` §141).
- **14ag-6** (M) *The other three ways a video and the liquid meet.* Of the four put to the owner
  (2026-11-13), the lamp is built (14ag-3). Left: the video poured as ink that the flow carries
  and thins (part of it is 14ag-1's framed pour), its brightness as heat (buoyant and Marangoni
  currents from the picture's light), and its motion stirring harder. Built in the order the owner
  picks; each as physics in the solver or the light path, none as a shader overlay.
- **14ag-7** (S) *The back plate's liquid does not bend the lamp.* With two plates, the video in
  the lamp is bent by the front plate's surface only (`lampBendAt` reads the front plate's optical
  path). The back dish sits in the same light; its liquid should bend it too, once the two dishes
  have their own heights in the projector's cone (18e-1). With Dish Spread on, the bend is off
  (its plate uv is `dishToPlate`'s, which `lampBendAt` does not undo); undo that one too.
- **14ag-8** (M) *Oil drops are flat slabs to the light.* Filmed on the owner's Mac (2026-11-14),
  the video under Splodascope and Classic stays ruler-straight: dye in water barely moves the
  index, and the solver's oil is a share of the column with a sharp edge and no thickness profile,
  so it bends the picture only in a thin band at its rim. A real floating oil lens is a cap,
  thickest in the middle, its shape set by the three surface tensions (Neumann's triangle) and
  gravity; give the view the oil's thickness from that, in the solver, and the drops become
  magnifiers over the lamp (and the plate's own `refractionOptics` reads them too). Not a plate
  shader fake: the path is the solver's.
- **14ag-9** (M) *The video coming in, clear and on the desk: one row per input, four uses, and the camera poured* (shipped 2026-11-27). Asked 2026-11-27: "using the camera input. It is generally hard to
  understand and control what is on screen ... I would also like to more fully control the video
  inputs on the main app vs just in settings. I want to be able to see things on the canvas as I
  change them. Also, I want to bring back the ability to pour the video on as well as playing it as
  a plate, as the light, or as the spinning led light background"). Git history: the pour never
  went away for a file (14ag kept Play and Pour on the file's row); what was missing was the pour
  for anything else, and the row itself was the file's alone, so with the camera on it named the
  file, Play unlit. Now `VideoShelf` is the input on the plate (the camera or window while one is
  on, else the file loaded) with a little live screen of it, Plate / Lamp / LED ring (where it
  shows, one lit) and Pour; a camera or window pours through a clone of the film's stream
  (`usePour` `pourStream`), stopped with the film. LED ring is a new setting, `filmRing` (MIDI
  "Video on LED Ring", rig key, off by default): the ring's row in the lamp draws the picture turned
  by the ring's angle (`videoRing`, wgsl/plateLamp.ts), LED Rotation Speed its spin. The desk's
  Video dot (was Film) opens the Video panel beside the plate, not the Settings sheet. Checks:
  `npm run myvideo` (the ring switch, the camera's row, its pour, Stop, off; the dot),
  `npm run videolamp` (the ring lights clear water with the picture, turns it half a turn at
  LED Rotation Speed 2π, ignores the film's row, Film Mix 0 is the look to the byte).
- **14ag-10** (S) *LED Rotation Speed is two panels from the ring's picture.* With the video on the
  ring its spin is the Lamp section's LED Rotation Speed; a second slider in Video would be two
  controls of one setting under one test id in the sheet (`npm run layout`). Give the Video panel a
  way to it (a "Spin" link to the Lamp section, or the ring's speed as a pin) once the owner has
  turned it in a show.
- **14ag-12** (S) *A pour swapped for another keeps the last one's frame as its motion's reference.*
  The pour reuses one hidden <video>, so `pourVideo` sees the same element and returns before
  resetting `videoFlowRef.current.source`: the first optical-flow frame after a file-to-file or
  file-to-camera swap compares two different pictures (one hard stir). Reset it in that early
  return (LiquidVisualizer.tsx is over budget: the line goes with a move out of it).
- **14ag-13** (S) *The mixer's Film row says nothing while the video is on the ring.* Its arrows,
  Level and Blend do nothing then (the ring takes the LED row's); dim the row and say "on the LED
  ring" there.
- **14ag-11** (S) *The lean display does not compile the ring out.* `U.filmRing != 0` is not one of
  `displayLean.ts`'s tests, so the ring's branch is always compiled (a few lines, one texture read).
  Add it with `may: val(s, 'filmRing')` if `npm run openingtime` shows it.
- **14ag-4** (S) *The framing's pixels have no check.* `npm run myvideo` holds the controls and
  their settings, not where the frame lands: on software WebGPU the app's plate was still
  rebuilding thirty seconds in, so a corner read there measured nothing. Give the lab a film
  texture (the plate shader's `filmFrame` is the same code) and read a corner at Zoom 1 and
  0.25, and the edge with Across at 1. Until then the owner judges it (`docs/judging.md`).
