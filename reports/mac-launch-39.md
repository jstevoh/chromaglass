# Mac launch and looks after #39

2026-09-14, late night. The Mac is on `main` at ba3733f "The pigment grain was never drawn for the first nine hundred steps (#39)".

*This report is pushed in parts. Sections after §1 are still to come if they are not below.*

## 1. Launch

- **Pull.** `git pull --ff-only` refused at first: #38 adds `playwright` to `package-lock.json`, and the local lockfile edit is in the way.
  - The two edits touch different parts of the file. The local edit drops 531 lines of optional `@esbuild/*` platform packages; #38 adds the `playwright` and `playwright-core` entries.
  - So I stashed only the lockfile, fast-forwarded f960f9b → ba3733f (#38 and #39), and popped the stash. It merged cleanly.
  - The lockfile is still modified locally: the 531 deleted lines are still gone, and #38's playwright entries are in it. A backup of the local file from before the pull is at `/tmp/package-lock.local-backup-39.json`.
  - The nested `chromaglass/` clone is untouched.
- **No `npm install`.** #38's only new dependency is `playwright`, a dev dependency the build does not use, and an install would rewrite the local lockfile.
- **Build.** `npm run build`: OK in 3.27 s.
- **Restart.** I killed the old server (pid 23447, key 7594) and started `npm run remote` with nohup. The log is in `~/chromaglass-server.log`.

| | |
|---|---|
| Server pid | **25271** |
| Show key | **9281** |
| Phone | http://192.168.0.234:3000/?remote=1&key=9281 |
| Network display | http://192.168.0.234:3000/?cast=true&key=9281 |
| `curl http://localhost:3000/` | 200, 1320 bytes |

- The key changed, so any of James's tabs or displays still holding key 7594 need a reload with 9281. I left James's Chrome and the projector alone.
- **Load:** GPU utilisation 99 % and load average 5.3–5.5 at the start (MOTIV Mix, James's Chrome, WindowServer). That is the same as #37, so timings below are compared by frames, not seconds.

## 3. The sheet — **everything at 8 but two stop-row words; three breaks read badly**

Method: `~/cg-scratch/surface39.mjs` (surface37 pointed at a new folder) and `surface39z.mjs` (3× zooms).
- MIDI panel open, MIDI enabled with no hardware attached, APC40 mkII factory map loaded.
- Every `<text>` and shape measured in the DOM in both modes, then the PNG saved in both modes.
- The old script's extra zoom block stopped on a control id this picture doesn't have (`fader-8`), after all measurements and both PNGs were saved. The zooms come from `surface39z.mjs`.

**Factory map: 80 bound / 67 unbound** (#37: 79 / 68). Ink against its own fill: 0 controls below 3.6 in either mode.

### a) Sizes — **208 of 210 lines at full size on this Mac**

| units | #37 lines | #39 lines |
|---|---|---|
| 8 | 189 | **208** |
| 7.5 | 1 | 1 (Macro) |
| 7 | 3 | 1 (Evolve) |
| 6.5 | 2 | 0 |
| 6 | 4 | 0 |
| 5.5 | 2 | 0 |

- **This is better than your 203.** Nothing is below 7 here, and Evolve is at 7, not 6.5. My guess is Chrome on macOS measures the font slightly narrower than your machine does; the numbers are the same in both modes.
- **Smallest:** Evolve at 7 units, which is 8.1 px on the Mac screen. Macro is at 7.5.

### b) Margins and cuts — **unchanged and clean**

- **Tightest margins:** Macro +1.7, Evolve +1.9, Clean +2.1 (all in the stop row, same as #37), then Seed and Metronome at +3.5.
- **The hyphenated labels** all sit further in than that: none is in the ten tightest, so each has at least 3.6 units of air.
- **Ellipses: 0. Text outside its shape: 0.** Both modes.
- **Fader label clearance:** 5.0 units at both ends, as on #37.
- **Saved PNGs:** 2128×1324 in both modes, with the title band.

### c) The hyphenated names — **four read well, three don't**

On the Mac at 1× (screenshot below), every hyphenated name is readable, in both modes. That is a clear improvement on #37's grey smudges at 5.5–6 units. The same holds on the saved PNG. What's left is the choice of break:

| label | reads | say instead |
|---|---|---|
| Cyber- / punk / Neon | **well**: breaks between the two words it's made of | — |
| Velvet / Under- / ground | **well** | — |
| Irides- / cence | **well** | — |
| Granu- / lation | **well** | — |
| Backg- / round / Loop | **badly**: "Backg" isn't a syllable | **Back- / ground**. Or "Bg Loop", which on #37 fit on one line at 8. |
| Micros- / copic / Chaos | **badly**: "Micros" reads as a word of its own | **Micro- / scopic** |
| Sensual / Labo- / ratory | **awkward**: readable, but the eye stalls on "Labo" | **Lab- / oratory** or **Labora- / tory** |

- Yes, I would rather have **"Back-ground"**. The same rule (break between the parts of a compound, or after a prefix) fixes Microscopic too.
- Background Loop is also the one knob that now needs three lines. On #37 its short form "Bg Loop" fit on one.

On screen at 1×:

![sheet on screen](s39-surface-screen.png)

Saved PNG, on paper:

![saved sheet, paper](s39-cheatsheet-paper.png)

3×: presets on paper, knobs on screen, stop row on paper:

![presets on paper, 3x](s39-zoom-presets-paper.png)
![knobs on screen, 3x](s39-zoom-knobs-screen.png)
![stop row on paper, 3x](s39-zoom-stoprow-paper.png)
