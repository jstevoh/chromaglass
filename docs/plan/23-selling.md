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
- *Shipped so far*: `npm run signin` (`scripts/signin.mjs`, the Firebase Auth emulator standing in for Google) measures the sign-in, fourteen lines. Story in `docs/plan-shipped/23-selling.md` §23 Accounts (moved 2026-10-29, 19m-2).

## Steps

- **23.1** *(owner)*: the merchant account, the Home price ($29–39) and Pro's ($199),
  and the checkout page.
- **23.2** (**shipped**, this PR): a hosted-site build flag (`VITE_FIREBASE_HOSTED_SITE=1`,
  or `?tierGates=1` for checks) that shows each paid feature above as an "In the ChromaGlass
  app" tile with a link (`src/lib/tierGates.ts`, `SettingsPanel.tsx`, `DeskPanels.tsx`), off
  in a licensed app and in … Story in `docs/plan-shipped/23-selling.md` §23.2 (moved 2026-10-29, 19m).
- **23.3** (**shipped**, this PR): the song-ID Worker (`server/fingerprint-worker.js`) takes
  an Ed25519-signed `X-ChromaGlass-Key` licence key as well as an allowed origin, and the
  site's manual tag stays. Story in `docs/plan-shipped/23-selling.md` §23.3 (moved 2026-10-29, 19m).
- **23.4** (**shipped**, this PR): the key in the Mac app and show server
  (`server/license-key.js`, `server/server-license.js`, `server/remote-server.js`,
  `src/lib/licenseKey.ts`, `desktop/`) Story in `docs/plan-shipped/23-selling.md` §23.4 (moved
  2026-10-29, 19m).
- **23.5** (**shipped**, this PR): the site's Record capped to a 15-second clip (`FREE_RECORD_MAX_SECONDS = 15`)
  and Render to 720p (`FREE_RENDER_MAX_HEIGHT = 720`), each with a small ChromaGlass corner mark (`useRecorder.ts`, `useSongRender.ts`) the Mixer cannot hide; the app's untouched. *Measure:*
  `npm run tiers` (11/11): verifies the 15 s cap, 720p cap, and corner mark pixels on recorded frames.
- **23.6** (**shipped**, this PR): the site's logo layer shows the ChromaGlass
  mark only (`SettingsPanel.tsx` and `DeskPanels.tsx`); your own
  logo is the app's. *Measure:* `npm run tiers` (11/11).
- **23.8** (**shipped**, this PR, `desktop/`): Home's listening features. Story in
  `docs/plan-shipped/23-selling.md` §23.8 (moved 2026-10-29, 19m).
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
  sign out with confirmation … Story in `docs/plan-shipped/23-selling.md` §23.10 (moved 2026-10-29,
  19m).
- **23.10c** (**shipped**, this PR): a way back in, and a profile sheet that reads (the
  owner, 2026-10-24: signed out while using the app, "there is no way to re-sign in"; "the
  profile page is garbage"). Story in `docs/plan-shipped/23-selling.md` §23.10c (moved 2026-10-29,
  19m).
- **23.10b** (**shipped**, #430's work, folded into 23.10c's PR): the Profile & Store sheet
  fits the screen (the owner, 2026-10-22: "a little janky"). Story in `docs/plan-shipped/23-selling.md`
  §23.10b (moved 2026-10-29, 19m).
- **23.11** (**shipped**, this PR): the Mac app with no key asks for the
  same sign-in once (`LicenseGate.tsx`, `src/main.tsx`), online, then runs as the site does;
  with a verified Ed25519 key it never asks. *Measure:* `npm run tiers` (11/11): verified with a key, with none
  and signed in, and with none and signed out.
- **23.12** (**shipped**, this PR): accounts hold the keys (`server/license-worker.js`); `npm run license-worker`. Story in `docs/plan-shipped/23-selling.md` §23.12 (moved 2026-10-29, 19m-2).
  **23.12-url** (**shipped**): `deploy.yml` now passes `VITE_FIREBASE_LICENSES_URL` to the build, so a signed-in site pulls its key from the account. Story in `docs/plan-shipped/23-selling.md` §23.12-url (moved 2026-10-29, 19m-2).
  *Open:* `VITE_FIREBASE_SHOWS_URL`
  is read by `accountShows.ts` and is also not in the build; it falls back to `/account-shows` on the
  same origin, which the hosted site does not serve, so decide with 23.14 where that endpoint lives.
  **23.12-jwks** (**shipped**, this PR): the Worker fetches Google's published keys for Firebase tokens, and the app asks for the account's key at start and after a sign-in. Story in `docs/plan-shipped/23-selling.md` §23.12-jwks (moved 2026-10-29, 19m-2).
  *Owed:* `wrangler deploy` of the licence
  Worker from the owner's Mac (its config is not in the repo), then confirm `owner-pro-1` is filed
  under the owner's sign-in email and was signed after the key rotation (the sheet now says so in
  words when the account holds a key the app cannot verify).
  **23.12-reissue** (open): a key the account holds that was signed by the retired key pair is
  refused by every browser; the Worker could re-sign such records on `GET /keys` with the current
  key (it is the source of truth for what was sold), with a check that a forged token never enters
  KV that way.
  **23.14-verify** (**shipped**, #467): `server/account-shows.js` now verifies the account token's signature against Google's keys (`server/firebase-token.js`); `npm run accountlink` 1b. Story in `docs/plan-shipped/23-selling.md` §23.14-verify (moved 2026-10-29, 19m-2).
- **23.14** (**shipped**, this PR): linking devices by account (`server/account-shows.js`,
  `src/lib/accountShows.ts`). Story in `docs/plan-shipped/23-selling.md` §23.14 (moved 2026-10-29,
  19m).
- **23.18** (**shipped**, this PR): cloud sync for Pro (`server/cloud-sync.js`, `src/lib/cloudSync.ts`): a Pro account carries its looks, sets, liquids, MIDI map and settings across every signed-in browser and Mac app; `npm run cloudsync`. Story in `docs/plan-shipped/23-selling.md` §23.18 (moved 2026-10-29, 19m-2).
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
- **23.10d** (**shipped**, #460): Sign in with Apple is not offered (`APPLE_SIGN_IN` in `SignInScreen.tsx`; `npm run signin` line 4). Story in `docs/plan-shipped/23-selling.md` §23.10d (moved 2026-10-29, 19m-2).
- **23.10e** (**shipped**, this PR): email and password accounts beside Google and the emailed link (`SignInForm`, `AccountSignInMethods.tsx`; `npm run signin` 17–21), live since the 2026-10-25 deploy. Story in `docs/plan-shipped/23-selling.md` §23.10e (moved 2026-10-29, 19m-2).
  *Owed by the owner:* the one hand-try the emulator cannot do (Google account,
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
