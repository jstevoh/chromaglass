# reelreader

**Analyse any video link or file.** reelreader turns a clip into the pictures and numbers that
carry how it looks and moves: contact sheets, a slit-scan timeline of the whole clip, a shot
list, and measures of motion, colour, light, form, cuts and sound, all on one page you can open
on a phone. It reads **how a video looks and moves**, not what is in it. Used as a Claude
skill, it lets Claude watch a video for you: Claude reads the sheets for what is in it, and the
skill holds it to honesty rules so every claim comes with its evidence.

```
npx reelreader https://www.youtube.com/watch?v=…      # or a file: npx reelreader take.mp4
```

For film students, editors, colourists, VJs and liquid light artists, ad and video teams,
YouTubers, video QA: anyone who wants to know how a video is cut, graded and paced, or how two
versions differ.

## What a run looks like

A 22-second excerpt of *Big Buck Bunny* (© Blender Foundation, CC BY 3.0), the first clip of
the test set. The full page it made is [docs/demo/report.html](docs/demo/report.html)
(download it and open it in a browser); the summary is [docs/demo/summary.md](docs/demo/summary.md).

The timeline: the centre column of every sampled frame side by side, time left to right, with
motion under it and every hard cut in red.

![The timeline of the demo clip](docs/demo/timeline.png)

The first contact sheet: frames at even intervals plus every cut, each stamped with its time.

<img src="docs/demo/sheet-1.jpg" width="560" alt="The first contact sheet of the demo clip">

And from the summary, in its own words:

> - cuts: 0:00.7, 0:03.8, 0:09.5, 0:11.3, 0:13.5, 0:15.6, 0:20.0
> - shots: 8 shots, average 2.8 s (shortest 0.7 s, longest 5.6 s); no sound, so no beat to cut on
> - colour: 62% of pixels are coloured; of those green 41%, blue 37%, cyan 14%
>
> Read as general footage, not a liquid light show: 19.1 hard cuts a minute (a show is one
> take, at most 2); 2% of the frame near black.
>
> Across the film it builds, starting quiet and gathering toward the end, in surges. Its
> strongest moment comes about a third of the way in, at 0:06, about three times the usual
> motion.

## Install

**Command line.** Node 20 or later and `ffmpeg` (with `ffprobe`) on the PATH; `yt-dlp` too for
links. No npm dependencies: it uses only Node's own modules.

```
npx reelreader --selftest          # does this machine's ffmpeg do? (about two minutes)
npm install -g reelreader          # then: reelreader <file or link>
```

