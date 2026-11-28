# reelreader, the link watcher

A command-line tool that watches a video (a file, or a link) and turns it into pictures and
numbers that a person or Claude can read: contact sheets, a slit-scan timeline of the whole
clip, and measures of how it looks and moves. It reads **how a video looks and moves**, not what
is in it: no people, objects, text or speech. When Claude uses it as a skill, Claude reads that
from the sheets itself.

It began as ChromaGlass's way of judging its own plate against real liquid light shows, and is
being packaged for anyone who studies moving pictures as **reelreader**, under the MIT licence
(PLAN §47p; this repository's own licence is separate). This page is its front page;
[watch-words.md](../reelreader/skill/watch-words.md) is the vocabulary its words come from, and
[watch-plugin-plan.md](watch-plugin-plan.md) the plan for shipping it as a Claude Code plugin. Its judging skill (how to read what it makes, honestly, for an editor, a colourist,
a VJ or anyone), with a test set of clips with known answers, is
[reelreader/skill/](../reelreader/skill/SKILL.md).

## What it makes

From one clip, in its out folder:

- `sheet-N.png`: frames at even intervals plus every hard cut, each stamped with its time.
- `timeline.png`: the centre column of every sampled frame side by side (time runs left to
  right), with motion, loudness and cuts under it.
- `stats.tsv` and `summary.md`: brightness, dark share, saturation, motion and loudness per
  frame; a design read (palette, colourfulness, contrast, edge width, form scale, flow lines,
  symmetry, composition); a physics read (flow speed, turning, spreading, lifetime, detail);
  how motion follows the sound; and a plain-language account.
- `design.json`, `palette.png`: the reads as data, for comparing two films.

```
node scripts/watch.mjs <file or URL> [--out DIR] [--from S] [--to S] [--crop x,y,w,h]
node scripts/watch.mjs <file> --vs <reference>          # the gaps against a reference, biggest first
node scripts/watch.mjs --before A --after B             # what changed between two films
node scripts/watch.mjs <file> --keep NAME               # keep it in the reference library
node scripts/watch.mjs <file> --liquid | --general      # the liquid or the general read, whatever the footage shows
node scripts/watch.mjs --refs | --selftest
```

In this repository `npm run watch -- …` runs the same thing.

## Liquid or general

Most footage gets a **general read**: the design read, the overall arc, a **Motion** section
(on-screen speed, how much is the camera, zoom, roll, how long a view holds, detail) and
words from film, design and colour theory. A **liquid read** adds what was calibrated on
real liquid light shows: the physics read (the fluid's own flow, carried against fading,
turnover), the technique guesses, the seven-canon report card, the wet show's words (cells,
marbling, a pour) and, with a settings map, "Settings to try". The tool reads a clip as
liquid only when it shows one: one take (at most 2 hard cuts a minute), motion of its own
rather than a camera move, and coloured light on a dark ground; or when the page names a
liquid technique and two of those hold. The summary's **Read as** line says which it chose
and the numbers that chose it. `--liquid` or `--general` decides instead, and so does the
config's `mode` (`auto`, `liquid` or `general`). Measured on real films and the rules:
`scripts/watchmode.mjs`; held by `npm run watchmode`.

## What it needs

Node 20 or later and `ffmpeg` (with `ffprobe`) on the PATH; `yt-dlp` only for links. No npm
packages: the scripts import only Node's own modules.

`--selftest` and its two neighbours (`npm run watchwords`, `npm run watchcard`) make their own
clips, so their ffmpeg needs the `libvpx` encoder and `libvorbis` or `libopus` for the sound.
Either gives the same reads (measured on ffmpeg 6.1 with each, 2026-11-28), so Homebrew's default
`ffmpeg`, which has no libvorbis, will do; when neither is there the self-test says which ffmpeg it
found (PLAN 47x-6).

## Its config file

Where the tool keeps things is in `reelreader.config.json` (every field is optional; what each means
is at the top of `scripts/watchconfig.mjs`):

| Field | What it says | With no config |
|---|---|---|
| `references` | the reference library's folders, in order (`~` and `$ENV_VAR` entries allowed) | `~/reelreader-references` |
| `fetch` | for a link this machine is refused: which machine to fetch it on, its folder, where its `yt-dlp` and `ffmpeg` are, what to do with the file after | plain `yt-dlp` into `~/reelreader/<name>` |
| `settingsMap` | a module turning `--vs` gaps into your app's settings ("Settings to try") | no such section |
| `scratch` | the temp folder name used when `--out` is not given | `reelreader` |
| `mode` | `auto` (the footage decides), `liquid` or `general`, when no flag is given | `auto` |

It is found as `--config FILE`, else `$REELREADER_CONFIG`, else `reelreader.config.json` in the folder you
run from, else beside the scripts. `$REELREADER_REFERENCES` is always the first library folder.
This repository's own is [`scripts/reelreader.config.json`](../scripts/reelreader.config.json); a copy
without it uses only the general places above, and `npm run watchconfig` holds that no module
names this project's places anywhere else.

## Limits

- **YouTube downloads only from a home connection.** YouTube answers a cloud or datacenter
  address with "Sign in to confirm you're not a bot" (or a 403), whatever that machine's network
  settings. The tool then saves the four stills YouTube serves to anyone and prints a one-line
  fetch to run on a computer on a home connection; bring the file back and watch that. Or watch
  a mirror (archive.org keeps many uploads) or a file you already have. Never hand it YouTube
  cookies: they are a login.
- **Vimeo can't be fetched.** It asks every visitor to sign in and its copies are DRM-locked,
  so neither the tool nor a headless browser gets the video. Use a screen recording of your own
  playback, or a file the maker sends. (PLAN 47v-7 is a way to read the frames in the page
  itself.)
- **Only analyse videos you have the right to.** Your own footage, films you have licensed or
  been sent, Creative Commons or public-domain work. Downloading from a platform is bound by
  its terms (YouTube's forbid it except where YouTube shows a download button or link, or the
  uploader agrees), and a reference kept in
  the library holds frames of someone else's film: keep it private, outside any public
  repository, as this project does.
- **It measures; it does not judge content.** The words come with the number that chose them,
  and a read from one take of a moving fluid may vary from take to take; the summary says which.
- **The physics read and the report card are made for liquid footage** (overhead projections,
  macro liquids). On other footage they still print today; PLAN 47p-3 limits them to liquid
  footage or a `--liquid` flag.
