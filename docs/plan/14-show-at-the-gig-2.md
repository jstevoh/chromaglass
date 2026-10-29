# 14. The show at the gig: hearing, timing, speed and the picture on the wall (continued)

Part 2 of 3 of §14; it begins at 14s. The section starts in `14-show-at-the-gig.md`.

## 14s. The ear: the input picker, Safari's second song, and song ID

**Measured in headless Chromium on 2026-09-28 where it says so; the rest read in the
code.**

- *The input picker never changed the input* (**shipped**, 2026-10-05): a pick opens the
  input picked, by its id, and closes the one before (`npm run inputpick`, 2/5 → 5/5).
  The story is in [`docs/plan-shipped.md`](docs/plan-shipped.md) under 14s.
- *On Safari and iOS, every song after the first is silence to the ear.* Without
  `captureStream`, `musicStream` hands back the one `MediaStreamDestination`'s stream;
  `startMusic`, `handleSourceChange` and `toggleMusic` stop `audioStream`'s tracks, and
  then the same ended stream is handed out again. Measured in Chromium with
  `captureStream` deleted: the analyser's source was live after the first shelf track
  and ended after the second; the track-end advance goes the same way. Inferred for
  Safari: that context is made in `oncanplay`, outside a gesture, and never resumed.
  Never stop the destination's own tracks; resume it from the play gesture.
- *Song ID can switch itself off for the session.* (The flag half **shipped** in 14z-2:
  the silence branch's `finalizeListen` is in a `finally` now; the two leaked
  `AudioContext`s are still open.) Its silence branch sets `busyRef` and
  awaits `finalizeListen` with no `finally` (`useMusicIntelligence.ts`), unlike the two
  branches beside it: one throw leaves identification, the local match and the song-end
  detector off. A failed `decodeAudioData` in `songMap.ts` and an error in `capturePcm`
  (`fingerprint.ts`) each leave an `AudioContext` open. (14h's shared busy flag is the
  same flag, hung by a request rather than a throw.)

*Measure:* the same as `npm run inputpick` with `captureStream` removed (the source
is live after the third track); `npm run music` with a `finalizeListen` that throws once
(identification runs again).

## 14t. The clock and the controller

**Read in the code.**

- *The beat clock can hold half tempo for good.* Locked at twice the period, an onset
  between beats has `k = Math.round(0.5) = 1` and an error of half the period, outside
  the 0.3 window: −0.08. The next, on the beat: +0.15. It gains 0.07 every two beats and
  never halves (`beatClock.ts`). A half-note intro at 150 bpm, then four on the floor,
  drives `musicPace` at 75 for the song, and sound learn's bars are eight beats long.
  This is the clock's own; §10 step 3's half tempo above 148 bpm is the bar grid's.
  Halve when most off-beat onsets land near half the period, and double the same way;
  a half-note intro in `npm run kicks`.
- *MIDI timecode's full-frame locates cannot arrive.* MIDI is opened with `sysex: false`
  (`useMidi.ts`), and a browser withholds SysEx without it, so the `0xF0` branch and
  `TimecodeReader.full` never run in the app. `README.md` says both are read, and
  `timecode.ts` counts on full frames for a backward shuttle; `npm run timecode` tests
  the reader and not the hook, which is why it is green. Ask for SysEx when timecode is
  chosen (it prompts), or say in the README that only quarter frames are read, and
  check the hook's path.
- *A controller's lights stay dark after a replug.* The LED cache is cleared on
  `[enabled, ports.output, map.name]`, and `onstatechange` only refreshes the ports and
  rewires the inputs. With the output on auto, a knocked cable or a power-cycled APC
  comes back dark and stays dark until each value changes. Clear the cache, and soft
  takeover, when an output connects. (§14's opening counts a MIDI replug as handled;
  that is the inputs.)
