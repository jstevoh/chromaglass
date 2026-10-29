# 14. The show at the gig: hearing, timing, speed and the picture on the wall: what shipped (continued)

Part 4 of 4 of §14's archive; it begins at 14ad. The section starts in `14-show-at-the-gig.md`.

## Third pass (moved 2026-10-29, 19m) (continued)

### 14. The show at the gig: hearing, timing, speed and the picture on the wall (continued)

#### 14ad. Any camera, anywhere; the motion camera told apart from the film's Webcam (shipped, asked 2026-10-24)

**Shipped** (2026-10-24): one camera list (`useCameras`, kept current on `devicechange`)
and one picker (`CameraPicker.tsx`) in both places a camera opens, desk and phone alike: the
motion camera (was "The Room") and the film's Webcam, which could only ever open the
browser's "environment" camera. Each choice is remembered apart; a camera pulled out takes
its source off and says so, and opens again by itself when it is plugged back in; a chosen
camera that is missing opens the browser's pick, says so, and hands over when it arrives
(`src/lib/cameras.ts`, `npm run cameras`). The room section is now **Motion camera**,
its first line says its picture is never shown and points at Webcam, and the film's camera
line says it shows a picture and points back. Story in `docs/plan-shipped/14-show-at-the-gig-3.md`.

- **14z-2** (**shipped**): where a song ends and the next begins, measured on real songs.
  `npm run songends` joins eight CC-BY songs (`scripts/fixtures/songs`, credits there) with
  half-second and two-second gaps, gapless and crossfaded, in a quiet room and a noisy one
  (the room 30 dB under the music), runs the app's own ear over them, and plays each song
  whole. The old rule, timed against the room tracker: 16 of 48 gaps and gapless joins, 0
  of 16 crossfades. `SongBoundary` now: 43 of 48, no change inside any whole song; a song's
  end is a dip 40 dB under its own loud level (over 40 s) or a second on the room's floor,
  and the next song is sound that carries on for 0.75 s (a last chord after a stop does
  not). On the lab's twenty-three songs: 65 of 66 gaps, 39 of 44 gapless, no false change
  in 5.8 h. It is heard on every reading of the ear (`onReading`), not on the App's renders
  (14u). Crossfades are song identification's: measured, no summary of the sound (harmony,
  spectral shape, level, hits) moved further between two songs than between a verse and a
  chorus of one. The local matcher now captures every 6 s, not 12: it names every
  crossfade's new song with none wrong, 7.9 s in after a 6 s crossfade (9.4 s at 12), 6.7 s
  gapless in a noisy room. It no longer names songs it has never heard: a held chord made
  one pair at every frame, and n of them against m in a stored song summed to thousands of
  votes at one place in it; each pair now votes once per alignment (`localFingerprint.ts`).
  With each fixture left out of the library in turn, strangers named 38 times before, 0
  after, and the known songs named in 978 captures of 4 s, not 929. The busy flag can no
  longer hang on a throw (14s's `finalizeListen`).

## Fourth pass (moved 2026-10-29, 19m-2)

### 14. The show at the gig: hearing, timing, speed and the picture on the wall

#### 14v. Where the opening's time went (2026-10-04)

Reported by the owner 2026-10-04: "Chromaglass takes a long time to load on the web."
Measured the same day. Where the time went, on CI's Mac with the shader cache emptied
(`npm run startup`, runs 37166785182, 37166234101, 37165604455): the desk is up within
a second, and the plate sits black on its starting frame until its first step at
12.15, 17.62 and 12.49 s. 11.46, 13.57 and 11.83 s of that is `gpu/prepare.ts`
building the opening's fifty pipelines one after another (about 0.23 s each; the
first, `fluid/fill`, 0.6–2.7 s while Chromium starts Metal; `plate/display` 1.5–2.2 s
alone). The owner's machine pays the same, scaled to its compiler, whenever a deploy
changes the shaders. The download is small beside it (about 550 kB of scripts, Brotli,
cached for good) but was a chain: the entry ran before the app's chunks were asked
for, and the GPU was asked for only after they had arrived and drawn.

#### 14v. Changed after it shipped (#254): one render pipeline compiling at a time

