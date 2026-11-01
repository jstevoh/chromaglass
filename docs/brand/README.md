# Brand files

Everything here is written by `npm run brand` (see `scripts/brand.mjs`); edit
`scripts/brand/art.mjs` and run it again rather than editing these.

| File | For |
|---|---|
| `icon.svg` | The icon at full detail, for anywhere that takes a vector |
| `lockup.svg` | The mark with the name, at full detail (the app's headers use a lighter copy in `src/assets/brand/`) |
| `google-logo-120.png` | Google's sign-in consent screen, which asks for exactly 120 × 120 |
| `avatar-800.png` | Profile pictures — YouTube, TikTok, Workspace — which crop to a circle themselves |
| `store/play-icon-512.png` | Google Play's 512 × 512 listing icon (PLAN 12.6; the App Store takes the iPhone app's own 1024 icon) |
| `store/play-feature-1024x500.png` | Google Play's feature graphic, opaque as Play asks |

The press page's logo downloads, `public/press/logo/`, come from the same run (PLAN 37k).

The wordmark is set in [Jost](https://github.com/indestructible-type/Jost),
under the SIL Open Font License (`scripts/brand/fonts/OFL.txt`).
