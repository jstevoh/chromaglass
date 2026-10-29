# 14. The show at the gig: hearing, timing, speed and the picture on the wall (continued)

Part 3 of 3 of §14; it begins at 14ad. The section starts in `14-show-at-the-gig.md`.

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

- **14z-1** (**shipped**): On a New Song opens on Keep. Nobody gets a look changed by
  a boundary nobody trusts; New preset and Random are still one press in Settings.
  `npm run music`: "a new song keeps the look unless someone asks for more" (FAIL on
  'preset', ok on 'off').
- **14z-2** (**shipped**): where a song ends and the next begins, measured on real songs.
  Story in `docs/plan-shipped.md` §14z-2 (moved 2026-10-29, 19m).
- **14z-3** (**shipped**): the change lands on a hit of the new song (27 of 31 gaps; else
  1 s after it is confirmed), a median 1.0 s after its first note. After a gap the look fades
  in over 1 s; named by identification, mid-crossfade, it blends in over twice the desk's
  fade, at least 4 s. Judged on the owner's GPU: `docs/judging.md` §65.
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
