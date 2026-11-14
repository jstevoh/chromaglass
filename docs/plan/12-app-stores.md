# 12. ChromaGlass in the App Store and Google Play

Asked on 2026-09-27: "What would it take to create an Apple iPhone app and put it in
the store?", then "expand on this idea with the Android store". Steps 1, 4 and 4a are
built; the running order has where each step stands. The
full iPhone write-up, with a table of every browser feature the app leans on, is in
the project files (`iphone-app/iphone-app-plan.md`); this is the plan.

**The decision (2026-10-30).** With the Apple developer account open, the owner
asked whether to ship on the App Store now, then "The app could be free right?" and
"What about an android app in the play store?", and chose: write it into the plan,
build nothing yet ("no need to do this yet"). What was weighed:

- *iPhone and iPad: yes, later, free with nothing to buy.* The shell is built (step
  4). In a web view iOS gives no capture of other apps' audio, no Web MIDI, no RTMP and
  no projector window, so the app is a pocket plate and the Mac app's remote, which
  suits a free app. Nothing for sale inside means no in-app purchase rules and the
  easiest review. A "get Pro" link out to our own checkout is allowed only on the US
  storefront, at 0 % for now: in August 2026 Apple asked the court in *Epic v. Apple*
  for 15 % on linked-out sales and the Supreme Court is reviewing the contempt
  finding, so the first version carries no link (12-link).
- *Google Play: yes, later, free.* The Trusted Web Activity (step 3) is less work than
  the iPhone app and is the website itself. The Play account is opened as the LLC, an
  organization account (it needs a D-U-N-S number), which is not held to the closed
  test of 12 testers for 14 days that a new personal account owes (12-play-org).
- *Mac App Store: no, for now (12-mas).* The direct Mac app (§13) is already signed,
  notarized, self-updating from GitHub Releases and sold through Lemon Squeezy (§23).

**The shape.** Neither store needs a rewrite. The show is one web build, and both
stores take a thin shell around it, but not the same shell, because the two phones'
web views differ in what matters here:

| | iPhone | Android |
|---|---|---|
| Shell | Capacitor: the built site **bundled** in the app, drawn by WKWebView | Capacitor too (12-ctl-3, in place of the Trusted Web Activity first planned): the same bundled build, drawn by Android's WebView |
| WebGPU | iOS 26 (iPhone 11 and newer), Safari and WKWebView alike | Android's WebView, on fewer phones than Chrome (Android 12+, Qualcomm and ARM GPUs); where it has none the app says so and offers Chrome or the Laptop remote (`NeedsWebGpu.tsx`) |
| Web MIDI | None in WebKit; a CoreMIDI plugin later | None in the WebView either; Chrome has it, which the website on the phone keeps |
| Record and Render | A web download does not save in a web view: route to the share sheet or Photos | The same in the WebView: route to the share sheet |
| Updates | A new App Store build each time (guideline 2.5.2: no downloading code that changes the app) | A new Play build each release (12-ctl-ship), as on the iPhone |
| Offline | Everything is inside the app | Everything is inside the app, with no service worker (as on the iPhone) |
| Account | Apple Developer Program, $99 a year | Google Play Console, $25 once |
| Tools | Xcode on the Mac | JDK 21 and the Android SDK: `android.yml` builds a debug APK in CI; `npm run android` opens Android Studio |

A Trusted Web Activity is Chrome itself, not a web view, so Android gets WebGPU, Web
MIDI, WebCodecs, wake lock and downloads exactly as the website has them today. A
Capacitor Android app would run in Android's WebView instead, which has no Web MIDI
and whose WebGPU would need its own test; the TWA is less work and does more. iOS
has no equivalent (every iPhone browser is WebKit, and Apple does not take a shell
that just points at a website), so there the build ships inside the app.
*Overtaken 2026-11-09 (12-ctl-3, built 2026-11-11): a TWA is the https site, which cannot
open a plain ws:// socket to the Mac, so it could never be the controller; Android is
Capacitor too, and a phone whose WebView lacks WebGPU is sent to Chrome.*

`detectTier()` in `src/lib/platform.ts` already has a `native` tier keyed on
`window.__CHROMAGLASS_NATIVE__`; the iPhone shell sets it. The Android app is the
hosted site in Chrome and keeps the `hosted` tier.

**What each store asks for.**

