#!/usr/bin/env node
/**
 * Rotates the licence signing key pair (PLAN.md 23.12-rotate, the security audit of
 * 2026-10-28, finding 1). Run on the owner's Mac, where `wrangler` is signed in; nothing
 * here is reachable from a cloud session, and the private key never leaves that Mac.
 *
 *   node scripts/licenserotate.mjs generate --out <file>
 *       Makes an Ed25519 pair. The private JWK goes to <file> (mode 0600, refused if the
 *       file exists, never printed); the public JWK is printed, and goes into
 *       `DEFAULT_PUBLIC_JWK` in server/license-key.js and src/lib/licenseKey.ts.
 *
 *   node scripts/licenserotate.mjs plan  --key <file> --keep-email <email[,email]> --config <wrangler toml>
 *   node scripts/licenserotate.mjs apply --key <file> --keep-email <email[,email]> --config <wrangler toml>
 *       Reads every licence record in the Worker's KV (`keys:`, `key:`, `machines:`).
 *       `plan` (and `apply` before it writes) prints each record, who holds it, and what
 *       will happen to it. Records filed under a --keep-email address are signed again
 *       with the new key (same id, tier, dates and seats, so a Mac's seat is not lost);
 *       every other licence record is deleted: nothing signed by the old pair verifies
 *       against the new public key, so the test-mode orders' keys (finding 1) are dead
 *       the moment the new public key ships, and there is no use leaving them in KV.
 *       Everything else in KV (`marketing:`, `sync:`, `held:`, rate counters) is left.
 *       `apply` writes a backup of every record it will touch to `--backup <file>`
 *       first (default `licence-kv-backup-<time>.json`, next to the key file, 0600),
 *       and refuses to run if --keep-email matches no record, so the owner is never left
 *       with nothing. `--keep-id key_a,key_b` keeps only those licences of the kept
 *       emails (an owner's address can hold test orders' keys beside his own); the
 *       rest of that address's records are deleted like anyone's.
 *
 *   node scripts/licenserotate.mjs revoke-plan|revoke --id key_a,key_b --backup <file> --config <toml>
 *       Revokes licences by id with no rotation, as a full refund does by hand (the owner's
 *       choice 2026-10-29 for the two test orders' keys, since nobody but the owner holds
 *       them). `revoke-plan` only reads. `revoke` writes the backup, reads it back, then
 *       takes each id out of its address's list, keeps `key:<id>` with `revoked: true` and
 *       clears its seats. `restore --backup <file>` puts the backup back.
 *
 * The order of a rotation, by hand on the owner's Mac when the owner says, with a rollback
 * at every step:
 *   1. `generate`; commit the public JWK (this PR), merge; the site deploys with it.
 *      Until step 3 the site reads the owner's old-key Pro as "could not verify".
 *   2. `plan`, read it, post it to the owner.
 *   3. In one sitting, straight after the site deploy: `apply`;
 *      `npx wrangler secret put LICENSE_PRIVATE_KEY --config <toml>` from the key file;
 *      and, the live Worker having a `LICENSE_PUBLIC_KEY` secret that overrides the code's
 *      `DEFAULT_PUBLIC_JWK` (found 2026-10-28), `npx wrangler secret delete LICENSE_PUBLIC_KEY`
 *      so the code's applies (details below); then
 *      `npx wrangler deploy --config <toml> --keep-vars`; then `npx wrangler deploy` for the
 *      song-ID Worker.
 *      The song-ID Worker (`server/fingerprint-worker.js`) verifies Home keys with
 *      `env.LICENSE_PUBLIC_KEY || DEFAULT_PUBLIC_JWK` too, so run `npx wrangler secret list`
 *      on BOTH Workers and delete a `LICENSE_PUBLIC_KEY` override from each (deleting is
 *      preferred to setting it to the new key: one place, the code, holds the key).
 *      The live store's product ids (Home 1479217, Upgrade 1479218, Pro 1479219) are built
 *      into the Worker's code, so this deploy carries them; an id on no list is held, never
 *      filed, so check `held:` in KV after the first real order.
 *   4. A Mac release (Actions → Mac app → Run workflow, release ticked): the installed
 *      app trusts the old public key until it updates.
 *   Rollback: `npx wrangler rollback` of the licence Worker to the version noted before
 *   step 3 (its secrets go back with it), `node scripts/licenserotate.mjs restore --backup
 *   <file> --config <toml>` for the KV records, and the site's previous release in Firebase
 *   Hosting. `apply` reads its backup file back and compares it to KV before it changes
 *   anything, and a record it cannot read stops the plan.
 */

