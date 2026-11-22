# Archive: 23. Selling it: the site free, the app paid

The closed items of [`docs/plan/23-selling.md`](../23-selling.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## Steps

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
- **23.9** (**shipped**, owner): in the Firebase console (`chromaglass`), Authentication turned on
  with Google, Apple and the emailed link; authorised domains configured; web config wired into
  `deploy.yml` via GitHub Actions repository secrets (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`).
  *(Open console step for the owner: in Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → Web client `793087423172-fi7d5oq5tisv3is84vvf8e6dtorighql.apps.googleusercontent.com`, add `https://chromaglass.art/__/auth/handler`, `https://www.chromaglass.art/__/auth/handler`, and `https://chromaglass.web.app/__/auth/handler` under Authorised redirect URIs, then update `VITE_FIREBASE_AUTH_DOMAIN` to `chromaglass.art` so `signInWithRedirect` stays same-domain on iPhone Safari.)*
- **23.13** (**shipped**, #390 and extended in #394): `public/privacy.html` and `public/terms.html` completed and
  approved by the owner, including 23.12's licence key, Lemon Squeezy checkout, and 2-machine terms. *Measure:* `npm run privacy` (16/16, CI, part `logic`).
  2026-10-24: both pages name who runs ChromaGlass, the owner's California LLC (the terms
  had named the product itself as the contracting party, which is not a person in law).
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
**23.12-jwks** (**shipped**, this PR): the Worker fetches Google's published keys for Firebase tokens, and the app asks for the account's key at start and after a sign-in. Story in `docs/plan-shipped.md` §23.12-jwks (moved 2026-10-29, 19m-2).
*Owed:* `wrangler deploy` of the licence
Worker from the owner's Mac (its config is not in the repo), then confirm `owner-pro-1` is filed
under the owner's sign-in email and was signed after the key rotation (the sheet now says so in
words when the account holds a key the app cannot verify).
**23.12-ids** (**shipped**, this PR): the built-in test-mode Home id was 1450530, but the store's test Home is 1450525 (its dashboard, and its own `order_created` of 2026-10-24, `first_order_item.product_id`), so since 23.12-orders every paid test Home order was held as an unknown product. Now 1450525; the live ids were read from the dashboard the same day (1479217 Home, 1479218 Upgrade, 1479219 Pro) and already matched. `npm run license-worker`, whose orders now carry the store's id: the old Worker 48/50 (9b, 9c held the order), the new 50/50.
**23.14-verify** (**shipped**, #467): `server/account-shows.js` now verifies the account token's signature against Google's keys (`server/firebase-token.js`); `npm run accountlink` 1b. Story in `docs/plan-shipped.md` §23.14-verify (moved 2026-10-29, 19m-2).
- **23.14** (**shipped**, this PR): linking devices by account (`server/account-shows.js`,
  `src/lib/accountShows.ts`). Story in `docs/plan-shipped.md` §23.14 (moved 2026-10-29,
  19m).
- **23.10d** (**shipped**, #460): Sign in with Apple is not offered (`APPLE_SIGN_IN` in `SignInScreen.tsx`; `npm run signin` line 4). Story in `docs/plan-shipped.md` §23.10d (moved 2026-10-29, 19m-2). Undone by 23.15 (2026-11-08): Apple is offered again.
**23.10e-5** (**shipped** with 23.15): the kept credential now carries the email it was refused for and is attached only to a sign-in of that address. Was: `pendingProviderCredential` (Google's credential kept
when Firebase refuses a Google sign-in because the email has a password) is attached on the
next password sign-in for *any* email. Firebase refuses to link it to another account today
(`email-already-in-use`, swallowed), so it is safe by the platform and not by this code; store
the error's `customData.email` with the credential and link only when it matches the password
sign-in's email.
