# QA list: what the owner found playing it (from 2026-10-04)

The owner's QA rounds, one line per fault, ranked by how much it costs a show. A fix
thread takes the top open item in a tier; the PR that fixes it strikes the line here
(`~~…~~ #NNN`, and "live" once deployed). Where it shows: **desk** (the laptop's
Perform and Design desks), **phone**, **wall** (the show screen or projector), **Mac**
(the desktop app).

**The bug bash (QA-33, 2026-11-26).** The owner asked for an automated bug bash.
`npm run bugbash` (scripts/bugbash.mjs) opens every look, puts every desk panel out on
seven seeded tabs and turns, presses or picks each of their controls end to end, then
does the same on the phone layout, one level into each sheet. It notes crashes, hangs,
freezes, a plate gone black, flat or NaN, settings past finite, new console errors,
switches that do not come back, and (low, to read rather than fix blind) controls that
change nothing. It is a report, never a gate, and runs on the Mac's GPU through the
film queue. Antigravity runs it and triages; its grouped list becomes one fix thread per
area, each fix striking its own line here.

- **QA-33a** Run the bug bash on main and write the grouped findings (Antigravity, the
  Mac). Shipped as a report when the list is in the project's files.
- **QA-33b** Fix threads, one per area of the list, each a QA item of its own.
- **QA-33c** The sweep cannot judge what a control *should* do, only that it did
  something and nothing broke; a dial that works but feels wrong is the owner's list
  and the heuristic review, not this.

**Tier 1. Seen by the room, or it stops the show.**

- **QA-32a** A held closeup whose frame empties while it is in (the pool flows out of it,
  Evolve thins it, a finger sweeps it) stays on the glass: Hold holds, by design, and only
  coming in lands (QA-32). Follow rides the liquid instead. Whether Hold should step to the
  nearest liquid when its frame has been bare for a few seconds, with no hand on the aim,
  is the owner's call; `npm run closeupland` is where its line would go. Found with QA-32.

**Tier 2. A control does the wrong thing, or cannot be reached.**

- **QA-20a** The other tools' Amounts, read the same way: what each lays or moves at
  0.05, 1 and 5 of its Amount, against what the dial's ends should mean (the Spray's
  mist, the Press's pressure, the Finger's drag, capped at 0.25 in `fingerDrag`, so its
  Amount stops doing anything past about 1.7). Found with QA-20; not measured yet.
- **QA-21** Same-seed render determinism failed: two renders of one seed differed
  slightly, then matched on the re-run. Either the check reads a frame before the
  plate is settled or something in the step is not seeded.
- **QA-22** Beat Squeeze failed, then passed.
- **QA-23** The ferrofluid ring drifting with the band failed, then passed.
- **QA-24** Startup missed its 2 s limit by 0.02 s: a near miss, so find whether
  startup grew or the Mac runner was slow, before touching the limit.
- **QA-25** One of the ear's checks missed narrowly. Read from the runs: `npm run renders`'
  "the ear is reading", whose bar is 45 frames in a three-second window (15 a second).
  Every Mac run since 10-10 read 28–36 a second in both windows until #347 (the cover
  glass's return); its own PR run and every deploy since read 15–19 in the second
  window, on the bar. #345 (Preview), #339 and #350 alone read 28–36, so it was the
  glass. In the lab (384², the app's rock and kicks at the default Plate Rock, 600
  steps, SwiftShader): the glass took the same substeps as the tilt alone (2.1–3.2 a
  step), so 27a-1's plan held, but a step cost 1,080 ms against the tilt's 740: its
  drift shift (`driftShift`, one pass for every carried field) called `at` once per use,
  twenty-one times a cell, each a load of the field and one of the gap (a `select`
  reads both sides). **Fixed (this PR):** each of the seven cells it needs read once,
  the gap only for the ferrofluid's volume, summed in the old order: on SwiftShader the field is
  the same to the bit (the lab's dye after 120 steps of the glass, 8879.708350418165 both),
  and a step with the glass costs 865 ms, the glass's own cost from 340 ms to 125.
  Also, since #361 the glass only drifts with Frame Sway up (default 0), so
  at the defaults the shift does not run at all.
- **QA-26** The phone's clean-screen check is flaky; a fix is proposed in a comment on
  #339 (from the Wall reconnect thread), not yet pushed.
- **QA-27** The phone's two-finger Drop (19h-2) is instrumented and waits for its next
  failure to show where the dye goes; read that run before changing anything.
