# Archive: 51. Projectors that blend on the wall, and focus that moves (asked 2026-11-27)

The closed items of [`docs/plan/51-layers-and-focus.md`](../51-layers-and-focus.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 51c. A look change is a fade or a cut, never hidden in the blur

- **51c-2 · An A/B deck dissolve.** *Shipped 2026-11-28: **Decks** (`projDeck`, a switch, off
  by default), the button beside the A/B Crossfade in the Mixer's Projectors box (desk,
  settings, phone Mix sheet, remote; MIDI-learnable as a switch); `lib/deckDissolve.ts`,
  `focusDissolve.ts`'s rack kinds, `app/useLookFades.ts` (`deckGo`); `npm run decks`.* With
  Decks on and two projectors on the wall, a Go with a fade goes to the darker projector (B on
  a tie). What was in the way: B could not draw a look of its own. What it can own is what 16a
  gave the back plate, its dish (every solver setting and the dyes); how the plates are drawn
  is one pass for both. So a deck Go splits the look: the dish to the dark deck while it is
  dark (over the first quarter; the front's solver keys, or the back plate's own look), the
  crossfade glided over the middle half along sin²(πq/2), the rest of the look on the front
  once the dish has landed, to three quarters (inside 51c's window, where both decks are
  melted or both half lit; one fade at a time on the front).
  The leaving projector racks out over the first half and holds the melt while its light
  goes; the arriving one racks out over the first quarter, still dark, holds, and racks in as
  its light comes up. A Go when the arriving deck is lit (the crossfade in the middle) waits
  the quarter for it to melt before its dish goes in. A second Go mid-dissolve goes to the
  darker deck then, each rack carrying on from its blur. A Go to a dark front pins the lit
  back plate to what it shows (`pinBack`), so it does not follow the front's new dish. A
  hand on the crossfader during the glide takes it back; a Back, a later Go or a Go to the
  back plate stops what of a deck Go is still to come. And B with no light on the wall is no
  longer blurred at all (`gpu/plateUniforms.ts`), so a dark B's melt costs nothing; A's is
  still drawn, because where neither projector has light the Mixer's rows laid over both
  plates fall to A's share (the pre-push review). Through the middle half 51c's 4.91 ms for
  two melted at 1600² on the Air applies. Checked on a made-up clock (nothing lit changes sharp; a rack
  jumps only in the dark; a second Go before and past the middle steps no rack by more than
  a frame) and through the real pass at 256 (the wall's light within 0.10% across the
  dissolve; B dark is off the wall to the byte, sharp, melted or with its dish changed,
  while at the middle each moves it; the first and last frames the plain A and B to the byte).
