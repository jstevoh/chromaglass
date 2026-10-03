# ChromaGlass for the Mac

The show, its server and the projector in one app (PLAN.md §13 step 1). It is the
website as `npm run build` makes it, packed into an Electron app together with the
show server (`server/remote-server.js`, the same file `npm run show` runs). Open it
and:

- the show opens from the server inside the app, with no network needed, ever;
- the phone remote, network displays, OSC (UDP 9000) and Art-Net work with no
  terminal (Show → Show Server Details… prints what the terminal used to: the show
  key and the phone's address);
- the show key is kept between launches, so phones set up at soundcheck stay
  linked after a restart;
- a projector that is plugged in gets the show at once, in full screen, with no
  click, and again whenever it is plugged back in (Settings → Wall still switches
  this to Ask or Off);
- the show keeps its frames and timers when its window is covered or hidden, and
  the display does not sleep.

The site inside is the one from the day it was built. Every change still lands on
the website first; a new download picks it up.

## Getting the app

**From CI (no Mac tools needed).** On GitHub: Actions → *Mac app* → *Run workflow*
on `main`. When it finishes, the run's *Artifacts* has `ChromaGlass-mac`: a zip
holding `ChromaGlass-<version>-arm64.dmg` (and a `.zip` of the app). It is built for
Apple silicon.

**On the Mac.** From the repo:

```sh
npm install
npm --prefix desktop install
npm run app        # run it from the repo, to try a change
npm run mac-app    # build the .dmg into desktop/release/
npm run desktop    # the check: the app, offline, on a lit plate (add -- --packaged for the built one)
```

## First launch

Until it is signed with a Developer ID (below), macOS says it cannot check the app
for malicious software. Open it once, let macOS refuse, then System Settings →
Privacy & Security → *Open Anyway* (macOS 15 no longer offers this from the
right-click menu). After that it opens like any app.

macOS then asks, each once:

- **Accept incoming network connections?** Allow: this is the phone remote, network
  displays, OSC and Art-Net. Deny and the show still plays on the laptop and its
  projector.
- **Microphone**, the first time sound is switched on. The sound is analysed on the
  Mac, never recorded or sent.
- **Camera**, the first time the scene camera or a camera source is used.
- **Local network** (macOS 15), for the same reason as the first.

Looks saved in Chrome at chromaglass.web.app are not in the app: the app has its own
storage, like a second browser. In Chrome, save each preset you need as a file (the
download button beside it in the presets menu) and the MIDI map
(`.chromaglass-midi.json`), then load them in the app the same way.

## Signing it with your Developer ID (optional, once)

An Apple Developer Program membership ($99 a year, already needed for the iPhone
app) lets CI sign and notarize the download, so it opens with no warning. Add these
as repository secrets (Settings → Secrets and variables → Actions):

| Secret | What |
|---|---|
| `CSC_LINK` | Your *Developer ID Application* certificate and key, exported from Keychain Access as a `.p12`, then base64 (`base64 -i cert.p12 \| pbcopy`) |
| `CSC_KEY_PASSWORD` | The password you gave the `.p12` |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password from account.apple.com → Sign-In and Security |
| `APPLE_TEAM_ID` | The ten-character team ID from developer.apple.com → Membership |

With them the workflow signs with the hardened runtime and notarizes; without them
(and on every pull request from a fork) it signs ad hoc, which is what lets an Apple
silicon Mac open it at all.

## How it is put together

- `main.js`: the main process. Picks the port (3000, the next free one if taken),
  keeps the show key, starts the server, grants the show's permissions (sound,
  cameras, MIDI, screens) to its own pages only, opens the show window, and puts the
  projector window on the projector's screen in full screen. Why each of these, at
  length, is in its comments.
- `preload.cjs`: tells the page it is in the app (`isDesktopApp()` in
  `src/lib/platform.ts`), which is what lets `useProjector` send the show to a
  projector without waiting for a click.
- `electron-builder.config.cjs`: what goes in the app (this folder, `dist/`, the
  server's two files), the Mac's Info.plist strings, and signing.
- `scripts/desktop.mjs` (`npm run desktop`): the check, run on the packed app by
  `.github/workflows/desktop.yml` on a Mac.

Next in §13: Syphon out (step 2), a native add-on that publishes the plate from
Electron's shared texture, so Resolume, VDMX or OBS take the plate as a layer.
