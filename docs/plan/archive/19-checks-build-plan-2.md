# Archive: 19. The checks, the build and the plan itself (continued)

The closed items of [`docs/plan/19-checks-build-plan-2.md`](../19-checks-build-plan-2.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 19m. Fragments for the shared documents, and this file as an index

- ~~**19m-2. Read each section once for the shipped prose the markers did not catch**~~
  **Shipped** (2026-10-29): about 1,700 lines of shipped stories in 30 section files moved,
  open plan 757 → 631 KB; 28f and 28g folded. Story in `docs/plan-shipped.md` §19m-2
  (moved 2026-10-29, 19m-2).

## 19v. Two checks that could not tell what they were asked

- **19v-3. The magnet check's second press landed on the plate bar.** **Shipped**
  (2026-10-17): Save's changed-look dot takes no width, so the bar at 1280 no longer wraps
  when a look changes and the plate stays under the hand. `layout` and `magnet` each ask it
  now. The story is in [`docs/plan-shipped.md`](docs/plan-shipped.md) §19v.

## 19x. A moved bar names itself

- **19x-3. Measured quotes what it printed.** **Shipped** (2026-10-26): the `Check changes named` job fails an Antigravity PR whose `Measured:` quotes no printed line (`scripts/measured.mjs`, `npm run checkguard`). Story in `docs/plan-shipped.md` §19x-3 (moved 2026-10-29, 19m-2). Named limit: `npm run checkguard` still reads "it passed on 2026-10-26" as printed, because the self-test holds that sentence in a string literal; the lookup cannot tell a script's fixtures from what it prints (the other scripts' fixtures are the same risk, small, and the reviewer's re-run is the guard). Found along the way: `namedLines` does not read a
  `Check changes:` that is itself a list item (`- **Check changes:**`, how Antigravity's
  bodies write the whole block), so a named change under that form is not seen. It fails
  safe (red, never green) but costs a round; read it the way `measuredGroups` does.

## 19aa. A flake tracker: each check's reds counted from CI's own logs

- **19aa-6. The renders lines on a starved runner (shipped 2026-10-24).** Story in
  `docs/plan-shipped.md` §19aa-6 (moved 2026-10-29, 19m).

## 19m. Fragments for the shared documents, and this file as an index

- ~~**19m-5. The live plan holds only open work**~~ **Shipped** 2026-11-21 (the owner: "Move
  all the old work to an archive for reference/context"). The open plan had grown back to
  1.16 MB because a PR marks its item shipped where it stands and nothing asks it to move
  the item. `scripts/planarchive.mjs` cuts each section file into headings and items
  (indented sub-items too), and moves every item whose first line says it is closed (struck
  through from the start, `(shipped ...)`, `**shipped**`, `*Shipped*`, or `Shipped`,
  `Done`, `Dropped` or `Retired` after its title) to `docs/plan/archive/` under the same
  file name. It leaves an item that says it shipped only in part, one whose text still
  names an open leftover, and one with an open sub-item under it; it keeps a
  closed heading as a stub while open items stand under it; and it refuses to write a sweep
  that would lose or double a line or an id. The first sweep moved 375 closed blocks,
  139 KB, out of 41 files, with every one of the plan's 1,436 ids still found by
  `grep -rn`; a second run moves nothing. §2, §3 and §7, shipped whole, moved to the archive
  as files. `checks.mjs`'s quarantine check now reads only the live `.md` files (it read
  every entry of `docs/plan/` and would have thrown on the new directory), which is right:
  a quarantine's plan id names open work.
