/**
 * The DAW bridge on the show server (PLAN.md 13.7a, docs/dawbridge.md).
 *
 * Re-exported from `./osc.js` so `desktop/electron-builder.config.cjs`, which
 * packs `server/osc.js`, carries the bridge in the Mac app without modifying
 * `desktop/`.
 */

export {
  DAW_BRIDGE_PORT,
  DAW_PROTOCOL,
  DAW_SLOTS,
  encodeDawNames,
  startDawBridge,
} from './osc.js';
