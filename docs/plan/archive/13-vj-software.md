# Archive: 13. ChromaGlass in popular VJ software

The closed items of [`docs/plan/13-vj-software.md`](../13-vj-software.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- ~~**13.5-link**~~ **Shipped** (2026-10-30, #588): the show server joins a Link
  session (`server/abletonLink.js`, the protocol spoken in Node, no native addon) and
  the page's tempo source takes its tempo, beat and bar; the Link switch in Settings →
  Sound → Tempo and on the phone's Sound sheet. `npm run link` 27/27. Story in
  `docs/plan-shipped.md` §13.5-link. **Owed:** the owner's session with Live
  (`docs/judging.md` §95); until it passes, the Pro page keeps Link under "on the way".
- ~~**13.5-link-one**, **-transport**, **-gate**, **-rescan**, **-menu**~~ **Shipped**
  (2026-11-01): Live's bar line is the plate's one from the first bar, Play/Stop lets
  Live's stop pause a running Sequence, Link is Pro, the interfaces are read again
  every thirty seconds, and the Mac app's Show menu has the switch. Story in
  `docs/plan-shipped.md` §13.5-link-one. **Owed:** in the same sitting, §95.
- ~~**13.5-osc-beats**~~ **Shipped** (2026-11-09): the beat line waits for 12 kicks,
  not 15 s; story in `docs/plan-shipped.md` §13.5-osc-beats.
- ~~**13.7-check**~~ (shipped 2026-11-07): the contract, `docs/dawbridge.md` (OSC
  over UDP on `127.0.0.1:9024`, every address and argument, the page's messages and
  the `CGPC` audio frame, the exports the check imports), and `npm run dawbridge`, a
  fake plugin against the real show server and the built app, red on main with its
  lines owed as `app` and `plugin`.
- ~~**13.7b**~~ (shipped 2026-11-07, built by Claude on the owner's Mac): the plugin,
  `plugin/dawbridge/` in JUCE 8, an AU and VST3 effect with `DawBridgeSelfTest`;
  `auval` passes and `npm run dawbridge -- --plugin` is 36 of 36 there. Story in
  `docs/plan-shipped.md` §13.7b.
- ~~**13.7b-film**~~ (shipped 2026-11-08): filmed in Ableton Live on the owner's Mac,
  Slot 4 driving Plate Rock with the tempo locked to Live. Story in
  `docs/plan-shipped.md` §13.7b. Logic waits for 13.7c's sitting (no Logic on that Mac).
- ~~**13-icon**~~ **Shipped** (2026-10-31): the Mac app's own `.icns`, drawn on macOS's grid by `npm run brand`. Story in `docs/plan-shipped.md` §13-icon. **Owed:** how it sits in the Dock beside the other apps, on the owner's Mac after the next release.
- ~~**13-update-signed**~~ **Shipped** (2026-10-27: the first signed and notarised release, 1.3.692; `MAC_APP_NOTARISED` is true and `npm run updates` asserts it). Story in `docs/plan-shipped.md` §13-update-signed (moved 2026-10-29, 19m-2). Owed: judging §75, the owner installs 1.3.692 and confirms the next release replaces it in place.
- ~~**13-update-auto**~~ **Shipped** (2026-11-11): Install Updates Automatically, on
  or off, in the *ChromaGlass* menu and the profile sheet, and never an update in the
  middle of a show (`npm run updates`). Story in `docs/plan-shipped.md` §13-update-auto.
  **Owed:** the next Mac release, then the owner's eye on the menu tick and the card's
  switch.
- ~~**13-first-open**~~ **Shipped**: the release notes, the profile sheet's Mac app card and the landing page say Open Anyway (`npm run updates`). Story in `docs/plan-shipped.md` §13-first-open (moved 2026-10-29, 19m-2).
- *Trap:* the updater reads the repository's **newest** release. Any other kind of
  release on this repo (a `show-*` tag of 14p, an iPhone build) must be published
  with `--latest=false`, or every installed app looks for `latest-mac.yml` in it
  and reports an error.
- ~~**13-version**~~ **Shipped** (2026-10-31): the site inside a release is built with the release's version. Story in `docs/plan-shipped.md` §13-version.
