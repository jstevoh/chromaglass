# Archive: 34. What Photism showed: the page and the app (asked 2026-10-22)

The closed items of [`docs/plan/34-photism.md`](../34-photism.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- **34a. A landing page before the sign-in wall.** *Shipped (2026-10-22), first version*: `Landing.tsx` before the sign-in, `npm run signin` holding it; the owner's look is `docs/judging.md` §62. Story in `docs/plan-shipped.md` §34a (moved 2026-10-29, 19m-2).
- **34a-7a. OSC and Art-Net are Pro.** *Shipped (2026-10-30, the owner's yes on the card of
  2026-10-29; story in `docs/plan-shipped.md` §34a-7a).* `npm run tiers` 4b and 4c.
- **34a-7f. The rig's wires, checked without the rig.** **Shipped** (`npm run rig`, `scripts/rig.mjs`):
  the real show server with a Pro key; every OSC address on `/pro`, sent as Resolume, TouchDesigner
  and Max send it, arrives as the message the page acts on; the page's `lights` leaves as an
  ArtDmx universe at the set rate; a desk's universe arrives as settings; and in the built app an
  OSC setting, a desk fader, a MIDI fader (past soft takeover) and a DAW's 120 BPM clock move the
  page, and an OSC setting lights the controller's ring. All 33 lines green: no
  claim on `/pro` was found broken. The plate's colours on the fixture and the blackout on the rig
  need a plate that reports its dye, so they run on the Mac (`RIG_PLATE=1` elsewhere). The
  programs themselves are `docs/judging.md` §93, one sitting with free versions.
- **34a-6a. The channel's ids.** *Shipped (2026-11-08): all six on the channel, Public, ids
  in `siteFilms.ts`; story in `docs/plan-shipped.md` §34a-6.*
- **34a-8. The YouTube channel, linked from the landing page.** *Shipped (2026-11-08, the owner's ask;
  story in `docs/plan-shipped.md` §34a-8).* `npm run signin` 11b.
- **34a-8a. The films themselves on the page.** *Shipped with 34a-6 (PR #679, carried from #729): the row
  "Six records from the 1920s" sits under the looks, and each card opens its film from the
  channel on the page itself.*
- ~~**34a-6b. Later:** the hero could cross-fade the loops instead of the stills.~~ *Shipped as 34a-2's filmed loop (2026-11-21).*
