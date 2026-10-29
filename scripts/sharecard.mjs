// The share card (`npm run sharecard`; PLAN.md 34a-5).
//
// What a link to the site unfurls into on Reddit, iMessage, Slack, X or
// Discord is index.html's Open Graph tags and the picture they name. Nothing
// on the site shows either, so nothing else notices when they go wrong: the
// card carried "A psychedelic liquid light show that reacts to your music" for
// a day after the landing page changed its headline (#529), and its og:image
// was the path "/og-card.png", where the protocol asks for a whole URL. This
// holds the tags and the picture to what the services read:
//
//   1. og:title, og:description, og:url, og:site_name and og:image:alt are
//      there and not empty, and twitter:card asks for the large picture;
//   2. og:image is an https URL on chromaglass.art (the one address, PLAN.md
//      23.16) whose path is a file in public/, so the deploy publishes it;
//   3. that file is a JPEG or PNG of exactly the size og:image:width and
//      og:image:height say, and that is 1200 × 630, the 1.91 : 1 every
//      service crops to; and under 300 KB, past which WhatsApp shows the link
//      with no picture;
//   4. the headline the card draws (scripts/brand/words.json, written by
//      scripts/brand/outline.mjs with each line's text beside its shapes) is,
//      word for word, the landing page's h1 (src/components/Landing.tsx).
//
// It cannot see whether the picture looks right or reads small: that is the
// card itself, which is judged by eye at the size a feed shows it. It reads
// the size from the file's own header (a JPEG's SOF segment, a PNG's IHDR),
// not from its name.
//
// So that it cannot pass while reading nothing, each rule first meets a broken
// copy of the real inputs (a mutant) and must turn it red; a rule that passes
// its mutant fails the run. Plain Node, no network: Measure's `logic`.

import fs from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, ROOT));

let failed = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed++;
};

/** Every <meta property|name=… content=…> in the page's head, by key. */
function metas(html) {
  const head = html.slice(0, html.indexOf('</head>'));
  const out = {};
  for (const m of head.matchAll(/<meta\s+([^>]*?)\/?>/g)) {
    const attr = (k) => m[1].match(new RegExp(`${k}="([^"]*)"`))?.[1];
    const key = attr('property') ?? attr('name');
    if (key) out[key] = attr('content');
  }
  return out;
}

/** Width and height from a JPEG's first SOF segment or a PNG's IHDR. */
function size(buf) {
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { type: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length;) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
      // SOF0 to SOF15, less DHT (C4), JPG (C8) and DAC (CC), which share the range.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'jpeg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** The landing page's h1, its JSX text with whitespace folded. */
const h1 = (tsx) => tsx.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/\s+/g, ' ').trim();

/** Each rule: a list of [ok, detail]; ok false is red. */
const RULES = {
  tags: ({ meta }) => [
    ...['og:title', 'og:description', 'og:url', 'og:site_name', 'og:image:alt'].map((k) => [!!meta[k]?.trim(), `${k} ${meta[k] === undefined ? 'missing' : 'empty'}`]),
    [meta['twitter:card'] === 'summary_large_image', `twitter:card is ${meta['twitter:card']}`],
  ],
  address: ({ meta, exists }) => {
    let url = null;
    try { url = new URL(meta['og:image']); } catch { /* a path, or nothing */ }
    return [
      [url?.protocol === 'https:' && url.host === 'chromaglass.art', `og:image is ${meta['og:image']}, not https://chromaglass.art/…`],
      [!!url && exists(url.pathname), `no public${url?.pathname} to publish`],
    ];
  },
  picture: ({ meta, picture }) => {
    const s = picture && size(picture);
    return [
      [!!s, 'the picture is not a JPEG or PNG'],
      [s?.w === 1200 && s?.h === 630, `the picture is ${s?.w} × ${s?.h}, not 1200 × 630`],
      [meta['og:image:width'] === String(s?.w) && meta['og:image:height'] === String(s?.h), `the tags say ${meta['og:image:width']} × ${meta['og:image:height']}, the file ${s?.w} × ${s?.h}`],
      [!!s && meta['og:image:type'] === `image/${s.type}`, `og:image:type is ${meta['og:image:type']} for a ${s?.type}`],
      [!!picture && picture.length < 300 * 1024, `${((picture?.length ?? 0) / 1024).toFixed(0)} KB, past WhatsApp's 300`],
    ];
  },
  headline: ({ words, landing }) => {
    const card = words.headline?.map((l) => l.text).join(' ');
    return [[!!card && card === h1(landing), `the card says "${card}", the landing page "${h1(landing)}"`]];
  },
};

function run(input, quiet) {
  const red = [];
  for (const [name, rule] of Object.entries(RULES)) {
    for (const [ok, detail] of rule(input)) if (!ok) red.push(`${name}: ${detail}`);
  }
  if (!quiet) for (const r of red) console.log(`  ${r}`);
  return red;
}

const html = read('index.html').toString();
const meta = metas(html);
const pathOf = (u) => { try { return new URL(u).pathname; } catch { return null; } };
const real = {
  meta,
  exists: (p) => fs.existsSync(new URL(`public${p}`, ROOT)),
  picture: pathOf(meta['og:image']) && fs.existsSync(new URL(`public${pathOf(meta['og:image'])}`, ROOT))
    ? read(`public${pathOf(meta['og:image'])}`) : null,
  words: JSON.parse(read('scripts/brand/words.json')),
  landing: read('src/components/Landing.tsx').toString(),
};

// Each mutant breaks one thing the way it has broken or could, and names the
// rule that must catch it.
const png = (w, h) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };
const MUTANTS = [
  ['address', 'the old relative path', { meta: { ...meta, 'og:image': '/og-card.jpg' } }],
  ['address', 'another host', { meta: { ...meta, 'og:image': 'https://chromaglass.web.app/og-card.jpg' } }],
  ['address', 'a file not in public/', { exists: () => false }],
  ['tags', 'no og:image:alt', { meta: { ...meta, 'og:image:alt': undefined } }],
  ['tags', 'a small summary card', { meta: { ...meta, 'twitter:card': 'summary' } }],
  ['picture', 'the wrong size', { picture: png(1200, 600), meta: { ...meta, 'og:image:height': '600', 'og:image:type': 'image/png' } }],
  ['picture', 'tags that disagree with the file', { meta: { ...meta, 'og:image:width': '1280' } }],
  ['picture', 'past 300 KB', { picture: Buffer.concat([real.picture ?? Buffer.alloc(0), Buffer.alloc(300 * 1024)]) }],
  ['picture', 'not a picture', { picture: Buffer.from('<!doctype html>') }],
  ['headline', 'the old line', { words: { ...real.words, headline: [{ text: 'A psychedelic liquid light show' }, { text: 'that reacts to your music' }] } }],
  ['headline', 'the landing page moves on', { landing: real.landing.replace(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/, '$1A new headline.$2') }],
];

console.log('mutants (each must be red)');
for (const [rule, what, change] of MUTANTS) {
  const red = run({ ...real, ...change }, true);
  check(red.some((r) => r.startsWith(`${rule}:`)), `${rule} catches ${what}`, red.length ? '' : 'passed');
}

console.log('the real card');
const red = run(real, false);
check(red.length === 0, `index.html's tags and ${meta['og:image']}`);

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\nall ok');
