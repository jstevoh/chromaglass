# server

What runs off the page: the local show server the laptop and phones meet at, and the Cloudflare Workers for licences, crash reports and song ID. Plain JavaScript modules.

## Start here

- `remote-server.js`: the show server (`npm run remote`): serves the built app on the LAN, relays the remote's messages between laptop and phones over WebSocket, takes OSC.
- `license-worker.js`: the licence Worker: merchant webhooks, keys, machine seats, cloud sync.
- `report-worker.js`: where the crash log's Send goes.
- `license-key.js`: `signLicenseKey`, `verifyLicenseKey` (Ed25519).

## Contracts

- Imports only each other, `node:*` and `ws`; never `src/`.
- The browser side mirrors the wire: `lib/remoteProtocol.ts` (relay), `lib/licenseKey.ts` (keys), `lib/cloudSync.ts` (sync), `lib/crashLog.ts` (reports), `lib/fingerprint.ts` (song ID).
- `desktop/main.js` loads `remote-server.js` and `server-license.js` in its own process.
- Workers deploy with wrangler: `wrangler.toml` (song ID), `wrangler.report.toml` (reports). Secrets live in the Worker's environment, never here.

## Files

- `account-shows.js`: an account's running shows (served by the show server).
- `artnet.js`: Art-Net in and out.
- `cloud-sync.js`: Pro cloud sync store.
- `fingerprint-worker.js`: song ID proxy.
- `firebase-token.js`: `verifyFirebaseToken`.
- `server-license.js`: local key storage for show server and Mac app.
- `license-key.js`, `license-worker.js`, `remote-server.js`, `report-worker.js`: above.

## Checks

Every file must pass `node --check` (Measure's "The scripts parse"). `npm run report-worker`, `license-worker`, `fingerprint-worker`, `cloudsync`, `accountlink`, `signin`, `tiers`, `showkey`, `lights` (Art-Net). The relay: `applink`, `remotemix`, `phonelink`, `draw`, `drawwall`. The Mac app: `desktop`.
