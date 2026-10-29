# 13. ChromaGlass in popular VJ software: what shipped

How §13's shipped items were found, built and measured. The open work is in
[`docs/plan/13-vj-software.md`](../plan/13-vj-software.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## First pass (moved 2026-10-04)

### 13-update. The Mac app's download, its releases and its updates (2026-10-25)

Asked by the owner on 2026-10-25, after the app was built and put in Applications by hand:
"don't we also need to create a download link on the webpage/profile? and whenever we have a
new release update that app? and also allow updating of the app from inside the app itself?"
The same day they chose a public download ("public download is fine"): Pro is checked inside
the app against the key (23.11), so a GitHub Release on this public repo is the file.

- **A release** is the owner's call: Actions → *Mac app* → *Run workflow* with *release*
  ticked, or a `desktop-v<version>` tag. `desktop.yml` builds and checks the app as every run
  does, then a `release` job on Ubuntu (no Mac minutes; the only job that may write) publishes
  `desktop-v<version>` as the newest release with the .dmg under a fixed name
  (`ChromaGlass-mac-arm64.dmg`), the zip, the blockmaps and `latest-mac.yml`. Not every merge:
  main takes several a day and each would tell every installed app to update. The version is the
  site's major and minor and the run's number, so nothing has to be bumped first (13-version is
  what that leaves).
- **The download**: Profile & Store has a Mac app card (`MacAppCard.tsx`, `src/lib/macApp.ts`):
  Pro on a Mac gets Download for Mac; Pro on a phone, an iPad or a PC is told to open the page on
  the Mac (the phone version); Free and Home are told it comes with Pro. The landing page's Pro
  tier lists it, with a download line for a Mac. The link is GitHub's `releases/latest/download/`
  of the fixed name, so a release never needs a deploy to be found.
- **Updates in the app** (`desktop/updates.js`, electron-updater 6.8.10): twenty seconds after
  opening and every six hours it reads the newest release's `latest-mac.yml`. macOS replaces an
  app in place only when it is signed with a Developer ID (Squirrel.Mac checks the new copy's
  signature against the old), and the owner has deferred the Apple account, so the build records
  whether it was signed (`chromaglass.signed` in its package.json) and: ad hoc, the menu's
  *Download ChromaGlass <version>…* and the profile card's button open the new .dmg; signed, it
  downloads and installs on quit, with *Restart to Update*. It never restarts, opens a window or a
  box by itself; one notification at most, none while a projector window is open; Check for
  Updates… is the only box. What it found stays found through a later check that fails offline or
finds the same release again, and on a signed Mac Restart to Update waits until Squirrel.Mac
itself has the update (electron-updater says it is downloaded before Squirrel has taken it, and
a click then would queue a quit for whenever Squirrel finished). A release runs only from main or
a tag.

Measured: `npm run updates` 69/69 (every updater event in order with stand-ins, what it must not
do unasked, and that the builder config, the app and the site agree on the .dmg's name and the
feed); `npm run desktop -- --packaged` 11/11 on the Linux pack, its new "updates" line the shipped
electron-updater reading a feed the check serves (`1.3.0 → 999.0.0 (idle → checking →
available)`, the menu's *Download ChromaGlass 999.0.0…*, the page's profile card seeing the same and told it as it happened: `checking → available 999.0.0`).

## Third pass (moved 2026-10-29, 19m)

### 13. ChromaGlass in popular VJ software

- **13-update** (**shipped** ad hoc, asked 2026-10-25; the story is in
  `docs/plan-shipped/13-vj-software.md` §13): a release is Run workflow → *Mac app* with *release*
  ticked, which builds, checks and publishes a GitHub Release; the site's Download for
  Mac (Profile & Store for Pro, the landing page) links to its fixed-name .dmg; the app
  finds new releases itself (electron-updater, `desktop/updates.js`) and, ad hoc,
  offers the download in its menu and the profile sheet. *Measure:* `npm run updates`
  (80/80, CI `Measure · logic`), and `npm run desktop -- --packaged`'s "updates" line
  (the shipped updater against a feed the check serves; 11/11 on the Linux pack).
  Judged on the owner's Mac: `docs/judging.md` §75.

- ~~`npm run desktop`'s projector line goes red on CI's Mac on PRs that never touched
  it ("the mirror's canvas missing", #255 and #262 on 2026-10-04)~~ **Fixed 2026-10-04
  (#263):** the line read the projector once, 2.5 s after its window appeared, and on
  the Mac the mirror comes up 3.15 s after the projector's page opens (the first run
  that printed it). Until then the page is `main.tsx`'s black loading fallback: the
  projector shares the show window's renderer, and the show has just reloaded and is
  in its opening, so the page's first animation frame is held as long as the show's
  (in the cloud 0.48–0.58 s with 11–66 ms of script, the mirror at 0.39–0.65 s). The
  line now waits for the mirror (`#stage-canvas`) up to the app's own 8 s loading bar,
  prints how long it took and the longest frame the page sat in before it, and reads
  the click hint 2 s after the mirror came up: the hint is timed from the mirror's
  mount, so the old read could judge it before it was due. The second read must be of
  the same page (its `timeOrigin`), at least 1.5 s after the mirror, with the show
  window still there and one projector window (the `check-skeptic`). Red on a build
  with no mirror canvas (missing at 8.02 s), on one whose hint ignores full screen,
  and on that one again with the projector reloading, or closing, 1 s after the mirror.

## Fourth pass (moved 2026-10-29, 19m-2)

### 13. ChromaGlass in popular VJ software

#### 13.1. The wrapper

1. **The wrapper** (one PR): an Electron app for the Mac with the built site inside
   it (offline from the first launch), the show server started with it, the show
   window opened on the projector with no click needed, background throttling off,
   and a macOS build on the CI runner. A check loads the packaged app with the
   network off and sees a lit plate. **Shipped** (2026-09-27): `desktop/` (its
   README has the build, the signing secrets and the first launch), the check
   `npm run desktop` run on the packed app by `.github/workflows/desktop.yml` on a
   Mac, which also builds the `.dmg` (Actions → Mac app → Run workflow). The server
   is `server/remote-server.js` unchanged, imported by the app; the app keeps its
   show key between launches; `useProjector` sends the show to a projector with no
   gesture when `isDesktopApp()`, and the app fills the projector's screen itself.
   Measured in a cloud session before and after: with a stand-in second screen, no
   projector window opened before, one opened in full screen after; without the
   app's fill, the wall showed the click hint and the laptop the title-bar chip.
   **Owed:** the Mac look (`docs/judging.md` §26), and signing it with the owner's
   Developer ID (the secrets in `desktop/README.md`); until then macOS asks once in
   Privacy & Security before it opens.

#### 13. Flexible Canvas Video Recording & Performance Separation

- Shipped: Flexible Canvas Video Recording & Performance Separation (`src/hooks/useRecorder.ts`,
  `src/components/RecordPanel.tsx`, `src/components/desk/RecordControls.tsx`). Canvas-only video
  recording with optional audio inclusion toggle, quality presets (Master 30 Mbps, Standard 12 Mbps,
  Compact 5 Mbps), frame rate (60/30 fps), container selection (Auto, WebM, MP4), and last take tracking.
  Performance gesture/stroke recording is clearly separated and controlled side-by-side in desk toolbars
  and a unified recording studio modal (`R` for video, `T` for performance).

#### 13-update-signed. The first signed and notarised release

  - **13-update-signed** *(shipped 2026-10-27: the first signed and notarised release,
    1.3.692, went live at 7:12 PM PT; `MAC_APP_NOTARISED` is now true in
    `src/lib/macApp.ts`, so the profile sheet's Mac app card and the landing page stop
    telling the Open Anyway way round, and `npm run updates` asserts the flag and that
    both pages still gate the words on it. The build job's limit went from 40 to 75
    minutes after a run was cancelled at 40 still waiting on Apple's notary service.
    Owed: judging §75, the owner installs 1.3.692 and confirms the next release replaces
    it in place)*: with the Developer ID secrets in, the same code downloads in the
    background and installs on quit. Nothing else to build. The release notes stopped
    by themselves, from what `spctl` says of the built app.

#### 13-first-open. The first release refused on the owner's Mac

  - **13-first-open** *(shipped)*: the first release, 1.3.622 (2026-10-25), was refused on
    the owner's Mac ("may harm your Mac"), and the reply sent then said right-click →
    Open, which macOS 15 no longer offers for an app it cannot check. The release notes
    (when `spctl` refuses the build), the profile sheet's Mac app card and the landing
    page's download line now say System Settings → Privacy & Security → Open Anyway;
    `desktop/README.md` adds the `xattr` way. Only a Developer ID **and** notarisation
    (13.1-sign) removes the warning. *Measure:* `npm run updates`, two lines (the words,
    and the notes' gate before publishing).
