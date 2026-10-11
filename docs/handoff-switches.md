# Handoff: every switch and control reads on and off (QA-30, for Antigravity)

<!-- Lives in the repo so a session without the project's shared files can read it. -->

The owner's ask (2026-10-11, with a screenshot of the Record panel's Include Audio Track
switch): "This switch doesn't look right. Go through all switches and controls and make
sure they are clear when things are turned on/off."

Plan: `PLAN.md` QA-30 (`grep -n 'QA-30' PLAN.md`). The check is `npm run switches`
(`scripts/switches.mjs`, read its header first) and lands with this brief on the branch
`claude/clear-switch-states-2o9z8d`, whose draft PR #381 carries the `handoff` label: carry on in
that PR (`docs/handoff.md`, "Stopping halfway"), do not open another.

## What was found

Eight ways a switch is drawn. The shared `Toggle` in `src/components/ui/index.tsx` is the
owner's design (`DESIGN-SYSTEM.md`: "on = accent bg, white knob at right; off = `track` bg,
`muted` knob at left") and passes. The rest were drawn by hand, each differently:

| where | on | off | what the check reads |
|---|---|---|---|
| Record panel, Include Audio Track (`record-audio-toggle`, `RecordPanel.tsx` ~233) | track `bg-primary` (#FAFAFA), knob `bg-white` | track `bg-border-strong`, knob white | knob on 1.0:1 (the reported one); on track not the accent |
| Settings: Flash Limit (`flash-limit-master`, `SettingsPanel.tsx` ~570), Auto Calibrate (~726, no role), Song Detection (`song-detection-toggle`, ~840), LED Platform (~3508, no role) | track `bg-white`, knob `bg-black` | track `bg-white/20`, knob black | knob off 2.0–2.2:1; on track not the accent; two say no state |
| Remote, Macro Closeup (`RemoteControl.tsx` ~842, no role, disabled until connected) | as above | as above | knob off 2.2:1; says no state |
| Track panel's local `Toggle` ×4 (`TrackPanel.tsx` ~37, no role) | track `bg-purple-500` | track `bg-white/20` | not reached by the check today: its button is in the old overlay (`overlayUp`, shown only with the desk down, `App.tsx` ~5836, no testid); purple-500 is not the accent. Fix it with the rest, and give its button a testid so the check can reach it |
| Wall panel's local `Switch` ×4 (`OutputPanel.tsx` ~333: `output-flip-x`, `output-flip-y`, `output-test-pattern`, `output-flash-guard`, no role) | white chip | `bg-white/5` chip | invisible to the check: says no state |
| Phone dock, the lit sheet button (`phone-open-{dye,looks,sound,play,mix,more}`, `PhoneStage.tsx` ~564–595) | `bg-active text-text` | `text-text-2` | ΔE 16 by fill, 13 by text, under the 20 bar (the tools beside it: ΔE 56 by border) |

And controls whose look changes with a state they do not say, so neither the check nor a
screen reader can read them: the dye `Swatch` (`ui/index.tsx` ~198, `selected`), the Wall
panel's chips above, the sequencer's stage cards (`SequencerPanel.tsx` ~167), the Record
panel's quality, fps and format buttons (`RecordPanel.tsx` ~283–355; their `bg-accent-soft`
is not a token, so the chosen one has no fill) and its two tabs (~83–107), the MIDI panel's
`chip()` (`MidiPanel.tsx` ~30), the remote's Natural dye (`DrawScreen.tsx` ~330), the mixer's
Grade/Graded (`MixerPanel.tsx` ~280, text colour only), and the Play screen's `Pill`
(`PhonePlay.tsx` ~111), which takes `pressed` and draws nothing for it (`play-save`).

## The bar (the check's `BARS`, printed at the top of every run)

- a knob against its track, both states: **3:1** or more (WCAG 1.4.11)
- on against off (a switch's track; a button's fill, border, text, a ring one state has,
  or any part inside it, each composited over what is behind it): **ΔE 20** or more (CIE76)
- a switch's on track is `--color-accent` (#8B5CF6), ±8 per channel
- every switch says its state: `role="switch"` with `aria-checked` (or `aria-pressed`)
- floors: every Settings section reached; at least 150 stateful controls found on the desk,
  50 on the phone, 4 on the remote; at least 150 of the desk's and 15 of the phone's changed
  state when clicked; the named ones among them

Today (`node scripts/switches.mjs | tail -3`): **429 controls, 356 ok, 16 under the bar** (the
seven switches, the six dock buttons, the Play screen's Save pill, the remote's switch).
**Target: 0 under the bar, every control in the table and the list above read by the check
(so it says its state), and the count of controls read not lower than today's.**

## The fix, in order

1. **Switches: one component.** Every pill in the table becomes the shared `Toggle`
   (`ui/index.tsx`), or, where a row's layout is its own (the Record panel's card with its
   icon and copy, the remote's glass card), keeps that layout round the `Toggle`'s own track
   and knob markup and colours (`var(--color-accent)` / `var(--color-track)`, knob `#fff` /
   `var(--color-muted)`), with `role="switch"` and `aria-checked`. Delete the local `Toggle`
   in `TrackPanel.tsx` and the local `Switch` in `OutputPanel.tsx`. Keep every existing
   `data-testid` (checks use `record-audio-toggle`, `flash-limit-master`,
   `song-detection-toggle`, `output-*`); give the ones with none a testid
   (`auto-calibrate-toggle`, `led-platform-toggle`, `remote-macro-toggle`, `track-*`).
2. **Say the state.** `aria-pressed` on the `Swatch` and every button in the list above that
   is one of a set with one chosen (`role="radio"` + `aria-checked`, or `role="tab"` +
   `aria-selected` for the Record tabs); `pressed` drawn on the Play screen's `Pill` (the
   accent trio the Follow and Wander pills use). Then the check reads them, and each must
   meet ΔE 20: the Record panel's chosen quality/fps/format button takes `bg-accent-bg` in
   place of the undefined `bg-accent-soft`; the mixer's Graded takes the accent trio, not
   text colour alone.
3. **The phone dock.** The lit sheet button takes the accent trio
   (`border-accent-border bg-accent-bg text-accent-text`) like the tools beside it, 48 px
   kept; `npm run phone` and `npm run layout` stay green.
4. Not in scope: the segmented control (ΔE 30 by text, passes), the accent trio itself
   (ΔE 50 by border, passes), the native checkboxes (browser-drawn, listed not held).
   Nothing is restyled beyond the table and the list; the desk's look is the owner's.

The phone's switches are the same components as the desk's (the Settings sheet is one
`SettingsPanel`), so 1 and 2 are the phone version too; 3 is the phone's own.

## Check changes

None to the bars. If a floor has to move (a surface renamed, a sheet gone), name it under
`Check changes:` with the count before and after; a bar does not move.

## Controls (check-skeptic, paste under `Controls:`)

- `ui/index.tsx` `Toggle` with its on track and knob set to `var(--color-track)`: the run
  must go red on `toggle-evolve` and `songs-follow` (knob 1.0:1, track ΔE 0).
- `record-audio-toggle` painted as the design (accent on, white knob on, `track` off,
  `muted` knob off): its line must go green while the others stay red.

## Run before pushing

`npm run switches` (builds; two minutes; `SWITCHES_SHOTS=dir` keeps a picture of each switch
in both states), `npm run lint`, `npm run panel`, `npm run desk`, `npm run phone`,
`npm run layout`; `npm run draftwall` if `App.tsx` is touched. The PR body carries the
handoff block from `docs/handoff.md` and, under `Measured:`, the check's last three lines
before and after.
