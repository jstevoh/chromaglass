// actionlint over the workflows, from a pinned release (PLAN.md 19k-3).
//
//   npm run actionlint            lint .github/workflows/*.yml
//   npm run actionlint -- <file>  lint these files instead
//
// What was reported. CLAUDE.md's table asked every session that touched a
// workflow to run `actionlint`, and no session could: it was not in the
// repository and the one cloud session that tried to fetch it was refused
// (19k's, 2026-10-26). A check nobody can run is a line in a table. A workflow
// with a context that is not there (`${{ github.evnt.name }}`), a `needs` that
// names no job or a step with two `run`/`uses` is a deploy that never starts,
// and it was found by pushing.
//
// What this does. Fetches the release below once, from GitHub's release page
// for this platform, holds it to the sha256 written here (copied from the
// release's own `checksums.txt`, so a changed asset, or a changed address, is
// red and not run), keeps it in `scratch/actionlint/<version>/`, and runs it
// over the workflows. Pinned, so the lint is the same in a session, on the
// owner's Mac and in CI, and moves when someone moves the pin.
//
// Not run: shellcheck and pyflakes, which actionlint runs when it finds them
// on the path. Ubuntu's runner has shellcheck and a cloud session or a Mac
// does not, so the same workflow would be green in one place and red in
// another, with a different shellcheck release saying different things. The
// `run:` blocks are bash that the workflow's own jobs exercise on every push.
//
// The control. The first thing it does with the binary is lint a workflow
// written to be wrong in the three ways above and require a red that names
// each, so a binary that finds nothing (a stub, a wrong platform's, a flag
// that turned the rules off) cannot make the real run green.

import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = '1.7.7';
// From actionlint_1.7.7_checksums.txt in the release.
export const SHA256 = {
  'darwin_amd64': '28e5de5a05fc558474f638323d736d822fff183d2d492f0aecb2b73cc44584f5',
  'darwin_arm64': '2693315b9093aeacb4ebd91a993fea54fc215057bf0da2659056b4bc033873db',
  'linux_amd64': '023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757',
  'linux_arm64': '401942f9c24ed71e4fe71b76c7d638f66d8633575c4016efd2977ce7c28317d0',
};

const plat = `${process.platform}_${{ x64: 'amd64', arm64: 'arm64' }[process.arch] ?? process.arch}`;
if (!SHA256[plat]) {
  console.log(`FAIL no pinned actionlint for ${plat} (${Object.keys(SHA256).join(', ')})`);
  process.exit(1);
}
const dir = path.join(ROOT, 'scratch', 'actionlint', VERSION);
const bin = path.join(dir, 'actionlint');

function fetchBinary() {
  fs.mkdirSync(dir, { recursive: true });
  const tgz = path.join(dir, `${plat}.tar.gz`);
  // curl, not Node's fetch: it takes the proxy a cloud session sets up, and
  // retries a dropped connection.
  execFileSync('curl', ['-fsSL', '--retry', '4', '--retry-delay', '3', '--max-time', '120', '-o', tgz,
    `https://github.com/rhysd/actionlint/releases/download/v${VERSION}/actionlint_${VERSION}_${plat}.tar.gz`], { stdio: 'inherit' });
  const got = crypto.createHash('sha256').update(fs.readFileSync(tgz)).digest('hex');
  if (got !== SHA256[plat]) {
    fs.rmSync(tgz);
    console.log(`FAIL the release for ${plat} is ${got}, not the ${SHA256[plat]} this script pins`);
    process.exit(1);
  }
  execFileSync('tar', ['-xzf', tgz, '-C', dir, 'actionlint']);
  fs.rmSync(tgz);
}
if (!fs.existsSync(bin)) fetchBinary();

const lint = (files) => spawnSync(bin, ['-no-color', '-shellcheck=', '-pyflakes=', ...files], { cwd: ROOT, encoding: 'utf8' });

// The control: three mistakes, each of which actionlint has a rule for.
const bad = `name: wrong
on: push
jobs:
  one:
    runs-on: ubuntu-latest
    steps:
      - run: echo \${{ github.evnt.name }}
  two:
    needs: [nobody]
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
        uses: actions/checkout@v5
`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'actionlint-'));
const control = path.join(tmp, 'wrong.yml');
fs.writeFileSync(control, bad);
const c = lint([control]);
fs.rmSync(tmp, { recursive: true, force: true });
const out = `${c.stdout}${c.stderr}`;
const wants = [[/evnt/, 'a context that is not there'], [/nobody/, 'a needs that names no job'], [/wrong\.yml:1[1-4]:/, 'a step with both run and uses']];
const missed = wants.filter(([re]) => !re.test(out)).map(([, w]) => w);
console.log(`${c.status === 1 && !missed.length ? ' ok  ' : 'FAIL'} the control, a workflow with three mistakes, is red and names each (exit ${c.status}${missed.length ? `; not named: ${missed.join(', ')}` : ''})`);
if (c.status !== 1 || missed.length) { console.log(out.slice(0, 1500)); process.exit(1); }

const files = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(path.join(ROOT, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f)).map((f) => `.github/workflows/${f}`);
const r = lint(files);
process.stdout.write(r.stdout);
process.stderr.write(r.stderr);
console.log(`${r.status === 0 ? ' ok  ' : 'FAIL'} actionlint ${VERSION} over ${files.length} workflow${files.length === 1 ? '' : 's'}${r.status === 0 ? '' : ` (exit ${r.status})`}`);
process.exit(r.status === 0 ? 0 : 1);
