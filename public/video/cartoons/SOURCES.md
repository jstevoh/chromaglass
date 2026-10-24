# The cartoons that ship with ChromaGlass

Four early cartoons, each the whole film looped, played as dye or as the projector's
film (`src/lib/cartoons.ts`, PLAN 14ab-2). This file records where each copy came
from and why it is free to ship. Add a cartoon here before you add it to the list
in the code.

Checked 2026-10-24. This is a record of what was checked, not legal advice.

## The rule they all rest on

In the United States a film published in 1930 or earlier is in the public domain:
the longest term a published work of that time could hold is 95 years, and it ran
out on 1 January of the 96th year (17 U.S.C. §304). Works from 1928 were freed on
1 January 2024, from 1929 on 1 January 2025, and from 1930 on 1 January 2026
(Duke Law's Center for the Study of the Public Domain, Public Domain Day 2024–2026:
https://cspd.law.duke.edu/publicdomainday/2026/).

Outside the United States: most countries in the Berne Convention, the EU and the UK
among them, apply the rule of the shorter term to a work from a country outside
them, protecting it no longer than its own country does (Berne Art. 7(8); EU Term
Directive Art. 7). Not every country does, so status abroad is likely but not
certain.

What we changed in each copy is cutting, scaling, smoothing the grain, greying and
removing the sound. That adds nothing anyone could own. Each soundtrack is removed
completely: the app has no use for it, and a soundtrack can carry its own
rights (a song or a recording) apart from the picture's.

## The cartoons

| File | Film | Year, maker | Why it is free | Copy used | What was cut |
|---|---|---|---|---|---|
| `skeleton-dance.mp4` | The Skeleton Dance | 1929, Walt Disney Productions (animated by Ub Iwerks) | Published 1929; US public domain 1 Jan 2025 (copyright renewed 1957, so it ran the full 95 years) | Internet Archive `the-skeleton-dance_1929`, its `.ia.mp4` (650×480) | Title card (first 17.7 s) and the end card, from 325.4 s |
| `steamboat-willie.mp4` | Steamboat Willie | 1928, Walt Disney Productions (Ub Iwerks) | Published 1928; US public domain 1 Jan 2024 | Internet Archive `steamboat-willie-16mm-film-scan-4k-lossless`, a scan of an old 16mm print by Reel Revival Film, marked Public Domain Mark 1.0; its 640×480 derivative | Title (first 3.9 s), end from 421.6 s; the film's edges and sprocket holes cropped off (picture at 472×374+63+53) |
| `swing-you-sinners.mp4` | Swing You Sinners! | 1930, Fleischer Studios for Paramount (directed by Dave Fleischer) | Published 1930; US public domain 1 Jan 2026 | Internet Archive `SwingYouSinners`, Public Domain Mark 1.0 (a 1950s television print by U.M.&M. TV Corp.) | The U.M.&M. TV card and the title (first 40.1 s), and its end card from 487.6 s |
| `tantalizing-fly.mp4` | Out of the Inkwell: The Tantalizing Fly | 1919, Max Fleischer for Bray Studios | Published 1919; US public domain since 1995 at the latest | Internet Archive `Fleischer_The_Tantalizing_Fly_1919`, its `.AVI` (480×320) | Title cards (first 14.8 s), end card from 213.4 s; the black border cropped |

## Caveats

- **Trademarks are not copyrights.** Disney still holds trademarks in Mickey Mouse,
  and a trademark lasts as long as it is used. Showing the 1928 film is fine; what
  a trademark forbids is using Mickey (or Disney's name or logo) in a way that says
  Disney made, sponsored or endorsed ChromaGlass. So: no Mickey in the app's
  branding, store pages, icons or marketing, and the cartoons are listed by
  title, not by character. The Duke centre's note on this:
  https://cspd.law.duke.edu/mickey/. The same goes for "Silly Symphony", which is
  only named here as the film's history, never as a label in the app.
- **Only these versions are free.** Later versions of a character (Mickey as drawn
  after 1930, Fleischer's later Betty Boop and Bimbo) are still under copyright.
  Nothing new is drawn from these films; they are only played.
- **Restorations.** The Skeleton Dance's online copies all appear to come from a
  modern digital transfer, not from a print scan; no print scan of it is online.
  In US law a copy has its own copyright only if it adds original authorship, and
  a faithful transfer or clean-up of an old film adds none (the reasoning of
  *Bridgeman Art Library v. Corel*, 1999, for exact copies of public domain
  works), but this is the one copy here that is not a scan of an old print. If a print scan surfaces, swap it in.
  Steamboat Willie was taken from the 16mm print scan rather than one of the
  higher-resolution copies that came from a studio restoration.
- **Not used:** colourised copies (new authorship), "4K remaster" or "AI upscale"
  copies, and anything from Disney+.

## How the files were made

```sh
# cut the cartoon, crop the film's edges where needed, 24 fps, 384 px wide,
# smooth the grain, grey, silent, index at the front for streaming
ffmpeg -ss START -to END -i SOURCE -an \
  -vf "[crop=…,]fps=24,scale=384:-2:flags=lanczos,hqdn3d=6:5:14:12,format=gray,format=yuv420p" \
  -c:v libx264 -preset slower -tune animation -crf 33 -profile:v high -level 3.1 \
  -g 96 -movflags +faststart OUT.mp4
```

The Skeleton Dance and Steamboat Willie at CRF 33, Swing You Sinners at 35 (its motion and grain cost the
most), The Tantalizing Fly at 32. Sizes: 6.1, 5.5, 8.1 and 1.5 MB (MiB), 21.2 MB for the
four. The first pass at 480 px with light smoothing came to 48 MB.
