# 10. Playing like a show

**Partly shipped**: the song's shape heard live and followed by a paced scene, and the first accent (Accent the One). What is open is below. How it was found, built and measured is in [`docs/plan-shipped/10-playing-like-a-show.md`](../plan-shipped/10-playing-like-a-show.md), under the same number.

`src/lib/phrasing.ts`, `src/lib/beatClock.ts`, `src/lib/audioFeatures.ts`,
`scripts/watch.mjs`, `scripts/film.mjs`

From the footage study of 2026-09-26: the plan page is
<https://claude.ai/artifact/UB2VSoFbA3S84yEoFPuPQX>, the notes are
`/mnt/project-files/research/light-show/footage.md` (every clip, its link and its
numbers) and `craft-and-field.md` (performers, VJ practice, the digital field).

The yardstick, measured on the footage at four samples a second:

| Quality | Real shows |
|---|---|
| Swells of motion | 1.5–3.5 a minute, peaking about 2.5x the median, rising and falling over 2–9 s |
| Composition change | every 7–10 s, without a cut |
| Scene change | every 15–30 s |
| Share of time calm | 20–40 % |
| Near-black | 30–60 % on average, ranging from 3 % to 90 % over a set |
| Hues in a frame | 2–3, one family leading, the family changing by scene (the owner, 2026-10-04, wants more: five dyes of a family on the plate, 18l) |
| Motion against loudness | r ≈ 0 at the beat; about 0.4 over 20 s windows |
| Edges | two regimes: soft washes under 1 %, sharp drop and cell fields about 15 % |
| Hard cuts | none |

The last-but-one row matters for this plan's own gate: the detail table at the top was
built on macro films, which are all drop and cell field. A real show's big shapes are
soft, so `npm run detail` should judge the two regimes separately rather than ask every
region to be sharp.

The steps, most visible first. Each is one PR with its own check, and every step after
0 reports its change in the film table's units.

0. **Film every look and measure it**, shipped in #162. `npm run film` records each
   look three times for two minutes with the band in a box and writes the table above
   with our looks under the real shows' rows; `film.yml` runs it by hand across six Mac
   runners. **The first full baseline has not been run yet**: that is one by-hand run of
   `film.yml`, and every step below is measured against it.
