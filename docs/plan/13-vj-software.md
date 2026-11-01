# 13. ChromaGlass in popular VJ software

Asked on 2026-09-27: "Integrate into popular VJ software." It came up alongside
"have we reached the point where we need to grow beyond the web?" The answer to that
(project files, `beyond-web/beyond-web.md`) was *not yet for the show itself*.
Handing video to another app was the one place a page cannot go. Step 1, the Mac app,
is built (#207); steps 2 to 8 are not.

**What integration means here.** A VJ app (Resolume Arena and Avenue, VDMX,
TouchDesigner, MadMapper, Millumin, OBS) meets ChromaGlass in four ways, and each one
takes a different route:

| | What it is | Route | Needs |
|---|---|---|---|
| **Video out** | The plate as a live layer in the VJ app | Syphon on macOS (Resolume, VDMX, MadMapper, Millumin, TouchDesigner, OBS), Spout on Windows (Resolume, TouchDesigner, OBS), NDI across a network (all of them) | A page cannot publish a GPU texture. **Today:** OBS captures the projector window and sends it out through its Syphon or NDI plugin. **Properly:** the wrapper (steps 1–3) |
| **Control in** | The VJ app or its controller plays ChromaGlass | OSC, which the show server already hears on UDP 9000 (`server/remote-server.js`, `oscToMessage`: `/chromaglass/setting/<key>`, `/action/<name>`, `/preset/<id>`, `/blow`, `/drop`, `/press`, `/tilt`, `/dye`) | The web app plus `npm run show`. Written up and templated, not built again |
| **Tempo** | One beat shared by everything | Ableton Link, which Resolume, VDMX and TouchDesigner all speak. MIDI clock already comes in (`src/lib/midi.ts`) | A page cannot join Link. The show server can |
| **Video in** | A VJ app's output as a ChromaGlass source | Syphon, Spout or NDI, arriving as a camera | **Today:** any virtual camera (OBS Virtual Camera, NDI Webcam Input), picked like a camera. **Properly:** the wrapper (step 6) |
| **A DAW** | Logic or Ableton playing ChromaGlass from the song: its audio, its tempo and transport, and automation lanes moving settings | MIDI from the DAW: clock, Start, Stop and Continue, and MIDI timecode's quarter frames are already read (`src/lib/midi.ts`), and CC from an automation lane reaches any setting through MIDI learn | **Today:** the DAW's output into a loopback device (BlackHole, Loopback) picked as the input, and its MIDI out through the Mac's IAC bus (not written up, never tried end to end; 14s's input picker bug bites here). **Properly:** a bridge plugin (step 7) |

**Not doing: a plugin inside the VJ app.** FFGL (Resolume) and ISF (VDMX, MadMapper)
run OpenGL fragment shaders inside the host. The plate is dozens of WebGPU compute
passes a frame, with a pressure solve, which means porting the solver back to GLSL.
That is the native rewrite `beyond-web.md` argues against (kept for later as step 8).
Streaming the plate into the host gives the VJ the same layer without it.
The same holds for drawing the plate inside a DAW plugin's window (asked 2026-10-04,
about an ad for a visualiser sold as an AU/VST plugin plus a standalone app): a
plugin's window is a native view, and the plate needs Chromium's WebGPU and Web MIDI.
Step 7 is the part of that idea that fits: a plugin that draws nothing.

