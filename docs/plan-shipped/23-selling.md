# 23. Selling it: the site free, the app paid: what shipped

How §23's shipped items were found, built and measured. The open work is in
[`docs/plan/23-selling.md`](../plan/23-selling.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Third pass (moved 2026-10-29, 19m)

### 23. Selling it: the site free, the app paid

- **23.2** (**shipped**, this PR): a hosted-site build flag (`VITE_FIREBASE_HOSTED_SITE=1`, or `?tierGates=1` for checks) that shows each paid feature
  above as an "In the ChromaGlass app" tile with a link (`src/lib/tierGates.ts`, `SettingsPanel.tsx`, `DeskPanels.tsx`), off in a licensed app and in a
  local `npm run dev`. *Measure:* `npm run tiers` (11/11, wired into `checks.yml` `Measure · lab`): loads the gated build and verifies 7 tiles on the free tier, 2 Pro tiles on a Home key, and 0 tiles on a Pro key.

- **23.3** (**shipped**, this PR): the song-ID Worker (`server/fingerprint-worker.js`) takes an Ed25519-signed `X-ChromaGlass-Key` licence key as
  well as an allowed origin, and the site's manual tag stays. 14o's gates come first
  and stay (origin, size, per-/64 hour, the day's ceiling, in `npm run
  fingerprint-worker`); a good key raises the hour's count (`LICENSED_RATE_PER_HOUR = 300`), not skipping the day's (`DAILY_LIMIT = 1000`). *Measure:*
  `npm run fingerprint-worker` (23/23): no key refused when `REQUIRE_LICENSE_KEY=1`, a bad signature refused before reading the body or calling the service, a good key answered and allowed past the 30/hr cap while stopping at `DAILY_LIMIT`.

- **23.4** (**shipped**, this PR): the key in the Mac app and show server (`server/license-key.js`, `server/server-license.js`, `server/remote-server.js`, `src/lib/licenseKey.ts`, `desktop/`): offline Ed25519 signature check, activation
  and the two-machine count (`/license-activate`, `/license-deactivate`, `/license-info.json` on loopback), the key's tier (Home or Pro) and the features each
  opens, Home → Pro upgrade keys, and an unlicensed app that runs as the site does (`requireSignIn=1&tierGates=1`). *Measure:* `npm run tiers` (11/11): verified with a valid Home key, a valid Pro upgrade key, tampered/expired keys, 2-machine cap, and no key.

- **23.8** (**shipped**, this PR, `desktop/`): Home's listening features. The app hears
  whatever the Mac plays with no tab to share (`desktop/main.js` `setDisplayMediaRequestHandler` with macOS ScreenCaptureKit loopback, `desktop/preload.cjs`, `desktop/electron-builder.config.cjs` `NSAudioCaptureUsageDescription`, `SoundPanel.tsx` `"System audio"` source), and an ambient TV mode (`Show → Ambient TV Mode (Cool & Quiet)`, `SoundPanel.tsx` toggle, `PhoneStage.tsx` Play sheet tile, `ambient.ts` the switch, `governor.ts` the 30 Hz step rate and rung ceiling, `drawGate.ts` the draw cap) runs the plate full screen on the TV for hours with the 60 Hz draw cap, 30 Hz solver step rate cap, and opening rung floor of 14j. *Measure:* in `npm run desktop` (13/13), the System audio source's pipeline reaches the ear and the picker was intercepted, and Ambient TV mode caps the solver at 30 steps/s, caps draws at 60 Hz in the app (`DrawGate`), and holds the opening rung; `npm run rungs` (76/76) and `npm run phone`. On the owner's Mac, an album through a streaming app drives the plate (`docs/judging.md` §87).

- **23.10** (**shipped**, #394; brief `docs/handoff-signin.md`): the sign-in on the
  hosted site (`SignInScreen.tsx`, `firebaseAuth.ts`, `authFlag.ts`), over `#cg-intro`
  with Google, Apple and an emailed magic link, and the account sheet (`AccountSheet.tsx`:
  the email, sign out with confirmation, delete the account with confirmation, and links
  to `/privacy.html` and `/terms.html`) on the desk, the narrow overlay and the phone.
  Returning visitors start the plate immediately from the local flag while Firebase
  confirms in the background, `?remote`, `?cast` and builds without `VITE_FIREBASE_*`
  never load Firebase, and `getFirebaseAuth()` uses `VITE_FIREBASE_AUTH_DOMAIN` directly
  rather than overriding it with `window.location.hostname` on `.web.app` (which sent an
  unauthorised `https://chromaglass.web.app/__/auth/handler` redirect URI on returning
  iPhones kept on `chromaglass.web.app` by `index.html`). *Measure:* `npm run signin` (14/14, wired into `checks.yml`
  `Measure · lab`), and `startup` on the Mac: a returning visit's first step no later
  than today's bar.

- **23.10c** (**shipped**, this PR): a way back in, and a profile sheet that reads (the owner,
  2026-10-24: signed out while using the app, "there is no way to re-sign in"; "the profile page is
  garbage"). Signed out with the show up, every account button (the desk's status bar, the corner
  pill, the phone's header and its Play menu) becomes a lit **Sign in** that opens the same sign-in
  the first visit meets, inside the sheet, over a plate that keeps playing; a sign-in or sign-out
  here, in another tab, or by the background check redraws them (`authFlag.ts` says so on
  `cg-auth-changed`, and other tabs are heard through `storage`). The sheet (23.10b's frame) is now
  one column that answers who you are (email and plan, or the sign-in), what you have (Pro says so;
  Home is offered the upgrade; Free sees the two plans side by side; a key typed by hand is one
  row), then the rest: running shows (one quiet line when there are none), the newsletter as one switch, sign
  out and a small delete at the bottom. The settings shortcut is gone (the desk and the phone each
  have their own). *Measure:* `npm run signin` 15 (a lit Sign in on the desk and the phone, 44 px on
  the phone, opening the sign-in over a running plate) and 16 (signing in from the sheet brings the
  account back); 1–13 unchanged.

- **23.10b** (**shipped**, #430's work, folded into 23.10c's PR): the Profile & Store sheet fits the screen (the owner,
  2026-10-22: "a little janky"). The sheet was one 955px column centred in a scrolling
  overlay, so on a 900px laptop and an 844px phone its title and close button sat above the
  screen with no way to scroll to them. Now the frame stays inside the viewport (`92dvh` on a
  phone, `100dvh - 2rem` on a laptop), the title and the footer links stay put and only the
  middle scrolls; two columns from 768px (who you are, the key and the running shows on the
  left; the store and the newsletter on the right), so a 1280×720 laptop sees the whole sheet
  at 600px tall with no scroll; on a phone a bottom sheet with the store second and 48px
  touch rows. Colours are the desk's tokens (violet for what you own and for Pro, red for
  sign-out's neighbour, white for the primary button) in place of amber, which meant nothing
  elsewhere; the three "Profile & Store" / "Account" pills lost their amber too. Checkout
  links, prices and every `data-cg-*` hook are unchanged. *Measure:* sheet height 955 → 600px
  at 1440×900 and 1280×720, 776px at 390×844 inside the screen (was cut off by 28, 118 and 56px at the top);
  `panel` 192/192, `layout` 74/74, `phone` 355/355.

- **23.14** (**shipped**, this PR): linking devices by
  account (`server/account-shows.js`, `src/lib/accountShows.ts`). A signed-in show running
  with `server/remote-server.js` publishes its LAN relay address and show key to
  `/account-shows` with its Firebase ID token (90 s TTL, isolated by account UID). A phone,
  tablet or laptop signed in to the same account sees the account's running shows in a list
  (on `PhonePlay`, `PhoneStage`, `AccountSheet`, `DeskPanels` `Phone · iPad` and
  `LaptopLink`) and joins one with a single tap: the account hands over the show's address
  and key, which #380's QR carries today. The QR stays for a guest's phone or one not signed
  in, and for a venue whose Wi-Fi has no internet. Once linked, control stays on the local
  network either way, so the internet going never drops the remote. *Measure:*
  `npm run accountlink` (6/6, wired into `checks.yml` `Measure · lab`): token/store isolation,
  two signed-in pages on the same account (one a show, one a phone) where the show is listed
  and joined with a tap and no address typed while the QR code stays on `Phone · iPad`, a
  third page on another account sees nothing, and cutting off the internet and account
  service leaves the local remote socket driving the show.

- **23.16** (**shipped**, this PR): one address. The owner asked (2026-10-24) for
  `chromaglass.web.app` "to always immediately forward to chromaglass.art"; it moved only a
  fresh visit, because localStorage belongs to the origin and a plain redirect would have left
  a returning visitor's licence, presets and set lists behind. `index.html`'s first script now
  forwards `chromaglass.web.app` and `chromaglass.firebaseapp.com` to the same path, query and
  fragment on `chromaglass.art`, carrying the old name's `chromaglass*` keys in the fragment;
  the new name writes them before the app's module runs, only from an old-name referrer, never
  over a key it has. The old name drops a carry-shaped fragment it is handed and carries once.
  Left behind: the signed-in flag, account email, pending email link, marketing choice, crash
  logs, and a signed-in visitor's licence key (one sign-in on the new name; the account gives
  the key back, 23.12, and the key stays out of browser history). It stays for Firebase's
  `/__/` pages, offline, a cached show whose network does not reach `chromaglass.art` within
  4 s, a `?cast` window with an opener, `?cg-stay` by hand, and state over 900,000 characters.
  Hosting's own redirects match paths, not hosts, so firebase.json cannot do it on one site.
  *Measure:* `npm run onehost` (25/25; 9/25 on the old page, and the referrer guard, the
  keep-what-it-has rule, the dropped handed-in fragment, carry-once and the 4 s wait each turn
  their checks red when taken out), in `Measure · lab`.
  The address itself was checked the same day: one A record at GoDaddy (Firebase's
  199.36.158.100), www and http both 301 to `https://chromaglass.art/`, Google Trust Services
  certificates for both names (2026-10-18, in CT logs).

- **23.17** (**shipped**, this PR): when slower frame rates cause the governor to step down (`status.steppedDown`) or the GPU solver is unavailable (`status.gpuUnavailable`), replace the old "Run it locally" `git clone` card (`src/components/RunLocallyCard.tsx`) and add a matching phone/desk `Fluid Grid` callout (`src/components/SettingsPanel.tsx`) suggesting an upgrade to **ChromaGlass Pro** (`CHECKOUT_PRO_URL` / `CHECKOUT_UPGRADE_URL` and `AccountSheet`), hidden once a Pro key is active; gate the `1024²` `Fluid Grid` option to Pro (`disabled={isTierGatingEnforced() && !isProLicenseUnlocked()}`); and let the automatic quality ladder climb to `768²` at `2x`/`3x` Retina and `1024²` at `1x` with projector `stageLadder` and full WebGPU adapter limits in `src/gpu/device.ts` (falling back first to `maxStorageBufferBindingSize` + `maxBufferSize` and then to defaults) whenever a verified Pro licence is active (`effectiveLadderTier` in `src/lib/platform.ts`, `LiquidVisualizer.tsx`). *Measure:* `npm run tiers` (12/12) and `npm run rungs` (74/74).

- **23.17d** (**shipped**, this PR): the Mac app opens only on a Home or Pro licence (the owner, 2026-10-25: "The Mac app should check the license. The app won't work for free"). It had no sign-in at all (`desktop.yml` built the site with no `VITE_FIREBASE_*`), gated nothing, and read Pro for every download; and the key `desktop/main.js` verified at launch never reached the page (the preload decoded it with a `Buffer` that cannot read base64url in a sandbox, so the bridge always said free). Now `desktop.yml` builds the site with the accounts and `VITE_MAC_APP=1`; a packed app always asks (`app.isPackaged`, no switch opens it free), takes no signing key from its environment, and has no developer tools; the one other key it trusts is its own build's `checkKey`, the public half of a pair `desktop.yml` makes per build and throws away with the runner, so `desktop -- --packaged` can open it on a key nobody else can sign; and the show, in the app's window and in any browser opened on the app's server, waits behind `AppLicenceGate.tsx` until a verified key whose tier is in `MAC_APP_TIERS` (`lib/macApp.ts`) is on the machine. A free account is no longer enough, as it was under 23.11. The door: sign in (email and password in the window; Google and the emailed link finish in the real browser on the app's own server, `?macSignIn=1`, which files the account's key with that server while the window watches `/license-info.json`), confirm a new password's email, Buy Home or Pro with "check again", or type a key. **Offline:** no grace period, by choice. A verified key opens the app at every start with no network and no time limit (a touring set with no Wi-Fi for a month still opens; 14h); online and signed in, the account is asked, and a key filed under that same email that the account no longer lists (refunded) leaves the machine at the next start, never mid-show (`heldKeyRefunded`, `retireStoredLicenseKey`). The cost: a refunded buyer who never goes online again keeps the app, which a timed lease would close (23.17h). *Measure:* `npm run signin` 22–24 (signed out shows the sign-in; a free account gets Confirm, then Buy, and no plate; a Home key opens at Home; a refunded key leaves the machine and the next start asks to buy), 22 and 24 failing on the code before; `npm run desktop` licence lines (11/11 from the repo; 13/13 packed with the site built as the app ships: it opens on its build's key, a self-signed Pro key with `LICENSE_PUBLIC_KEY` and the network refused meets the door, and so does a plain browser on its server); `npm run tiers` 12/12 (its gate lines 5–7 now pass through the new door). Needs a Mac release (Actions → Mac app → Run workflow, release ticked) to reach installed apps. The owner settled the tiers on 2026-10-26 ("Home can open the app"), so the site's copy says so too: the Home price card lists the Mac app, the Mac line under the cards and the profile sheet's Mac row say it comes with Home and Pro, and the sheet offers Home the download (`macAppRow` reads `MAC_APP_TIERS`; `npm run updates` checks Home on a Mac gets the download).

## Fourth pass (moved 2026-10-29, 19m-2)

### 23. Selling it: the site free, the app paid

#### 23.16b. The address is the webpage

  - **23.16b** (**shipped**, this PR): the address is the webpage. The owner, signed in,
    reported "I don't always get the webpage when I go to chromaglass.art": the landing page
    (34a) came up only for a signed-out visitor, once per tab, and a signed-in or licensed one
    got the plate. The owner chose (2026-10-24) the webpage at `/` for every visit and the show
    at its own address, `/show` (`src/lib/showPath.ts`; not `/play`, which is the phone's Play
    screen on anything, lib/phone.ts). Play moves the address to `/show` before the sign-in
    opens, so Google's redirect and the emailed link come back to the show; the installed
    app's start_url, the profile sheet's close, the remote's way back and the desk's "open the
    page" address are `/show`. For a signed-in visitor, `/` with an app word in its query
    (`?remote`, `?cast`, `?look`, `?profile`, …) still opens the app; a visitor who must sign
    in meets the webpage first anywhere but `/show`, as before. *Measure:* `npm run signin` 6b (a signed-in visit to `/`
    meets the webpage, not the plate, and its Play opens the plate at `/show` with no sign-in).

#### 23.17g. A key opens the Mac app on two Macs

- **23.17g** (**shipped**, this PR): a key opens the Mac app on two Macs, not any number. The Worker counted machines (`POST /activate`, two per key) but nothing asked it; the show server's own count is per Mac. Now the page asks (`src/lib/macSeat.ts`, called from `activateLocalLicenseKey` in `src/lib/licenseKey.ts`, only in the build the app ships, `VITE_MAC_APP=1`, with the Worker's address already in it) before a key is filed. The Mac's name for the count is a random id kept in the licence file (`seatId`, `server/server-license.js`), not the host name, which two Macs can share and an owner renames; the Worker's refusal now names the Macs holding the seats (`labels`) and the door says which. "Remove from this computer" gives the seat back at the Worker (`deactivateLocalLicenseKey`). Offline is not a refusal, by the never-lock-out rule (23.10): a Mac the Worker cannot be reached from opens on the key's signature, is filed as unconfirmed (`seatConfirmed`), and at every online start (`syncServerLicense` → `confirmHeldSeat`, which asks again even for a seat it holds, the Worker answering a known seat as a refresh) is seated and filed as such for the offline starts after; a refunded key, or a full key on a Mac the Worker never seated, leaves the Mac from its next start (`retireStoredLicenseKey`), never from the page it is showing. A "full" for a Mac the Worker had seated only marks it unconfirmed, so a hiccup in the Worker's store cannot take the app off a paying Mac; the start after, still full, retires it. This is what lets a refund reach a Mac that typed the key in at the door with no sign-in (`heldKeyRefunded` needs the window signed in under the key's email) — 12h. *Measured:* `npm run license-worker` 12a–12j (the real `licenseKey.ts`, bundled as the app builds it, and the real licence manager, five Macs against one key: a third is refused with the two named, a release frees a seat, an offline Mac is let in and sorted at its next online start, a refunded key says so; 12f is the control, the same page built for the site, which asks nothing and opens a third Mac).

#### 23.17m. The Mac app's findings from the security audit

- **23.17m. The Mac app's findings from the security audit (2026-10-28), shipped.** (4) OSC has no show key, so anyone on the venue's Wi-Fi could drive the show; the app now opens with it off, and *Show → OSC input* turns it on for this Mac only (127.0.0.1) or from the network (0.0.0.0), live (`setOsc` in `server/remote-server.js`) and kept in `show.json`; `OSC_PORT` in the environment still decides outright, and `OSC_BIND=127.0.0.1` narrows the terminal server. A menu on the laptop with no phone version, on purpose: a phone that could open the show to the network would hand that to whoever holds its key. (7) Electron 44.10.0 and `npm audit fix` in `desktop/` (0 advisories). (9) A packed app quits when launched with `--remote-debugging-port` or `-pipe`, unless Node's inspector is already open (the build whose fuse is open, which the check drives). (10) `/license-info.json`, `/license-activate` and `/license-deactivate` turn away a request that came from another site (`Sec-Fetch-Site`, `Origin`) and a POST that is not JSON. (13) `disable-library-validation` and `allow-unsigned-executable-memory` are out of the entitlements. *Measure:* `npm run tiers` 3b (fails on the old server), `npm run desktop -- --packaged` lines `OSC closed`, `no debugger`, `entitlements`.

#### 23.17-cikeys. The signing secrets out of pull requests' runs

- **23.17-cikeys** (**shipped**, this PR; the security audit of 2026-10-28): the Mac app's build handed the owner's Developer ID certificate, its password and the Apple notarisation password to every same-repo pull request's run (`desktop.yml` on `pull_request` with `CSC_FOR_PULL_REQUEST`), beside that branch's own build config, npm scripts and dependencies; and any workflow a branch wrote could read them, and the site's deploy key, as repository secrets. Now the build signs only on a Run workflow on main, in the `mac-signing` environment, with each signing secret passed under that condition; a pushed `desktop-v*` tag no longer releases (its run is the tag's own copy of the file); the deploy runs in `firebase-live`; every workflow is read-only at its top; the Firebase deploy action is pinned to a commit. *Measure:* `npm run cisecrets` (Measure · logic), each rule red on a broken copy of the real file first; `npm run updates` holds the release to main.

#### 23 Accounts. Measured by npm run signin

- **Measured by** `npm run signin` (`scripts/signin.mjs`, written before the build):
  the Firebase Auth emulator stands in for Google's servers, so the real SDK runs in
  a cloud session and on CI with no project or secret. Fourteen lines, from "no
  Firebase in a build without the config" to "a sign-out in another tab and the
  account deleted leave a running plate up". On today's site it is red from line 3.
  Run against a throwaway sign-in in the session that wrote it, every line went
  green, so each line can pass; the same sign-in made to drop the show when the
  account signs out failed line 8, and one that waited on Firebase alone failed
  line 7.

#### 23.12. Accounts hold the keys

- **23.12** (**shipped**, this PR): accounts hold the keys (`server/license-worker.js`).
  The merchant's webhook files each Ed25519-signed key under the buyer's email in Workers KV;
  a signed-in app asks the Worker for its keys with its Firebase ID token, checked against
  Google's public keys, and activates up to 2 machines per key. *Measure:*
  `npm run license-worker` (12/12, wired into `checks.yml` `Measure · logic`): `DEFAULT_PUBLIC_JWK.x`
  matches across `server/license-key.js` and `src/lib/licenseKey.ts` and is not the burned key, a bad webhook
  signature refused, missing `LICENSE_PRIVATE_KEY` fails closed (500), a bad token refused, a good token given its own keys and no one else's,
  Home→Pro upgrade, two-machine cap, and a refunded key revoked.

#### 23.12-url. VITE_FIREBASE_LICENSES_URL in the build

  **23.12-url** (**shipped**): `deploy.yml` never passed `VITE_FIREBASE_LICENSES_URL` to the
  build, so the live bundle had the account's key fetch and the marketing-choice sync folded away
  (measured on the live site 2026-10-19: no `/keys` or `/preferences` call in any chunk); a signed-in
  site never pulled its key from the account. Now passed from a repository secret of that name
  (the Worker's address with no path). Built with and without it: 0 chunks carry the calls without,
  1 with. Typing a key by hand never needed it (checked offline).

#### 23.12-jwks. The owner's Pro account read Free

  **23.12-jwks** (**shipped**, this PR): the owner's Pro account read Free (2026-10-24). The Worker
  verified Firebase ID tokens only against a `GOOGLE_JWKS` variable that the check sets and the live
  Worker never had, so it answered 401 to every real sign-in and no account key ever reached a
  browser; and the app asked for the key only while the profile sheet was open. Now the Worker fetches
  Google's published keys for Firebase tokens and keeps them for the endpoint's max-age (about five
  hours, measured), asking at most once a minute for an unknown key id or while Google is down, one
  fetch shared by concurrent requests; an RS256 token must name this project as both audience and
  issuer, and carry an expiry, an issue time not in the future and a subject; the app asks once it starts signed in
  (`src/lib/accountLicense.ts`, from `main.tsx`) and again the moment a sign-in completes in the
  sheet, keeping the best of Home and Pro; a key taken off the computer by hand stays off until
  asked back from the sheet (it would otherwise retake a Mac's seat at the next start). *Measure:*
  `npm run license-worker` 15/15, 12/15 on the old Worker (8: no `GOOGLE_JWKS`, a good token gets
  its Pro key and Google is asked once, old: 0 keys, 401; 8b: Google down, ten tokens ask it once;
  3b: tokens for another project, another issuer, the demo project, or with no audience or issuer
  refused, old: four of five let through); `npm run signin` 14 (Free before the key is
  filed, Pro after a restart with the sheet never opened).

#### 23.14-verify. The account token's signature checked

  **23.14-verify** (**shipped**, #467; found 2026-10-24): `server/account-shows.js`
  `verifyAccountToken` read the token's uid, audience and issuer but never checked its
  signature, so anyone who could reach a show server could name any uid and read or publish
  that account's running shows. It now verifies RS256 against Google's keys in
  `server/firebase-token.js` (cached and rate-limited as 23.12-jwks does), the project, the
  issuer and the times; the emulator's unsigned tokens count only with `FIREBASE_AUTH_EMULATOR`
  set. *Measure:* `npm run accountlink` 1b (a signed token taken; unsigned, forged and
  other-project tokens refused), 7/7.

#### 23.18. Cloud sync for Pro

- **23.18** (**shipped**, this PR): cloud sync for Pro (`server/cloud-sync.js`,
  `src/lib/cloudSync.ts`, `src/lib/cloudSyncApp.ts`, `CloudSyncCard` in the profile sheet,
  desk and phone). Asked by the owner, 2026-10-25: the Mac app has its own storage, so looks
  saved in Chrome were not in it. A Pro account now carries the saved looks, sequences, saved
  sets and the working set list, song shows and action sets, custom liquids, the MIDI map,
  tool amounts, music settings and Follow songs; every browser and Mac app signed in to it
  keeps them in step through the licence Worker's `/sync` (one KV value per account, the tier
  read from the keys filed under the account's email). Each device stays the source of truth
  offline and saves exactly as before; the engine looks at the same localStorage keys every
  5 s and stamps what changed. The rule is newest-wins per item with deletions as tombstones,
  the cloud's copy on a tie, and what a device held before it first synced stamped oldest (so
  a second machine's untouched starter set never replaces the first's). Clocks are corrected
  by the skew each answer measures; a record far in the future is pulled back to a minute past
  the server's clock. KV has no transactions, so a manifest every ten minutes finds a push lost
  to another device's write and sends it again. Not synced, on purpose: the projector layout,
  audio input and source, MIDI ports, desk mode, licence and sign-in, which belong to the
  machine. The MIDI map syncs whole, one value: two computers with different controllers
  replace each other's map (a map per controller is 23.18-midi). Erase the cloud copy from the
  sheet (any signed-in account, Pro or not); the erase leaves a marker, and a push on a sign-in
  token issued before it is refused, so a Mac app left open cannot put back an erased or
  deleted account's copy. Deleting the account stops if the erase fails. A look the cloud
  refuses (over 256 KB) is reported on the card and not sent again until edited.
  *Measure:* `npm run cloudsync` (13/13, `checks.yml` `Measure · logic`): saved on one device
  and read back by the stores' own load functions on the other, for arrival, the starter set
  list, concurrent edits of different looks, the later edit of one look from a clock ten
  minutes slow, deletion, offline edits, a lost write healed, Home/keyless/forged/other
  accounts refused or isolated, unreadable storage never read as empty, erase, a future
  stamp, a refused look and an id of `toString`, and the wiring (every synced key is its
  module's, and every key held in React state reloads when the cloud writes it). Each guard
  was broken in turn and its line went red.

#### 23.10d. Sign in with Apple is not offered

- **23.10d** (**shipped**, #460): Sign in with Apple is not offered (the owner,
  2026-10-24: "I don't want to do the apple developer account or accept logins from
  them. maybe later - but not now."). The button is held behind `APPLE_SIGN_IN` in
  `SignInScreen.tsx`, the landing page and the privacy page say Google or an emailed
  link. *Measure:* `npm run signin` line 4 fails if an Apple button is drawn.

#### 23.10e. Email and password accounts

- **23.10e** (**shipped**, this PR): email and password accounts (the owner, 2026-10-24:
  "an email login option that stores passwords and other account details ... and if they
  have a google account it can link to that"). Firebase Email/Password beside Google and the
  emailed link; Firebase keeps one account per email, so a password is one more way into the
  same uid and the licence (keyed on the email, `keys:<email>`) follows with no Worker change.
  *Sign-in form* (`SignInForm`, shared by the first-visit screen, the account sheet on the desk
  and the phone): "Continue with email" opens an Emailed link / Password pair of tabs; Password
  has sign in, create account, show/hide, and "Forgot password?". Sign-up mails the confirmation
  link at once. An address that already has an account says so, and offers "Continue with Google
  and add this password" (Google, then `linkWithCredential`). A Google sign-in Firebase refuses
  because the email has a password keeps Google's credential and attaches it on the next
  password sign-in. *Account sheet* (`AccountSignInMethods.tsx`): which ways in the account has,
  "Set a password" (a Google account: `linkWithCredential`; an emailed-link one: `updatePassword`),
  and, for an unconfirmed password account, a banner with "I've confirmed" (reload, renew the
  token, ask the Worker for the licence) and "Send it again". **Why confirmation matters:** the
  licence Worker already refuses an ID token whose email is not verified
  (`license-worker.js`, `email_verified === false`), which is what stops a stranger signing up
  with someone else's address from reading that person's licence; an unconfirmed account reads
  Free until the link is opened. *Measure:* `npm run signin` 17–21 (the real SDK against the Auth
  emulator): sign-up makes one unconfirmed account, mails the link, starts the plate, a filed Pro
  key reads Free until confirmed and Pro after; on a phone the password signs in to the same uid,
  a wrong one is refused in words, a reset is mailed; a Google account signed up again gets no
  second account and ends with `google.com` + `password` on one uid; a Google and an
  emailed-link account each set a password from the sheet and sign in with it; the password form
  fits 1024×768 and a phone upright and on its side. *Console step, **done** (the owner, 2026-10-25): Email/Password is on and
  "Link accounts that use the same email" is on.* Live since the 10:23 AM PT deploy on
  2026-10-25.

## Shipped after the split

### 23.8-clock. The packed Mac check hears the system audio (2026-10-29)

- **23.8-clock** (**shipped**, PR #550, 2026-10-29): the packed Mac check's system-audio line went red three times in eleven runs on 2026-10-28 (#544 twice, #537 once; each green on a re-run) with both of the source's contexts "running" within 0.1 s of the click, 239 packets sent and the ear reading volume 0 for the whole 10 s; the eight green runs heard the tone 0.7–1.0 s after the click, and the reds were the faster runners (the opening rung two steps higher). A context's state is not its clock: Chromium reports "running" when it asks the audio service for an output stream, and `currentTime` stays at zero until the device answers, so the line could not tell a dead device from a broken wire. The System audio source moved to `src/lib/systemTap.ts` (out of `App.tsx`, at its ceiling) with `stats()`, the line to `scripts/desktop-audio.mjs` (out of `desktop.mjs`, at its ceiling), printing both clocks, the packets in the page, the track, what `getDisplayMedia` answered and, when nothing is heard, whether a fresh context can render anything. The seventh run on that head (40770856220) was the red that said it: the tap's clock ran (0.43 s to 9.30 s, 232 packets in the page, the track live), the ear's context "running" with its clock never off zero, and the fresh context at 44100 Hz (the renderer's fallback when the output device will not open) with its clock at zero too. The runner's virtual output device, having opened one stream, opened no second one for the rest of that run. *Fix:* the ear analyses the System audio source inside the tap's own context (`useAudioAnalyzer`'s `sharedContext`, which it neither resumes nor closes): the PCM, ScreenCaptureKit's loopback and the analyser are one output stream, which is also one fewer for the Mac to drive at a gig. *Measure:* `npm run desktop -- --packaged` on CI's Mac, the system-audio line heard with one clock (the PR's runs on the fix are counted in its body); the line fails, with the probe's numbers, on a run where even the first stream does not open. *Open:* 23.8-streams in PLAN.md.
