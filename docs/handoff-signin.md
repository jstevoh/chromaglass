# Handoff: the sign-in, PLAN 23.10 (for Antigravity)

<!-- Lives in the repo so a session without the project's shared files can read it. -->

The owner's ask (2026-10-11): accounts for ChromaGlass, signed in with Google, Apple
or an emailed link through Firebase Authentication, and **the free site behind the
sign-in**. Plan: `PLAN.md` §23, "Accounts" and step 23.10 (`grep -n '^## 23' PLAN.md`).
One PR, desk and phone together. A Claude thread reviews it against this file.

## The bar: `npm run signin`, 14/14

`scripts/signin.mjs` was written before this build and is the whole target. It builds
the site twice (with and without the Firebase config), runs Firebase's own Auth
emulator (fetched with npx, no project or secret), and drives the pages. Today it is
red from line 3. It was run green against a throwaway sign-in, so every line can pass.

- **Do not change the check.** No bar, input, timeout or selector moves. If a line
  looks wrong, stop and say so in the PR body under "Check changes:"; don't edit it.
- Read its header: the 14 lines, the `data-cg-*` hooks it reads, the build variables.
- Wire it into `checks.yml` on an open (ubuntu) shard in this PR, as `npm run intro`
  is, with the `npm run build` it needs left to the script itself.

## What to build

1. **The gate, in `src/main.tsx`, before `Root` renders.** Only when
   `import.meta.env.VITE_FIREBASE_API_KEY` is set and the page is the show (not
   `?remote`, not `?cast`). Without the variable, Vite must drop the whole branch:
   no Firebase in the build (line 1a).
   - Import the sign-in lazily, as `App` is. The Firebase SDK must not be in the
     entry chunk, and the entry grows at most 6000 B gzipped (line 2).
   - Load it beside the App's chunk, not before it: `requestGpuEarly()` and the
     intro stay where they are, and a returning visit must not start later
     (`startup` on the Mac).
   - **Don't wait on `auth.authStateReady()` to start the show.** With a cached user,
     Firebase asks Google to confirm it before it resolves. When the network hangs
     (a venue's captive Wi-Fi), that took 19.3 s against today's 0.6 s, measured by
     line 7 on a prototype. Instead:
     - keep a "signed in on this browser" flag in `localStorage`, set at sign-in;
     - with the flag set, start the App at once and finish Firebase in the background;
     - clear the flag when Firebase settles on no user, or on an explicit sign-out or
       delete, but never unmount the show;
     - so the next load asks again (line 9).
     Lines 6 and 7 hold a returning visit to today's boot plus 5 s.
   - `connectAuthEmulator` when `VITE_FIREBASE_AUTH_EMULATOR` is set (the check only).
2. **Once the App is mounted, nothing about the account unmounts it.** Don't
   subscribe the show to `onAuthStateChanged`. Sign-out in another tab, an expired
   token or a deleted account change nothing until the next load (lines 8, 9).
3. **The sign-in screen** (`[data-cg-signin]`) over the intro `index.html` paints,
   in the app's own design tokens, not a stock Firebase UI.
   - Three buttons: `[data-cg-signin-provider="google.com"]`, `"apple.com"` and `"email"`.
   - Google and Apple use `signInWithPopup`, falling back to redirect where a popup
     is blocked (iPhone Safari).
   - The email path is `[data-cg-signin-email]` and `[data-cg-signin-send]`, then
     `[data-cg-signin-sent]` once the link is sent.
   - The link's `url` is `location.href`, so it lands back on the page asked for,
     query and all: a shared look link survives (line 5).
   - On landing, finish with `signInWithEmailLink`, then strip only `mode`,
     `oobCode`, `apiKey` and `lang` from the address.
   - Fits 1024×768, 390×844 and 844×390 with no sideways scroll. Every button is at
     least 44 px each way (line 11).
4. **The account sheet** (`[data-cg-account]`), opened by `[data-cg-account-open]`.
   - It shows the account's email, `[data-cg-account-signout]` (asks first on the page,
     `[data-cg-account-signout-confirm]`, then reloads to the sign-in) and `[data-cg-account-delete]` then
     `[data-cg-account-delete-confirm]` (`deleteUser`, then the sign-in).
   - On the desk: in the settings, where the other app-wide things are.
   - On the phone: in the phone's settings sheet (`src/components/phone/`). Run
     `npm run phone` and `npm run layout`.
5. `firebase` as a dependency (the modular SDK, `firebase/app` and `firebase/auth`
   only). No FirebaseUI, no other auth library.

## Not in this PR

- The deploy's real config (23.9, the owner's).
- The Mac app (23.11), keys on the account (23.12), linking devices (23.14), the
  iPhone app (23.15).

## The PR body

Use the handoff block from `docs/handoff.md`: Plan item / Done / Measured / Controls /
Review owed / Left. Then "Check changes:" (here: none). Under Measured, paste
`npm run signin`'s 14 lines, `npm run phone` and `npm run layout`.