- *Apple.* A bundle ID and App Store Connect record; permission strings for the
  microphone, camera, adding to Photos, and motion if Tilt goes native; a privacy
  policy URL and the App Privacy label (crash reports from `crashLog.ts` as
  Diagnostics, not linked; audio clips to AudD/ACRCloud when song ID is on; lyrics
  lookups to lrclib.net; no tracking); a privacy manifest; export compliance (HTTPS
  only); a 1024 px icon, 6.9" iPhone screenshots, an age rating and a review note.
  The review risk is guideline 4.2, minimum functionality ("a website in a wrapper"),
  which the bundled build, offline play and native mic, camera, motion and Photos
  answer. TestFlight puts it on the owner's phone before review.
- *Google.* Identity verification for the developer account; Digital Asset Links
  (`/.well-known/assetlinks.json` on Firebase Hosting, holding the app's signing
  certificate fingerprint) so Chrome drops its address bar; an Android App Bundle
  signed through Play App Signing, targeting the API level Google currently requires;
  the Data safety form (the same three data flows as Apple's label); a privacy policy
  (required, since the app uses the microphone and camera); the IARC content rating;
  a 512 px icon, a 1024×500 feature graphic and phone screenshots. A personal
  developer account made since late 2023 must run a **closed test with at least 12
  testers opted in for 14 days in a row** before it can publish to everyone; that is
  the longest wait on the Android side and cannot be hurried, so it starts early.
  Play's minimum-functionality and WebView policies are aimed at wrappers of other
  people's sites; our own interactive instrument is not what they catch.

Both listings say the show flashes, and that the flash guard (`src/lib/flashGuard.ts`)
limits it. Free is simplest on both: a price or in-app purchase adds agreements, tax
forms and a 15 % cut.

**Running order.** Steps marked *(owner)* need the owner's phone, card or account.

1. **Smoke test the site on both phones** *(owner)*: chromaglass.web.app in Safari on
   an iOS 26 iPhone and in Chrome on a recent Android phone. Does the plate start,
   hold its frame rate, take fingers, hear the mic? Whatever breaks here is fixed on
   the website first, and both apps inherit the fix. *iPhone: **passed**, the owner
   ran the site in Safari on 2026-09-27 ("iPhone works. I tested it"). Android: not
   yet run.*
2. **Open both accounts** *(owner)*: Apple Developer Program and Play Console, and
   install Xcode. *Apple's is open (2026-10); Play Console not started, to be opened
   as the LLC (12-play-org).* Apple's side, 2026-11-13: the App Store Connect record
   "ChromaGlass TV" (`app.chromaglass.tv`) exists and an Admin API key is kept by the
   owner outside the repo; the Apple TV app's builds go up from the owner's Mac with
   it (`tvos/README.md`, "TestFlight and the App Store"). Still owed: the iPhone
   app's own record for `app.chromaglass`, the key as a secret in one of main's
   environments so CI can upload, and the EU trader status (DSA) in App Store
   Connect, which only the owner can fill in.
3. **The Android shell** (one PR; *replaced by 12-ctl-3, 2026-11-09: a Capacitor app, since a TWA cannot be the Mac's controller*): a Bubblewrap project, `assetlinks.json` in
   `public/.well-known/` with a Firebase Hosting header so it serves as JSON, the
   manifest checked for what a TWA needs, and a CI step that builds the bundle.
   The upload key stays with the owner, never in the repo. Then the closed test
   starts, 12 testers for 14 days, while the iPhone work carries on. *Built instead as
   12-ctl-3 (2026-11-11): `android/`, a Capacitor project, its debug APK from `android.yml`;
   signing and the Play upload are 12-ctl-ship.*
4. **The iPhone shell** (one PR): Capacitor's `ios/` project with `webDir: dist`,
   no service worker in the app, permission strings, status bar hidden, minimum
   iOS 26, and an `xcodebuild` step on the macOS runner. ***Built*** (the "iPhone
   app" workflow compiles it for the simulator; `npm run ios` opens it in Xcode on
   the Mac), not yet run on a phone (`docs/judging.md` §16). Changed from the
   plan: the app takes the website's quality ladder, not the `native` tier's,
   because `capacitor://localhost` read as a laptop serving itself and would
   have offered a phone 1024² at three device pixels (`detectTier`, checked by
   `npm run applink`); it gets more once a phone's heat over a set is measured.
   Still owed from this step: the audio session (music through the speaker
   while the mic is on) and the idle timer, which lean on WebKit's own
   handling until the phone shows whether they need native code; the home
   indicator.
4a. **The app is also the laptop's remote** (asked for 2026-09-27: "make the
   remote control work on the iPhone app … switch back and forth between
   modes"). More › Laptop remote asks once for the laptop's address (paste the
   Phone line `npm run remote` prints, or type it) and remembers it; the remote
   carries it as `?relay=` and connects there, since the app's own origin has
   no relay (`src/lib/appLink.ts`). Play here goes back to the plate. Only in
   the app: the website's https page cannot open a plain ws:// socket to a
   laptop. Only the app's remote follows `?relay=`: review found that the
   laptop's display followed it too, so a crafted link opened on the laptop
   handed its show key and the show to any host it named; fixed before
   merge. `npm run applink` (Measure) checks all of it on a real relay with a
   stand-in laptop, the page on another origin and a stranger's host. ***Built***, not yet on a
   phone. Open: the iPad in the app gets the full layout, which has no Laptop
   remote button yet, and neither does a phone that took More › Full layout
   (until the app is reopened); a QR code on the laptop that opens the app straight
   into its remote (a `chromaglass://` link) would save the typing. The full layout's button has its
   check written first (2026-11-08): `npm run deskreach` line `remote` (in the app at 1024×1366 and
   1366×1024, `desk-laptop-remote` drawn without a tap, asking for the laptop as the phone's does),
   owed; the QR code needs Xcode's URL scheme and is not in it.
5. **Record and Render save natively on the iPhone** (one PR): the share sheet or
   Photos. The only feature that needs new code to work at all. *Not started.*
6. **A privacy policy page** on Firebase Hosting, and the store listings: text,
   screenshots from the lab and a real phone, icons, the feature graphic. ***Built***
   *but the screenshots* (2026-11-01): the privacy page (23.13) has a section for
   the phone apps; every listing field for both stores is in `docs/store-listings.md`,
   held to its store's limit by `npm run presskit`, with the App Privacy label and
   Play's Data safety answers; Play's icon and feature graphic are drawn by
   `npm run brand` (`docs/brand/store/`). Story in `docs/plan-shipped.md` §12.6.
   - **12.6-shots** *(owner's phone)*: the screenshots, 6.9" iPhone at 1320 × 2868
     and two to eight Android phone shots, taken from TestFlight and the closed test
     (step 7), not from the lab or a desktop browser: a store screenshot promises
     what the phone draws, and only the phone's own GPU shows its grid and frame.
   - **12.6-label**: the App Privacy row for email and user id depends on whether the
     iPhone app shows sign-in, which 12-ship decides; settle the label there.
7. **TestFlight and the closed test** *(owner)*: a full set played on each phone,
   watching heat, battery and audio routing; a by-hand check in `docs/judging.md`.
   *Not started.*
8. **Submit to both stores.** *Not started.*
9. **Later:** a CoreMIDI plugin so controllers work on the iPhone and iPad; the iPad
   and a Mac App Store build from the same Xcode project; Android tablets and
   Chromebooks come with the Play listing.

The phone layout (#173) is what both apps show, so the operating rule that every
feature ships its phone version is what keeps them whole.

**Items from the 2026-10-30 decision.**

- **12-ship** *(when the owner says go)*: one PR takes the iPhone app to TestFlight:
  the signing team in `ios/`, an archive and upload job in `ios.yml` from main only
  (the API key from step 2), step 5's native save, step 6's privacy page, and, if the
  app shows the sign-in, Sign in with Apple beside Google's (guideline 4.8) and
  deleting the account inside the app (5.1.1(v); both already noted in §23). Then
  the owner's set through TestFlight (`docs/judging.md` §16) and step 8.
- **12-link** *(later, US only)*: a "Get the Mac app" link from the iPhone app to our
  own checkout, once the court has set what Apple may charge on linked-out sales.
  Outside the US the app names no price and links to no purchase.
- **12-play-org** *(owner; cleared Google's review 2026-11-12)*: the Play Console account as the LLC (organization,
  D-U-N-S number), not a personal one, so publishing does not wait on the 14-day
  closed test. Before it, step 1's Android smoke test. *Answered by 12-ctl-3
  (2026-11-11): the Android app is Capacitor, not a TWA, with cleartext and mixed
  content allowed, so it has the laptop remote as the iPhone's does.*
- **12-mas** *(not doing, for now)*: a Mac App Store build. It would need a
  sandboxed Electron build in place of the Developer ID one, give up
  `desktop/updates.js` for Apple's review of every release, and put at risk the
  system-audio loopback (`MacSckSystemAudioLoopbackOverride` and the local UDP tap in
  `desktop/main.js`, 23.8). Pro would have to be an in-app purchase (guideline
  3.1.1); a licence bought from our store may unlock it only if Pro is also sold in
  the app (3.1.3(b)), so two licence systems. Apple's 15 % is about $30 on Pro's
  $199 against Lemon Squeezy's about $10, and the tools VJs pay for (Resolume, VDMX,
  MadMapper, TouchDesigner) sell direct. Reopen only if Home's sales show buyers
  who would have found it in the store, and then as Home alone.

**12-ctl: the phone apps are the show's controller (asked 2026-11-08).** The owner: "shouldn't
we have 2 apps on each platform? tv apps to just show the visuals, and android and ios apps to
control the show?", then "lets get antigravity to build those apps". So on each store a TV app
(12-tv, it only shows the plate) and a phone app, which is one app doing both things the iPhone
shell already does: it plays the show itself (a pocket plate), and it is the Mac app's
controller, with the dials, the songs and the looks. Draw, the dials, the sequencer and the looks
are on the remote now (4a, `npm run applink`); what the controller lacks is written first as
`npm run controller` (owed lines named below, in Measure's `browser2` part), so Antigravity
builds against a red check (briefs in the project files, `antigravity/briefs-2026-11-09-phone-apps.md`):

- **12-ctl-1: the songs on the phone (shipped; story in `docs/plan-shipped.md` §12-ctl-1).**
  A Songs screen one tap from Draw and from Controls: the laptop's set list (tap to arm an item
  for the next Go) and its song shows (Run, Stop, Follow songs), sent as `RemoteState.setList`
  and `RemoteState.songs`; `npm run controller` lines `setlist`, `songs`, `display`.
- **12-ctl-2** (S, Antigravity): **scan instead of typing.** The Laptop remote form gets Scan,
  which reads the QR code the Phone · iPad panel already draws (8f, `lib/qr.ts`; it says the
  Phone line) with a camera plugin in both shells, and links with it; anything not http(s) is
  refused in words. This is 4a's open "QR code" without the URL scheme: one code serves a phone's
  camera (it opens the show server's own remote in the browser) and the app. *Measure:*
  `controller` line `scan`.
- ~~**12-ctl-3**~~ *(shipped 2026-11-11)*: the Android app, a Capacitor project beside `ios/`; its story is in `docs/plan-shipped.md`.
- **12-ctl-find** (S, after 12-tv-2): the app finds the Mac on the network by the Mac app's
  Bonjour advert that 12-tv-2 adds, so neither typing nor a scan is needed. Its check is written
  when 12-tv-2's advert is on main. The advert is in (`server/bonjour.js`, `_chromaglass._tcp`,
  TXT `id` and `path`; `browse()` there is a querier a check can reuse).
- **12-ctl-ship** (Claude): the Android bundle signed through Play App Signing (the upload key
  stays with the owner, the CI secret is Claude's to wire), an upload job to the Play closed test
  from main, and the iPhone's half is 12-ship. Sign-in, in-app account deletion (5.1.1(v)), the
  licence Worker and anything that touches a key are Claude's, never in an Antigravity brief.
- **12-ctl-weight** (S, found 2026-11-11 building 12-ctl-3): the phone apps bundle all of
  `dist/`, so the Android debug APK is 148 MB (`android.yml`'s artifact, 147774968 bytes), and
  the iPhone app carries the same. Most of it is media the website streams: `dist/video` 81 MB
  (the cartoons 78 MB), `dist/music` 38 MB, `dist/press` 27 MB. Play's limit for a bundle's base
  is 200 MB, and a phone used as a remote needs none of it. Leave those folders out of the
  apps' copy (or serve them from the site when the app plays one) before 12-ctl-ship, and add a
  size line to `controller` so the bundle cannot grow back unseen.

**12-tv: the plate on a living-room TV (asked 2026-11-08; the owner chose route 2, the receiver app, the same day).** The
owner asked whether a Google TV / Android TV app should play the plate on a big
screen at home, unlocked by Home and Pro. What decides it is the TV's GPU, not the
store. The plate is WebGPU only (`src/gpu/device.ts` fails with `no-webgpu`, no
WebGL path), and the boxes people own are phone chips from several years ago: the
Google TV Streamer is a MediaTek MT8696 with a PowerVR GE9215 (the 2021 Fire TV Stick
4K Max's chip), the old Chromecast with Google TV a Mali-G31, the Shield a Tegra X1
stuck on Android 11. Chrome shipped WebGPU on Android 12+ for Adreno and Mali first;
Android TV has no Chrome, and the WebView only gets a restricted compatibility-mode
WebGPU (OpenGL ES 3.1) from Chrome 146 (blink-dev, January 2026). Samsung's and LG's
TV browsers have none. Unmeasured, but scaled from the M4's 1024² step (25.2 ms) a
GE9215 would hold a small grid at a few frames a second, if it starts at all. So the
routes, cheapest first:

1. **The computer draws, the TV shows (works today, free).** HDMI (Cast → Second
   display), AirPlay from the Mac to an Apple TV or an AirPlay TV as a second
   display, or Chrome's "Cast tab" to a Google TV. Tab casting is compressed video
   with lag, fine for an evening, not for a gig. Nothing to build but a guide page.
2. **A TV receiver app (recommended).** A thin Android TV app (a WebView shell,
   since TWAs need Chrome, which Android TV lacks) that opens a `/tv` page: it finds
   the Mac app on the same network, plays its plate as a low-latency WebRTC stream
   (`canvas.captureStream()` in the Mac app, signalled through the same relay the
   network display uses), and needs no WebGPU on the TV. Sound is heard and analysed
   where it plays (the Mac's system audio, 23.8), so the TV needs no mic: the boxes
   have none, only the remote's push-to-talk, and Android lets an app hear other
   apps only through a screen-capture consent most TV builds do not offer. When no
   Mac is on, the app plays a library of long rendered films (§6) so it is never a
   blank screen. Unlock: the TV shows a code and a QR, the owner signs in on the
   phone (device-code flow on Firebase Auth), and the TV asks `tierGates` /
   the licence Worker for Home or Pro, the same check the Mac app makes. No price
   and no buy button in the app, so Play Billing is not needed (the app only opens
   what an account already owns). The phone stays the remote. Size: M, two PRs (the
   Mac app's stream and the `/tv` page; the Android shell, D-pad focus and Play
   listing under 12-play-org), and the Mac app's live encoder (`desktop/live.js`)
   is the piece to reuse.
3. **The plate itself on the TV.** The same shell with the solver in the WebView.
   Only worth it if step 0 below shows a box that holds a usable grid; the cheap
   boxes will not, so this would sell only to Shield-class owners. Size: L, mostly
   a TV grid ladder and D-pad desks.
4. **Apple TV, the plate itself.** tvOS has no WebView at all, so it means porting
   the solver to Metal (the WGSL could be translated, the app around it could not).
   The Apple TV 4K's A15 would run it well. Size: XL, and AirPlay from the Mac
   (route 1) already gives Apple TV owners the picture. Not now.

**12-tv-apple (the owner, 2026-11-08: "an Apple TV app as well").** Route 2's
receiver, native on tvOS: a small Swift app (no WebView there) that plays the same
Mac stream route 2 builds, with the same TV-code sign-in and Home/Pro check. It
rides on route 2's stream and adds no work to the Mac side. The stream format is
the trap: libwebrtc has no official tvOS build, so either the Mac app also offers
low-latency HLS that `AVPlayer` plays natively (a second or two of lag, fine for an
evening) or the app carries a community WebRTC build. Store rules: a free app that
only opens what an account bought on the web, with no buy button or price, should
fit guideline 3.1.3(f) (free stand-alone companion), unchecked with Apple. Needs the
App Store Connect record from 12-ship. Size: M, after route 2's first PR, and
after 12-tv-hls (below).

**12-tv-1: the stream and the `/tv` page (shipped, PR 1 of route 2; story in
`docs/plan-shipped.md` §12-tv-1).** The show's page sends the wall's canvas to a
TV on the network as WebRTC video, signalled through the show server's relay
(`src/lib/tvFeed.ts`, `server/remote-server.js`'s `tv` role); `/tv?key=…` plays it
with no GPU (`src/components/TvDisplay.tsx`), films while the show is off; Home or
Pro on the laptop, three TVs at most; `npm run tv`.

What route 2 still needs, found while building 12-tv-1:

- **12-tv-2: the Android TV app, the Bonjour advert and pairing by four digits
  (shipped 2026-11-12, merged with 12-tv-2b after #768 sat green unmerged; story in
  `docs/plan-shipped.md` §12-tv-2).** `androidtv/`
  (plain Java, a WebView on `/tv` plus NsdManager; the `Android TV app` workflow
  builds, unit-tests and lints it and keeps the debug APK); `server/bonjour.js`
  (`_chromaglass._tcp` from the show server itself, so `npm run remote` and the
  Mac app both advertise); `server/tv-pairing.js` (four digits, Allow and No on
  the laptop, a key per TV, Forget); `npm run tvpair`.
- **12-tv-2b: the Play listing (S; the repository's half built 2026-11-12, the
  owner's half in Play Console open).** The Play org account cleared Google's
  review on 2026-11-12. Built: the signed release bundle (`bundleRelease`, signed
  by the owner's upload key through the `ANDROID_UPLOAD_KEYSTORE` and
  `ANDROID_UPLOAD_PASSWORD` secrets, version code the run number; Actions →
  Android TV app → Run workflow with *release* ticked, main only, artifact
  `chromaglass-tv-release`); `scripts/android-upload-key.sh`, which makes the
  upload key on the owner's Mac with its own openssl (PKCS#12, password in the
  Keychain) and sets both secrets, and which 12-ctl-ship can share; the TV listing
  in `docs/store-listings.md` (no price, no tier, "needs the ChromaGlass app on a
  Mac" said plainly; data safety: nothing collected; the reviewer's App access
  text); the 1280 x 720 TV banner and the 320 x 180 launcher banner drawn by
  `npm run brand` (`tvBanner`, replacing the cut from the social card); six TV
  screenshots at 1920 x 1080 from the press stills. Found and fixed: with no Mac on
  the network the app showed only "Looking for the show…", which is all Play's TV
  review (a real TV, no Mac) would have seen, and a reason Play turns TV apps away;
  the first screen now has **Watch a sample film**, the press clips played in a
  `VideoView` with their CC BY music credit on screen, while it keeps looking (a
  Mac that turns up takes over). *Measure:* `presskit` (the TV listing's limits and
  no selling words, the banners' sizes with no alpha, the screenshots' sizes, the
  sample clips served by the site); the workflow's `bundleRelease` on every PR and
  its unit tests (every clip carries its credit). Owed by the owner: the upload key
  (one command), then the Play Console steps (create the app, the forms, the TV
  form factor, the first upload by hand).
- **12-tv-remote: the TV's remote picks the look (shipped 2026-11-12; story in
  `docs/plan-shipped.md` §12-tv-remote).** Asked 2026-11-12, the TV staying a
  receiver: right and left play the next and previous preset on the Mac, OK a
  random one, up, down or Menu the list. The relay lets a TV pick only a preset
  the laptop listed, one every 0.4 s (`server/tv-remote.js`); the page reads the
  D-pad (`src/components/TvRemote.tsx`), the app passes on Menu and Back; the
  phone version is a tap bar. `npm run tvremote`; on a real TV `docs/judging.md` §126.
- **12-tv-remote-2: more than presets from the remote (S, if asked).** The remote
  picks presets only. The owner's own looks and the set list's songs are the next
  things a sofa might want (the set list's Go is `cue-set-item` on the phone), and
  a long-press of OK could arm Go rather than cut to clean glass at once.
- **12-tv-2e: uploads to Play from CI (S, after the first upload).** Play's first
  bundle for an app must go up by hand in Play Console; after that the release job
  could send each bundle to the internal track itself with the Play Developer API
  (a Google Cloud service account the owner adds in Play Console → Users and
  permissions, its JSON as a secret). Shared with 12-ctl-ship's upload job.
- **12-tv-2c: judged on a real TV (S, the owner's eyes).** Side-load the
  workflow's APK on a Google TV, pair it with the Mac app, watch an evening.
  Unseen so far: NsdManager against the advert on a real network, the advert
  beside the Mac's own mDNSResponder (both on udp 5353; it works on Linux in
  the check, and Node Bonjour libraries share the port the same way on macOS),
  and the WebView's WebRTC decode on a TV box. `docs/judging.md` §125; the
  sample film (12-tv-2b) on the TV too: Back returns to the list, and a Mac
  starting its show replaces it.
- **12-tv-2d: the newer NSD calls (S).** `resolveService` is deprecated from
  Android 14 for `registerServiceInfoCallback`, which also follows a Mac whose
  address changes while the TV watches; the app uses the old call on every
  version today, which still works. And an IPv6 link-local address with a zone
  (`fe80::1%wlan0`) would need its `%` escaped in the URL; NSD hands back IPv4
  first on every box seen in documentation, so it is left until one does not.
- **12-tv-signin: films with the Mac off, and the TV-code sign-in (M).** Today
  `/tv` plays films only while the Mac's show server answers. With the Mac off,
  the shell opens the site's `/tv`, which shows a code and a QR; the phone signs
  in (a device-code flow: the licence Worker issues the code, the phone's signed-in
  page claims it, the TV polls and gets a short-lived token naming the tier) and
  the TV plays the long rendered films (§6) for Home and Pro. Licence Worker and
  auth: gets one Claude review before merge.
- **12-tv-hls: low-latency HLS beside WebRTC, for Apple TV (M, before
  12-tv-apple).** `AVPlayer` plays HLS natively and tvOS has no official
  libwebrtc. The Mac app's Live Show encoder (`lib/liveStream.ts`) already makes
  H.264 packets; the show server would cut them into fMP4 parts and serve an
  `.m3u8` on the LAN. A second or two of lag, fine at home.
- **12-tv-flat: the TV gets the plate without the wall's geometry (S).** The TV
  is sent `#liquid-canvas`, the wall as the projector has it, keystone and corner
  pin included; at home with no projector that is the plate as it is, but a rig
  that also feeds a projector sends its warp to the TV too. The Live Show's
  `stack` frames (37x-4d-1) are the flat picture to send instead.
- **12-tv-sound: the music on the TV's speakers (S, if asked).** The TV is sent
  no sound: the music plays where the Mac plays it. Sending the show's audio as a
  second track would keep it in step with the picture (WebRTC syncs the two),
  for a Mac whose music should come out of the TV.

Progress (2026-11-08): the transport is settled without HLS. LiveKit's
`webrtc-xcframework` (MIT, a binary Swift package of Google's libwebrtc, tag
150.7871.05) ships a tvOS slice, so the app answers the Mac's WebRTC offer exactly
as the `/tv` page does, at LAN latency, and 12-tv-hls is a fallback, not a
prerequisite. The sign-in it needs shipped first (12-tv-signin below).

Progress (2026-11-08, later): the app's core is written, in `tvos/` as a Swift
package that builds without Xcode: the offline pass check, the sign-in client that
keeps a live code on screen, and the relay's messages. `npm run tvswift` builds it
and runs it against the Worker's own `/tv/` handler (link, a code running out, the
pass verified, renewed to the next generation, a spent pass unlinking). Left: the
app target in `tvos/App` (the code screen with its QR, the video view answering the
Mac's offer through LiveKitWebRTC, the pass in the keychain), which waits on Xcode
with the tvOS SDK on the owner's Mac.

Progress (2026-11-08, evening): the receiver and the app are written. The /tv page's
connection rules are one Swift value, `ReceiverMachine`, driven over URLSession's
WebSocket by `ReceiverDriver`; `npm run tvswift` now also runs it against a stand-in
relay (live, a wrong key, a lockout, a show going off, a stuck picture). The peer
connection over LiveKit's WebRTC is `tvos/Video` (`LiveKitPeer`), and `npm run tvvideo`
proves it on a Mac with no Xcode: a Chromium page sends a canvas over WebRTC through a
stand-in relay, and the receiver goes live in 0.4 s and decodes 30 frames a second at
640x360, dark and light as sent (two mutations, a grey page and a receiver that never
reports a frame, each turn it red). The app (`tvos/App`, an XcodeGen spec) has the code
screen with its QR, the address screen, the show view over `LKRTCMTLVideoView`, and the
pass in the keychain; `.github/workflows/tvos.yml` builds it for the tvOS simulator and
runs `tvvideo` on a macOS runner when a PR touches `tvos/`. Open from it:

- **12-tv-apple-1, finding the Mac.** Today the TV reads the Mac's "TV at home"
  address (`RelayAddress`), typed with the remote. Bonjour (`_chromaglass._tcp`)
  would find it with no typing; the Mac side is route 2's, so it is agreed with the
  Google TV app before either builds it.
- **12-tv-apple-2, swift-crypto on Linux.** `npm run tvswift` runs on Measure's
  `logic` part, so a cold runner compiles swift-crypto's BoringSSL (about a minute)
  each time it runs. If that shows in the shard's time, cache `tvos/.build` or move
  the check to a Mac shard, where CryptoKit needs no build.
- **12-tv-apple-3, films while the show is off.** The /tv page plays films until the
  show starts (its `films` state); the app shows "Looking for the show…" on black. Play
  the same films (an `AVPlayer` over the site's film list) under the waiting screen.
- **12-tv-apple-4, the 50 ms jitter buffer.** The page sets `TV_JITTER_MS = 50` on its
  receiver (`jitterBufferTarget`); LiveKit's Objective-C API may not expose the
  receiver's jitter target. Find whether it does (`LKRTCRtpReceiver`), and if not,
  measure the TV's delay against the page's on one Mac (a flash on both screens filmed
  together) before deciding it matters.
- **12-tv-apple-5, a shorter link for the phone.** The code screen shows
  `chromaglass.art/?tvlink` to type on a phone; a path such as `chromaglass.art/tv-link`
  (a Firebase rewrite to the same page) reads better aloud and from across a room.
- **12-tv-apple-6, the app on a TV, judged.** First run done 2026-11-13: Xcode built it
  and it ran in the Apple TV 4K simulator, showed its code, received its pass when a
  Home account claimed the code, and played the live plate over WebRTC. That run used a
  local copy of the licence Worker with a demo signing key and a local show server with
  a throwaway key, the address handed in at launch. LiveKit's tvOS simulator slice is
  arm64 only, so `project.yml` excludes x86_64 for the simulator SDK. Signed with the
  owner's team and on TestFlight since 12-tv-apple-7. Left: the owner installs it
  from TestFlight on an Apple TV against the Mac app's own show and the live Worker,
  and judges it before it is submitted for review.
- **12-tv-apple-7, TestFlight and the App Store.** Built 2026-11-13: the bundle is
  `app.chromaglass.tv` (the record's), version 1.0; `npm run brand` draws the layered
  App Store icon (back, middle, front at 1280x768 and 400x240) and the top shelf
  (1920x720, wide 2320x720); a privacy manifest; `ITSAppUsesNonExemptEncryption`
  false; camera and microphone purpose strings, because LiveKit's WebRTC framework
  links the capture APIs and App Store Connect bounced build 1 without them
  (ITMS-90683); `Info.plist` versions read from the build settings. The archive is
  built unsigned and the export signs it in the cloud, since the team has no devices
  for a development profile (`tvos/README.md`). Build 1.0 (2) uploaded; the privacy
  page gained the Apple TV item. Left: the internal TestFlight group, the store page
  (screenshots from `docs/brand/store/tv/`, privacy and support URLs, the 3.1.3(f)
  review note: a free companion that only opens what was bought on the web, no price
  and no buy button), then submit once the owner has judged the build (12-tv-apple-6).
- **12-tv-apple-8, the upload from CI.** Builds go up from the owner's Mac by hand.
  A job on the macOS runner with the API key as an environment secret would archive
  and upload on a tag, with the build number from the run number.

**~~12-tv-signin~~: a TV signs in by a short code. Shipped (the licence Worker's
`/tv/` routes and the phone's `?tvlink` page); story in `docs/plan-shipped.md`
§12-tv-signin.** Open from it:

- **12-tv-signin-1, the TVs read it.** The Apple TV app (12-tv-apple) and the
  Google TV shell (route 2) call `/tv/code` and `/tv/poll`, show the code and a QR
  of `https://chromaglass.art/?tvlink=<code>`, keep the `cgtv1.` pass in the
  keychain (Android: EncryptedSharedPreferences), verify it offline against the
  built-in public key, and renew it through `/tv/renew` within a week of `exp`.
- **12-tv-signin-2, a list of linked TVs.** The Worker keeps each link now
  (`tvpass:<id>`, and `tvpasses:<email>` lists an account's ten), so dropping one
  is deleting its record; what is missing is the account page that lists them
  (when linked, a name the TV sends) with a button to unlink, if owners ask.
- **12-tv-signin-3, the live Worker carries `/tv/`.** The licence Worker is deployed by
  hand from the owner's Mac with the owner's go, so the merged `/tv/` routes answer only
  once it is redeployed; until then a TV cannot get a code.
- **12-tv-signin-3, KV's lag between locations.** Workers KV is eventually
  consistent across Cloudflare's locations, for up to about a minute. A phone and
  a TV served by different locations can see each other's writes late: the phone
  may be told "no such code" for a code the TV drew a moment ago, and the TV may
  poll "pending" for up to a minute after the phone linked it. Both recover on
  their own (the phone's player tries again, the TV keeps polling), so it is a
  delay, not a failure; if owners meet it, move the code and pass records to a
  Durable Object, which is consistent.
- **12-tv-signin-4, a renewal lost on the way.** Each renewal moves the link's
  generation on, and a pass from an older generation kills the link (that is how
  a copied pass dies). So a renewal whose answer never reaches the TV (the Wi-Fi
  drops mid-reply) costs a re-link with a fresh code. Rare, and safe; if it is
  met, keep the previous generation valid for a few minutes after a renewal.

**Step 0, before any build (S):** run the grid ladder in a WebView on a real Google
TV box (the owner's, or a $100 Streamer) and write down whether `navigator.gpu`
exists and what grid it holds. If it holds nothing, route 3 closes for good.
