// How the scripts that read GitHub's API (`flakes.mjs`, `macqueue.mjs`) call
// curl, without the owner's token ever reaching a log.
//
// What was reported: `npm run flakes` on the owner's machine hit a transient
// 502 from the Actions API, and the error it died with printed the owner's
// GitHub token. Both scripts passed the token to curl as an argument,
// `-H "Authorization: Bearer <token>"`, and when a child process fails Node
// builds its error message from the whole command line ("Command failed:
// curl -fsSL --retry 3 -H Authorization: Bearer ghp_…") and keeps the
// argument list on the error as `cmd` and `spawnargs`. A top-level await that
// rejects prints all of it. The same argument list is also readable by any
// process on the machine for as long as curl runs (`ps`).
//
// So the header goes to curl on its standard input, as a one-line config
// (`-K -`), and never on the command line: there is nothing in the arguments
// to print. And every error that leaves here is a new one, built from curl's
// exit code and its stderr with anything that looks like a token taken out,
// in case a future flag (`-v` prints the request's headers) or a server
// echoing the request puts one back. Redaction alone would have been the
// obvious fix, but it only catches the shapes it knows; an argument that is
// never written cannot be printed in any shape.
//
// `node scripts/ghapi.mjs --selftest` (`npm run ghapi`) checks it against a
// server of its own that answers 502, and checks that the old way leaks on
// the same server, so the check can see a leak at all.

