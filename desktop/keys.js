/**
 * Where the stream keys live (PLAN.md 37x-4b).
 *
 * A stream key is the password to the owner's channel: anyone holding it can
 * go live as them. So it is never in show.json, a log, a crash report or the
 * page (docs/live-show.md): the page names a key ("youtube"), and this
 * process reads it only to hand it to the RTMP client (live.js).
 *
 * The store is Electron's `safeStorage`: on a Mac it encrypts with a key that
 * macOS keeps in the user's login Keychain under the app's name (the "Safe
 * Storage" item Chromium-based apps make), so the file this writes,
 * `live-keys.json` beside show.json in the app's folder, holds only
 * ciphertext, readable by this app on this account and by nothing else. Why
 * not the `security` command, which would put the key itself in the
 * Keychain: `security add-generic-password` takes the password on its
 * command line, where every process on the machine can read it from the
 * process list for as long as the command runs; `safeStorage` crosses no
 * such line.
 *
 * On a machine where no encryption is available (a Linux box with no keyring,
 * where the check runs) the store refuses to keep a key, and the check hands
 * its key straight to live-start, which the repo's app allows and the packed
 * app never does (live.js). The `safeStorage` object is passed in, not
 * imported, so a plain node test can stand one in.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function makeKeyStore({ file, safeStorage }) {
  const available = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
  const load = () => {
    try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}; } catch { return {}; }
  };
  const save = (entries) => {
    mkdirSync(dirname(file), { recursive: true });
    // Written beside and renamed over: a crash mid-write cannot leave half a file.
    writeFileSync(`${file}.tmp`, JSON.stringify(entries, null, 2), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  };
  return {
    available,
    /** Keep `key` under `name`; the previous key of that name is gone. */
    set(name, key) {
      if (!name) throw new Error('a key needs a name');
      if (!available()) throw new Error('this machine has no keychain to keep a stream key in');
      const entries = load();
      entries[name] = { cipher: safeStorage.encryptString(key).toString('base64'), set: new Date().toISOString() };
      save(entries);
      return true;
    },
    /** The key itself, for the RTMP client only; null when there is none or it cannot be read. */
    async read(name) {
      const e = load()[name];
      if (!e?.cipher || !available()) return null;
      try { return safeStorage.decryptString(Buffer.from(e.cipher, 'base64')); } catch { return null; }
    },
    /** The names and when each was set: never the keys. */
    list() {
      const entries = load();
      return Object.keys(entries).sort().map((name) => ({ name, set: entries[name].set ?? null }));
    },
    remove(name) {
      const entries = load();
      if (!(name in entries)) return false;
      delete entries[name];
      save(entries);
      return true;
    },
  };
}