1. **Rest, big events and darkness.** `phrasing.ts` already has the shape and measured
   why it changes nothing: small gusts on a plate that is never still are invisible. Let
   it fire the whole-frame events the app already has (a flood pour, a partial drain, a
   dye swap, a press), let the plate settle and the dimmer fall between them, and let a
   scene end in near-black. A Pacing setting whose zero keeps today's look.
   *Target:* swells 1.5–3.5 a minute, calm 20–40 %, near-black ranging across at least
   10–70 % over a set, cuts still zero. *Check:* a node harness on the phrase generator
   from a seeded run, and the film table.
   *Shipped* (#170) on the stage sequencer rather than the phrase generator (`src/lib/scenePacing.ts`; a **Pacing** setting whose 0 keeps today's show, an ending per stage, a built-in **Light Show Night**; `npm run pacing`: 2.35 swells a minute, calm 25–28 %). Whether the plate delivers it is the film's to say: film Light Show Night. Story in `docs/plan-shipped/10-playing-like-a-show.md` §10 step 1 (moved 2026-10-29, 19m-2).
2. **Hear the song's shape live.** Presence (rising or falling action) and a slowly
   accumulating intensity from #154's bands, and from them live build, drop and
   breakdown events that choose which swell step 1 fires and how big. *Target:* a drop
   reported within one bar, none in a steady section, and motion against loudness near
   0 at the beat and positive over 20 s. *Check:* synthesised songs with known builds.
   Found on the way:
   - A drop in a scene's dark ending is let go (12 of Light Show Night's 60 in the
     check, one in five): the light is going down and the next scene comes up with its own move.
     A show following a song might rather cut the dark short on a drop and come up
     with it; worth judging on the Mac with a real track.
   - Over 1 s windows the proxy's motion-against-loudness reads 0.26 to 0.29, the top
     of the footage's range at the beat, because the proxy has no beat-level motion of
     its own and a second's mean is mostly the section. The plate's own motion adds
     that noise; `film.yml` with a song playing is what measures it.
   - The tracker hears the beat coming back after a breakdown as a drop (0.75 on the
     check's verse after a breakdown), so the scene throws its big move there too.
     Right for a club track; a band coming back from a quiet verse may want less.
   - A scene that comes up out of the dark while the song builds holds its opening
     move until the build ends: it comes up lit and still. Worth judging on the Mac.
   Found on the way, not yet fixed:
   - A build is recognised about halfway in, not at its start (a short one later: the
     club song's four-bar second build at 65 %): the hats leave before the riser has
     climbed far, so the top end falls before it rises, and the climb has to show in
     every third of six seconds so a fill's two-beat jump is not one. A build that
     starts by taking the beat away is heard as a breakdown for its first bars. Onset
     density (a snare roll doubling) would catch it earlier.
   - A song whose first build comes before its beat has ever played (intro straight
     into a build) is heard from its drop: builds wait for the beat.
   - The kick onset reads a fast snare roll's 200 Hz body as kicks: in the club song's
     build, 32nd-note snares fired `kick` three to five times a half-second. Sound learn
     on the kick fires through every build.
   - Nothing on the shelf has a beat: its four tracks are ambient, so the tracker is
     measured on synthesised songs only, and on the shelf only for not inventing drops
     or builds (none now). A CC-licensed dance track with known sections on the shelf
     would let the check hear real drops.
   - Quiet is thirty-five decibels under the song's loudest, a guess for a room: a
     noisy club between tracks may never fall that far, and then the next song's
     intro can still read as a breakdown of the last. Worth measuring on a recording
     from a gig.
3. **Choose the accents.** Beat squeeze and plate rock fire on every kick. Let the
   performer pick downbeats, every other bar or fills only, vary the depth a little as a
   hand does, and pull a hand-played press onto the predicted beat. Needs a real
   downbeat, which #155 does not have yet.
   *Check:* `npm run downbeat` (90), built: the bar grid's one on eight synthesised songs, every kick weighed by its place, the sure mark 2.2. Not yet seen on the plate: the app's frames cannot be read in a cloud session. Story in `docs/plan-shipped/10-playing-like-a-show.md` §10 step 3 (moved 2026-10-29, 19m-2).
   *Found while building it, not yet done:*
   - **The rest of the step is not built.** The one (and the one after a fill) is; the
     other accents the step asks for are not: *every other bar* (the grid knows the bar,
     not yet the pair of bars), *fills only* (the fill is heard, and could be the only
     press), *a hand's variation* (the depth varied a little from press to press), and
     *a hand-played press pulled onto the predicted beat*.
   - **Above about 148 bpm on four on the floor the grid hears half tempo** (75 to 87
     bpm) and is almost never sure of the one (0 of 172 estimates at 160, 31 of 184 at
     150). It fails safe, every kick 1, but no accent reaches DnB or fast techno; the
     check's songs stop at 140.
   - **Four on the floor's one is slow to come.** With the kick on every beat and a
     chord a bar, only the chord tells the one from three: on sixteen-bar sections
     the grid is sure of it 49 % of the time at 90 bpm, 82 to 88 % faster (a third of
     the time on the eight-bar sections the check had first). A crash on the one and
     the phrase's changes are evidence the grid does not use yet; the bass line's
     pickup it hears only as the harmony moving (a loop with one reached a t of 2.6
     on it alone).
   - **The sure mark rests on three synthesised loops.** 2.2 stands a third over their
     worst (1.65). A real bar-less track (a DJ tool, a techno loop with a drifting
     pad) may reach further; a recorded one on the shelf would say.
   - **Half tempo, now and then.** Club 140 names 70 bpm on 2 of its 181 settled
     ticks (the check holds 95 %); the weighting toward 120 is an octave and a bit
     wide, and 140 is near where its double and half weigh alike.
   - **A new song after a gap finds its one late**: bar 14 of its groove, against
     bar 7 heard alone. The old grid is held four seconds before it is let go, and
     the new one then gathers from nothing.
   - **No recorded song has been counted.** Nothing on the shelf has a beat; a
     CC-licensed rock track and a dance track with known bars would let the check
     hear real ones.
   - **Sound learn's "Each bar" still counts from the clock's lock**, the one a
     quarter of the time; it could fire on the grid's one instead.
   - **The beat clock fires on through a fill on its own prediction**, which hides the
     fill from the accent's "after a fill" in the app (the check hears the kicks
     themselves).
4. **Press smooth, lift into fingers** (roadmap G). A squeeze gives a smooth ring and a
   lift breaks into fingers; today both finger. *Check:* finger count round the ring,
   low on press and high on lift, in the lab.
   *Built 2026-09-27* (lib/squish.ts; `npm run lift`, 25 checks): a press is round by construction and remembers itself, and the glass lifts after it in fingers at the spokes; Fingering 0 is today's plate exactly, on the phone on the Press tool's Amount. Waiting on the owner's eyes on a real GPU (judging.md 15). Story in `docs/plan-shipped/10-playing-like-a-show.md` §10 step 4 (moved 2026-10-29, 19m-2).
   *Found while building it, not yet done:*
   - **Beat Squeeze has never pressed the plate. Fixed** (shipped with this item's fix PR, the owner's call on 2026-09-27): every stroke lands on a whole cell, and a kick is let go over a third of a second (`KickRelease`); `npm run lift`, `npm run squeeze` on the Mac shard, both on the CPU (the GPU read is an item below). Every look changes with music playing; waiting on the owner's eyes (judging.md 15). Story in `docs/plan-shipped/10-playing-like-a-show.md` §10 step 4 (moved 2026-10-29, 19m-2).
   - **The show hears a quarter of the simulated band's kicks, or fewer, on the Mac.** **Shipped** (with 14d): the clock and the song's shape read the kick's onset by its time, and a kick with its bass note is called (next item but one): 155–160 of 160 chorus kicks (`npm run kicks`). Still owed: the count in the app on the Mac (next item). Story in `docs/plan-shipped/10-playing-like-a-show.md` §10 step 4 (moved 2026-10-29, 19m-2).
   - **Count the heard kicks in the app on the Mac.** `npm run kicks` hears the band
     offline, through the ear's code; nothing yet counts it in the running app, where
     the plate's frames and the band's timer share a busy page. Both counts are there
     under `?debug`: `chromaglassDebug().heardKicks()` (onsets the loop saw) and `window.__band()`
     (kicks the band scheduled, and how many late). *Check to write:* a Mac check
     that plays the band for 30 s and asks for nine in ten of its kicks heard.
   - **A kick with its bass note read as low mids.** **Shipped** with the item above (`KICK_TILT_DB` 6 → 3 dB; `npm run kicks` at 48 and 44.1 kHz holds the ear's onsets to 95 % in every section). Not yet heard on real records: a kick under a bass guitar on the beat, a floor tom; `bands` has no tom. Story in `docs/plan-shipped/10-playing-like-a-show.md` §10 step 4 (moved 2026-10-29, 19m-2).
   - **A check that reads a kick's press on the GPU.** `npm run squeeze` counts the
     cells and depth the kick hands the plate and the gap its release gives back, on
     the CPU: a regression in the upload (the plate not marked dirty, the flush
     skipped, `squeezeUpdate` ignoring a delta) would pass it. The Mac reads back the
     velocity (`rbVx`, `rbVy`); the outward flow round a kick's centre a frame or two
     after it lands, against the same seconds at Beat Squeeze 0, would say the press
     reached the solver. (The hand's press goes up the same path, and the Mac's tool
     checks read that.)
   - **A kick dirties the plate for about half a second.** With Fingering up a
     kick's press is remembered and lifts for over a second, and its release lays a
     third of a second; on the Fillmore with a band the lead plate is marked dirty,
     a full delta upload, on most steps. Nothing measures the frame cost yet; worth
     reading on the Mac's frame timings before a show.
   - **Whether a kick's press should show more.** Held and released, a kick at the
     Fillmore's squeeze thins the film under it by about a seventh (0.030 to 0.0255) for
     a tenth of a second; the ring it spreads is the flow the shader derives from
     that. If it reads too faint on the Mac, the press can go deeper now that it no
     longer adds up (the 0.0024 a disc was doubled when the press laid nothing, so
     it was never judged by its own look).
   - **The lab's glass is forty times springier than the app's.** BASE's `gapSpring`
     is 0.02 a step; the app derives it from dt and Plate Spring, 0.00048 at the
     default look (the glass half way back in about 24 s), 0.0080 at the fastest look
     (Lacing Run), 0.00005 at the slowest (Lumia). A lab check that presses or lifts
     measures a glass no look has unless it passes the look's spring (`npm run lift`
     does now); the others that touch the gap (`straw`, `physics`) should be read with
     that in mind, and a lib function shared by the app and the lab would keep them
     from drifting apart. The spring is not all of it: the app's dt (0.00107 at the
     default look, against the lab's 0.004) and its gap memory (0.99665 a step, where
     the lab's forgets dh/dt at once) differ too. With all three, the lab's held press
     drove the dye out of the whole ring before any lift (its mean 0.069 against the
     0.5 laid), so `lift` passes the spring only; whether the app's plate empties a
     press's ring like that is for the Mac.
   - **At the default look a press stays down for tens of seconds.** Half way back in
     about 24 s is a long time for a hand on glass; worth judging on the Mac whether
     the glass should come up faster by default (Plate Spring).
   - **The Fillmore East sequence's Sunburst stage leans on Beat Squeeze** (1.0, with
     Fingering 1.0): with the squeeze reaching the plate, each kick now lifts with a
     faint ripple at the rim's spokes (a tap's lift, 0.004 in `npm run lift`), and the
     big sunburst still comes from a hand on the Press; a kick's lift strong enough to
     read as the sunburst is a plan item for after the owner has seen it. Its
     description says the dish is pressed on every kick again. Judge it on the Mac.
   - **The fingers are drawn, not grown.** The lift lays spokes from the CPU as the
     press did; the solver's own squeeze flow is still symmetric in the sign of dh/dt.
     An instability in `squeezeUpdate` keyed on a rising gap would let the fingers'
     spacing come from the film's thickness, as roadmap G asks.
   - **A pressed disc comes out octagonal in the lab** (an even press on an even
     plate): some grid direction in the squeeze solve, cause not yet looked for.
   - **The lab's finished picture of an off-centre point is not at that point.** A
     ring drawn round the press's cell in `lab.render` found none of its fingers
     (correlation −0.06 against −0.97 in the dye, and no flip or transpose above 0.23),
     so the plate shader's dish and lens framing moves it; a check that reads the
     picture off the centre needs that map first.
   - **Fingering had no way onto the phone** before this (now on the Press tool's
     Amount); the other Show-sheet plate controls (Beads, Cells, Lacing) still have none.
