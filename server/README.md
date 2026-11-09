# server

What runs off the page: the local show server the laptop and phones meet at, and the Cloudflare Workers for licences, crash reports and song ID. Plain JavaScript modules.

## Start here

- `remote-server.js` (40 KB, grep it): the show server (`npm run remote`): serves the built app on the LAN, relays the remote's messages between laptop and phones over WebSocket (and a TV's WebRTC handshake with the laptop, the `tv` role, PLAN 12-tv), takes OSC, Art-Net and Ableton Link, sends OSC out. Exports `setOsc`/`oscState` and `setOscOut`/`oscOutState` for the Mac app.
- `license-worker.js` (35 KB, grep it): the licence Worker: merchant webhooks, keys, machine seats, cloud sync.
- `report-worker.js`: where the crash log's Send goes.
- `feedback-worker.js`: where Settings → Feedback goes: one D1 table (`feedback-schema.sql`) and a mail to support@ (PLAN 39a).
- `license-key.js`: `signLicenseKey`, `verifyLicenseKey` (Ed25519).

## Contracts

- Imports only each other, `node:*` and `ws`; never `src/`.
- The browser side mirrors the wire: `lib/remoteProtocol.ts` (relay), `lib/licenseKey.ts` (keys), `lib/cloudSync.ts` (sync), `lib/crashLog.ts` (reports), `lib/feedback.ts` (feedback), `lib/fingerprint.ts` (song ID).
- `desktop/main.js` starts `remote-server.js` and imports `server-license.js` in its own process.
- Workers deploy with wrangler: `wrangler.toml` (song ID), `wrangler.report.toml` (reports), `wrangler.feedback.toml` (feedback, with its D1 database). Secrets live in the Worker's environment, never here.

## Files

- `abletonLink.js`: Ableton Link in, so the show takes the tempo and the bar from the music apps on the network. `startLink({ listInterfaces, rescanMs })` reads the interfaces again every 30 s. `remote-server.js` exports `linkOn()` and `onLinkChange(fn)` for the Mac app's Show menu; Link is Pro, beside OSC and Art-Net.
- `account-shows.js`: an account's running shows (served by the show server).
- `assistant.js`: the guard for the owner's AI assistant (PLAN 44b–44d): `readAssistantMode(env, file)` (the switch: `CHROMAGLASS_ASSISTANT`, or one word in `CHROMAGLASS_ASSISTANT_FILE`, default `server/.assistant`; off, suggest, play or full), `createAssistantGuard(send)`, `ROOM_KEYS` (from `assistant-room-keys.json`, the page's `RIG_KEYS` and `SETUP_KEYS`, rewritten by `node scripts/assistant.mjs --write`). `remote-server.js` admits the `assistant` role only from the laptop, with the show key, while the switch is on, and passes its every message through the guard. The guard also passes a `song-action` (PLAN 44f: Play for a pour, burst, dyes, zoom, kaleidoscope, look, title or a look setting; Full for the rest), and the relay answers `assistant-still` itself (44c-4, any mode on) and hands a `picture` marked `still` to the assistant alone. `mcp/` imports `ROOM_KEYS`; nothing here imports `mcp/`.
- `artnet.js`: Art-Net in and out.
- `osc.js`: OSC both ways: the reader and the address space the show takes in (`readOsc`, `oscToMessage`), the writer and the feed it sends out (`encodeOsc`, `encodeBundle`, `feedMessages`, `oscOutTarget`; PLAN 13.5-osc).
- `cloud-sync.js`: Pro cloud sync store.
- `fingerprint-worker.js`: song ID proxy.
- `feedback-schema.sql`: the feedback table, run once against D1.
- `firebase-token.js`: `verifyFirebaseToken` (the shows and feedback Workers): `{ uid, aud, email, emailVerified }`, `emailVerified` added for feedback.
- `server-license.js`: local key storage for show server and Mac app.
- `license-key.js`, `license-worker.js`, `remote-server.js`, `report-worker.js`: above.

## Checks

Every file must pass `node --check` (Measure's "The scripts parse"). `npm run report-worker`, `feedback-worker`, `license-worker`, `fingerprint-worker`, `cloudsync`, `accountlink`, `signin`, `tiers`, `showkey`, `assistant` (the assistant role and guard), `lights` (Art-Net), `link` (Ableton Link), `oscout` (OSC out). The relay: `applink`, `remotemix`, `phonelink`, `draw`, `drawwall`, `tv`. The Mac app: `desktop`.