- **Changed after it shipped (2026-10-04, #254): one render pipeline compiling at a time.**
  Main's deploy of 5505a2a (run 37196539858) went red on `startup` 4b: the page's
  thread held 4.98 s from 0.96 s, against the 4.5 s cap. The three render pipelines
  asked first (display, derive, the air's splat) did not compile side by side: each
  took 5.22–5.24 s there, where the display alone had taken 1.03–2.49 s on every
  run before this item, and the hold ended 0.27–0.65 s before the display's compile
  did on six of the seven Mac runs since (2.92 to 5.94 s; the seventh still waited
  in its lanes for first uses). Before it, with a kernel first, the hold ended 2.5
  to 4.5 s in whatever was compiling, once with nothing asked yet. So
  `buildInTurn` now compiles one render pipeline at a time, the display still
  first, the other lanes taking kernels beside it. So what the page asks does move
  when Chromium's hold at the GPU's start ends: it can lengthen it. On #254's Mac run
  (37200639755) the hold was 2.91 s from 1.01 s (4.98 s on the red deploy; 1.92 to
  4.98 s on the seven runs since #249), the first step 10.21 s (7.96 to 14.19 s).
  The display still took 3.46 s, settling at 3.9 s with the two kernels beside it,
  which also took 3.46 s each: whatever is in flight under Chromium's GPU start
  ends with it. So one run says the change is not worse and passes 4b with room;
  whether it narrows the spread needs the next deploys' readings.

#### 14z-1. On a New Song opens on Keep

- **14z-1** (**shipped**): On a New Song opens on Keep. Nobody gets a look changed by
  a boundary nobody trusts; New preset and Random are still one press in Settings.
  `npm run music`: "a new song keeps the look unless someone asks for more" (FAIL on
  'preset', ok on 'off').

#### 14z-3. The change lands on a hit of the new song

- **14z-3** (**shipped**): the change lands on a hit of the new song (27 of 31 gaps; else
  1 s after it is confirmed), a median 1.0 s after its first note. After a gap the look fades
  in over 1 s; named by identification, mid-crossfade, it blends in over twice the desk's
  fade, at least 4 s. Judged on the owner's GPU: `docs/judging.md` §65.

#### 14f. Sound and MIDI reach the plate a frame late, through a whole-app render

**Read in the code.** Every frame the analyser calls `setAudioData` with two new
arrays (`useAudioAnalyzer.ts`), which re-renders the whole ~4,400-line `App`; only
then does an effect copy it into `audioDataRef`, after this frame's loop has run, so
the plate reads the sound one frame late. A MIDI CC goes through an animation frame,
`setSettings` and an effect the same way (`rideSetting`, `App.tsx`). `App.tsx` already
avoids exactly this elsewhere ("a re-render of the whole shell sixty times a
second"). On a weaker laptop that is dropped frames and garbage-collection hitches on
top of the solver.

Measured since, by `npm run ears` on the Mac runner (2026-09-27): with the show
window covered and nothing else drawing, the ear's 16 ms tick read 15 times a
second, not 60 (inferred: each reading re-renders `App`, and the main thread could
not take more); the visible app drew 28 frames a second in the same run. On #195's
deploy (main 6c6d17e) the visible page drew 14 frames in two seconds while the rest
of the show was still being built behind it, and `npm run ears` went red on a floor
of twenty frame readings, with the ear doing what it should (the wall's 10 asks all
read in the page's stalls). The floor now asks that every frame the page drew read
(#194); how slowly a busy page draws is this item's to fix, not that check's.

*Fix:* the frame loop reads the analyser and the ride's shadow itself; React keeps
the meters, at about ten updates a second, with the arrays reused. *Measure:* count
`App` renders a second under `?debug` in `npm run desk` with a stream running (12 or
fewer), and stamp the reading's time against the frame's.

#### 14o-smoke. The deployed Worker, measured from a cloud session

- ~~**14o-smoke**~~ (S): the deployed Worker, measured from a cloud session on 2026-10-24.
  The live site's build carries the Worker's address; a POST with no Origin is refused 403;
  one from the site's origin passes the store, size and rate gates to the body (400 on a
  non-audio body); a 4 s tone reaches AudD, which answers that it cannot fingerprint a pure
  tone; and a 10 s clip of the bundled "Live On Rainy Days" comes back 200 `{"match":false}`
  (not in AudD's catalogue). Whether a well-known commercial track comes back named is
  the one thing left, and needs a recording no cloud session should send.
