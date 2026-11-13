#!/usr/bin/env node
// The phone's page to link a TV (src/components/phone/TvLink.tsx, PLAN.md 12-tv-signin).
//
// `npm run tvlink` renders the real page in Chromium at a phone's size and drives it the
// way a player would, with the account and the licence Worker stood in for: the page's
// own `lib/firebaseAuth` is swapped for a signed-in stub at bundle time, and the Worker's
// `/tv/claim` is answered by a route that records what the phone sent. What it asserts is
// what the player can and cannot do on the page, read from the page and the request:
//
//  - a code typed by hand is formatted as it is typed, and sent once it is whole, with
//    the account's token, as the Worker reads it;
//  - a code that arrived in the address (`?tvlink=…`, the QR a TV shows, or a link anyone
//    could send) is not sent on one tap: the button stays off until the player ticks that
//    the TV in front of them shows it. The review of the first version found that a
//    prefilled code was a one-tap phish (someone sends their own TV's code, the victim's
//    licence lands on it);
//  - a code edited away from the one in the address is a typed code again.
//
// The page is bundled here with esbuild rather than built with Vite: the check is about
// this page's behaviour, and a Vite build has no Firebase keys, so the real page never
// leaves its sign-in step there (it says so, and `npm run phone` builds that path).

import { build } from 'esbuild';
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? ' ok  ' : ' FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const stubAuth = {
  name: 'stub-auth',
  setup(b) {
    b.onResolve({ filter: /lib\/firebaseAuth$|^\.\/firebaseAuth$|^\.\.\/\.\.\/lib\/firebaseAuth$/ }, () => ({ path: 'stub-auth', namespace: 'stub' }));
    // The sign-in form is never shown to a signed-in player, but a build with a key
    // bundles it, and it starts Firebase when its module loads: stubbed the same way.
    b.onResolve({ filter: /^\.\.\/SignInScreen$/ }, () => ({ path: 'stub-signin', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
      contents: a.path === 'stub-signin'
        ? `export const SignInForm = () => null;`
        : `export const getCurrentUserEmail = async () => 'fan@example.com';
           export const getCurrentIdToken = async () => 'id-token-of-fan';`,
      loader: 'js',
    }));
  },
};

const out = await build({
  stdin: {
    contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
               import TvLink from './src/components/phone/TvLink';
               createRoot(document.getElementById('root')).render(React.createElement(TvLink));`,
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true,
  format: 'iife',
  write: false,
  jsx: 'automatic',
  plugins: [stubAuth],
  define: {
    // A key, as the site's build has: the page reaches the account (and the form) only
    // in a build with one, so a build without one carries no Firebase (`npm run signin`,
    // 1a). With "" here the page stopped at its sign-in step and every check below timed out.
    'import.meta.env.VITE_FIREBASE_API_KEY': '"test-key"',
    'import.meta.env.VITE_FIREBASE_LICENSES_URL': '"https://licence.test/keys"',
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'silent',
});
const script = out.outputFiles[0].text;

const browser = await launchChromium(chromium);
try {
  async function open(query) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
    const page = await ctx.newPage();
    const sent = [];
    await page.route('https://chromaglass.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="root"></div>' }));
    await page.route('https://licence.test/**', async (r) => {
      const req = r.request();
      sent.push({ url: req.url(), auth: req.headers().authorization, body: req.postDataJSON() });
      await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: JSON.stringify({ ok: true, tier: 'home' }) });
    });
    await page.goto(`https://chromaglass.test/${query}`);
    await page.addScriptTag({ content: script });
    await page.waitForSelector('[data-cg-tvcode]', { timeout: 10_000 });
    return { ctx, page, sent };
  }
  const sendOff = (page) => page.$eval('[data-cg-tvsend]', (b) => b.disabled);

  {
    const { ctx, page, sent } = await open('?tvlink');
    await page.fill('[data-cg-tvcode]', '');
    await page.type('[data-cg-tvcode]', 'bdkm qxt');
    const part = await page.inputValue('[data-cg-tvcode]');
    const offPart = await sendOff(page);
    await page.type('[data-cg-tvcode]', 'z');
    const whole = await page.inputValue('[data-cg-tvcode]');
    check('a typed code is formatted as it is typed, and the button waits for all eight letters',
      part === 'BDKM-QXT' && whole === 'BDKM-QXTZ' && offPart && !(await sendOff(page)), `${part} → ${whole}`);
    check('a typed code asks no extra question', (await page.$('[data-cg-tvsure]')) === null);
    await page.click('[data-cg-tvsend]');
    await page.waitForSelector('[data-cg-tvdone]', { timeout: 5000 }).catch(() => {});
    check('and is sent to the Worker\'s /tv/claim with the account\'s token, as the Worker reads it',
      sent.length === 1 && sent[0].url === 'https://licence.test/tv/claim' && sent[0].auth === 'Bearer id-token-of-fan'
        && sent[0].body?.userCode?.replace('-', '') === 'BDKMQXTZ' && (await page.$('[data-cg-tvdone]')) !== null,
      JSON.stringify(sent));
    await ctx.close();
  }
  {
    const { ctx, page, sent } = await open('?tvlink=bdkmqxtz');
    const filled = await page.inputValue('[data-cg-tvcode]');
    const asked = (await page.$('[data-cg-tvsure]')) !== null;
    const offBefore = await sendOff(page);
    // A tap on the disabled button, and Enter in the field, must both send nothing.
    await page.click('[data-cg-tvsend]', { force: true });
    await page.press('[data-cg-tvcode]', 'Enter');
    await page.waitForTimeout(300);
    check('a code from the address is filled in, but asks first and sends nothing on a tap or Enter',
      filled === 'BDKM-QXTZ' && asked && offBefore && sent.length === 0, `filled ${filled}, asked ${asked}, sent ${sent.length}`);
    await page.check('[data-cg-tvsure] input');
    const onAfter = !(await sendOff(page));
    await page.click('[data-cg-tvsend]');
    await page.waitForSelector('[data-cg-tvdone]', { timeout: 5000 }).catch(() => {});
    check('once the player ticks that the TV in front of them shows it, it is sent',
      onAfter && sent.length === 1 && sent[0].body?.userCode?.replace('-', '') === 'BDKMQXTZ', JSON.stringify(sent));
    await ctx.close();
  }
  {
    const { ctx, page } = await open('?tvlink=BDKMQXTZ');
    await page.fill('[data-cg-tvcode]', 'cfgh-jklm');
    check('a code edited away from the address\'s is a typed code again',
      (await page.$('[data-cg-tvsure]')) === null && !(await sendOff(page)));
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
