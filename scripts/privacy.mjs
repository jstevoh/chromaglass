#!/usr/bin/env node
/**
 * Does the privacy page still say where everything that leaves the machine goes?
 *
 *   npm run privacy
 *
 * PLAN.md 23.13. A privacy page is a list of claims about the code ("lyrics go
 * to LRCLIB", "crash reports are only sent when you press Send"), and the code
 * moves every day while the page is written once. The failure this check is
 * for is the quiet one: a PR adds a fetch to a new service, or a new
 * build-time service URL, and the page goes on promising the old list. So it
 * reads the code, not the page's own say-so:
 *
 *   1. every host named in the app's code and its servers (src/, index.html,
 *      the service worker, server/), outside comments, is named on the page,
 *      unless it is on LINK_ONLY below with the reason it is never fetched;
 *   2. every `VITE_…` service the app is built with is described on the page
 *      (SERVICES below maps each to the words that describe it), and a new
 *      one with no entry fails rather than passing unseen;
 *   3. the page says what 23.13 asks of it: the email and the account id are
 *      kept, nothing is sold, and deleting the account deletes them;
 *   4. neither page still carries an OWNER mark in double braces, anywhere
 *      in the file (an href or a comment included), so a half-written page
 *      cannot merge and go live.
 *
 * A host built at run time is caught where it can be: a URL whose host is a
 * template (`https://${…}`) must be on TEMPLATE_HOSTS with what it is, and a
 * server's `env.…_HOST` or `env.…_URL` must be on ENV_HOSTS with the words the
 * page uses for it, so a new one fails rather than passing unseen. What it
 * still cannot see: a service a dependency calls on its own. Firebase
 * Authentication is the one that matters, and it is named by its
 * VITE_FIREBASE_ keys (2) once 23.10 adds them, and by ALWAYS below.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const PRIVACY = 'public/privacy.html';
const TERMS = 'public/terms.html';
const text = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
// The page as a reader sees it: the explanatory comment at the top names
// things for the next person editing it and must not count as the page
// telling the reader.
const visible = (html) => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const page = visible(text(PRIVACY));

/**
 * Hosts that appear in the code but are never fetched, each with why. Only on
 * a line that does not fetch: the same host in a fetch(), a WebSocket, an
 * import() or a src= counts as reached, so listing a host here for its links
 * cannot hide a request to it added later.
 */
const LINK_ONLY = {
  'archive.org': 'the music library credits each track with a link to its page',
  'creativecommons.org': "each track's licence, as a link",
  'github.com': 'links to the source, and the name LRCLIB asks clients to send',
  'www.w3.org': 'the SVG namespace string; nothing is fetched from it',
};
/** Hosts the page names by the service's name rather than its address. */
const NAMED_AS = { 'api.audd.io': 'AudD', 'audd.io': 'AudD' };
/** Build-time services: VITE_ key (or prefix ending _) → words the page uses for it. */
const SERVICES = {
  VITE_FINGERPRINT_PROXY_URL: 'Song identification',
  VITE_CRASH_REPORT_URL: 'Crash reports',
  VITE_FIREBASE_: 'Firebase Authentication',
};
/** A server's host or URL from its environment → the words the page uses for it. */
const ENV_HOSTS = {
  ACR_HOST: 'ACRCloud', // the song identification Worker's second service
  ARTNET_HOST: 'Art-Net', // the show server's lighting output, on the person's own network
};
/**
 * URLs whose host is filled in at run time (`http://${…}`), by the expression
 * that fills it → what it is. Each is an address on the person's own network
 * or a server's environment (ENV_HOSTS); a new one fails until it is placed.
 */
const TEMPLATE_HOSTS = {
  'env.ACR_HOST': 'ENV_HOSTS',
  'info.hosts[0]': 'own network: the show server\'s LAN address, for the phone',
  'raw': 'own network: the laptop address the person types into the phone',
  'host': 'own network: the show server printing its LAN address at start',
  'lanHost': 'own network: the show server\'s LAN address in the Cast menu, for a network display (14m-https)',
};
/** What every visitor reaches whatever the code says: the hosts of the site itself and its fonts. */
const ALWAYS = ['fonts.gstatic.com', 'Firebase Hosting', 'Cloudflare'];

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.svg'].includes(extname(p))) files.push(p);
  }
};
walk('src'); walk('server');
files.push('index.html', 'public/sw.js');