macOS: `brew install ffmpeg yt-dlp`. Debian or Ubuntu: `sudo apt install ffmpeg`, and yt-dlp
from its own releases (the distribution's copy is often too old for YouTube).

**Claude Code plugin** (the skill, a helper agent and a `/reelreader` command):

```
/plugin marketplace add jstevoh/reelreader
/plugin install reelreader@reelreader
```

Then send Claude a link or a file, or type `/reelreader <link or file>`.

**Claude apps (claude.ai, Claude Desktop).** Download `reelreader-skill.zip` from the
[latest release](https://github.com/jstevoh/reelreader/releases/latest) and add it under
Settings → Capabilities → Skills. The zip carries the scripts inside it, so it runs where
Claude runs code; that sandbox needs ffmpeg, and links need a network that the site serves.

## What it makes

From one clip, in its out folder (`--out DIR`, else a temp folder):

- `report.html`: all of it on one page for a person, best moment first, then the timeline, the
  read, the words, the numbers and every sheet. Self-contained (the pictures are inside it), so
  it can be mailed or opened on a phone; it names no folder of the machine that made it.
- `sheet-N.png`: frames at even intervals plus every hard cut, each stamped with its time.
- `timeline.png`: the slit-scan, with motion, loudness and cuts under it.
- `summary.md` and `stats.tsv`: brightness, dark share, saturation, motion and loudness per
  frame; a design read (palette, colourfulness, contrast, edge width, form scale, flow lines,
  symmetry, composition); a motion read (on-screen speed, how much is the camera, zoom, roll,
  how long a view holds); how motion follows the sound; the overall arc in words, each word
  with the number that chose it and its source in film, design or colour theory.
- `shots.csv`: every hard cut found again to the frame, each shot's start, length and
  palette, and whether the cut landed on a beat of the music (the beat tracked from the sound
  itself), with how many did against what chance would give.
- `best.mp4` and `best.png`: the clip's strongest 10 to 15 seconds and its strongest frame.
- `design.json`, `palette.png`: the reads as data, for comparing two films.

## Commands

```
reelreader <file or URL> [--out DIR] [--from S] [--to S] [--crop x,y,w,h]
reelreader <file> --vs <reference>          # the gaps against a reference, biggest first
reelreader --before A --after B             # what changed between two films
reelreader <file> --keep NAME               # keep it in your reference library
reelreader <file> --liquid | --general      # the liquid or the general read, whatever the footage shows
reelreader <file> --no-report               # no report.html, best.mp4 or best.png
reelreader --batch <folder | playlist | list.txt> [--rank score|colour|motion|pace|beat]
reelreader --refit [ratings.json]           # fit the report card to your own ratings
reelreader --notes [ratings.json]           # what your rating notes keep saying
reelreader --refs | --selftest
```

**Batch runs and your own eval set.** `--batch` watches every clip in a folder, a playlist or a
list of paths and links, and writes one ranked table (`batch.md`, `.csv`, `.json`), an
`index.html` linking each clip's page, and `rate.html`: a page that plays each clip beside its
sheet, takes a mark from 1 to 5, a note, and notes pinned to moments, and saves
`ratings.json`. It runs from the disk with no server and sends nothing anywhere. `--refit`
fits the report card's bands to the clips you rated highest and says how well the fit agrees
on clips left out of it; later runs grade with your fit only when that agreement holds.
`--notes` groups what the notes keep saying, and flags a theme on three clips or more as a
candidate fault check.

## Liquid or general

Most footage gets the **general read**. A **liquid read** adds what was calibrated on real
liquid light shows (overhead projections of oils, inks and water on glass): a physics read of
the fluid's own flow, technique guesses, and a seven-canon report card. reelreader reads a clip
as liquid only when it shows one (one take, motion of its own rather than a camera move,
coloured light on a dark ground); the summary's **Read as** line says which it chose and the
numbers that chose it. `--liquid` or `--general` decides instead.

## The judging skill

[skills/reelreader/SKILL.md](skills/reelreader/SKILL.md) tells Claude how to run reelreader,
in what order to read what it makes, and how to judge a clip for the person asking: lenses
for an editor, a colourist, a VJ or liquid light artist, or anyone. Its honesty rules come
first: every claim carries its evidence, a measure the footage flags is reported as flagged,
one take is one take, and the numbers miss faults that your eyes must not. It comes with:

- a helper agent that watches long or several videos in its own context,
- a words guide (where every word in a summary comes from),
- a worked example, and a guide to building an eval set from your own ratings,
- a **test set** of four short clips with known answers (an animated short, a good liquid
  take, the same take frozen for five seconds, the same take turning like a record), each with
  the trap a careless read falls into. Hold Claude's account to the key before trusting it on
  your footage.

## Its config file

Every field is optional. `reelreader.config.json` in the folder you run from (or `--config
FILE`, or `$REELREADER_CONFIG`):

| Field | What it says | With no config |
|---|---|---|
| `references` | the reference library's folders, in order (`~` and `$ENV_VAR` entries allowed) | `~/reelreader-references` |
| `fetch` | for a link this machine is refused: which machine to fetch it on, its folder, where its `yt-dlp` and `ffmpeg` are | plain `yt-dlp` into `~/reelreader/<name>` |
| `settingsMap` | a module turning `--vs` gaps into your app's settings ("Settings to try") | no such section |
| `scratch` | the temp folder name used when `--out` is not given | `reelreader` |
| `mode` | `auto` (the footage decides), `liquid` or `general` | `auto` |

The details of each field are at the top of [scripts/watchconfig.mjs](scripts/watchconfig.mjs).

## Limits

- **YouTube downloads only from a home connection.** YouTube answers a cloud or datacenter
  address with "Sign in to confirm you're not a bot". reelreader then saves the stills YouTube
  serves to anyone and prints a one-line fetch to run on a computer on a home connection; bring
  the file back and watch that. Never hand it YouTube cookies: they are a login.
- **Vimeo can't be fetched.** It asks every visitor to sign in and its copies are DRM-locked.
  Use a screen recording of your own playback, or a file the maker sends.
- **Only analyse videos you have the right to.** Your own footage, films you have licensed or
  been sent, Creative Commons or public-domain work. Downloading from a platform is bound by its
  terms. A reference kept in the library holds frames of someone else's film: keep it private.
- **It measures; it does not judge content.** No people, objects, text or speech: Claude reads
  those from the sheets. A read from one take may vary from take to take, and the summary says
  which words did.
- **The report card is calibrated on two real liquid light shows.** Treat it as a description
  against those shows, not a quality score, until you refit it to your own ratings.
- macOS and Linux (and WSL). Native Windows is not tried yet.

## Tests

`npm test` runs the self-test and the tests that make their own clips or use the test set, with
nothing but Node and ffmpeg (about ten minutes).

## Where it comes from

reelreader began as the way the [ChromaGlass](https://chromaglass.art) liquid light show judges
its own picture against real liquid light shows, and is built from that project's source,
where its checks run every day; this repository is a build of it, one commit a release. The
comments in the code keep the reasons each measure is the way it is, with the project's own
plan items.

## Licence

MIT (see [LICENSE](LICENSE)). The test clips keep their own licences, listed in
[skills/reelreader/testset/README.md](skills/reelreader/testset/README.md).
