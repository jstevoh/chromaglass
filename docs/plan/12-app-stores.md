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
3. **The Android shell** (one PR): a Bubblewrap project, `assetlinks.json` in
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
   into its remote (a `chromaglass://` link) would save the typing.
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