- *Continue starts the bar again.* `App.tsx` sends Start and Continue alike to
  `clockStart`, which resets the pulse count (`tempo.ts`), and Song Position Pointer
  (0xF2) is dropped by `parseMidi`: a DAW that continues mid-bar leaves the phase up to
  three quarters of a beat off. (Start and a clock dropout are 14e's.) 14-bit pairs and
  NRPN (CC 99/98/6/38) are not decoded either, so learn and auto-map bind the coarse
  byte or the parameter number.
- *Program Change is dropped* (**14t-pc**, from §30). `parseMidi` (`midi.ts`) returns
  CC and note on/off and nothing else, so a 0xC0 message never reaches learn. AUM's
  MIDI matrix, the Elektron boxes and most hardware sequencers send Program Change (and
  Bank Select, CC 0/32) when the pattern changes, and Imaginando's VS switches patches
  on it. A `program` binding kind in `MidiTarget`, bound either to set-list item n or
  to a named preset, played with the item's own fade. On the phone, the bindings are
  listed on its MIDI page. *Measure:* beside `npm run desk`'s MIDI lines, a recorded
  run of Program Change messages lands on the bound look every time, none doubled,
  with the item's fade.
- *The decks already know the bar* (*proposed*). Pioneer's Pro DJ Link (a CDJ's beat
  packets carry the beat within the bar and the tempo) and Denon's StageLinQ are on the
  network the show server already listens on for OSC and Art-Net. They give the true
  downbeat and tempo, which the ear gets wrong (half tempo above ~148, the one slow to
  come), and a track-load or on-air event that can stand in for fingerprinting at a new
  song. Ableton Link (§13 step 5) gives tempo and phase but not the track's bar one. A
  `server/prolink.js` beside `artnet.js`, into the beat clock as an outside source with
  14e's lead; "Decks" as a tempo source in the Sound sheet, on the phone too. The
  protocols are documented by their users, not their makers, which is the risk.

*Measure:* `npm run kicks` with a half-note intro (the tempo is 150 by the chorus);
`npm run timecode` through the hook with a SysEx full frame; a reconnected output is
sent every lit pad again; Continue after a Song Position of bar 3, beat 2 lands there.

## 14u. The desk and the shell

**Measured in headless Chromium at 1440×900 on 2026-09-28 where it says so; the rest
read in the code.**

- *The preview frame stops following the hole.* `usePreviewFrame.ts` observes
  `ref.current` once per `[enabled]`, and the desk stays up across Esc and a Perform ↔
  Design switch, so a new hole is never observed. Measured: after clean screen and Esc
  the frame stays at 0,0,1440,900 while the hole is at 288,104,824,706; a click on the
  preview lands on the hole, and every tool does nothing until a resize. After a switch,
  clean screen leaves the plate as the 824×706 box in a black window, wrong exactly when
  the laptop's screen is the show. A callback ref that observes what it is attached to.
- *Evolve wanders around the look before.* Only `applyPreset` and `updateSettings` move
  `driftAnchor` or drop `driftGlide` keys; `fadeSettingsTo` (Go), `revertLook` (Back),
  the sequencer's stages do not (`rideSetting`, a MIDI fader, does since 2026-10-11). `driftLook` holds each
  dial within 20 % of its travel of the anchor, and skips a dial the anchor has at 0.
  Measured with the real `driftLook` over 100 drifts: 1,496 of 1,560 preset-to-preset
  Gos pull a dial more than a quarter of its travel off the new look, or switch on a
  dial it had off (stardust-collapse to poster-1969: nine switched on, ten pulled);
  re-anchored at the Go, none. Re-anchor at the end of a look fade. ~~A fader is also
  fought by a glide in flight; treat a ride as a hand's write.~~ Shipped with 14f's MIDI
  half: the glide on that dial is dropped at the first message and the anchor moves to
  where the fader put it.
