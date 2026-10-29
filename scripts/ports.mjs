// Which port a harness serves the app on (PLAN.md 19ah-6).
//
//   const PORT = port(4357);                 a harness's own port
//   const PORT = port(4183, 'PHONE_PORT');   ... which PHONE_PORT, when set, replaces
//   node scripts/ports.mjs --list            every harness port, shifted, comma-separated
//   node scripts/ports.mjs --selftest        the rules below, held
//
// What was asked. The owner's Mac runs main's deploy shards (19ah), one after
// another: the first deploy on it (run 40929715769, 2026-10-29) spent 51.5
// minutes on five shards of 8.6 to 12.1 minutes each, and the owner asked
// whether it could run several at once. A second runner on the same Mac is
// one more `config.sh`; what stopped it was the harnesses. Eighty of them serve
// the built app on a fixed port written into the script, with `--strictPort`,
// and many share one: 4351 is `bottles`, `mirror`, `moving` and `render-app`
// (one on the `tools` shard, one on `plate`), 4331 is `crash`, `ears` and
// `stages`, 4197 `draw`, `followview`, `phonelink` and `showkey`. Two shards
// at once on one machine meet on one of those within minutes, and the second
// either fails to listen or, for a harness that probes its port and connects
// to whatever answers, measures the first one's server and its build.
// `scripts/macports.sh` made a shard wait for the ports to close, which is
// one at a time again by another name.
//
// What this does. Every harness asks for its port here, and gets the port
// written in its script plus HARNESS_PORT_SHIFT, a whole block of ten
// thousand: unset (GitHub's Macs and ubuntu runners, a session, the owner by
// hand) it is 0 and every port is what it was; the first runner on the
// owner's Mac has 10000 in its `.env`, a second 20000, a third 30000
// (`scripts/macrunner-setup.sh` writes it), and the runner gives its `.env`
// to every job it runs. So two shards on one Mac never share a port, and a
// runner's shard never meets a session's run by hand on the Mac either.
//
// Why a block and not a free port from the OS (`listen(0)`, which `desktop`
// and `wgsl` use). A harness's port is also a fact other code relies on:
// `quick.mjs` reads it from the script to keep two checks that share one
// apart, `macports.sh` reads the same list to wait for a stale run, and a
// failing run names it. One number per harness, moved as a whole, keeps every
// one of those true; a port picked at run time would need each harness to
// pass it around, eighty edits of a harder kind. The blocks are ten thousand
// apart because every harness port is under 10000 (the selftest holds that),
// so no shifted port lands on another harness's unshifted one, and the
// highest, 39999, is below 49152, where macOS starts handing out ports to
// outgoing connections, so the OS never takes one first.
//
// Why a variable that names a harness still wins as it is (PHONE_PORT=5000
// is 5000, not 15000): whoever set it chose that port.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const BLOCK = 10000;
const BLOCKS = 4; // 0 (by hand, GitHub's machines) and three runners on one Mac
const EPHEMERAL = 49152;

export function portShift(env = process.env) {
  const raw = (env.HARNESS_PORT_SHIFT ?? '').trim();
  if (!raw) return 0;
  const n = Number(raw);
  // A typo here must not quietly mean 0: that is the block a session on the
  // same Mac uses, and two runs on one port is the failure this exists for.
  if (!Number.isInteger(n) || n < 0 || n % BLOCK || n / BLOCK >= BLOCKS) {
    throw new Error(`HARNESS_PORT_SHIFT is "${raw}"; it is a block of ${BLOCK}: one of ${Array.from({ length: BLOCKS }, (_, i) => i * BLOCK).join(', ')}`);
  }
  return n;
}

export function port(base, name, env = process.env) {
  if (name && env[name]) return Number(env[name]);
  return base + portShift(env);
}

