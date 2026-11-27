# Song ID, retired (2026-11-27)

Automatic song identification: what named the song playing without anyone typing it.
The owner retired it on 2026-11-27 ("we aren't using the automatic song identity
detection really") and asked for the code to be kept here, so it can come back. Nothing
in this folder is built, typechecked (`tsconfig.json` excludes `archive/`) or run by CI.

## What it was

Two ways of naming a song, both run from the ear's half-second tick in
`src/hooks/useMusicIntelligence.ts`:

- **The paid lookup.** `src/lib/fingerprint.ts` captured five seconds of sound and sent
  it through the song-ID Worker (`server/fingerprint-worker.js`, deployed with
  `wrangler.toml` as `chromaglass-fingerprint`) to AudD or ACRCloud. Every ten seconds
  while nothing was named, every 35 once one was. On only when the build had
  `VITE_FINGERPRINT_PROXY_URL` (`deploy.yml` and `desktop.yml` pass it from a secret).
  The Worker refused other sites, oversized bodies, more than 30 an hour from one
  address and the day's ceiling, counted in the `FINGERPRINT_LIMITS` KV namespace (PLAN 14o).
- **The local matcher.** `src/lib/localFingerprint.ts` (peak-pair hashes, the index,
  `matchSnippet`), with its index built off the thread by `fingerprintIndexBuild.ts` and
  `fingerprintIndexWorker.ts`. A four-second capture every six seconds named any song the
  show had mapped before, free and offline. The song map's worker made each song's
  fingerprint as it mapped it, and `songMap.ts` stored it in IndexedDB's `fingerprints`
  store beside the map, its frames moved by the map's lead (`shiftFingerprintFrames`,
  now at the bottom of `src/lib/localFingerprint.ts` here; PLAN 28h-9).

## What still works without it

A song named by hand is followed exactly as an identified one was: the Track panel's
Tag, the Songs panel's Listen and Name it, the assistant's `listen` with a name, and
`window.__tagSong` under the checks. From the name come the song map (made on its first
listen), lyrics, the per-song look and evolution, song shows and Follow songs, designed
shows, and the corner caption with the song's title. Silence still ends a song.

What is gone: a song changing by itself (a crossfade or a gapless join changes nothing
until the next song is named), and a song heard before being recognised when it plays
again. Stored fingerprints stay in IndexedDB and in show kits (`TrackFingerprint` moved to
`src/lib/musicTypes.ts`), but songs mapped from now on get none.

## The checks that went with it

Unchanged copies of the scripts as they stood, whose live versions lost their song-ID
halves (the numbers on 2026-11-27, before → after in the live script):

- `scripts/music.mjs`: the local matcher naming songs, through a mic, never a stranger,
  and the index grown a song at a time (`npm run music` 23 → 10 checks).
- `scripts/songends.mjs`: the matcher naming each join's new song, through
  `SongChangeGate` with the boundary (`npm run songends` 11 → 7; the boundary's seven are
  as they were).
- `scripts/listen.mjs`: the fingerprint stored with a map names the song's second; and
  "nothing named for 45 s says so" (`npm run listen` 29 → 28).
- `scripts/fingerprint-worker.mjs`: the Worker's refusals (was `npm run
  fingerprint-worker`, 19 checks, removed from `package.json` and `scripts/checks.json`).

They import `../src/lib/…` for everything else, so they run only once the files are back.

## Bringing it back

1. Move the files back where their paths say: `git mv archive/song-id/src/lib/*.ts
   src/lib/`, `archive/song-id/server/fingerprint-worker.js` to `server/`,
   `archive/song-id/scripts/fingerprint-worker.mjs` to `scripts/`, `wrangler.toml` to
   the root (move `shiftFingerprintFrames` back into `src/lib/songMapLead.ts`).
2. `git apply -R archive/song-id/unhook.patch`: the hook, the song map's fingerprint,
   Listen's wait for the song ID, the Track panel's line, the pricing copy and the
   checks' manifest as they were. It was cut against main at `cbe0864`; files that have
   moved on since will need a hand where it does not apply.
3. Put the three archived checks back over the live ones (or merge their song-ID halves
   in), and `npm run lint`, `listen`, `music`, `songends`, `fingerprint-worker`.
4. The Worker on Cloudflare was left deployed but is called by nothing; its secret
   `AUDD_API_TOKEN` and the `VITE_FINGERPRINT_PROXY_URL` repository secret were left as
   they were.
