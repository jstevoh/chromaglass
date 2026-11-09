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
| Shell | Capacitor: the built site **bundled** in the app, drawn by WKWebView | A Trusted Web Activity (Bubblewrap): the **live** site in full-screen Chrome |
| WebGPU | iOS 26 (iPhone 11 and newer), Safari and WKWebView alike | Chrome on Android 12+, Qualcomm and ARM GPUs; the app's "needs WebGPU" screen covers the rest |
| Web MIDI | None in WebKit; a CoreMIDI plugin later | Chrome has it, so USB controllers work from day one |
| Record and Render | A web download does not save in a web view: route to the share sheet or Photos | Chrome downloads as it does now |
| Updates | A new App Store build each time (guideline 2.5.2: no downloading code that changes the app) | Every deploy to `main` reaches the app at once; the store only sees a new build when the shell changes |
| Offline | Everything is inside the app | The service worker (`public/sw.js`) caches a file only once it has been fetched; precaching the build is 14h |
| Account | Apple Developer Program, $99 a year | Google Play Console, $25 once |
| Tools | Xcode on the Mac | Bubblewrap (JDK and Android SDK), on the Mac or in CI; Android Studio optional |

A Trusted Web Activity is Chrome itself, not a web view, so Android gets WebGPU, Web
MIDI, WebCodecs, wake lock and downloads exactly as the website has them today. A
Capacitor Android app would run in Android's WebView instead, which has no Web MIDI
and whose WebGPU would need its own test; the TWA is less work and does more. iOS
has no equivalent (every iPhone browser is WebKit, and Apple does not take a shell
that just points at a website), so there the build ships inside the app.

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
   as the LLC (12-play-org).* Still owed on Apple's side when the work starts: the
   App Store Connect record for `app.chromaglass`, and an App Store Connect API key
   as a secret in one of main's environments so CI can upload to TestFlight.
3. **The Android shell** (one PR; *replaced by 12-ctl-3, 2026-11-09: a Capacitor app, since a TWA cannot be the Mac's controller*): a Bubblewrap project, `assetlinks.json` in
   `public/.well-known/` with a Firebase Hosting header so it serves as JSON, the
   manifest checked for what a TWA needs, and a CI step that builds the bundle.
   The upload key stays with the owner, never in the repo. Then the closed test
   starts, 12 testers for 14 days, while the iPhone work carries on. *Not started.*
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
- **12-play-org** *(owner)*: the Play Console account as the LLC (organization,
  D-U-N-S number), not a personal one, so publishing does not wait on the 14-day
  closed test. Before it, step 1's Android smoke test. Unchecked: the iPhone app's
  laptop remote leans on the app's own origin (4a), and a TWA is the https site,
  which cannot open a plain ws:// socket to a laptop, so the Android app may have
  no laptop remote without more work.
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

- **12-ctl-1** (M, Antigravity): **the songs on the phone.** The Perform desk's set list (its cue
  list, `lib/setList.ts`) and the song shows (`lib/songShows.ts`) reach the remote in
  `RemoteState.setList` and `RemoteState.songs`, on a Songs screen one tap from Draw and from
  Controls: an item tapped is armed for the next Go, a song show run or stopped, Follow songs
  turned over. The laptop's half sends them from what it has saved and acts on `cue-set-item`,
  `song-run`, `song-stop`, `song-follow` with the functions the desk's rows call. *Measure:*
  `controller` lines `setlist`, `songs`, `display`.
- **12-ctl-2** (S, Antigravity): **scan instead of typing.** The Laptop remote form gets Scan,
  which reads the QR code the Phone · iPad panel already draws (8f, `lib/qr.ts`; it says the
  Phone line) with a camera plugin in both shells, and links with it; anything not http(s) is
  refused in words. This is 4a's open "QR code" without the URL scheme: one code serves a phone's
  camera (it opens the show server's own remote in the browser) and the app. *Measure:*
  `controller` line `scan`.
- **12-ctl-3** (M, Antigravity): **the Android app, as Capacitor, not a TWA.** Step 3 planned a
  Trusted Web Activity: the hosted https site in Chrome, which cannot open a plain `ws://` socket
  to the Mac on the LAN (mixed content; 12-play-org's open question), so it could never be the
  controller. The Android app is therefore the iPhone's shell on Android: `npx cap add android`
  beside `ios/`, the same bundled build and app id `app.chromaglass`, the microphone and camera,
  cleartext and mixed content allowed for the LAN, and a CI workflow that builds an unsigned debug
  APK (no secrets). What it gives up is the TWA's every-deploy-reaches-the-app; a release builds a
  new bundle (12-ctl-ship). Android's WebView has WebGPU on fewer phones than Chrome does, so when
  the plate cannot start in the app it says so, offers the Laptop remote, and opens the show in
  Chrome. Step 1's Android smoke test still stands for Chrome. *Measure:* `controller` lines
  `android`, `nogpu`, and the workflow green.
- **12-ctl-find** (S, after 12-tv-2): the app finds the Mac on the network by the Mac app's
  Bonjour advert that 12-tv-2 adds, so neither typing nor a scan is needed. Its check is written
  when 12-tv-2's advert is on main. The advert is in (`server/bonjour.js`, `_chromaglass._tcp`,
  TXT `id` and `path`; `browse()` there is a querier a check can reuse).
- **12-ctl-ship** (Claude): the Android bundle signed through Play App Signing (the upload key
  stays with the owner, the CI secret is Claude's to wire), an upload job to the Play closed test
  from main, and the iPhone's half is 12-ship. Sign-in, in-app account deletion (5.1.1(v)), the
  licence Worker and anything that touches a key are Claude's, never in an Antigravity brief.

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
  (shipped, this PR; story in `docs/plan-shipped.md` §12-tv-2).** `androidtv/`
  (plain Java, a WebView on `/tv` plus NsdManager; the `Android TV app` workflow
  builds, unit-tests and lints it and keeps the debug APK); `server/bonjour.js`
  (`_chromaglass._tcp` from the show server itself, so `npm run remote` and the
  Mac app both advertise); `server/tv-pairing.js` (four digits, Allow and No on
  the laptop, a key per TV, Forget); `npm run tvpair`.
- **12-tv-2b: the Play listing (S, after 12-play-org).** Upload a signed release
  bundle (Play App Signing, the same secrets and upload job as 12-ctl-ship),
  the TV store listing (no price, "needs ChromaGlass on a Mac" plainly said),
  TV screenshots at 1920 x 1080, and a banner made for 320 x 180 rather than the
  cut from the social card in `androidtv/.../drawable-xhdpi/banner.png`, which
  shows the card's glow as a lighter band. The Play org account is in Google's
  review (2026-11-09).
- **12-tv-2c: judged on a real TV (S, the owner's eyes).** Side-load the
  workflow's APK on a Google TV, pair it with the Mac app, watch an evening.
  Unseen so far: NsdManager against the advert on a real network, the advert
  beside the Mac's own mDNSResponder (both on udp 5353; it works on Linux in
  the check, and Node Bonjour libraries share the port the same way on macOS),
  and the WebView's WebRTC decode on a TV box. `docs/judging.md` §12-tv-2.
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

**Step 0, before any build (S):** run the grid ladder in a WebView on a real Google
TV box (the owner's, or a $100 Streamer) and write down whether `navigator.gpu`
exists and what grid it holds. If it holds nothing, route 3 closes for good.
