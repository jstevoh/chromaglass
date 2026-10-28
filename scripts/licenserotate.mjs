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
 *       with nothing.
 *
 * The order of a rotation, by hand on the owner's Mac when the owner says, with a rollback
 * at every step:
 *   1. `generate`; commit the public JWK (this PR), merge; the site deploys with it.
 *      Until step 3 the site reads the owner's old-key Pro as "could not verify".
 *   2. `plan`, read it, post it to the owner.
 *   3. In one sitting, straight after the site deploy: `apply`;
 *      `npx wrangler secret put LICENSE_PRIVATE_KEY --config <toml>` from the key file;
 *      and, the live Worker having a `LICENSE_PUBLIC_KEY` secret that overrides the code's
 *      `DEFAULT_PUBLIC_JWK` (found 2026-10-28), `npx wrangler secret put LICENSE_PUBLIC_KEY`
 *      with the new public JWK (or delete it so the code's applies); then
 *      `npx wrangler deploy --config <toml> --keep-vars`; then `npx wrangler deploy` for the
 *      song-ID Worker (it verifies Home keys against the code's public key).
 *   4. A Mac release (Actions → Mac app → Run workflow, release ticked): the installed
 *      app trusts the old public key until it updates.
 *   Rollback: `npx wrangler rollback` of the licence Worker to the version noted before
 *   step 3 (its secrets go back with it), `kv key put` of the backup file's records, and
 *   the site's previous release in Firebase Hosting.
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
export async function rotate({ kv, privateJwk, publicJwk, keepEmails, apply = false, log = () => {} }) {
  const keep = new Set(keepEmails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  if (!keep.size) throw new Error('--keep-email is required: the owner must keep a key');

  const names = [];
  for (const prefix of LICENCE_PREFIXES) names.push(...(await kv.list(prefix)));
  const backup = {};
  for (const n of names) backup[n] = await kv.get(n);

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
      resign.push({ email, record: r });
      keptIds.add(r.id);
    }
  }
  if (!resign.length) throw new Error(`no unrevoked licence is filed under ${[...keep].join(', ')}; refusing to delete the rest`);

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

// ── wrangler as a KV adapter ─────────────────────────────────────

function wranglerKv({ config, binding, remote }) {
  const base = (...a) => ['wrangler', 'kv', 'key', ...a, '--binding', binding, ...(config ? ['--config', config] : []), ...(remote ? ['--remote'] : [])];
  const run = (args) => execFileSync('npx', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return {
    async list(prefix) {
      return JSON.parse(run(base('list', '--prefix', prefix))).map((k) => k.name);
    },
    async get(name) {
      try {
        return run(base('get', name, '--text'));
      } catch {
        return null;
      }
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
    const plan = await rotate({ kv, privateJwk, publicJwk, keepEmails: keep, apply: false, log: console.log });
    if (apply) {
      const backupFile = flag(argv, 'backup', `${keyFile}.kv-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      writeFileSync(backupFile, JSON.stringify(plan.backup, null, 2), { mode: 0o600 });
      console.log(`backup of ${Object.keys(plan.backup).length} records: ${backupFile}`);
      await rotate({ kv, privateJwk, publicJwk, keepEmails: keep, apply: true });
    }
    console.log(`${apply ? 'applied' : 'plan'}: ${plan.resigned.length} re-signed, ${plan.deleted.length} deleted`);
    return;
  }
  console.log('usage: licenserotate.mjs generate --out <file> | plan|apply --key <file> --keep-email <email> --config <toml>');
  process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`licenserotate: ${e.message}`);
    process.exit(1);
  });
}