const hosts = new Map(); // host → first file:line
const fetched = new Map(); // host → first file:line that requests something
const envKeys = new Map();
const envHosts = new Map();
const templates = new Map(); // the expression a URL's host is built from → file:line
// A line that asks for something rather than linking to it.
const REQUESTS = /\bfetch\(|WebSocket\(|EventSource\(|\bimport\(|\bsrc\s*=|sendBeacon\(|XMLHttpRequest/;
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const t = line.trim();
    // Whole comment lines (`//`, a block comment's ` * ` lines). A block
    // comment that opens on a line with code is cut out below instead, so
    // `/* x */ fetch(…)` still counts.
    if (t.startsWith('//') || t.startsWith('*')) return;
    const code = line.replace(/\/\*.*?(\*\/|$)/g, ' ').replace(/\s\/\/\s.*$/, '');
    const at = `${f}:${i + 1}`;
    for (const m of code.matchAll(/(?:(?:https?|wss?):)?\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) {
      // A bare `//host` counts only as a protocol-relative URL in quotes.
      if (!m[0].includes(':') && !/['"`(]$/.test(code.slice(0, m.index))) continue;
      const h = m[1].toLowerCase();
      if (!hosts.has(h)) hosts.set(h, at);
      if (REQUESTS.test(code) && !fetched.has(h)) fetched.set(h, at);
    }
    for (const m of code.matchAll(/(?:https?|wss?):\/\/\$\{([^}]+)\}/gi)) {
      if (!templates.has(m[1].trim())) templates.set(m[1].trim(), at);
    }
    if (f.startsWith('server')) {
      for (const m of code.matchAll(/\benv\.([A-Z0-9_]+_(?:HOST|URL))\b/g)) if (!envHosts.has(m[1])) envHosts.set(m[1], at);
    }
    if (f.startsWith('src') || f === 'index.html') {
      for (const m of code.matchAll(/\bVITE_[A-Z0-9_]+/g)) if (!envKeys.has(m[0])) envKeys.set(m[0], at);
    }
  });
}

// 1. Hosts.
check('the code names hosts at all (the scan reads something)', hosts.size >= 3, `${hosts.size} hosts in ${files.length} files`);
// An address on the person's own network (the phone link's example
// address, localhost) is theirs, not a service: the page covers it once, as
// "your own network".
const ownNetwork = (h) => /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
check('the page says the phone link stays on your own network', page.includes('your own network'));
const linkOnly = (h) => h in LINK_ONLY && !fetched.has(h);
const unnamed = [...hosts].filter(([h]) => !linkOnly(h) && !ownNetwork(h) && !page.includes(NAMED_AS[h] ?? h));
check('every host the code reaches is named on the privacy page', unnamed.length === 0,
  unnamed.length ? unnamed.map(([h, at]) => `${h} (${fetched.get(h) ?? at})`).join(', ') : [...hosts.keys()].filter((h) => !linkOnly(h) && !ownNetwork(h)).join(', '));
const staleLinkOnly = Object.keys(LINK_ONLY).filter((h) => !hosts.has(h));
check('every link-only host is still in the code', staleLinkOnly.length === 0, staleLinkOnly.join(', '));
const unplaced = [...templates].filter(([e]) => !(e in TEMPLATE_HOSTS));
check('every URL with a run-time host is placed', unplaced.length === 0,
  unplaced.length ? unplaced.map(([e, at]) => `\${${e}} (${at})`).join(', ') : [...templates.keys()].join(', '));
const envUnknown = [...envHosts].filter(([k]) => !(k in ENV_HOSTS));
const envUnnamed = [...envHosts].filter(([k]) => k in ENV_HOSTS && !page.includes(ENV_HOSTS[k]));
check("every server's host from its environment is named on the privacy page",
  envUnknown.length === 0 && envUnnamed.length === 0,
  envUnknown.length || envUnnamed.length
    ? [...envUnknown.map(([k, at]) => `${k} has no entry (${at})`), ...envUnnamed.map(([k]) => `${ENV_HOSTS[k]} (${k})`)].join(', ')
    : [...envHosts.keys()].join(', '));
const missing = ALWAYS.filter((w) => !page.includes(w));
check('the page names the site\'s own hosts and its fonts', missing.length === 0, missing.join(', '));

// 2. Build-time services.
const serviceFor = (k) => Object.keys(SERVICES).find((s) => (s.endsWith('_') ? k.startsWith(s) : k === s));
const unknown = [...envKeys].filter(([k]) => !serviceFor(k));
check('every VITE_ service the app is built with has an entry', unknown.length === 0,
  unknown.length ? unknown.map(([k, at]) => `${k} (${at})`).join(', ') : [...envKeys.keys()].join(', '));
const undescribed = [...new Set([...envKeys.keys()].map(serviceFor).filter(Boolean))].filter((s) => !page.includes(SERVICES[s]));
check('every such service is described on the privacy page', undescribed.length === 0, undescribed.map((s) => SERVICES[s]).join(', '));

// 3. What 23.13 asks the page to say.
const says = [
  ['the email is kept', /email address/i],
  ['the account id is kept', /account id/i],
  ['nothing is sold', /do not sell/i],
  ['deleting the account deletes it', /Delete account[\s\S]*deletes your account/i],
];
for (const [what, re] of says) check(`the privacy page says ${what}`, re.test(page));
check('the privacy page and the terms link to each other',
  text(PRIVACY).includes('href="/terms.html"') && text(TERMS).includes('href="/privacy.html"'));

// 4. Nothing left for the owner to fill.
for (const f of [PRIVACY, TERMS]) {
  // The raw file, not what a reader sees: a mark left in an href or a meta
  // tag is as unfinished as one in a paragraph.
  const left = [...text(f).matchAll(/\{\{OWNER:\s*([^}]*)\}\}/g)].map((m) => m[1].trim());
  check(`${f} exists with nothing left for the owner to fill`, existsSync(f) && left.length === 0,
    existsSync(f) ? left.join('; ') : 'missing');
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
