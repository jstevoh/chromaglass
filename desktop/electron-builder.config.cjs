/**
 * How the Mac app is packed (`npm run mac-app`, and `.github/workflows/desktop.yml`).
 *
 * The app is this folder's main.js and preload.cjs, the site as `npm run build`
 * left it in the repo's dist/, and the show server's two files from server/,
 * laid out so the server's own `../dist` finds the site. Nothing is fetched
 * when it runs: that is the "complete cached system" Steve asked for.
 *
 * Signing. A Developer ID build needs Steve's certificate and Apple account,
 * which a cloud session and CI do not have until they are added as secrets
 * (CSC_LINK, CSC_KEY_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD,
 * APPLE_TEAM_ID; desktop/README.md). Without them the app is signed ad hoc,
 * which an Apple silicon Mac needs to run it at all, and macOS asks once, in
 * Privacy & Security, before opening an app from an unidentified developer.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const signed = !!process.env.CSC_LINK || !!process.env.CSC_NAME;
const notarize = signed && !!process.env.APPLE_TEAM_ID;

module.exports = {
  appId: 'app.chromaglass.desktop',
  productName: 'ChromaGlass',
  copyright: 'Copyright © James Higgins',
  // The app's version is the site's: one number for what is inside it.
  extraMetadata: { version: root.version },
  directories: { output: 'release', buildResources: 'resources' },
  files: [
    'main.js',
    'preload.cjs',
    'package.json',
    { from: '../dist', to: 'dist', filter: ['**/*'] },
    { from: '../server', to: 'server', filter: ['remote-server.js', 'artnet.js'] },
  ],
  // All of it in one archive: Electron reads the site (the server's fs calls)
  // and imports the server (an ES module) from inside it. `npm run desktop --
  // --packaged` is what says so.
  asar: true,
  // No auto-update feed: a new build is a new download (desktop/README.md).
  publish: null,
  mac: {
    target: [{ target: 'dmg', arch: ['arm64'] }, { target: 'zip', arch: ['arm64'] }],
    category: 'public.app-category.entertainment',
    icon: '../public/icon-512.png',
    identity: signed ? undefined : '-',
    hardenedRuntime: signed,
    gatekeeperAssess: false,
    notarize,
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    extendInfo: {
      NSMicrophoneUsageDescription: 'ChromaGlass listens to the music to play the plate. The sound is analysed on this Mac and never recorded or sent anywhere.',
      NSCameraUsageDescription: 'ChromaGlass can use a camera as a source on the plate (the scene camera and the Mixer).',
      NSLocalNetworkUsageDescription: 'ChromaGlass serves the show to phones (the remote) and network displays on this network, and hears OSC and Art-Net.',
    },
  },
  dmg: { title: 'ChromaGlass ${version}' },
  // For the check in a Linux cloud session (`npm run desktop -- --packaged`); not shipped.
  linux: { target: 'dir', icon: '../public/icon-512.png', category: 'AudioVideo' },
};