- ~~*⌘S never saves over the open look.*~~ Settled by QA-18: the button, ⌘S and ⌘K all
  ask for a name now, and writing over is the sheet's Replace. Do not make ⌘S write over
  again: a Save that silently wrote over the open look is what the owner reported.
- *A sequence in the set list reads "missing" on every load.* The `cues` memo reads
  `sequencerRef.current`, which is assigned further down the same render, and its
  dependencies do not change on load. Go still plays it; the list says `slow-build · seq
  · missing`. Measured.
- *One storage read can stop the app starting.* `localStorage.getItem(
  'chromaglass-palette-lock')` in a `useState` initialiser has no `try`, where every
  read around it has one; with the site's storage blocked (Chrome with the site's
  cookies blocked, some private windows) it is the one throw, and Boot says "ChromaGlass
  could not start". Measured.
- *Two hands on the phone's clean screen bring the controls back.* The long press's
  `down` overwrites its timer without clearing it (`App.tsx`), so the first finger's
  700 ms can no longer be cancelled once a second finger lands.
- *Renders nobody needs* (beside 14f): `useImperativeHandle` in `LiquidVisualizer.tsx`
  has no dependencies, so its handle of about seventy methods is rebuilt on every App
  render (30 a second through a look fade); `<audio onTimeUpdate>` re-renders the App
  about four times a second while a song plays; `getLiveEngineStatus` is passed inline,
  so Settings' 1 s tick is re-armed by every App render and does not tick while the App
  renders fast.
- ~~*After 14f's sound half (#211):* `useSongChange` sampled the song-gap detector at
  the App's render rate.~~ It listens on the ear's `onReading` now (14z-2).

*Measure:* `npm run desk` and `npm run layout` for the frame after Esc and after a
switch (the frame is the hole; a click on the preview reaches the plate); a node check
over `driftLook` for the 1,560 pairs, re-anchored; `npm run setlist` for the sequence's
name; `npm run phone` for two fingers; a load with storage blocked in `npm run panel`.

## 14v. The show takes a long time to load on the web