**The wrapper comes first** (the owner, 2026-09-27: "Would a good option be to create a
small native wrapper that allows us to integrate into other VJ apps and have a
complete cached system?" Yes, and he asked for it in the plan). It is one small
native shell that does three jobs:

- **The whole show, cached.** The built site goes inside the app, so it opens and
  plays with no network. That covers a gig with no wifi, which the service worker
  only partly covers (see "Found along the way").
- **The show server, inside it.** OSC, Art-Net and the phone remote without a
  terminal. Electron's main process runs `server/remote-server.js` as it is.
- **A native add-on for the VJ routes.** Syphon, NDI and Spout, out and later in.

It is **Electron**, not Tauri. The show server is already Node. Electron's
Chromium is the WebGPU and Web MIDI that CI's `WebGPU (macOS)` job tests, while
Tauri on a Mac draws in Safari's web view, which has no Web MIDI. And Electron's
offscreen rendering hands over a GPU shared texture, which Syphon and Spout need.
The web app stays the core: every change lands on the site first, and the wrapper
picks it up in its next build. `detectTier()` already reads Electron as the
`native` tier. It is about 150 MB to download, which a show laptop doesn't mind.

**Running order.** Steps marked *(owner)* need the owner's Mac and a VJ app on it.

1. ~~**The wrapper**~~ **Shipped** (2026-09-27, #207): `desktop/`, checked by `npm run desktop` on the packed app in `desktop.yml`. Story in `docs/plan-shipped.md` §13.1 (moved 2026-10-29, 19m-2). **Owed:** the Mac look (`docs/judging.md` §26); signing landed with 13-update-signed.
2. **Syphon out** (one PR): a native add-on that publishes the plate as a Syphon
   server from Electron's offscreen shared texture, with no readback. Then *(owner)*:
   the plate as a layer in Resolume or VDMX on the owner's Mac, with the delay measured
   against the plate's own frame. *Not started.* **Check written** (2026-11-01,
   `scripts/desktop-syphon.mjs`, run by desktop.yml as `npm run desktop -- --owed=syphon`):
   the add-on loads, a Show-menu checkbox `syphon-out` (off at start) serves "ChromaGlass"
   with at least 30 frames a second published and each released, through
   `globalThis.__chromaglassSyphon` in the main process; skipped off a Mac. The build
   takes `syphon` out of `--owed`.
3. **NDI out, then Spout on Windows** (one PR each): the same add-on sends NDI over
   the network, and Spout on a Windows build. *Not started.*
4. ~~**Control, written up**~~ **Shipped** (2026-10-31): `docs/osc.md`, every address with a starter Resolume map and a TouchDesigner script (`docs/osc/chromaglass_touchdesigner.py`), held to the code by `npm run rig`. Story in `docs/plan-shipped.md` §13.4. **Owed:** the maps tried in Resolume and TouchDesigner, the owner's sitting in `docs/judging.md` §93.
   - **13.4-ipad** (from §30): the same write-up for playing the show from an iPad in
     AUM, with no new code. The iPad joins a network MIDI session, which a Mac shows to
     Chrome as a Web MIDI port; AUM's MIDI matrix then sends clock, notes, CC and Program
     Change (14t-pc) to the show; the audio arrives on the interface's line in; Link
     joins once 13.5-link ships. The network MIDI path is inferred, not tested: then
     *(owner)* tried once on the Mac with an iPad, a `docs/judging.md` entry (next free
     number at merge).
5. **ChromaGlass talks back and keeps time**, now two PRs in the show server, Link
   first (§30, 2026-10-11: Link is the shared clock of the iPad's music apps, AUM, Loopy
   Pro, Drambo, Koala, as well as of Resolume, VDMX and TouchDesigner, and VS offers it
   as a clock source):
   - ~~**13.5-link**~~ **Shipped** (2026-10-30, #588): the show server joins a Link
     session (`server/abletonLink.js`, the protocol spoken in Node, no native addon) and
     the page's tempo source takes its tempo, beat and bar; the Link switch in Settings →
     Sound → Tempo and on the phone's Sound sheet. `npm run link` 27/27. Story in
     `docs/plan-shipped.md` §13.5-link. **Owed:** the owner's session with Live
     (`docs/judging.md` §95); until it passes, the Pro page keeps Link under "on the way".
     - **13.5-link-one.** The bar grid (`lib/barGrid.ts`) finds the one by ear; Link
       already knows it (`TempoReading.bar`, beat zero of the session is every peer's bar
       line). Let a Link reading set the grid's place, so Accent the One and the song's
       bar-counted moves land on Live's downbeat from the first bar. *Measure:* `npm run
       downbeat` with a Link session whose one is not where the onsets put it.
     - **13.5-link-transport.** Link carries Live's play and stop (`stst`, read and
       relayed, `playing` on the message) but nothing uses it: a stopped Live could pause
       the Sequence the way MIDI Stop does. Off by default (a stopped transport in a DJ
       set is not the end of the show).
     - **13.5-link-gate.** Link is not behind the licence yet. #586 (34a-7a, open when
       this shipped) gates OSC and Art-Net as Pro in the show server; Link belongs under
       the same gate (`setLink` in `server/remote-server.js`), once that lands.
     - **13.5-link-rescan.** The peer opens its sockets on the interfaces up when Link is
       switched on; Ableton's library rescans every thirty seconds. A Mac that joins the
       Wi-Fi after Link is on finds only loopback until Link is switched off and on.
       Rescan on a timer, as the library does.
     - **13.5-link-menu.** A Show menu item in the Mac app beside OSC's, for an operator
       who never opens Settings → Sound.
   - ~~**13.5-osc**~~ **Shipped** (2026-11-01): OSC out of the plate's colour, the ear's
     readings and bands, the tempo and the beat, from Settings → Sound and the phone
     layout (`npm run oscout`); story in `docs/plan-shipped.md` §13.5-osc. **Owed:** the
     owner's sitting with Resolume (`docs/judging.md` §106).
     - **13.5-osc-menu.** A Show menu item in the Mac app beside OSC input's, with Show
       Server Details naming the target, for an operator who never opens Settings
       (`setOscOut` and `oscOutState` are exported for it; with 13.5-link-menu).
     - **13.5-osc-rate.** The report rides the Art-Net report's 50 ms; a VJ app's own
       frame is 16 ms. Measure on the Mac whether a hue on `/colour/hue` steps visibly,
       and send at 30 or 60 Hz only if it does (the beat already goes at once).
     - **13-pack-imports.** `desktop/electron-builder.config.cjs` copies the server's
       files by name, so a new module the server imports starts in `npm run show` and
       fails the packed app only on the Mac's CI (#658: `osc.js`). `npm run desktop`
       (or `checks`) should fail when a relative import of a packed server file is not
       on that list.
     - **13.5-osc-scale.** Every value is 0..1 except `/bpm`; Resolume's tempo input
       wants its own range. Write the range a Resolume BPM shortcut takes into docs/osc.md
       once the owner's sitting has read it.
6. **Video in from a VJ app** (one PR): Syphon and NDI arrive as a Mixer source
   (§11), not through a virtual camera. *Not started.* Beside the Mixer layer, the
   picture can also be poured into the liquid as dye that the flow then carries (the
   `pourVideo` path), the way the 1960s shows laid film loops and slides under the oil;
   VS 2 (§30, 2026-10-24) takes a camera, Syphon or Spout feed as a source, and this
   is ours. The phone gets the source picker.

7. **A DAW bridge plugin** (asked 2026-10-04; two or three PRs, after step 2): an
   AU and VST3 plugin for Logic and Ableton that draws nothing and plays the running
   app (the Mac app of step 1, which is the "standalone" half) over the show server
   on localhost. It carries three things MIDI from a DAW carries badly or not at all:
   - *Automation.* A fixed bank of automatable parameters (say 32 slots, so the DAW
     sees a stable list), each bound to a setting, a preset or an action by the same
     learn flow and binding map as MIDI learn (§5), at full resolution rather than
     CC's 128 steps, named in the DAW's lane by what they are bound to.
   - *Transport.* The host's tempo, play state and bar position every block, into the
     beat clock the way MIDI clock goes in (`beatClock.setExternal`), with the bar's
     phase exact rather than counted from 24 pulses, and a locate that lands a set
     list's cue where the song is (what 14t's missing Song Position Pointer and full
     MTC frames are for over MIDI).
   - *Audio.* The track or sidechain the plugin sits on, as PCM to the app's one ear,
     so kicks, bands, Audio Impact and song shape read the DAW's own mix with no
     loopback device; and the host's latency report, so the ear can line the kick up
     with the picture (14e).
   Built in JUCE (C++), the AU validated with `auval` and both formats built on the
   macOS runner, signed and notarised with the same Developer ID secrets the Mac app
   waits on. The app side is a bridge link in the show server, which a node fake of
   the plugin can check with no DAW: slots move settings, transport moves the clock,
   PCM moves the bands. *Measure:* a settings move written in the fake arrives within
   one frame; a tempo change reaches `musicPace` within a beat; the fake's kick and
   the plate's kick within 14e's window. Then *(owner)*: Logic and Ableton on the
   owner's Mac, an automation lane playing a look change on the bar. The phone rule:
   the link's switch and its slot bindings are in the More sheet.
   Before any of it, the MIDI route in the table above, tried once in Logic and
   Ableton and written up with step 4. *Not started.*
   - **13.7-ipad** (later, from §30; after step 7 and §12's iPad app): the iPad sibling.
     An AUv3 that draws nothing, sits on an AUM (or Loopy Pro, Drambo) channel, and
     sends that channel's readings, its notes and the host's transport to the show over
     Wi-Fi, so each instrument has its own ear with no cables, as 24.1's patch inputs
     give a rack. The same bridge link in the show server as step 7, so the node fake
     checks both.

8. **Later: one renderer core, native as well as on the web** (asked 2026-10-04,
   the owner: "add it to the plan for later"). Not scheduled: it is what the plate
   drawing *inside* a host would need (a DAW plugin's window, a Resolume FFGL effect,
   a TouchDesigner operator), which steps 2 to 7 do without. Sized on main that day:
   the renderer is about 9.2k lines of WGSL (26 compute, 11 fragment and 8 vertex
   entry points) and 8.4k lines of TypeScript in `src/gpu/`; what decides each frame
   (settings, presets, sound, MIDI, the Mixer, the tools, much of it in
   `LiquidVisualizer.tsx`) is most of the other 62k lines; and 96 of the 135 scripts
   in `scripts/` drive a browser. The route that does not fork the show: `src/gpu/`
   ported to Rust on wgpu, whose WGSL is ours nearly as written, built to
   WebAssembly on WebGPU for the site and natively for a plugin, with the web app
   still the brain and handing the core a frame's settings and splats. One kernel
   group at a time, each held to the lab's numbers (`physics`, `derive`, `maze` and
   the rest) on both builds. What it would buy beyond hosts: shaders shipped
   compiled (most of the opening is compiling, 14v), the projector's frame timing,
   120 Hz and HDR (H4) in our hands, and CoreMIDI on the iPhone and iPad. Not frame
   speed: Chrome's WebGPU already runs on Metal (inferred, not measured). Start only
   when the owner wants the plate drawn inside a host. *Not started.*

**Windows** (asked 2026-10-04, the owner: "let's add windows plans"). Nothing here has
ever run on a Windows PC. Chrome and Edge on Windows have WebGPU (on Direct3D 12), Web
MIDI and the Window Management API, so the site should play as it does on a Mac, but
CI's GPU checks run only on the Mac runners (the free Windows runners have no GPU,
and no more runners are being added), so NVIDIA, AMD and Intel graphics, Direct3D's
shader compiler and Windows' audio inputs are all unmeasured. In this order:

- **13-win-smoke** *(owner or a tester, beside Wave 2)*: the site in Chrome on two
  PCs, one with NVIDIA graphics and one with Intel integrated graphics: the opening's
  time to the first step, frames a second on Classic and on the heaviest look, a
  projector on a second screen, a USB audio interface picked by the input picker, a
  MIDI controller learned, and a crash report sent from the corner dot. What it finds
  becomes items here. It gates the rest, and should come before any paid beta.
- **13-win-app** (one PR): the Mac app built for Windows too: a `win` target (NSIS
  installer, x64) in `desktop/electron-builder.config.cjs`, a Windows job in
  `desktop.yml` that packs it and runs `npm run desktop -- --packaged` (the lit-plate
  and hidden-window lines skip there as under xvfb, with no GPU), and `desktop/main.js`
  read for anything only a Mac does (the projector's fill, the show key's folder,
  the menu). Then *(owner or tester)*: the installed app on a PC with a projector.
- **13-win-sign** *(owner)*: a Windows code-signing certificate, as secrets the Windows
  job signs with. Unsigned, SmartScreen warns people off the installer, as macOS does
  for the unsigned Mac app (13.1-sign).
- **13.3**'s Spout out then lands on this build, and **13-update**'s updates serve both.
- Selling it (§23) needs nothing Windows-only: a licence key checked offline works
  the same in both apps.

Until step 2 lands, the plate still reaches a VJ app the way it can today: OBS
captures the projector window and sends it on through its Syphon or NDI plugin, and a
virtual camera brings video in. The phone rule applies to anything with a control: a
Link or OSC-out switch is reachable from the phone's More sheet.

**Found along the way** (from the same beyond-the-web review, for a gig with no
network):

- `public/sw.js` caches files as they are fetched, and loads the page from the
  network first, so parts of the app nobody opened, and the music shelf, are
  missing offline. Cache the whole build ahead of time, and add a check that loads
  the app with the network off.
- Record keeps the whole take in memory until it stops (`src/hooks/useRecorder.ts`).
  That's fine for a song and risky for a set. In Chrome, write to a file as it
  records (File System Access).
- ~~Flexible Canvas Video Recording & Performance Separation~~ **Shipped**. Story in `docs/plan-shipped.md` §13 (moved 2026-10-29, 19m-2).
- The popup projector has only been used with one projector. Run two before rig R1
  counts on it.

**Found building step 1** (2026-09-27):

- The app's storage is its own, like a second browser: presets, MIDI maps and
  settings saved in Chrome are not in it, and moving them is one file at a time
  (each preset's download button, the MIDI map). One "take everything with you"
  file (every user preset, the MIDI and sound-learn maps, the set list, the room's
  settings), written in Chrome and opened in the app, would make the move one step.
  The same file is a backup before a gig.
- The storage belongs to the origin, port included: if port 3000 is taken when the
  app opens (a `npm run show` still running), the app moves to 3001 and opens with
  none of its saved looks. It says so in Show → Show Server Details…, but a
  performer would not look there. Either warn in the show window, or give the app
  its own origin (a custom protocol for the show window, with the relay still on
  the port), which needs `relayInfo()` to learn the relay's address another way.
- Built for Apple silicon only. An Intel Mac needs an `x64` (or universal) target in
  `desktop/electron-builder.config.cjs`, about doubling the build.
- ~~**13-icon**~~ **Shipped** (2026-10-31): the Mac app's own `.icns`, drawn on macOS's grid by `npm run brand`. Story in `docs/plan-shipped.md` §13-icon. **Owed:** how it sits in the Dock beside the other apps, on the owner's Mac after the next release.
- **13-update** (**shipped** ad hoc, asked 2026-10-25; the story is in
  `docs/plan-shipped.md` §13) Story in `docs/plan-shipped.md` §13-update (moved 2026-10-29,
  19m).
  - ~~**13-update-signed**~~ **Shipped** (2026-10-27: the first signed and notarised release, 1.3.692; `MAC_APP_NOTARISED` is true and `npm run updates` asserts it). Story in `docs/plan-shipped.md` §13-update-signed (moved 2026-10-29, 19m-2). Owed: judging §75, the owner installs 1.3.692 and confirms the next release replaces it in place.
  - ~~**13-first-open**~~ **Shipped**: the release notes, the profile sheet's Mac app card and the landing page say Open Anyway (`npm run updates`). Story in `docs/plan-shipped.md` §13-first-open (moved 2026-10-29, 19m-2).
  - *Trap:* the updater reads the repository's **newest** release. Any other kind of
    release on this repo (a `show-*` tag of 14p, an iPhone build) must be published
    with `--latest=false`, or every installed app looks for `latest-mac.yml` in it
    and reports an error.
  - ~~**13-version**~~ **Shipped** (2026-10-31): the site inside a release is built with the release's version. Story in `docs/plan-shipped.md` §13-version.
  - **13-exit** (found 2026-10-25): the first launch from /Applications on the owner's
    Mac exited by itself after a few seconds, with no crash report; the second has
    stayed up. The app writes nothing about why it quits. Write the main process's
    errors and `render-process-gone` / `child-process-gone` to
    `userData/logs/main.log`, so the next one says why; then find it.
  - **13-sync** (asked 2026-10-25): the app's storage is its own, so Pro looks saved
    on the site were not in it. Shipped as **23.18** (cloud sync for Pro, its own PR);
    the one-file-at-a-time move below is what Free and Home still have.
- The hidden-window lines are judged only where a window in a bare Electron is seen
  to slow down when minimised or covered: never under xvfb (no window manager), and
  on CI's Mac runner only if its window server really hides a minimised window.
  The first run's control, a window inside the app, stayed visible at 46 frames/s
  minimised because the app's switches reach every window in its process. Where
  it is not measured, it is `docs/judging.md` §26 on the owner's Mac.
- In a cloud session `npm run desktop` can fail "the run finished" on a 30 s
  `page.reload` timeout, after software WebGPU starves the page (its covered-window
  reading shows 2 s of timers taking about 54 s, and once the GPU process exited).
  Measured on 2026-10-03 in one container: 3 of 6 runs failed this way after main's
  #231 and #233 came in, and 1 of 4 failed on the head before them. So it is the
  container, not those PRs. The Mac runner has never shown it. Worth fixing: a
  check that times out because its machine is slow says nothing about the app.
  Wait for the reload on the page's own first frame rather than `load`, or say
  "skip" when the covered reading shows the page was starved, as the lit plate does.
- ~~`npm run desktop`'s projector line goes red on CI's Mac on PRs that never touched it
  ("the mirror's canvas missing", #255 and #262 on 2026-10-04)~~ **Fixed 2026-10-04
  (#263):** Story in `docs/plan-shipped.md` §13 (moved 2026-10-29, 19m).
- **desktop-cast-late** *(found 2026-10-27 on #507, which touched only the workflow's
  timeout)*: the projector line went red again on CI's Mac, the mirror's canvas
  "missing at 8.15 s" because the `CastDisplay` chunk itself arrived at 8.12 s (the
  index scripts by 1.69 s, the page's longest frame 1.19 s with 0 ms of script). So
  the 8 s wait was spent fetching one lazy chunk from the app's own server, not in
  the page. The re-run, and every other Mac app run that day, passed. Find what held
  that chunk (the server busy with the show's reload, or the runner's disk while the
  notary upload ran beside it) before touching the 8 s: the bar is the app's own
  loading bar, and a projector that takes eight seconds to appear at a gig is a fault.
  *Measure:* `npm run desktop` printing when each chunk was asked for and answered.
  Keeping the solver's 668 kB chunk out of the mirror's page was tried and moved
  nothing in the cloud (0.42–0.63 s against 0.39–0.65 s), so it was left out. *Still
  open:* whether the Mac's 3 s is Chromium's GPU-start hold (`npm run startup` reads
  a cold show's at 2.5–3.2 s) or the show's own opening code is what the printed
  frame says; if it is script, it is the show's opening to shorten (§14), since the
  wall is black for those seconds after the projector is plugged in.