// What counts as a harness's port in its source: `port(NNNN` is one; a bare
// number after a name ending in PORT, or after a PORT variable's `??`, or
// after a variable called `port`, or given to `--port` as a literal or a
// `String(NNNN + t)`, is a port that does not move with its runner. The
// bare forms are what every harness wrote before this.
const ASKED = /\bport\((\d{4,5})\b/g;
const BARE = [
  /\b[A-Z0-9_]*PORT[A-Z0-9_]*\s*=\s*\d{4,5}\b/g,
  /process\.env\.[A-Z0-9_]*PORT[A-Z0-9_]*\s*\?\?\s*\d{4,5}\b/g,
  /['"]--port['"]\s*,\s*['"]\d{4,5}['"]/g,
  // And the two the first pass missed, a lower-case `port = 4620` and a
  // `String(4620 + t)` given to --port (royopen and seed, on the Mac shards).
  /(?<![\w.$-])port\s*=\s*\d{4,5}\b/g,
  /['"]--port['"]\s*,\s*String\(\s*\d{4,5}/g,
];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const scripts = () => readdirSync(HERE).filter((f) => f.endsWith('.mjs') && f !== 'ports.mjs')
  .map((f) => ({ f, text: readFileSync(path.join(HERE, f), 'utf8') }));

export function harnessPorts() {
  const bases = new Map();
  for (const { f, text } of scripts()) for (const m of text.matchAll(ASKED)) {
    const b = Number(m[1]);
    bases.set(b, [...(bases.get(b) ?? []), f]);
  }
  return bases;
}

if (process.argv.includes('--list')) {
  const shift = portShift();
  console.log([...harnessPorts().keys()].sort((a, b) => a - b).map((b) => b + shift).join(','));
} else if (process.argv.includes('--selftest')) {
  let fails = 0;
  const check = (n, ok, d = '') => { if (!ok) fails++; console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

  const bare = [];
  for (const { f, text } of scripts()) for (const re of BARE) for (const m of text.matchAll(re)) bare.push(`${f}: ${m[0]}`);
  check('every harness asks for its port here, so it moves with its runner', bare.length === 0,
    bare.length ? `${bare.length} fixed: ${bare.slice(0, 6).join('; ')}${bare.length > 6 ? '; …' : ''}` : '');

  const bases = harnessPorts();
  const all = [...bases.keys()];
  // A floor, so the list cannot pass by being empty: 80 harnesses asked when
  // this was written. Fewer means the pattern stopped matching how they ask.
  check('the harness ports are found', all.length >= 40, `${all.length} distinct ports in ${new Set([...bases.values()].flat()).size} scripts`);
  const out = all.filter((b) => b <= 1024 || b >= BLOCK);
  check(`every harness port is between 1024 and ${BLOCK}, so no block reaches another`, out.length === 0, out.join(', '));
  const top = Math.max(...all) + (BLOCKS - 1) * BLOCK;
  check(`the highest shifted port is below ${EPHEMERAL}, where macOS hands out ports of its own`, top < EPHEMERAL, `${top}`);

  check('unset, a port is the one in the script', port(4357, undefined, {}) === 4357);
  check('a runner\'s shift moves it by its block', port(4357, undefined, { HARNESS_PORT_SHIFT: '20000' }) === 24357);
  check('a harness\'s own variable wins, unshifted', port(4183, 'PHONE_PORT', { PHONE_PORT: '5000', HARNESS_PORT_SHIFT: '10000' }) === 5000);
  check('a harness\'s own variable unset, the shift still applies', port(4183, 'PHONE_PORT', { HARNESS_PORT_SHIFT: '10000' }) === 14183);
  for (const bad of ['1', '15000', '40000', '-10000', 'x', '1e4.5']) {
    let threw = false;
    try { port(4357, undefined, { HARNESS_PORT_SHIFT: bad }); } catch { threw = true; }
    check(`HARNESS_PORT_SHIFT="${bad}" is refused, not read as 0`, threw);
  }

  // The thing itself, end to end: two processes that ask for one harness's
  // port, as two shards on one Mac would, each with its runner's `.env`
  // inherited. Different blocks both listen; the same block is the collision
  // this is for, and must still be one (else the first test proves nothing).
  const listen = `import { port } from ${JSON.stringify(path.join(HERE, 'ports.mjs'))};
    import { createServer } from 'node:net';
    const s = createServer(); const p = port(4357);
    s.once('error', (e) => { console.log(p, e.code); process.exit(3); });
    s.listen(p, '127.0.0.1', () => { console.log(p, 'listening'); setTimeout(() => s.close(), 1500); });`;
  const pair = (a, b) => {
    // Both started before either is waited for: spawnSync would run them one
    // after the other and the second would find the port free again.
    const run = (shift) => new Promise((done) => {
      const c = spawn(process.execPath, ['--input-type=module', '-e', listen], { env: { ...process.env, HARNESS_PORT_SHIFT: shift } });
      let o = ''; c.stdout.on('data', (d) => { o += d; }); c.on('exit', (code) => done({ code, o: o.trim() }));
    });
    const first = run(a);
    return new Promise((r) => setTimeout(r, 400)).then(() => Promise.all([first, run(b)]));
  };
  const [x, y] = await pair('10000', '20000');
  check('two runners\' shards on one Mac both serve the same harness', x.code === 0 && y.code === 0, `${x.o}; ${y.o}`);
  const [p, q] = await pair('10000', '10000');
  check('two runs in one block still collide (the control)', p.code === 0 && q.code === 3, `${p.o}; ${q.o}`);

  // And macports.sh's list is this one, shifted.
  const listed = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--list'], { env: { ...process.env, HARNESS_PORT_SHIFT: '10000' }, encoding: 'utf8' }).stdout.trim().split(',').map(Number);
  check('--list gives every harness port in its runner\'s block', listed.length === all.length && listed.includes(14357) && listed.every((n) => n >= BLOCK && n < 2 * BLOCK), `${listed.length} ports, ${listed[0]}…${listed.at(-1)}`);

  console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
  process.exit(fails ? 1 : 0);
}
