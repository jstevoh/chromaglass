// Art packs sold on top of Home (PLAN.md 45a-2): the Worker's side of the moiré pack.
//
// The owner chose on 2026-11-07 to sell the moiré pack as an add-on to Home, about $15,
// and to include it in Pro. A pack is not a tier, so it does not get a key of its own:
// a buyer would then hold two keys, and every place that holds one (the account sheet,
// the Mac's seats, the song-ID Worker) would have to learn to hold a set. Instead the
// buyer's Home key is signed again with the pack's name in its `packs` list, under the
// same id, as an upgrade signs the Home key again as Pro. The old token stays valid (a
// signed key verifies offline for ever) but names no pack, so nothing is lost by a Mac
// that has not fetched the new one yet; the account's `/keys` hands it the new one.
//
// Which order bought which pack is kept on the record (`packOrders`), because the
// pack's order is not the key's order: a refund of the pack order must take the pack
// off and leave the Home the buyer still paid for, and a refund of the Home order
// takes the whole key, packs with it, as before.
//
// Kept beside license-worker.js rather than in it: that file is near the 40 KB the
// size check warns at (`npm run sizes`), and this is a piece with one job.

import { signLicenseKey, normalizePacks } from './license-key.js';

/*
  The store's product for each pack, test mode's and live mode's (Lemon Squeezy numbers
  them apart), built in so a deploy that forgets a setting still files the pack, and a
  later store can add its own as a Worker setting (comma separated), as the tiers' lists
  do (`LS_HOME_PRODUCT_IDS`). Read from the dashboard when the product was made on
  2026-11-07: 1509032 is the test-mode Moiré Pack and 1509029 the live one (ids are global
  across the two modes, so the test one is not near Home's 1450525).
*/
export const PACK_PRODUCTS = {
  moire: { setting: 'LS_MOIRE_PRODUCT_IDS', builtIn: [1509032, 1509029] },
};

function listed(list, id, builtIn) {
  if (!id) return false;
  if (builtIn.includes(id)) return true;
  return String(list || '')
    .split(',')
    .some((v) => Number(v.trim()) === id);
}

/** The pack a Lemon Squeezy product sells, or null when it sells none. */
export function packForProduct(env, productId) {
  for (const [name, p] of Object.entries(PACK_PRODUCTS)) {
    if (listed(env[p.setting], productId, p.builtIn)) return name;
  }
  return null;
}

/** The pack fields a record carries into a key signed again for it (an upgrade, a refiled Home). */
export function packFields(record) {
  const packs = normalizePacks(record?.packs);
  const orders = record?.packOrders && typeof record.packOrders === 'object' ? record.packOrders : null;
  return {
    ...(packs.length ? { packs } : {}),
    ...(orders && Object.keys(orders).length ? { packOrders: { ...orders } } : {}),
  };
}

async function resign(env, record, packs, packOrders, privateJwk) {
  const token = await signLicenseKey(
    {
      id: record.id,
      tier: record.tier,
      email: record.email,
      issuedAt: record.issuedAt,
      updatesUntil: record.updatesUntil,
      maxMachines: record.maxMachines,
      ...(record.upgradeFrom ? { upgradeFrom: record.upgradeFrom } : {}),
      packs,
    },
    privateJwk,
  );
  const next = { ...record, token };
  delete next.packs;
  delete next.packOrders;
  const kept = normalizePacks(packs);
  if (kept.length) next.packs = kept;
  if (Object.keys(packOrders).length) next.packOrders = packOrders;
  // An upgraded key keeps the Home it replaced (`replaces`), which a refunded upgrade
  // files again (`refileHome`). That Home was copied with the packs it had then, so a
  // pack refunded on the Pro key must come off it too, or refunding the upgrade later
  // would hand back a pack the buyer had their money back for.
  if (next.replaces && typeof next.replaces === 'object') {
    const old = next.replaces;
    const replaces = { ...old };
    delete replaces.packs;
    delete replaces.packOrders;
    const oldPacks = normalizePacks(old.packs).filter((p) => kept.includes(p));
    const oldOrders = Object.fromEntries(Object.entries(old.packOrders || {}).filter(([p]) => p in packOrders));
    if (oldPacks.length) replaces.packs = oldPacks;
    if (Object.keys(oldOrders).length) replaces.packOrders = oldOrders;
    next.replaces = replaces;
  }
  return next;
}

async function file(env, email, keys, record) {
  const updated = keys.filter((k) => k.id !== record.id);
  updated.push(record);
  await env.LICENSE_KV.put(`keys:${email}`, JSON.stringify(updated));
  await env.LICENSE_KV.put(`key:${record.id}`, JSON.stringify(record));
}

/**
 * A paid pack order: the buyer's Home key, signed again with the pack. Answers
 * `{ record }` when it filed (or had already filed this very order), or `{ held }`
 * with the reason it filed nothing, for the owner to refund or file by hand:
 * - no Home key on file for the email (the pack is an add-on, and selling it alone
 *   would sell Home's looks for $15 on a Free copy that cannot otherwise play them);
 * - a Pro key on file (Pro already includes every pack: the buyer paid for nothing);
 * - every Home key already carries the pack (bought twice).
 */
export async function addPack({ env, email, orderId, pack, privateJwk, readEmailKeys }) {
  const keys = await readEmailKeys(env, email);
  const live = keys.filter((k) => !k.revoked);
  // The same order delivered again (the store retries, the dashboard resends) is already filed.
  const again = live.find((k) => orderId && k.packOrders?.[pack] === orderId);
  if (again) return { record: again };
  if (live.some((k) => k.tier === 'pro')) return { held: 'pack already in Pro' };
  const homes = live.filter((k) => k.tier === 'home');
  if (!homes.length) return { held: 'pack with no Home key' };
  const target = homes.find((k) => !normalizePacks(k.packs).includes(pack));
  if (!target) return { held: 'pack already on key' };
  const packs = normalizePacks([...normalizePacks(target.packs), pack]);
  const packOrders = { ...(target.packOrders || {}), [pack]: orderId };
  const record = await resign(env, target, packs, packOrders, privateJwk);
  await file(env, email, keys, record);
  return { record };
}

/**
 * A refunded pack order: the key that pack is on, signed again without it. Answers
 * `{ record, pack }`, or null when the order bought no pack on this email's keys (it
 * is then a key's own order, and the Worker's refund takes the key as before).
 */
export async function removePack({ env, email, orderId, privateJwk, readEmailKeys }) {
  if (!email || !orderId) return null;
  const keys = await readEmailKeys(env, email);
  for (const k of keys) {
    if (k.revoked || !k.packOrders || k.orderId === orderId) continue;
    const entry = Object.entries(k.packOrders).find(([, o]) => o === orderId);
    if (!entry) continue;
    const [pack] = entry;
    const packOrders = { ...k.packOrders };
    delete packOrders[pack];
    const packs = normalizePacks(k.packs).filter((p) => p !== pack);
    const record = await resign(env, k, packs, packOrders, privateJwk);
    await file(env, email, keys, record);
    return { record, pack };
  }
  return null;
}