import { spawn, execFileSync, execFile } from 'node:child_process';
import { inspect, promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const tokens = () => [process.env.GH_TOKEN, process.env.GITHUB_TOKEN].filter((t) => t && t.length >= 8);

/**
 * The text with every token taken out: the ones in the environment, by
 * value, and anything shaped like a GitHub token or an Authorization header,
 * whatever its value, so a token from somewhere else is caught too.
 */
export function redact(text) {
  let s = String(text ?? '');
  for (const t of tokens()) s = s.split(t).join('[token]');
  return s
    .replace(/\b(gh[opsur]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})/g, '[token]')
    .replace(/(authorization\s*[:=]\s*"?)(bearer|token|basic)?\s*[^\s"']+/gi, '$1[redacted]')
    .replace(/\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]');
}

/** curl's arguments and its standard input for one GET: the token only in the input. */
export function curlCall(url) {
  const token = process.env.GH_TOKEN;
  const args = ['-fsSL', '--retry', '3', '-H', 'Accept: application/vnd.github+json'];
  // `-K -` reads options from stdin. Without a token there is no stdin to
  // read, and curl is asked nothing it would wait on.
  if (token) args.push('-K', '-');
  args.push(url);
  return { args, input: token ? `header = "Authorization: Bearer ${token.replace(/["\\]/g, '')}"\n` : '' };
}

const failure = (url, code, stderr) => {
  const e = new Error(redact(`curl ${url} failed (exit ${code}): ${String(stderr).trim()}`));
  e.code = code;
  e.stderr = redact(stderr);
  return e;
};

/** GET `url` through curl; resolves with the body, rejects with a redacted error. */
export function ghCurl(url, { maxBuffer = 1 << 28 } = {}) {
  const { args, input } = curlCall(url);
  return new Promise((resolve, reject) => {
    const child = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let size = 0, err = '';
    child.stdout.on('data', (b) => {
      size += b.length;
      if (size > maxBuffer) child.kill();
      else out.push(b);
    });
    child.stderr.on('data', (b) => { err += b; });
    child.on('error', (e) => reject(failure(url, e.code ?? 'spawn', e.message)));
    child.on('close', (code) => {
      if (size > maxBuffer) reject(failure(url, 'maxBuffer', `more than ${maxBuffer} bytes`));
      else if (code !== 0) reject(failure(url, code, err));
      else resolve(Buffer.concat(out).toString());
    });
    child.stdin.end(input);
  });
}

/** The same, synchronously, for a script with no awaits (`macqueue.mjs`). */
export function ghCurlSync(url, { maxBuffer = 1 << 28 } = {}) {
  const { args, input } = curlCall(url);
  try {
    return execFileSync('curl', args, { input, maxBuffer, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  } catch (e) {
    // execFileSync's error carries the arguments and stdin's neighbours; none
    // of it leaves, only the code and the stderr, redacted.
    throw failure(url, e.status ?? e.code, e.stderr ?? e.message);
  }
}

async function selftest() {
  const FAKE = 'ghp_' + 'Z9'.repeat(18);
  process.env.GH_TOKEN = FAKE;
  // The server is on this machine; a cloud session's proxy must not be asked.
  process.env.NO_PROXY = process.env.no_proxy = '127.0.0.1,localhost';
  // The server runs in a process of its own: `ghCurlSync` blocks this one's
  // event loop until curl returns, so a server here could never answer it.
  // It echoes the request's headers in the 502's body, as a misbehaving proxy
  // might, and says at /seen what Authorization header it was last sent.
  const server = spawn(process.execPath, ['--input-type=module', '-e', `
    import { createServer } from 'node:http';
    let seen = '';
    const s = createServer((req, res) => {
      if (req.url === '/seen') return res.end(seen);
      seen = req.headers.authorization ?? '';
      if (req.url === '/ok') res.end(JSON.stringify({ ok: true }));
      else { res.statusCode = 502; res.end('bad gateway; you sent ' + seen); }
    });
    s.listen(0, '127.0.0.1', () => console.log(s.address().port));
  `], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((r, no) => {
    server.stdout.once('data', (b) => r(Number(String(b).trim())));
    server.once('exit', (code) => no(new Error(`the test server stopped before it listened (exit ${code})`)));
  });
  const base = `http://127.0.0.1:${port}`;
  const seen = async () => (await promisify(execFile)('curl', ['-fsS', `${base}/seen`])).stdout;
  let failed = 0;
  const check = (name, ok, detail) => {
    console.log(`${ok ? ' ok  ' : ' FAIL'} ${name} — ${String(detail).replace(/\s+/g, ' ')}`);
    if (!ok) failed++;
  };
  // Everything Node would print for an uncaught error, and a little more.
  const printed = (e) => [inspect(e, { depth: 5, showHidden: true }), String(e), e?.stack, JSON.stringify(e)].join('\n');
  const leaks = (s) => s.includes(FAKE) || s.includes(FAKE.slice(4, 24));
  try {
    const body = await ghCurl(`${base}/ok`);
    const sent = await seen();
    check('the token still reaches the API', JSON.parse(body).ok === true && sent === `Bearer ${FAKE}`,
      `body ${body.trim()}, the server saw ${sent === `Bearer ${FAKE}` ? 'the bearer header' : JSON.stringify(redact(sent))}`);
    check('the token is not on curl\'s command line', !curlCall(`${base}/x`).args.some(leaks),
      `arguments ${curlCall(`${base}/x`).args.join(' ')}`);

    let e = null;
    try { await ghCurl(`${base}/bad`); } catch (x) { e = x; }
    check('a 502 rejects, and what it prints carries no token', e != null && !leaks(printed(e)) && /error: 502/.test(e.stderr),
      e ? `printed ${printed(e).length} chars: ${String(e.message).slice(0, 120)}` : 'did not reject');

    e = null;
    try { ghCurlSync(`${base}/bad`); } catch (x) { e = x; }
    check('the same, synchronously', e != null && !leaks(printed(e)) && /error: 502/.test(e.stderr),
      e ? String(e.message).slice(0, 120) : 'did not throw');

    // The control: the way both scripts called curl before, on the same
    // server. If this does not leak, the checks above could not see one.
    e = null;
    try {
      await promisify(execFile)('curl', ['-fsSL', '-H', `Authorization: Bearer ${FAKE}`, `${base}/bad`]);
    } catch (x) { e = x; }
    check('control: the old way leaks the token into its error, and the check sees it', e != null && leaks(printed(e)),
      e ? `old error message begins "${redact(String(e.message).slice(0, 70))}"` : 'did not reject');

    const cases = [
      [`Command failed: curl -H Authorization: Bearer ${FAKE} url`, FAKE],
      ['authorization: token gho_' + 'a'.repeat(36), 'gho_'],
      ['header = "Authorization: Bearer github_pat_' + 'B'.repeat(40) + '"', 'github_pat_'],
      ['Bearer abc.def-ghi_jkl', 'abc.def'],
    ];
    const missed = cases.filter(([s, secret]) => redact(s).includes(secret));
    check('redact takes out tokens of every shape it is shown', missed.length === 0,
      `${cases.length - missed.length} of ${cases.length}${missed.length ? `; missed ${missed.map(([s]) => s.slice(0, 30)).join(', ')}` : ''}`);
    const plain = 'GET /repos/x/actions/runs?per_page=100 returned error: 502';
    check('redact leaves an ordinary line alone', redact(plain) === plain, redact(plain));
  } finally {
    server.kill();
  }
  console.log(failed ? `\n${failed} FAIL` : '\nall ok');
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv.includes('--selftest')) await selftest();
