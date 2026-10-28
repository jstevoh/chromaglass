/**
 * Local license storage and verification for the show server and Mac app
 * (PLAN.md 23.4 & 23.11).
 *
 * Verifies Ed25519-signed license keys offline (`server/license-key.js`),
 * persists the active key and per-key machine activations in
 * `CHROMAGLASS_LICENSE_FILE` (or `server/.license.json`), and exposes
 * loopback-only endpoints (`/license-info.json`, `/license-activate`,
 * `/license-deactivate`) so the desktop app and local browser UI stay in sync.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyLicenseKey } from './license-key.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));

export const LICENSE_INFO_PATH = '/license-info.json';
export const LICENSE_ACTIVATE_PATH = '/license-activate';
export const LICENSE_DEACTIVATE_PATH = '/license-deactivate';
export const MAX_MACHINES_PER_KEY = 2;

const MAX_BODY_BYTES = 16 * 1024;

function defaultMachineId() {
  return String(process.env.CHROMAGLASS_MACHINE_ID || hostname() || 'local-mac').trim().slice(0, 128);
}

const EMPTY_STATE = () => ({ active: null, activations: {}, seatId: null, seats: {} });

function readStateFile(filePath) {
  try {
    if (!existsSync(filePath)) return EMPTY_STATE();
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return EMPTY_STATE();
    return {
      active: parsed.active && typeof parsed.active === 'object' ? parsed.active : null,
      activations: parsed.activations && typeof parsed.activations === 'object' ? parsed.activations : {},
      seatId: typeof parsed.seatId === 'string' && parsed.seatId ? parsed.seatId : null,
      seats: parsed.seats && typeof parsed.seats === 'object' ? parsed.seats : {},
    };
  } catch {
    return EMPTY_STATE();
  }
}

function writeStateFile(filePath, state) {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(state, null, 2), { mode: 0o600 });
    chmodSync(filePath, 0o600);
  } catch {
    // read-only checkout: state lives in memory for this process
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += String(chunk);
      if (raw.length > MAX_BODY_BYTES) reject(new Error('too large'));
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

export function createServerLicenseManager(options = {}) {
  const filePath = options.filePath ?? process.env.CHROMAGLASS_LICENSE_FILE ?? join(HERE, '.license.json');
  let memState = readStateFile(filePath);

  function loadState() {
    const disk = readStateFile(filePath);
    if (disk.active || disk.seatId || Object.keys(disk.activations).length > 0) {
      memState = disk;
    }
    return memState;
  }

  // What a second Mac sees when the Worker says the seats are full.
  function label() {
    return String(options.label ?? process.env.CHROMAGLASS_MACHINE_LABEL ?? hostname()).slice(0, 80);
  }

  function saveState(next) {
    memState = next;
    writeStateFile(filePath, next);
  }

  /**
   * This install's name for the licence Worker's seat count (PLAN.md 23.17g).
   * Not the host name `machineId` uses: two Macs both called "MacBook-Pro"
   * would share one seat, and the host name is what the owner renames. A random
   * id filed beside the key, so it survives a reinstall of the app (the
   * licence file sits in the app's data folder) and is lost with that folder,
   * which is a new seat, freed from the old Mac by "Remove from this computer".
   */
  function seatId() {
    const state = loadState();
    if (!state.seatId) {
      state.seatId = randomUUID();
      saveState(state);
    }
    return state.seatId;
  }

  async function currentStatus() {
    const state = loadState();
    const machineId = defaultMachineId();
    const requireSignIn = Boolean(process.env.CHROMAGLASS_REQUIRE_SIGNIN);
    const enforced = Boolean(process.env.CHROMAGLASS_ENFORCE_TIERS || process.env.CHROMAGLASS_REQUIRE_SIGNIN);

    if (state.active && typeof state.active.key === 'string') {
      const check = await verifyLicenseKey(state.active.key);
      if (check.valid && check.tier && check.id) {
        const machines = Array.isArray(state.activations[check.id]) ? state.activations[check.id] : [state.active.machineId || machineId];
        return {
          valid: true,
          tier: check.tier,
          key: state.active.key,
          email: check.email,
          id: check.id,
          exp: check.exp,
          machineId: state.active.machineId || machineId,
          machines,
          maxMachines: MAX_MACHINES_PER_KEY,
          seatId: seatId(),
          label: label(),
          // Whether the licence Worker has said this Mac may hold the key. A key
          // that has never reached the Worker (typed in offline) is false, and
          // the page asks at its next online start; the answer is kept here for
          // the starts that are offline (PLAN.md 23.17g).
          seatConfirmed: Boolean(state.seats[check.id]),
          requireSignIn,
          enforced,
        };
      }
    }

    return {
      valid: false,
      tier: 'free',
      key: null,
      email: null,
      id: null,
      exp: null,
      machineId,
      machines: [],
      maxMachines: MAX_MACHINES_PER_KEY,
      seatId: seatId(),
      label: label(),
      seatConfirmed: false,
      requireSignIn,
      enforced,
    };
  }

  async function activate(rawKey, rawMachineId, seatConfirmed) {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    const machineId = typeof rawMachineId === 'string' && rawMachineId.trim()
      ? rawMachineId.trim().slice(0, 128)
      : defaultMachineId();
    const check = await verifyLicenseKey(key);
    if (!check.valid || !check.tier || !check.id) {
      return {
        status: 403,
        body: {
          ok: false,
          valid: false,
          tier: 'free',
          error: check.error || 'invalid-signature',
        },
      };
    }

    const state = loadState();
    const existing = Array.isArray(state.activations[check.id]) ? [...state.activations[check.id]] : [];
    if (!existing.includes(machineId)) {
      if (existing.length >= MAX_MACHINES_PER_KEY) {
        return {
          status: 409,
          body: {
            ok: false,
            valid: false,
            tier: 'free',
            error: 'machine-limit',
            machines: existing,
            maxMachines: MAX_MACHINES_PER_KEY,
          },
        };
      }
      existing.push(machineId);
    }

    // If upgrading from an existing key on the same machine, release the old key's slot on this machine
    if (state.active?.id && state.active.id !== check.id) {
      const prevMachines = Array.isArray(state.activations[state.active.id])
        ? state.activations[state.active.id].filter((m) => m !== machineId)
        : [];
      state.activations[state.active.id] = prevMachines;
    }

    state.activations[check.id] = existing;
    // true files the Worker's yes; false takes it back (the Worker said full to a
    // Mac that held a seat); undefined leaves it as it was.
    if (seatConfirmed === true) state.seats[check.id] = Date.now();
    else if (seatConfirmed === false) delete state.seats[check.id];
    state.active = {
      key,
      tier: check.tier,
      email: check.email,
      id: check.id,
      exp: check.exp,
      machineId,
      activatedAt: Date.now(),
    };
    saveState(state);

    const status = await currentStatus();
    return {
      status: 200,
      body: {
        ok: true,
        ...status,
      },
    };
  }

  async function deactivate(rawKey, rawMachineId) {
    const state = loadState();
    const machineId = typeof rawMachineId === 'string' && rawMachineId.trim()
      ? rawMachineId.trim().slice(0, 128)
      : state.active?.machineId || defaultMachineId();
    const targetKey = typeof rawKey === 'string' && rawKey.trim()
      ? rawKey.trim()
      : state.active?.key || '';

    if (targetKey) {
      const check = await verifyLicenseKey(targetKey);
      if (check.id && Array.isArray(state.activations[check.id])) {
        state.activations[check.id] = state.activations[check.id].filter((m) => m !== machineId);
      }
      if (check.id) delete state.seats[check.id];
    }
    if (!rawMachineId || state.active?.machineId === machineId) {
      state.active = null;
    }
    saveState(state);
    const status = await currentStatus();
    return {
      status: 200,
      body: {
        ok: true,
        ...status,
      },
    };
  }

  async function initFromEnv() {
    const envKey = process.env.CHROMAGLASS_LICENSE_KEY;
    if (typeof envKey === 'string' && envKey.trim()) {
      await activate(envKey.trim(), defaultMachineId());
    }
  }

  async function handleRequest(req, res, pathname, isLaptopReq) {
    if (!isLaptopReq) {
      sendJson(res, 403, { error: 'laptop only' });
      return;
    }

    if (pathname === LICENSE_INFO_PATH && req.method === 'GET') {
      const status = await currentStatus();
      sendJson(res, 200, status);
      return;
    }

    if (pathname === LICENSE_ACTIVATE_PATH && req.method === 'POST') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { ok: false, error: 'invalid-json' });
        return;
      }
      const result = await activate(body?.key, body?.machineId, typeof body?.seatConfirmed === 'boolean' ? body.seatConfirmed : undefined);
      sendJson(res, result.status, result.body);
      return;
    }

    if (pathname === LICENSE_DEACTIVATE_PATH && req.method === 'POST') {
      let body = {};
      try {
        body = await readJsonBody(req);
      } catch {
        body = {};
      }
      const result = await deactivate(body?.key, body?.machineId);
      sendJson(res, result.status, result.body);
      return;
    }

    sendJson(res, 405, { error: 'method not allowed' });
  }

  return {
    currentStatus,
    activate,
    deactivate,
    initFromEnv,
    handleRequest,
  };
}