**Partly shipped** (2026-10-04): the opening builds its pipelines three at a time, asks for the app and the GPU earlier, asks for the display first, and an intro covers the black plate (`npm run loadtime`, `npm run intro`, `npm run startup`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*Shipped so far* (2026-10-04): where the opening's time went on CI's Mac (the plate black 12 to 18 s to its first step, 11 to 14 s of it fifty pipelines compiled one after another; the download a chain). Story in `docs/plan-shipped.md` §14v (moved 2026-10-29, 19m-2).

- **Shipped, 14v-5: the intro starts still, and turns once the opening's render
  pipelines are built** (2026-10-10). Turning, it stopped the Mac's frames while
  Chromium started the GPU (startup's "no stop in the opening" red on about half of
  10-10's runs); `npm run intro` line 9b. The story is in `docs/plan-shipped.md`.
- **Shipped, 14v-6: the opening asks its first fills before the display, after the mount
  frames settle** (2026-10-18, this PR). Story in `docs/plan-shipped.md` §14v-6 (moved
  2026-10-29, 19m).

- **Shipped, 14v-7: a frame gap while the intro is held still counts only the page's own work in it** (2026-10-24, the owner's choice). Story in `docs/plan-shipped.md` §14v-7 (moved 2026-10-29, 19m-2); judged by `npm run flakes -- --check 'no stop in the opening'` over the week after. Named limit: the GPU process's compiles of the app's shaders inside the still stretch are not counted (1, 1b and the first step's cap hold their length).
- **14v-8. Two edges of 14v-7's rule, from its review (#456).** (b) is shipped (2026-10-25):
  three more synthetic openings for the `seenOk` gate (long tasks not observable, the
  timer's median over its bar, no timer reading), each of which must count the gap whole;
  with `seenOk` forced true all three go wrong. (a) waits. One gap can reach 6.5 s before
  check 4 goes red: 4.5 s of it taken out as the page seen free, plus the 2 s bar. Read the
  week's `stillIdle` on the line before deciding whether the cap should be per gap; in the 37
  Mac runs since 14v-7 merged the longest wait for a frame was 0.8 to 1.6 s and the still
  intro took nothing out on any of them, so there is nothing to read yet.
- **Shipped, 14v-9: the webpage loads only itself first, and leaves the GPU for Play**
  (2026-10-28). `npm run loadtime` 4a to 4d; the story is in `docs/plan-shipped.md` §14v.
- **14v-10. The plate's opening is 8.75 s of compiling on a cold Mac.** CI's Mac, PR
  #511's run 40619521397 (2026-10-28): first step 13.44 s, the device given at 4.33 s,
  56 pipelines built ahead from 4.34 to 13.09 s (25.5 s of compiles over three lanes,
  median 0.32 s; `fluid/deltaVel:rgba16float` 2.67 s, `fluid/liquidForces:rgba16float`
  2.66 s, `fluid/squeezeUpdate` 1.40 s, `plate/display` 1.03 s). The two slowest are
  the next thing to read: why each takes eight times the median, and whether the
  opening needs them before its first step.
- *Fewer compiles: kernels that run back to back fused.* With the lanes busy, the
  opening is the sum of its compiles over three: 0.33 s median each with three in
  flight. The solver's small kernels are each a full compile however little they do
  (most are 4–6 kB of source, the shared Sim struct and a few lines); pairs that run
  one after the other on the same cells (`decayDye` and `decayVel`, the multigrid's
  restrict and zero) could be one dispatch writing both, which is fewer compiles and
  fewer dispatches a step. Each fusion changes the solver's step, so each wants
  `physics`, `thingap` and the Mac's frame time, not just `startup`.
- **Changed after it shipped (2026-10-04, #254): one render pipeline compiling at a time.** Story in `docs/plan-shipped.md` §14v (moved 2026-10-29, 19m-2). Still to read: whether it narrows the spread, from the next deploys' readings.
- *Fewer or smaller opening pipelines.* `plate/display` alone is 1.5–2.2 s cold, and
  every look opens on the same forty-three; a display shader split by what the look
  turns on, or kernels that share one pipeline, would cut the compile itself. Measure
  with `npm run startup`'s "built ahead" line.
- *More lanes.* All at once held the page for 8.6 s (`gpu/prepare.ts`); three is
  the default; four or more may still hold under `startup`'s 2 s gap.
- *The first compile waits on Chromium starting the GPU* (2.5–3.7 s of the
  opening, `fluid/fill`), at about a second after load on CI's Mac whenever the
  device is asked for: asking at boot did not move it there. Whether it moves on
  the web, where the app's download takes longer, is unmeasured.

## 14w. The pointer on the wall (shipped)

**Shipped.** Story in `docs/plan-shipped.md` §14w (moved 2026-10-29, 19m).

## 14x. The microphone hears the hand on the laptop (shipped)

**Partly shipped** (2026-10-04): a reading taken just after a press, key or touch on the page calls no onset on the microphone (`npm run clicks`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped.md`](docs/plan-shipped.md), under the same number.

*Still open:*
- *A gesture the page handles after its sound has reached the ear is not gated.* The
  browser hands input over at the start of a frame and the ear reads after it, so with
  a laptop's ~30 ms of input latency a frame's delay is covered (`npm run clicks`
  measures it); a page busy for longer than the latency, or a microphone faster than
  the trackpad, lets that click through. Holding every onset back to wait for late
  events would make every kick late; not done.
- *A line input is gated too.* An audio interface on the "microphone" source does not
  hear the trackpad, but its kicks in a gesture's moment are swallowed all the same (at
  most one a gesture; the clock covers a steady song). If it matters at a gig, a switch
  on the Sound panel, or the device's label, could say which input is a room.
- *Judged on a real laptop.* The click modelled in `npm run clicks` is a tick and a
  thump; a MacBook's own microphone on its own trackpad is the owner's to try: pick
  tools and ride Speed in a quiet room on the microphone, and the plate should not
  move on the clicks.

## 14y. The sound Source opens on Off (shipped, asked 2026-10-22)

**Shipped.** Story in `docs/plan-shipped.md` §14y (moved 2026-10-29, 19m).

- **Measured** (`npm run opensource`) and **check changes** (`qa`'s first-visit line, `kickbubbles`, and the harnesses that set the remembered source). Story in `docs/plan-shipped.md` §14y (moved 2026-10-29, 19m-2).
- **Judged by the owner:** a landing visitor no longer meets a plate moving to music
  before choosing anything (14y reverses that first-visit choice at the owner's word); if
  the landing page (34a) wants a moving demo it should be a filmed clip, not the live band.

## 14aa. The plate stutters in bursts on a machine with room to spare (shipped, asked 2026-10-24)

**Shipped.** Story in `docs/plan-shipped.md` §14aa (moved 2026-10-29, 19m).

- **14aa-1** (open, the owner's eyes): on the owner's 120 Hz laptop and on the wall, does
  the plate still stutter now and then? `docs/judging.md` §88.
- ~~**14aa-2**~~ (measured 2026-10-25 on the owner's Mac, Metal, comment on #441) Shipped;
  story in `docs/plan-shipped.md` §14aa-2 (moved 2026-10-29, 19m).

## 14aa-3. The governor climbs back to sixty steps into a stutter (shipped 2026-10-25)

**Shipped**: the governor measures what a solver step costs apart from the frame's drawing,
judges each climb on what the state it climbs to would cost, and gives sixty steps up when
frames keep missing a refresh with the GPU over its budget, where it used to wait for an
average that sat either … Story in `docs/plan-shipped.md` §14aa-3 (moved 2026-10-29, 19m).

Open, found doing it:

- **14aa-4** (open, a named shortcut): a climb's cost is predicted from the cells for a
  step and the pixels for the drawing. Neither is the machine's own: Poster's step went
  8.2 → 25.1 ms from 512² to 768² on the owner's Mac, 3.1 times for 2.25 times the cells (the
  larger grid's textures leave the cache), and part of the drawing does not scale with the
  pixels at all, so a pixel climb is predicted dearer than it is and a grid climb cheaper.
  Learn each rung's ratio from the frames it has drawn this session (a step's cost on every
  grid visited, the drawing's on every pixel share) and predict from that. Two trades this
  shortcut makes today, both visible next to the old governor (the review of #474): a light
  look tops out a rung lower (512² at two pixels, where the old governor climbed on to 768²
  at two pixels and sixty steps, predicted 11.6 ms against the 9 ms budget), and after one
  busy tab a light look climbs to 768² at thirty steps and sixty never comes back (the old
  governor had it back in about ninety seconds). The second could also be priced: give up
  the rung again when that wins back sixty under budget.
- **14aa-5** (open): the governor's lines are 60 Hz milliseconds (`SLOW_MS`, `FAST_MS`,
  `MISSED_MS`): on a 120 Hz display a missed refresh is 8.3 ms late and is not seen as one. Take
  the refresh from the draw gate (`drawGate.refreshMs`) and draw the lines in refreshes.
- **14aa-6** (open): `npm run stutter` runs by hand on the Mac (the watcher). Whether it joins
  a Mac shard depends on what the CI runner's GPU makes of Poster, which no run has asked yet.

## 14ab. What else runs on the CPU every frame (found with 14aa, read in the code)

An inventory of the frame loop's own CPU work, 2026-10-24. Ranked by what a show pays.

- ~~**14ab-1** *The video pour pauses and plays its video every frame* (a bug).~~ Story in
  `docs/plan-shipped.md` §14ab-1 (moved 2026-10-29, 19m).
- **14ab-2** *The video pour's optical flow is a CPU loop* over a 192² `getImageData`
  each frame, with a new 147 KB array each time, calling `addDensity`/`addVelocity` per
  pixel. `fluid.pourImage` already takes a video on the GPU; the frame differencing
  belongs in a compute pass beside it.
- **14ab-3** *Every frame reads both fields back and averages them on the CPU*
  (`syncFromGpu`, a loop over every cell of each layer for the mean density and colour)
  where `measure()` on the GPU returns the same means in 32 bytes. With 14j's "read back
  only on a frame that stepped".
- **14ab-4** *A CPU pour uploads the whole grid every step* (`flushDeltas`: about 1.3 MB
  through three to five `writeTexture`s and the upsamples), for a few changed cells.
  Splat records on the GPU (`applySplats`) are the path; what still goes through the
  delta grids is the bubbles' rims, the hands, the breath and the room stir.
- **14ab-5** *The plate, post chain, camera, output and particles make their bind groups
  and views every frame* (10–20 `createBindGroup`, 40–60 `createView`); the solver
  caches its own (H2c-11).
- **14ab-6** *The beads redraw a 512² canvas and upload it every frame they move*, with a
  gradient per bead (`beads.ts`); a drawn splat pass on the GPU would do it.
- ~~**14ab-7** *The ear allocates every frame*: two byte arrays (14f's open line), two
  `Float64Array`s, and seventeen onset detectors each doing slice, sort, map and sort on
  their history.~~ Shipped; story in `docs/plan-shipped.md` §14ab-7 (moved 2026-10-29, 19m).
- ~~**14ab-8** *The gamepad* re-renders App at 30 Hz while its cursor shows~~ **Shipped** (#533, `npm run renders`' gamepad phase). Story in `docs/plan-shipped.md` §14ab-8 (moved 2026-10-29, 19m-2).
- **14ab-9** *Thick liquid's share* makes a MAP_READ buffer and two 590 KB arrays every
  sixty steps (`speciesShare`); a ring like the readback's.
- **14ab-10** *Two of `npm run wall`'s lines judge the Mac runner, not the gate.* On #441's
  tools shard, two attempts on one head were each red on one line of 224, a different line
  each time. Attempt 1 failed "both windows animating, 0.25 of a refresh behind", which read
  1.1x, against a bar of 1.05: 21.9 drawn against 20.4 served, with displays at 19.4 and
  30.1 Hz. Attempt 2 failed "both windows were handed the same refreshes", which read 1.154x
  (17.2 served against 14.9), over its bar of 1.15. The PR changes neither `drawGate.ts` nor the place frames are offered
  to it. The runner was handing each window 11 to 30 of its 60 refreshes. Green runs that
  night handed 13 to 40, and #461's green run read 1.13x on the same line. The lines' own
  comments say a starved runner's late timers part the two windows' frames by themselves. Find
  a measure of the gate's fault that holds at a quarter of the display's refreshes, or a
  starvation reading that sets the line aside and says so. The bar itself stays where it is.

## 14ac. Cartoons that ship with the app, and the video pour's stutter (shipped, asked 2026-10-24)

**Shipped** (2026-10-24): four public domain cartoons, each the whole film looping, poured
as dye or played as the film from a Cartoons shelf on the desk's Dye panel and the phone's
dye sheet (`src/lib/cartoons.ts`, `CartoonShelf.tsx`; sources and licences in
`public/video/cartoons/SOURCES.md` … Story in `docs/plan-shipped.md` §14ac (moved
2026-10-29, 19m).

Open, found building it:

- **14ac-1** *A poured file has no Stop.* The desk's Video… and the phone's "A video as dye"
  pour a file, looping, and nothing in the app stops it short of reloading; only the shelf's
  cartoons have a Stop. One Stop for whatever is pouring, beside Video… and on the phone.
- **14ac-2** *The pour's dye is the picture's light, a shortcut.* The pour keys out dark
  pixels and lays every lighter one as dye of its own colour, and pushes the plate along the
  picture's brightness gradient where the frame changed (`LiquidVisualizer.tsx`, "Video
  Pour"). A black-and-white cartoon is mostly a light background, so it pours mostly white
  over the whole dish, with the figures as holes in it. Nothing in a real liquid show works
  like this: a film there is projected through the dish (which is what Film does), not
  dissolved into it. Two ways to look at: an Ink key that pours the picture's *dark* lines
  as dye (the ink of a cartoon is its drawing), and the picture as light on the plate rather
  than as dye in it. Judge first (§66), then pick.
- **14ac-3** *More films for the shelf.* Walter Ruttmann's *Lichtspiel Opus I–IV*
  (1921–25) are abstract hand-tinted animation, made for exactly this, public domain in
  the US by date and in Germany since 2012 (Ruttmann died 1941). The Archive's copies are
  re-uploads of modern restorations or carry an uploader's CC BY claim; they need a print
  or a transfer whose source is known before they ship. Ub Iwerks' *Fiddlesticks* (1930)
  and the 1930 Silly Symphonies joined the US public domain in 2026, with the same check.
  Every addition gets a row in `SOURCES.md` first; `npm run cartoons` refuses one without.
  *2026-10-27:* Fiddlesticks (1930) is on the shelf, with four later colour films (see above).
  Still open: Lichtspiel and *The Adventures of Prince Achmed* (1926, tinted), which are free by
  date and need a print whose source is known; the 1930 Silly Symphonies (black and white);
  and the Popeye colour specials, the Superman shorts and *Poor Cinderella*, left off for the
  characters' trademarks, not their copyright (`SOURCES.md`, "Considered and left off").
- **14ac-4** *The cartoons are grey.* **Shipped for colour** (2026-10-27): five are in colour,
  and the pour lays each pixel's own colour, so no code changed. Whether the look's palette
  should tint the grey four or the colour five (Film's grade already can, in the Mixer) is
  still the owner's call in §66 and §85.
- **14ac-5** *Colour that is two-strip or Cinecolor.* These prints have two colours (red-orange
  and blue-green), not three: no true yellow, blue or purple. The pour lays what the print
  has; judge in §85 whether a look's palette should fill in what a two-colour print cannot.
- **14ac-6** *A feature on the shelf is a 27 MB file.* Gulliver's Travels is a quarter of the
  shelf's weight, fetched only when someone picks it. If that proves a cost (a phone on mobile
  data), cut it to a half hour of its best scenes as a separate entry, or serve it by a
  lower bitrate; the check holds a feature under 30 MB.
- **14ac-7** *The cartoons were not in Settings → Film.* **Shipped** (2026-10-29): the Film
  section lists the shelf under its demo loops. Story in `docs/plan-shipped.md` §14ac.

## 14ae. One Record button (shipped, asked 2026-10-24)

**Shipped.** Story in `docs/plan-shipped.md` §14ae (moved 2026-10-29, 19m).

- **14ae-1** *Song film still lives in the music player too.* Its film icon stays beside the
  song it renders; the panel's row opens the same sheet. Phase 3 of the Clear Controls audit
  (one home per setting) decides which stays.
- **14ae-2** *A still of the plate.* There is no "Save picture" (only the crash report's
  screenshot). A fourth card in the Record panel; the plate's frame is one `toBlob` away.
- **14ae-3** *Recording MIDI or automation.* Nothing records a controller's or a ride's
  movements; the Take keeps only the hands on the plate. Wanted only if the owner asks.
- **14ae-4** *Sound's source in the words.* The panel's Sound switch could name the source
  ("Sound: Mic") the way the header's Sound dot does; with phase 1's renames.
- **14ae-5** *The phone's Record sheet.* The phone has the choice in More and a Play pill;
  Sound on/off and quality are desk-only.
