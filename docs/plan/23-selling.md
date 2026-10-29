# 23. Selling it: the site free, the app paid

This section is in 2 files, cut between items: `23-selling.md`, `23-selling-2.md`.

*Asked 2026-10-04: which features should leave the free web app and stay in a paid
version. The owner chose the split below the same day. Nothing is gated yet; this
section is the order to build it in.*

**The rule.** The website keeps the whole plate and is the demo: anyone who signs in
(free, with Google, Apple or an emailed link; the owner's choice 2026-10-11, below)
sees the best ChromaGlass there is, on their own laptop and one projector. Home is
what a listener wants for an evening with their own music (whatever the computer plays,
the TV with no click, full recordings); Pro is what turns the plate into a show rig, and most of that is what a page cannot
do at all, so the paid side is mostly the Mac app (§13 step 1), and the Windows app
after it (13-win-app), rather than features cut from the site.

**Why so little leaves the site.** The source is public and BUSL lets anyone run
their own copy and change it, so a gate on the website is a nudge, not a lock. It
still works, because nearly everyone uses the hosted site rather than building from
source: gates go in the hosted site's build, and the code stays in the repo. What the
app does natively (the show server with no terminal, video out, offline, the
projector with no click, writing to disk) needs no enforcement at all. Two things
cost the owner money on every use, song ID now and any cloud storage later, so they
sit behind the key.

**Order.** None of it before Wave 1, a judging pass (Wave 2), the signed Mac app
(13.1-sign) and a free beta with a few VJs. Then the steps below, then charging.

## The split

| Feature | Free website | Home app | Pro app | Why |
|---|---|---|---|---|
| Signing in (Google, Apple or an emailed link) | required, once a browser | once, then offline for good with a key | once, then offline for good with a key | The owner's choice (2026-10-11). The account holds the key and links the devices (23.10–23.14). |
| Every look, preset and photograph | ✓ | ✓ | ✓ | The look is what sells it; a weaker demo loses the sale. |
| Solver quality, grid and governor | ✓ | ✓ | ✓ | Hobbling the picture makes the site a worse advert. |
| Every tool and every liquid | ✓ | ✓ | ✓ | Playing with the liquid is a first visit's "wow". |
| Design desk; your own presets as files | ✓ | ✓ | ✓ | People invest in it, and their presets carry into the app. |
| Microphone, system audio, file player, beat clock, band in the box | ✓ | ✓ | ✓ | Sound-reactivity is the core promise. |
| Whatever the computer plays (a streaming app, a music library), heard with no tab to share | | ✓ | ✓ | The listener's first wish, and a page can only hear a shared tab or a microphone. Whether Electron can take the Mac's system audio directly is not yet tested. |
| An ambient mode: full screen on the TV for hours, cool and quiet (14j) | best effort | ✓ | ✓ | A listening session runs an album or an evening, not a set. |
| MIDI controller, MIDI learn, tap tempo | ✓ | ✓ | ✓ | A VJ tries it with their own controller before buying. |
| One projector or TV on HDMI (Cast → Second display) | ✓ | ✓ | ✓ | A party or a first gig on the site is the best advert. |
| Projector or TV found and sent to with no click, back after a knocked cable | | ✓ | ✓ | A page needs a gesture; at home it is the TV coming on by itself. |
| The Mixer's stack on one plate | ✓ | ✓ | ✓ | It is part of the look. |
| Two or more projectors, each its own plate (§16) | | | ✓ | Only multi-screen rigs need it, and they are paying jobs. |
| Show Sequencer and set lists | ✓ | ✓ | ✓ | Free to try; a cap on a site set list's length can come later. |
| Lyrics overlay (LRCLIB) | ✓ | ✓ | ✓ | A free service and a good party trick. |
| Song ID | manual tag only | ✓, a monthly cap | ✓ | Every lookup costs the owner money; the cap keeps Home's price above its cost. |
| Song maps, per-track identity, history | ✓ | ✓ | ✓ | Work from a manual tag at no cost. |
| Your own logo on the wall | ChromaGlass mark | ChromaGlass mark | ✓ | A club or a band putting its name up is a paying use. |
| Record | short clips, small mark | full length, no mark, to disk | full length, no mark, to disk | The site holds the take in memory anyway (§13 found along the way). |
| Render a song | 720p, small mark | full resolution, no mark | full resolution, no mark | Sharing a video of your own record is what a listener does. |
| Phone and tablet remote | | ✓ | ✓ | Changing the look from the couch; needs the show server, which the app has built in. |
| Network displays, OSC in | | | ✓ | The same show server; pro integration. |
| Art-Net: the room's lights follow the plate | | | ✓ | The same show server; only venues have DMX. |
| Syphon, Spout, NDI out (13.2, 13.3) | | | ✓ | Impossible from a page; the main reason a VJ buys a native app. |
| DAW bridge plugin (13.7) | | | ✓ | It talks to the app, not the site. |
| Modular patch inputs (§24): two channels / every channel; CV out | two channels | two channels | every channel, CV out | A page gets two input channels; the rest needs the app reading the interface natively. |
| Works offline | best effort | ✓ | ✓ | The app bundles the build. |
| The room camera driving the plate | ✓ | ✓ | ✓ | A demo moment that costs nothing. |
| iPhone app playing the show itself (§12) | free | | | Store rules take a cut of an in-app sale; keep it a demo. |
| iPhone app as the laptop's remote | | via the laptop's key | via the laptop's key | The laptop's licence covers its remote, so no store sale. |

## How it unlocks

- **Bought once through a merchant of record** (Paddle or Lemon Squeezy), which runs
  the checkout, VAT and sales tax and emails a licence key. The key is also held
  by the buyer's account (23.12), so it can be restored and moved without digging
  out the email. (Until 2026-10-11 this said no accounts; the owner then chose them.)
- **The key is a signed token** the app checks against a public key built into it, so
  it works with no internet at the gig: activated once online, two machines per key,
  moved from a settings page.
- **Two tiers, each bought once with a year of updates** (the owner's choice,
  2026-10-04, "I want more casual hobby buyers": people using it for their own
  listening sessions on their stereos, not just VJs). **Home, $29–39**, for listeners:
  what the hobby end of the market charges (Visual Lab Pro $39, Magic Music Visuals
  $79.95). **Pro, $199**, for show rigs: what the closest products charge (Synesthesia
  Standard $199, VDMX6 $199; Resolume Avenue is €299). Home to Pro costs the difference,
  as Resolume's Avenue to Arena does. After the year, updates are an optional yearly
  renewal (about $59 for Pro), and a lapsed key keeps the last version it had. A
  founder price for the beta's first buyers and half off for students are the norm.
  The exact Home price is the owner's, in 23.1. A subscription would need the key to
  expire and the app to call home, which fights the offline promise; if the owner
  wants one, it is a separate decision. Prices read 2026-10-04 from the vendors' pages.

## Accounts (the owner's choice, 2026-10-11)

*Asked 2026-10-11: "time we have logins & accounts … I really do like using SSO through
google — but we could do our own?" Recommended and chosen the same day: Firebase
Authentication with Google, Apple and an emailed link, and the free site behind the
sign-in. Then: "a more streamlined approach to connecting phones/tablets/computers"
once the login works (23.14).*

- **Why Firebase and not our own.** The site is already on Firebase Hosting, so the
  sign-in is the same project, free at this size, and Google's sign-in is the one the
  owner likes. Our own would mean storing passwords, resets, breaches and two-factor
  ourselves, in a public repository, for nothing a player sees. **Why not Google
  only:** it shuts out everyone without a Google account, and Apple requires Sign in
  with Apple in any iPhone app that offers Google's (App Store guideline 4.8).
- **What a login wall costs, and what pays it back.** A first visitor and a shared
  link now meet a sign-in before the plate, which loses some of the demo's first
  "wow". So the sign-in sits over the intro `index.html` already paints, and a link
  to a look survives it (the emailed link lands back on the page asked for).
- **A show never locks out.** A browser that has signed in keeps a flag saying so,
  and with it the plate starts at once while Firebase finishes in the background.
  Firebase alone is not enough: it confirms a cached user with Google before it
  answers, and on a network that hangs rather than refuses (a venue's captive Wi-Fi)
  a prototype took 19.3 s to start against today's 0.6 s (`npm run signin` line 7). Once the plate is up nothing about the account takes it down: not
  the internet going, not a session expiring, not a sign-out in another tab, not the
  account deleted. Only the next load asks again. An explicit sign-out from the
  account sheet in the same window is the one exception, and it asks first.
- **What is never asked.** The phone remote (`?remote`) and a cast (`?cast`): they
  belong to a show that is already signed in. The Mac app with a key: the key works
  offline for good (23.4). A build with no Firebase config (`npm run dev`, every
  check, a fork's own copy) has no sign-in at all; the source is public and BUSL lets
  anyone run it, so the wall is the hosted site's, as the paid gates are.
- **Measured by** `npm run signin` (`scripts/signin.mjs`, written before the build):
  the Firebase Auth emulator stands in for Google's servers, so the real SDK runs in
  a cloud session and on CI with no project or secret. Fourteen lines, from "no
  Firebase in a build without the config" to "a sign-out in another tab and the
  account deleted leave a running plate up". On today's site it is red from line 3.
  Run against a throwaway sign-in in the session that wrote it, every line went
  green, so each line can pass; the same sign-in made to drop the show when the
  account signs out failed line 8, and one that waited on Firebase alone failed
  line 7.

## Steps

- **23.1** *(owner)*: the merchant account, the Home price ($29–39) and Pro's ($199),
  and the checkout page.
- **23.2** (**shipped**, this PR): a hosted-site build flag (`VITE_FIREBASE_HOSTED_SITE=1`,
  or `?tierGates=1` for checks) that shows each paid feature above as an "In the ChromaGlass
  app" tile with a link (`src/lib/tierGates.ts`, `SettingsPanel.tsx`, `DeskPanels.tsx`), off
  in a licensed app and in … Story in `docs/plan-shipped.md` §23.2 (moved 2026-10-29, 19m).
- **23.3** (**shipped**, this PR): the song-ID Worker (`server/fingerprint-worker.js`) takes
  an Ed25519-signed `X-ChromaGlass-Key` licence key as well as an allowed origin, and the
  site's manual tag stays. Story in `docs/plan-shipped.md` §23.3 (moved 2026-10-29, 19m).
- **23.4** (**shipped**, this PR): the key in the Mac app and show server
  (`server/license-key.js`, `server/server-license.js`, `server/remote-server.js`,
  `src/lib/licenseKey.ts`, `desktop/`) Story in `docs/plan-shipped.md` §23.4 (moved
  2026-10-29, 19m).
- **23.5** (**shipped**, this PR): the site's Record capped to a 15-second clip (`FREE_RECORD_MAX_SECONDS = 15`)
  and Render to 720p (`FREE_RENDER_MAX_HEIGHT = 720`), each with a small ChromaGlass corner mark (`useRecorder.ts`, `useSongRender.ts`) the Mixer cannot hide; the app's untouched. *Measure:*
  `npm run tiers` (11/11): verifies the 15 s cap, 720p cap, and corner mark pixels on recorded frames.
- **23.6** (**shipped**, this PR): the site's logo layer shows the ChromaGlass
  mark only (`SettingsPanel.tsx` and `DeskPanels.tsx`); your own
  logo is the app's. *Measure:* `npm run tiers` (11/11).
- **23.8** (**shipped**, this PR, `desktop/`): Home's listening features. Story in
  `docs/plan-shipped.md` §23.8 (moved 2026-10-29, 19m).
- **23.7** *(owner)*: the free beta (listeners as well as VJs), then charging. Later, if wanted, the same key
  pasted into the site unlocks it there too (bypassable from source, which is fine).
- **23.9** (**shipped**, owner): in the Firebase console (`chromaglass`), Authentication turned on
  with Google, Apple and the emailed link; authorised domains configured; web config wired into
  `deploy.yml` via GitHub Actions repository secrets (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`).
  *(Open console step for the owner: in Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → Web client `793087423172-fi7d5oq5tisv3is84vvf8e6dtorighql.apps.googleusercontent.com`, add `https://chromaglass.art/__/auth/handler`, `https://www.chromaglass.art/__/auth/handler`, and `https://chromaglass.web.app/__/auth/handler` under Authorised redirect URIs, then update `VITE_FIREBASE_AUTH_DOMAIN` to `chromaglass.art` so `signInWithRedirect` stays same-domain on iPhone Safari.)*
- **23.13** (**shipped**, #390 and extended in #394): `public/privacy.html` and `public/terms.html` completed and
  approved by the owner, including 23.12's licence key, Lemon Squeezy checkout, and 2-machine terms. *Measure:* `npm run privacy` (16/16, CI, part `logic`).
  2026-10-24: both pages name who runs ChromaGlass, the owner's California LLC (the terms
  had named the product itself as the contracting party, which is not a person in law).
- **23.13-mail** (open, the owner): `support@chromaglass.art`, the contact both pages and
  the terms give, has no mailbox: on 2026-10-24 the domain's DNS (GoDaddy) had no MX
  record, so mail to it bounces. Set up a mail service for the domain and add its MX and
  SPF records; until then the pages promise an address nobody reads.
- **23.10** (**shipped**, #394; brief `docs/handoff-signin.md`): the sign-in on the hosted
  site (`SignInScreen.tsx`, `firebaseAuth.ts`, `authFlag.ts`), over `#cg-intro` with Google,
  Apple and an emailed magic link, and the account sheet (`AccountSheet.tsx`: the email,
  sign out with confirmation … Story in `docs/plan-shipped.md` §23.10 (moved 2026-10-29,
  19m).
- **23.10c** (**shipped**, this PR): a way back in, and a profile sheet that reads (the
  owner, 2026-10-24: signed out while using the app, "there is no way to re-sign in"; "the
  profile page is garbage"). Story in `docs/plan-shipped.md` §23.10c (moved 2026-10-29,
  19m).
- **23.10b** (**shipped**, #430's work, folded into 23.10c's PR): the Profile & Store sheet
  fits the screen (the owner, 2026-10-22: "a little janky"). Story in `docs/plan-shipped.md`
  §23.10b (moved 2026-10-29, 19m).
- **23.11** (**shipped**, this PR): the Mac app with no key asks for the
  same sign-in once (`LicenseGate.tsx`, `src/main.tsx`), online, then runs as the site does;
  with a verified Ed25519 key it never asks. *Measure:* `npm run tiers` (11/11): verified with a key, with none
  and signed in, and with none and signed out.
- **23.12** (**shipped**, this PR): accounts hold the keys (`server/license-worker.js`).
  The merchant's webhook files each Ed25519-signed key under the buyer's email in Workers KV;
  a signed-in app asks the Worker for its keys with its Firebase ID token, checked against
  Google's public keys, and activates up to 2 machines per key. *Measure:*
  `npm run license-worker` (12/12, wired into `checks.yml` `Measure · logic`): `DEFAULT_PUBLIC_JWK.x`
  matches across `server/license-key.js` and `src/lib/licenseKey.ts` and is not the burned key, a bad webhook
  signature refused, missing `LICENSE_PRIVATE_KEY` fails closed (500), a bad token refused, a good token given its own keys and no one else's,
  Home→Pro upgrade, two-machine cap, and a refunded key revoked.
  **23.12-url** (**shipped**): `deploy.yml` never passed `VITE_FIREBASE_LICENSES_URL` to the
  build, so the live bundle had the account's key fetch and the marketing-choice sync folded away
  (measured on the live site 2026-10-19: no `/keys` or `/preferences` call in any chunk); a signed-in
  site never pulled its key from the account. Now passed from a repository secret of that name
  (the Worker's address with no path). Built with and without it: 0 chunks carry the calls without,
  1 with. Typing a key by hand never needed it (checked offline). *Open:* `VITE_FIREBASE_SHOWS_URL`
  is read by `accountShows.ts` and is also not in the build; it falls back to `/account-shows` on the
  same origin, which the hosted site does not serve, so decide with 23.14 where that endpoint lives.
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
  filed, Pro after a restart with the sheet never opened). *Owed:* `wrangler deploy` of the licence
  Worker from the owner's Mac (its config is not in the repo), then confirm `owner-pro-1` is filed
  under the owner's sign-in email and was signed after the key rotation (the sheet now says so in
  words when the account holds a key the app cannot verify).
  **23.12-reissue** (open): a key the account holds that was signed by the retired key pair is
  refused by every browser; the Worker could re-sign such records on `GET /keys` with the current
  key (it is the source of truth for what was sold), with a check that a forged token never enters
  KV that way.
  **23.12-orders** (**shipped**, this PR; the security audit of 2026-10-28, findings 5, 6 and 15): the Worker filed a key for whatever Lemon Squeezy sent. Now a Lemon Squeezy order files a key only for a product on `LS_HOME_PRODUCT_IDS`, `LS_PRO_PRODUCT_IDS` or `LS_UPGRADE_PRODUCT_IDS` (the three test-mode ids and the three live ones, 1479217 Home, 1479218 Upgrade, 1479219 Pro, are built in); a product's name no longer decides, and an unknown product used to be a Home key. An order whose status is not `paid` (pending, failed) files nothing. An Upgrade needs an unrevoked Home key under the same email, or it files no Pro key (it used to, at $164 against Pro's $199). `order_refunded` revokes only when the order's status is `refunded`: Lemon Squeezy sends the event for a partial refund too (`partial_refund`), which used to take the whole licence. The paid `order_created` of an order already refunded, delivered again, is held too (a refund leaves `refunded:<order>`; the review of #560). A refused order answers 200 (the store would only retry), is logged, and is kept in KV as `held:<key id>` for the owner. `POST /activate` and `/deactivate` take 60 asks an hour per address (counted before the key is read) and 20 per key, then 429 with `Retry-After` (`ACTIVATE_PER_ADDRESS`, `ACTIVATE_PER_KEY` settings); the counters are KV, so the limit is a brake on a script, not an exact meter. *Measured:* `npm run license-worker` 13a–13d and 14a–14c, 7 of the 44 failing on the Worker before (37/44 with the 34a-4b Worker); the existing 9-lines' fixtures now carry `status: "paid"`, as Lemon Squeezy's do, and the live-id line lists a Home id. *Owed:* the first real order is read in KV (`held:` empty, its key filed): an order for an id on no list is held, not filed; whether Lemon Squeezy sends anything when a pending order is later paid is not known from here, so read `held:` in KV after go-live and re-send a held order from the store's webhook log if it was paid (open). **23.12-seats** (open): the profile sheet lists the Macs holding a key's seats and lets a signed-in owner release one (a Worker route verified with the Firebase token, as `/keys` is), so a dead Mac's seat does not need a hand edit of KV (23.17g's open note); finding 15's second half.
  **23.12-rotate** (this PR; the same audit, finding 1): the keys a test-mode order minted verify offline for ever, so the guard in 34a-4b stops new ones only. The plan was to rotate the signing pair before the store sells; the owner chose not to (2026-10-29), because the live KV held three licences, all under his own address (his Pro and two test orders), every key the Worker mints is filed in KV so nobody else holds one, and a rotation would have cost his key, a Mac release and a window of "could not verify". Instead `node scripts/licenserotate.mjs revoke` takes the two test keys out of his list, marks them revoked (so `/activate` refuses them and a Mac asks the account at each online start) and clears their seats, after a backup it reads back; `restore` puts a backup back. The rotation itself (`generate | plan | apply`, header: the order and the rollback) stays built and tested for the day the private key may have leaked, or before a launch with real keys in KV: it re-signs the keys to keep (`--keep-email`, `--keep-id`) and deletes the rest, and the public half goes into `DEFAULT_PUBLIC_JWK` in `server/license-key.js` and `src/lib/licenseKey.ts`, the song-ID Worker, and with a release the Mac app. A pair made 2026-10-29 sits unused on the owner's Mac. *Measured:* `npm run license-worker` 15a–15i against an in-memory KV (a refused plan changes nothing, an unreadable record stops it, the backup restores, the old token and a test buyer's fail against a new public key, the revoked token is refused). *Open:* rotate if the old private key (a Worker secret) is ever thought to have left it.
  **23.14-verify** (**shipped**, #467; found 2026-10-24): `server/account-shows.js`
  `verifyAccountToken` read the token's uid, audience and issuer but never checked its
  signature, so anyone who could reach a show server could name any uid and read or publish
  that account's running shows. It now verifies RS256 against Google's keys in
  `server/firebase-token.js` (cached and rate-limited as 23.12-jwks does), the project, the
  issuer and the times; the emulator's unsigned tokens count only with `FIREBASE_AUTH_EMULATOR`
  set. *Measure:* `npm run accountlink` 1b (a signed token taken; unsigned, forged and
  other-project tokens refused), 7/7.
- **23.14** (**shipped**, this PR): linking devices by account (`server/account-shows.js`,
  `src/lib/accountShows.ts`). Story in `docs/plan-shipped.md` §23.14 (moved 2026-10-29,
  19m).
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
  **23.18-deploy** (*owner*): `/sync` exists once the licence Worker is deployed by hand from
  the Mac (`npx wrangler deploy`, as for #460); until then a Pro sheet says sync stopped on an
  error and retries, and nothing else changes.
  **23.18-cost** (open): every push is one Workers KV write, and the free plan allows 1000 a
  day for the whole Cloudflare account (licence webhooks and activations included). Pushes
  wait for 4 s of quiet and come at most every 5 s, so a player editing all evening is a few
  dozen; past about thirty busy Pro players a day the free plan runs out and writes fail
  (sync then backs off and keeps everything local). Workers Paid ($5 a month) lifts it to
  a million a month. If two devices of one account racing ever matters, a Durable Object per
  account gives real transactions in place of the manifest's repair.
  **23.18-music** (open): the song memory in IndexedDB (fingerprints, song maps, recorded
  performances, `musicDb.ts`) does not sync: it is large and per room. A show kit
  (`showKit.ts`) still carries it by file.
  **23.18-prune** (open): tombstones are kept for ever (they no longer count toward a store's
  2000-item cap, but they grow the account's value); drop those older than 90 days once every
  device's rev is past them.
  **23.18-verify-share** (open): the licence Worker keeps its own `verifyFirebaseIdToken` beside
  `server/firebase-token.js`, which was written to run in both; one copy of security code
  drifts less. Neither checks `auth_time`, which Firebase's documented steps include.
  **23.18-midi** (open): a MIDI map per controller (keyed by the device's name), so two rigs
  keep their own maps instead of the newest replacing the other.
  **23.18-pack** (open): the Mac app packs `server/` from a hand list
  (`desktop/electron-builder.config.cjs`), and this PR's new `firebase-token.js` was missing
  from it until the packed app failed to start on CI's Mac. A line in `npm run desktop` that walks
  `remote-server.js`'s relative imports and fails on any file the list leaves out would catch
  the next one in the cloud, before the Mac job.
  **23.18-exit** (open): a Mac app quit straight after an edit sends it the next time it opens
  (no send on `pagehide`); a `keepalive` push of the waiting records under 64 KB would close it.
- **23.10d** (**shipped**, #460): Sign in with Apple is not offered (the owner,
  2026-10-24: "I don't want to do the apple developer account or accept logins from
  them. maybe later - but not now."). The button is held behind `APPLE_SIGN_IN` in
  `SignInScreen.tsx`, the landing page and the privacy page say Google or an emailed
  link. *Measure:* `npm run signin` line 4 fails if an Apple button is drawn.
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
  2026-10-25. *Owed by the owner:* the one hand-try the emulator cannot do (Google account,
  Account, Set a password, sign out, sign in with the password, same licence;
  `linkWithCredential` against the real project).
  Open follow-ups:
  **23.10e-1** (open): an emailed-link account cannot be told from a password one from the
  browser (Firebase lists the `password` provider for both), so the sheet says "Email (link or
  password)" and "Set a new password"; an Admin-SDK call in the Worker could say which.
  **23.10e-2** (open): the reset and confirmation emails use Firebase's default templates and
  sender; the console's template editor can carry the ChromaGlass name and the support address
  once the mail service (23.13-mail) exists. **23.10e-3** (open): a password policy (the console's
  password-strength setting) is not turned on; the form asks for 8 characters, Firebase's own
  floor is 6. **23.10e-4** (open): the iPhone app's sign-in (23.15) needs the same form and the
  keychain's autofill hints.
  **23.10e-5** (open, from #475's review): `pendingProviderCredential` (Google's credential kept
  when Firebase refuses a Google sign-in because the email has a password) is attached on the
  next password sign-in for *any* email. Firebase refuses to link it to another account today
  (`email-already-in-use`, swallowed), so it is safe by the platform and not by this code; store
  the error's `customData.email` with the credential and link only when it matches the password
  sign-in's email.
  **23.10e-6** (open, from #475's review): `signInWithGoogleAddPassword` sets the signed-in flag
  before checking the Google email is the typed one, so choosing the wrong Google account leaves
  the person signed in as it with no plate; check first, or sign out on a mismatch. The same
  path hits `auth/account-exists-with-different-credential` (a non-Gmail Google address whose
  email already has a verified password) and says "Google is added when you do", but stashes no
  credential, so it is not: stash it, or reword.
  **23.10e-7** (open, from #475's review; pre-registration takeover, a known platform weakness):
  someone can create a password account for another person's *non-Gmail* address with the public
  key and link their own Google to it; if the real owner later resets the password and keeps
  using the account, the attacker's Google still signs in to that uid, now with a verified email.
  The emailed-link sign-in already runs on the Email/Password provider, so this is not new with
  passwords. Fix: the sheet lists every linked provider with its own email and lets the owner
  remove one, and a password reset signs the other providers out.
