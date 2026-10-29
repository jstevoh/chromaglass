# 11. The mixer

**Partly shipped**: the mixer is built and live (the stack, the lumia and gel rows, a blend per row, crossfades, the narrow desk, the Back that fully goes back, the remote's own check), and several Mac checks that went red are fixed. What is open is below: the Mac looks still owed, the row per projector, and the faults found along the way. How it was found, built and measured is in [`docs/plan-shipped/11-mixer.md`](../plan-shipped/11-mixer.md), under the same number.

`src/lib/mixer.ts`, `src/components/MixerPanel.tsx`, the display pass in
`src/gpu/wgsl/plate.ts`; the design is [docs/rig-plan.md](docs/rig-plan.md) R7.

Asked for directly on 2026-09-27: "a video mixer control available from the top level
but also in the settings, that can move the order of layers (LED spinning, video,
picture, any other image input) and control brightness, contrast and the other photo
and video standards on each." With it, a standing rule: every feature ships its phone
version in the same PR (see the operating rules below).

1. ~~**The sources there are, in one stack**~~ *shipped* (#176). Story in `docs/plan-shipped/11-mixer.md` §11.1 (moved 2026-10-29, 19m-2). **Owed:** the Mac look in `docs/judging.md` §13 (the film between the plates, the LED beam, whether 0–200 % is the right travel).
2. ~~**The other pictures as rows**~~ *shipped* (#189). Story in `docs/plan-shipped/11-mixer.md` §11.2 (moved 2026-10-29, 19m-2). **Owed:** the Mac look in `docs/judging.md` §13 (the gel's 1.5 gain over the lens; the lumia as a beam).
3. ~~**A blend per row**~~ *shipped* (#193). Story in `docs/plan-shipped/11-mixer.md` §11.3 (moved 2026-10-29, 19m-2). **Owed:** the Mac look in `docs/judging.md` §13 (the key's edge on a real film; Add over a bright plate).
4. ~~**Crossfade a row**~~ *shipped* (#195). Story in `docs/plan-shipped/11-mixer.md` §11.4 (moved 2026-10-29, 19m-2). **Owed:** the Mac look in `docs/judging.md` §13, and a film coming in from a pad filmed by hand (`film.yml`) to show no hard cut in its motion table.
6. **A row per projector** (rig-plan R1). Once a rig has more than one live plate,
   each projector's plate is a row, with its own grade at the projector's scope (R2).
   This is the large one; it waits on R1, and is §16e.

Found while shipping step 2, *shipped so far*: #189's deploy went red on two Mac `qa` checks that had passed on the same tree (the adapter going away under the run); `qa.mjs`'s sections now report `no frame` instead of aborting the suite. Story in `docs/plan-shipped/11-mixer.md` §11 (moved 2026-10-29, 19m-2).

Found while shipping step 4, not yet done: #195's deploy (main 6c6d17e) went red on
two Mac checks that passed on the same tree in its PR run and again in #196's run
right after, so step 4 went live only with #196. `npm run ears` on the open shard:
"visible with the wall asking too" drew 14 frames in 2 s where it asks more than 20
(35 in #196's run); every reading was in the right place, so the floor counted the
runner's frame rate, not the ear, and the "Gaps in the plan" thread has a fix on #194.
`npm run squeeze` on the show shard: "the tapped beat drives the show's clock" read a
beat every 396.6 ms against 401.4 ms tapped (2 ms allowed), with the plate stepping
255 times in 12 s where it steps about 320; the Mixer's fades only read the tempo. The
tempo the taps set is the plain mean of their gaps, so something moved the clock off it
after the taps; worth reading whether the clock falls back to the heard beat when a
frame comes more than 250 ms after the last (`beatClock.setExternal`'s window).

Found while building step 4, and settled, *shipped so far* (#204): Back has its own path and fully goes back, fading the wall's part of the room with the look and leaving the machine's setup, the hand's writes and a blackout (`npm run rowfade` 48 → 58). Story in `docs/plan-shipped/11-mixer.md` §11 (moved 2026-10-29, 19m-2).
Still true: a Back after a new song's own look rewinds the room to when that
song began, which "fully back" means but may surprise after an unattended change.
Not done here: a take pressed during a Go wins over
the Go for that row, but a hand on the gel wheel's or the lumia's slider during a Go
still does not (the Go's next step puts the look's level back), and inside a sequence
a take on the gel or the lumia during a stage's glide is stopped by the glide's next
tick, as a hand's is (the button lights once and nothing moves). The rule a Go now
keeps (a later press wins, to the end of the change) would settle both.

Found while building step 3, not yet done: the logo darkens what is under it by up to
8 steps of 255 in the pixel or two where its card meets its clear margin, on its own
way in as much as any blend, because its texture is filtered with its colour not
premultiplied by its alpha (`npm run mixer` stays two pixels clear of that edge).
Premultiplying on upload would take it out. And once, in a cloud session,
`npm run phone`'s "spreading them zooms in by as much as they spread" read 4.00× →
5.60× (1.40 times, 3.40 wanted): the zoom followed the first of six finger moves
(50 → 70 px) and none after. It passed on the next run (3.40) and on every run before;
the Mix sheet is shut by then. Worth reading whether a touchMove can be dropped while
the page is busy. Seen again building step 4: three runs in seven with `PW_WEBGPU=1`
(1.40, 1.40, 3.00 times), on step 4's tree and once on step 3's. Sending the move the
pinch's once-a-frame throttle holds back when the frame is up, instead of at the lift,
did not stop it, so the later moves seem not to reach the pinch at all (inferred, not
measured): the touch listeners' cleanup drops the pinch, and a plate rebuilt mid-pinch
would do exactly this.

Three Mac checks went red once each on commits that did not touch them, one per run,
while this batch's plan was going in (#177), and no cause is known yet:

- ~~`npm run phone`, "two fingers holding Drop lay dye under both": one finger reading a third of the other~~ **Found and fixed**: the plate lost one pool's dye to the fingering push, which #222 took out (#240 showed it, and the line is now two halves: what each finger laid and what the plate holds). Story in `docs/plan-shipped/11-mixer.md` §11 (moved 2026-10-29, 19m-2).
  *Still open, and rarer:* both fingers low at once, after
  #222. Once on #230's branch (16:07Z 2026-10-03, A 0 and B 0 with 214 and 206
  laid, the mirrors at -0 to -3) and once in the 146 holds (74 and 76 of 285 and
  277, the whole plate up 159 of 562 laid, low from the first reading 0.4 s in,
  in the one diagnostic run that did not yet log drying or air). Not stale
  readbacks; not seen in the few holds with the band never started, too few to
  clear the band. The line now prints the whole plate's gain against what both
  fingers handed it, so the next one says whether the plate lost dye everywhere.
- ~~**Found while reading it, and fixed with it: a held Drop with Drop Height up let go of a drop on every step, not every tenth.**~~ **Fixed** (the drop clock is counted after each step it is used on). Story in `docs/plan-shipped/11-mixer.md` §11 (moved 2026-10-29, 19m-2). Owed: the owner's look at Bass Drop and Boiling Point at 60 fps (`docs/judging.md` §19).
- `tools.mjs`, "Blow held still blows a bubble": the straw blew 0 bubbles, on the
  run after, where every other shard passed.
- ~~`npm run startup`, the same check, a second kind of stop: the frames stopped before the device was given~~ **Fixed**: a stretch with no frame, no tick of the page's timer and no long task, begun in the first 3 s and not where an awaited promise had just settled, is Chromium holding the thread while it starts its GPU; 4b takes it out of check 4 and holds it to 4.5 s all told. Story in `docs/plan-shipped/11-mixer.md` §11 (moved 2026-10-29, 19m-2). *Still open:* a continuation the check does not wrap (an `import()`) would look held; the 4.5 s cap is the backstop.
  Seen on #299 and #301, 2026-10-05: a third kind, frames stopped with the page's timer still running, inside the device request: #301's run 37355609842 stopped 2.07 s from 2.57 s, the device asked at 2.39 s and given at 4.71 s, a long animation frame from 2.58 s whose rendering began at 4.65 s with no script in it, and #299's earlier head 2.20 s the same way. Again on #330's run 38028974928 (2026-10-10): 2.17 s from 2.76 s, the device asked at 2.40 s and given at 5.03 s, no long task, nothing made or written in the gap; #330 changes nothing before the device either. Not held (the timer ran) and not the page's own (nothing of its ran); check 4 counts it. Neither PR runs anything before the device is given. Whether 4b should own a frame stop that lies wholly inside a pending requestDevice with no page script in its long animation frame is the question. The old "within 0.25 s of the control's stop" and "control plus a second" are
  gone. Read against the 53 logs: #204's red and 36339282520's split stop (1.28 s
  then 1.68 s) now count as one held stretch each, 2.57 s and about 3 s; 2 of the 53
  (4.05 s on 36294600123, 3.75 s on 36338802046, each wholly inside a four-second
  device request) went over the old 3.5 s cap, as did #194's 3.52 s; the owner chose
  to raise it to 4.5 s, above every opening read (the controls' longest 4.18 s).
- ~~`npm run startup`, 1b, "moving for good no later than the old way"~~ **Fixed** (two PRs): 1b takes Chromium's handover and the compile of the old way's pipelines out of both sides and holds the page's own wait to the control's plus 1 s, and the show's build of those pipelines to 1.75 times the control's stop for them. Story in `docs/plan-shipped/11-mixer.md` §11 (moved 2026-10-29, 19m-2). *Still open:* the replay approximated each build from the run's total; the 1.75 should be read against twenty green Mac runs' real split. (A build less than half again slower than the runner's own spread cannot be told from it by one pair of openings; a third opening, or a reference compile timed inside each, would cost another half-minute of Mac time a run.)
- Still owed from that hunt: the solver's first submits cost a few tenths of a second
  more than later ones even with every compute pipeline dispatched once ahead on
  scraps (downsample 0.32 s, upsampleDelta 0.40 s, run 36306162647). Worth finding
  whether a one-workgroup dispatch on one-texel scraps reaches the cost at all.
- `tools.mjs`, the Finger's "and adds none": red on 4 of about 20 Mac runs across
  four branches on 2026-09-27 (53 → 66, 56 → 71, 50 → 64, 49 → 64, where the plate
  left alone drifted −22 to −12 before and +8 to +10 after), green on the rest,
  including gains as large (61 → 81 against +1 and +8). What differs on the red runs is
  the drift before the stroke, negative every time, so the margin read off it looks
  like the thing to read first; nothing measured yet says why.
- `magnet.mjs`, "dragging the Magnet gathers the ferrofluid along where the hand
  goes": on #180 (PLAN.md only, the same code #179's PR and deploy passed), the drag
  gathered 300 → 363 against 266 → 300 left alone, a gain of 29 where the check asks
  a tenth of 300. It asks the gain against what was there, on a hand path drawn at
  random each run, so a run whose best spot starts full reads low; worth reading
  the gain's spread over the last runs before touching its tenth.
- `phone.mjs`, "portrait: set to one bar in the drawer, the same take lands in about
  half the time": on #210 (the Press; no mixer or phone code) it landed where it
  should (0 at 1944 ms against two bars' 3849 ms; #201's run 1936 against 3838) and
  went red on "with a jump", whose size the line did not print (it does now). The fade is stepped by
  a 16 ms show interval against the show clock and the slider shows React's state,
  so a main thread that stalls on a busy Mac runner moves the level a stall's worth
  at once, and at one bar the allowance per 80 ms sample (0.106) is half two bars'.
  Worth printing the largest step and its gap first, then asking whether the walk
  should stamp the level with the show's time rather than the harness's.
