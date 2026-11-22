# Archive: 45. The moiré pack: printed sheets on the stage, sold as an art pack

The closed items of [`docs/plan/45-moire-pack.md`](../45-moire-pack.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- ~~**45a-2. Selling it to Home.**~~ **Shipped** (2026-11-07): a `packs` list in the signed
  key, the store's Moiré Pack product ($15 once) re-signing the buyer's Home key, the account
  sheet's Buy line and the section's Get it (`npm run license-worker` 13g–13q, `npm run tiers`
  14); story in `docs/plan-shipped.md` §45a-2.
- ~~**45a-8. The website sells the pack.**~~ **Shipped** (2026-11-07, with 45a-2): a card
  under the landing page's price cards with four frames of the pack drawn on the Mac's GPU
  (`public/landing/moire/`, 960x600 for a 480x300 box so the fine lines do not beat against
  the screen), its own Buy, and a row in `pro.html`'s tier table (`npm run signin` 11b reads
  the card, its Buy and that all four pictures load).
- **45a-11. Moiré Waves, the seventh look** (**shipped**, this PR). The owner picked the
  Waves clip off the moiré reel of 2026-11-08 ("I like the waves one"), and no look had
  the Waves sheet. Moiré Star's stage (Classic underneath, the kick on the Curl) with two
  Waves sheets face up, Turn 2, Spin 0.2, Curl 0.4: the clip's settings. On Waves the
  Curl is the waves' height, so the kick lifts them. The phone lists it with the other
  pack looks (`phoneLooks` reads the presets), and the pack's lock covers it.
- ~~**45a-13. Random looks land on moiré one pick in sixteen, not one in five**~~
  (**shipped** 2026-11-11, `npm run panel`; story in `docs/plan-shipped.md`).
- ~~**45a-14. Randomise lays a pair of sheets now and then**~~ (**shipped** 2026-11-11 with
  45a-13, `npm run panel`; story in `docs/plan-shipped.md`).