5. **Oil and water that stay apart** (roadmap §I). Liquids as bodies with interfaces,
   with the ferrofluid phase as the precedent. The biggest difference in every frame,
   and the largest piece of work here; prototype in the lab first.
   *Shipped 2026-09-27 for oil and water* (#179, Oil Bodies, on in Oil & Water): the oil
   carries its own share of the dye, so amber oil on teal water stays two colours
   as the drops round, merge and are dragged. *Check:* `npm run bodies`. Waiting on
   the owner's eyes on a real GPU (judging.md 14).
   *Found while building it, not yet done:*
   - **Only oil is a body.** Silicone lands in the same oil field; soap, milk, ink and
     the other bottles are still properties that blend. Each immiscible pair wants
     the same treatment (roadmap §I, and batch 4's liquids).
   - **Oil on Water with Oil Bodies at 0 still loses colour.** The rebuilt tension
     took a settled drop from 41% to 88% of its dye kept (86% still inside it), but MacCormack still drops
     the rest; the flux transport Oil Bodies uses keeps all of it. Worth trying the
     flux transport for any look with oil, bodies or not, and measuring the cost.
   - **A seam inside freshly merged bodies** lingers for a few seconds in the lab
     (each drop's old rim). Judge it on the Mac; if it reads as a drawn line, blend
     the oil's own colour faster where two bodies have just joined.
   - **The cost is untimed.** Oil Bodies adds a transport, four partition passes, four
     blurs and a landing pass to every step of Oil & Water; `npm run stages` on the
     Mac gives the number.
   - **The lab's default diffusion (1e-4) is harsher than Oil & Water (0).** Checks
     of the dye near oil should set the look's own diffusion, or say why not.
   - **Oil poured in the first seconds of a show may stall a frame.** The bodies'
     six kernels, like the oil's surface tension before them, are built behind the
     show (about fifteen seconds after it opens on the Mac), because no look runs
     them until oil is poured and `npm run startup` holds the opening to what its
     first steps use. Oil poured before they are ready builds them on that frame.
     A check that pours oil at once in Oil & Water would say how long it stops.
6. **A plate that lives on its own** (roadmap S2, heat and boiling). Blocked on heat
   having a strength. The analog operators' accounts say to unblock it as a
   performer's control (§36e).
7. **Layers at their own speeds** (roadmap Stage 4, the rig). A slow wash, a drop field
   and a streak layer, each at its own speed, added as light. Moved up by §36h.
8. ~~**Evolve changes slowly with the song.**~~ Shipped: one move at a time (a few
   related dials, 30–90 s glides, about one a minute), steered by the song's sections
   and its level over half a minute, the palette turning at drops and breakdowns, the
   same on a slow clock with no music; nothing that moves the frame. `npm run
   slowevolve`. Story in `docs/plan-shipped/10-playing-like-a-show.md` §10 step 8.
   - **8a** (open, the owner's eye): judge it on the Mac, with a song and without
     (`docs/judging.md` §51). If a minute's glide reads as nothing happening, the
     reach (`moveTargets`' share of each dial's window) is the dial to turn, not the
     glide's length.
   - **8b** (open): `npm run evolving`, the browser check that Evolve works in the
     running app, is not in CI. Run in a cloud session on SwiftShader, its dial lines
     pass (4 of 81 dials moved in 70 s at full speed, all inside their windows; on main,
     14 of 99, one of them Lamp Motion, which moves the whole picture), but its two hand
     lines fail the same way on main and here: the app draws no frames there, so the
     hands never run. Put it on a Mac shard, or split the dial lines into Measure.
   - **8c** (open): the palette change only colours dye still to come, which is the
     real thing (a pour does not recolour the dish). With Evolve's hands at a drop
     every seven seconds that turns the plate over in a minute or two; on a look with
     few drops it may read as no change at all. Measure how long the plate takes to
     carry half the new palette on the film table, per look.
   - ~~**8d** the Evolve Speed dial sets the pace~~ Shipped: low creeps, high moves
     quickly (the owner, 2026-10-11), measured from each look's own Evolve Speed, where
     it plays as it did. Moves a minute from the bottom of the dial to the top 0.63 →
     1.10 before, 0.20 → 4.87 now. Story in `docs/plan-shipped/10-playing-like-a-show.md` §10 step 8d.
     - **8d-1** (open): the looks set Evolve Speed from 0.02 to 0.3, and it is also the
       hands' pour rate, so the same dial position is a different pace on each look. If
       the owner would rather the number meant one pace everywhere, retune the looks'
       own values first (14 of 41 would slow by 1.5 to 3.5 times).
     - **8d-2** (open): App glides in half-second steps, so a full-speed glide of 5 to
       11 s is 10 to 22 steps. Judge on the Mac whether a fast colour move looks stepped;
       if so, step short glides faster (not the whole interval: `npm run renders`
       counts App's renders).

Small things that ride along with the steps: drops with a coloured rim lined up in
chains along the flow (with batch 3), letting the dish rim show now and then as a phrase
event, and one big organiser over a field of small drops at about a 10:1 size range.

*Proposed 2026-09-28:* **Go on the music.** A Go is immediate and its fade is in seconds
(`sendLook` → `fadeSettingsTo`; a set item's `fade` is seconds), while the Mixer's takes
already fade in bars (`barsToMs`, #195). A performer wants the change to land on the
music: Go on the next bar, in 4, 8 or 16 bars, or at the next section the song's shape
hears (`barGrid`'s one, `songShape`), with the fade in bars. Beside it a **T-bar**: a
learnable fader, and one on the phone, that scrubs the fade from the look playing to the
one armed, by hand, with soft takeover, and a Go that completes it. It is the hand's side
of §17's anticipation. On the phone a long press on Go arms "on the bar" with a ring
counting down, and the Looks sheet gets the T-bar. *Measure:* `npm run setlist` for the
arming and the count; `npm run downbeat`'s song for a Go that lands within a frame of the
one; `npm run desk` for the T-bar's soft takeover.