import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { signLicenseKey, verifyLicenseKey } from '../server/license-key.js';

const LICENCE_PREFIXES = ['keys:', 'key:', 'machines:'];

/** A new Ed25519 pair as JWKs. */
export async function generatePair() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    privateJwk: priv,
    publicJwk: { kty: 'OKP', crv: 'Ed25519', alg: 'Ed25519', ext: true, key_ops: ['verify'], x: pub.x },
  };
}

/**
 * Works out (and, when `apply`, does) the rotation against `kv`, an object with
 * `list(prefix) → names`, `get(name) → text|null`, `put(name, text)` and `delete(name)`.
 * Returns the plan: what is kept and re-signed, what is deleted, and the backup of both.
 */
export async function rotate({ kv, privateJwk, publicJwk, keepEmails, keepIds = [], apply = false, log = () => {} }) {
  const onlyIds = new Set(keepIds.map((i) => i.trim()).filter(Boolean));
  const keep = new Set(keepEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  if (!keep.size) throw new Error('--keep-email is required: the owner must keep a key');

  const names = [];
  for (const prefix of LICENCE_PREFIXES) names.push(...(await kv.list(prefix)));
  const backup = {};
  for (const n of names) {
    backup[n] = await kv.get(n);
    // A name `list` just returned has a value. A null here is a read that failed, and a backup
    // missing it would let `apply` delete a record nothing can restore (the review of #560).
    if (backup[n] == null) throw new Error(`could not read ${n}; refusing to plan or apply with a record missing from the backup`);
  }

  const resign = []; // records to write again
  const keptIds = new Set();
  for (const email of keep) {
    const raw = backup[`keys:${email}`];
    if (!raw) continue;
    let list = [];
    try {
      list = JSON.parse(raw);
    } catch {
      throw new Error(`keys:${email} is not JSON; not touching anything`);
    }
    for (const r of Array.isArray(list) ? list : []) {
      if (!r || r.revoked) continue;
      // With --keep-id only those licences stay: an email can hold test orders' keys too.
      if (onlyIds.size && !onlyIds.has(r.id)) continue;
      resign.push({ email, record: r });
      keptIds.add(r.id);
    }
  }
  if (!resign.length) throw new Error(`no unrevoked licence${onlyIds.size ? ` with id ${[...onlyIds].join(', ')}` : ''} is filed under ${[...keep].join(', ')}; refusing to delete the rest`);

  const keptNames = new Set([...keep].map((e) => `keys:${e}`));
  for (const id of keptIds) {
    keptNames.add(`key:${id}`);
    keptNames.add(`machines:${id}`);
  }
  const doomed = names.filter((n) => !keptNames.has(n));

  // Describe every licence record before anything moves.
  const describe = (n) => {
    try {
      const v = JSON.parse(backup[n]);
      const rows = Array.isArray(v) ? v : [v];
      return rows.map((r) => `${r.id ?? '?'} ${r.tier ?? ''} ${r.email ?? ''} order ${r.orderId ?? '-'}${r.revoked ? ' (revoked)' : ''}`).join('; ');
    } catch {
      return '(not JSON)';
    }
  };
  for (const n of names) {
    log(`${keptNames.has(n) ? 'KEEP  ' : 'DELETE'} ${n}  ${n.startsWith('machines:') ? '' : describe(n)}`);
  }

  const written = {};
  for (const { email, record } of resign) {
    const token = await signLicenseKey(
      {
        id: record.id,
        tier: record.tier,
        email: record.email || email,
        issuedAt: record.issuedAt,
        updatesUntil: record.updatesUntil,
        maxMachines: record.maxMachines,
        ...(record.upgradeFrom ? { upgradeFrom: record.upgradeFrom } : {}),
      },
      privateJwk,
    );
    // The new token must verify against the new public key, and the old one must not.
    const ok = await verifyLicenseKey(token, publicJwk);
    if (!ok.valid) throw new Error(`the key re-signed for ${record.id} does not verify against the new public key`);
    if (record.token && (await verifyLicenseKey(record.token, publicJwk)).valid) {
      throw new Error(`${record.id}'s old token verifies against the new public key: that is not a new pair`);
    }
    (written[email] ??= []).push({ ...record, token });
  }

  if (apply) {
    for (const [email, list] of Object.entries(written)) {
      await kv.put(`keys:${email}`, JSON.stringify(list));
      for (const r of list) await kv.put(`key:${r.id}`, JSON.stringify(r));
    }
    for (const n of doomed) await kv.delete(n);
  }
  return { kept: [...keptNames].filter((n) => n in backup), deleted: doomed, resigned: resign.map((r) => r.record.id), written, backup };
}

/**
 * Revokes licences by id without rotating the key: what a full refund does (`order_refunded` in
 * server/license-worker.js), by hand. Each id leaves its owner's `keys:<email>` list, its
 * `key:<id>` record is kept with `revoked: true` (so /activate refuses it and /keys omits it)
 * and its seats are cleared. Returns the backup of every record it read or would change.
 * A token already on a Mac still verifies offline until that Mac next asks the account; with
 * the holder known to be the owner alone, that is the whole exposure (the owner's choice
 * 2026-10-29 over a rotation, which would have cost his own key and a Mac release).
 */
export async function revokeIds({ kv, ids, apply = false, log = () => {} }) {
  const wanted = ids.map((i) => i.trim()).filter(Boolean);
  if (!wanted.length) throw new Error('--id is required');
  const backup = {};
  const edits = [];
  for (const id of wanted) {
    const raw = await kv.get(`key:${id}`);
    if (raw == null) throw new Error(`could not read key:${id}; refusing to go on`);
    backup[`key:${id}`] = raw;
    const rec = JSON.parse(raw);
    if (!rec.email) throw new Error(`key:${id} has no email; not touching it`);
    const listName = `keys:${rec.email}`;
    if (!(listName in backup)) {
      const listRaw = await kv.get(listName);
      if (listRaw == null) throw new Error(`could not read ${listName}; refusing to go on`);
      backup[listName] = listRaw;
    }
    const machines = await kv.get(`machines:${id}`);
    if (machines != null) backup[`machines:${id}`] = machines;
    log(`REVOKE ${id} ${rec.tier} ${rec.email} order ${rec.orderId ?? '-'}${rec.revoked ? ' (already revoked)' : ''}`);
    edits.push({ id, rec, listName, hasMachines: machines != null });
  }
  if (apply) {
    for (const { id, rec, listName, hasMachines } of edits) {
      const list = JSON.parse(backup[listName]).filter((k) => k.id !== id);
      backup[listName] = JSON.stringify(list); // so the next id of this address starts from the shortened list
      await kv.put(listName, backup[listName]);
      await kv.put(`key:${id}`, JSON.stringify({ ...rec, revoked: true }));
      if (hasMachines) await kv.delete(`machines:${id}`);
    }
  }
  return { backup: Object.fromEntries(Object.entries(backup)), revoked: wanted };
}

/** Puts every record of a backup file's contents back, as they were. Deletes nothing. */
export async function restoreBackup({ kv, backup }) {
  const names = Object.keys(backup);
  if (!names.length || names.some((n) => typeof backup[n] !== 'string')) throw new Error('the backup is empty or has a record that is not text; not restoring');
  for (const n of names) await kv.put(n, backup[n]);
  return names;
}

// ── wrangler as a KV adapter ─────────────────────────────────────

function wranglerKv({ config, binding, remote }) {
  const base = (...a) => ['wrangler', 'kv', 'key', ...a, '--binding', binding, ...(config ? ['--config', config] : []), ...(remote ? ['--remote'] : [])];
  const run = (args) => execFileSync('npx', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return {
    async list(prefix) {
      return JSON.parse(run(base('list', '--prefix', prefix))).map((k) => k.name);
    },
    // Throws on any failure: a swallowed error read as "no such key" is how a backup misses a record.
    async get(name) {
      return run(base('get', name, '--text'));
    },
    async put(name, text) {
      const f = join(tmpdir(), `licenserotate-${process.pid}-${Date.now()}.json`);
      writeFileSync(f, text, { mode: 0o600 });
      try {
        run(base('put', name, '--path', f));
      } finally {
        writeFileSync(f, '');
      }
    },
    async delete(name) {
      run(base('delete', name));
    },
  };
}

// ── CLI ──────────────────────────────────────────────────────────

function flag(argv, name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

async function main(argv) {
  const [cmd] = argv;
  if (cmd === 'generate') {
    const out = flag(argv, 'out');
    if (!out) throw new Error('generate needs --out <file> for the private key');
    if (existsSync(out)) throw new Error(`${out} exists; not overwriting a key`);
    const { privateJwk, publicJwk } = await generatePair();
    writeFileSync(out, JSON.stringify(privateJwk), { mode: 0o600 });
    chmodSync(out, 0o600);
    console.log(`private key written to ${out} (mode 600, not shown)`);
    console.log('public key for DEFAULT_PUBLIC_JWK:');
    console.log(JSON.stringify(publicJwk));
    return;
  }
  if (cmd === 'plan' || cmd === 'apply') {
    const keyFile = flag(argv, 'key');
    const keep = String(flag(argv, 'keep-email', '')).split(',');
    const keepIds = String(flag(argv, 'keep-id', '')).split(',');
    if (!keyFile) throw new Error('--key <private key file> is required');
    const privateJwk = JSON.parse(readFileSync(keyFile, 'utf8'));
    const publicJwk = { kty: 'OKP', crv: 'Ed25519', alg: 'Ed25519', ext: true, key_ops: ['verify'], x: privateJwk.x };
    const kv = wranglerKv({
      config: flag(argv, 'config'),
      binding: flag(argv, 'binding', 'LICENSE_KV'),
      remote: !argv.includes('--no-remote'),
    });
    const apply = cmd === 'apply';
    // The backup is written before anything is changed, by running the plan first.
    const plan = await rotate({ kv, privateJwk, publicJwk, keepEmails: keep, keepIds, apply: false, log: console.log });
    if (apply) {
      const backupFile = flag(argv, 'backup', `${keyFile}.kv-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      writeFileSync(backupFile, JSON.stringify(plan.backup, null, 2), { mode: 0o600 });
      // Read the file back, and compare it to what was read from KV, before anything is changed.
      const back = JSON.parse(readFileSync(backupFile, 'utf8'));
      const same = Object.keys(plan.backup).length > 0 && Object.keys(plan.backup).every((n) => back[n] === plan.backup[n]) && Object.keys(back).length === Object.keys(plan.backup).length;
      if (!same) throw new Error(`the backup file ${backupFile} does not match what was read from KV; nothing was changed`);
      console.log(`backup of ${Object.keys(plan.backup).length} records, read back and matching: ${backupFile}`);
      await rotate({ kv, privateJwk, publicJwk, keepEmails: keep, keepIds, apply: true });
    }
    console.log(`${apply ? 'applied' : 'plan'}: ${plan.resigned.length} re-signed, ${plan.deleted.length} deleted`);
    return;
  }
  if (cmd === 'revoke-plan' || cmd === 'revoke') {
    const ids = String(flag(argv, 'id', '')).split(',');
    const kv = wranglerKv({ config: flag(argv, 'config'), binding: flag(argv, 'binding', 'LICENSE_KV'), remote: !argv.includes('--no-remote') });
    const plan = await revokeIds({ kv, ids, apply: false, log: console.log });
    if (cmd === 'revoke') {
      const backupFile = flag(argv, 'backup');
      if (!backupFile) throw new Error('revoke needs --backup <file>, written (and read back) before anything changes');
      writeFileSync(backupFile, JSON.stringify(plan.backup, null, 2), { mode: 0o600 });
      const back = JSON.parse(readFileSync(backupFile, 'utf8'));
      const same = Object.keys(plan.backup).every((n) => back[n] === plan.backup[n]) && Object.keys(back).length === Object.keys(plan.backup).length;
      if (!same) throw new Error(`the backup file ${backupFile} does not match what was read from KV; nothing was changed`);
      console.log(`backup of ${Object.keys(plan.backup).length} records, read back and matching: ${backupFile}`);
      await revokeIds({ kv, ids, apply: true });
    }
    console.log(`${cmd === 'revoke' ? 'revoked' : 'plan'}: ${plan.revoked.join(', ')}`);
    return;
  }
  if (cmd === 'restore') {
    const backupFile = flag(argv, 'backup');
    if (!backupFile) throw new Error('--backup <file> is required');
    const kv = wranglerKv({ config: flag(argv, 'config'), binding: flag(argv, 'binding', 'LICENSE_KV'), remote: !argv.includes('--no-remote') });
    const names = await restoreBackup({ kv, backup: JSON.parse(readFileSync(backupFile, 'utf8')) });
    console.log(`restored ${names.length} records from ${backupFile}`);
    return;
  }
  console.log('usage: licenserotate.mjs generate --out <file> | plan|apply --key <file> --keep-email <email> [--keep-id <id>] --config <toml> | revoke-plan|revoke --id <id,id> [--backup <file>] --config <toml> | restore --backup <file> --config <toml>');
  process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`licenserotate: ${e.message}`);
    process.exit(1);
  });
}
