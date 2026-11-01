/**
 * How the Mac app is packed (`npm run mac-app`, and `.github/workflows/desktop.yml`).
 *
 * The app is this folder's main.js and preload.cjs, the site as `npm run build`
 * left it in the repo's dist/, and the show server's two files from server/,
 * laid out so the server's own `../dist` finds the site. Nothing is fetched
 * when it runs: that is the "complete cached system" the owner asked for.
 *
 * Signing. A Developer ID build needs the owner's certificate and Apple account,
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
  copyright: 'Copyright © jstevoh',
  // The app's version is the site's (one number for what is inside it), and a
  // release's is set by desktop.yml: the site's major and minor and the run's
  // number, so every release is newer than the last without a version bump in
  // a pull request first (electron-updater only offers a higher version). And
  // whether it was signed, which is what lets main.js install an update in place
  // (desktop/updates.js).
  //
  // And `checkKey`: the public half of a key pair desktop.yml makes for each
  // build and throws away with the runner, so the check of the built app can
  // open the show on a key it signs itself (PLAN.md 23.17d). Nobody holds the
  // private half once the job ends, so the shipped app trusts it for nothing.
  extraMetadata: {
    version: process.env.DESKTOP_VERSION || root.version,
    chromaglass: { signed, ...(process.env.CHROMAGLASS_BUILD_CHECK_KEY ? { checkKey: JSON.parse(process.env.CHROMAGLASS_BUILD_CHECK_KEY) } : {}) },
  },
  directories: { output: 'release', buildResources: 'resources' },
  files: [
    'main.js',
    'updates.js',
    'live.js',
    'liveSession.js',
    'rtmp.js',
    'keys.js',
    'preload.cjs',
    'package.json',
    { from: '../dist', to: 'dist', filter: ['**/*'] },
    { from: '../server', to: 'server', filter: ['remote-server.js', 'artnet.js', 'osc.js', 'abletonLink.js', 'account-shows.js', 'firebase-token.js', 'server-license.js', 'license-key.js'] },
  ],
  // All of it in one archive: Electron reads the site (the server's fs calls)
  // and imports the server (an ES module) from inside it. `npm run desktop --
  // --packaged` is what says so.
  asar: true,
  // Where the app looks for its next version (desktop/updates.js): this repo's
  // GitHub Releases, which desktop.yml publishes to when the owner asks for a
  // release. electron-builder writes this into the app as app-update.yml and
  // writes latest-mac.yml beside the download; it never uploads anything itself
  // (`--publish never` in package.json), so a pull request's build cannot make a
  // release. The repository's newest release must be the app's: another kind of
  // release on this repo would be made with `--latest=false`.
  publish: { provider: 'github', owner: 'jstevoh', repo: 'chromaglass', releaseType: 'release' },
  mac: {
    target: [{ target: 'dmg', arch: ['arm64'] }, { target: 'zip', arch: ['arm64'] }],
    category: 'public.app-category.entertainment',
    // macOS's own icon, drawn on its grid by `npm run brand` (PLAN 13-icon); it
    // was the website's flat 512 tile, edge to edge in the Dock.
    icon: 'resources/icon.icns',
    identity: signed ? undefined : '-',
    hardenedRuntime: signed,
    gatekeeperAssess: false,
    notarize,
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    extendInfo: {
      NSMicrophoneUsageDescription: 'ChromaGlass listens to the music to play the plate. The sound is analysed on this Mac and never recorded or sent anywhere.',
      NSAudioCaptureUsageDescription: 'ChromaGlass listens to your Mac’s system audio so any music or streaming app plays the plate without sharing a browser tab. The sound is analysed on this Mac and never recorded or sent anywhere.',
      NSCameraUsageDescription: 'ChromaGlass can use a camera as a source on the plate (the scene camera and the Mixer).',
      NSLocalNetworkUsageDescription: 'ChromaGlass serves the show to phones (the remote) and network displays on this network, and hears OSC and Art-Net.',
    },
  },
  // The .dmg keeps one name in every release, so the site's "Download for Mac"
  // (src/lib/macApp.ts) is one fixed link to the newest; the zip, which is what
  // an in-place update downloads, keeps its version in its name.
  dmg: { title: 'ChromaGlass ${version}', artifactName: 'ChromaGlass-mac-${arch}.${ext}' },
  // For the check in a Linux cloud session (`npm run desktop -- --packaged`); not shipped.
  linux: { target: 'dir', icon: '../public/icon-512.png', category: 'AudioVideo' },
};
