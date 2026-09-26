---
name: watch
description: Watch a video (a YouTube or other link, a phone recording of a real show, or a take from the app's Record button) as contact sheets, a slit-scan timeline and motion/colour/sound numbers. Use when the user sends a video link or file as a reference, asks how the app's output moves, or asks whether the plate moves with the music.
---

# Watch: a video as pictures and numbers

Claude reads images, not video. `npm run watch` turns a clip into the pictures
and numbers that carry what a liquid light show is made of: how it moves, how
that changes over the piece, and whether it moves with the music.

```sh
npm run watch -- <file or URL> --out <scratchpad>/<name>
npm run watch -- clip.webm --out … --from 30 --to 90 --frames 36 --at 41.5,62
npm run watch -- --selftest     # a synthetic clip with known answers
```

It prints a summary (also `summary.md`) and writes:

| File | What it is for |
|---|---|
| `timeline.png` | **Read first.** The centre column of every sample side by side (time runs right; a streak's slope is its speed), a motion strip, a loudness strip, red lines at cuts. The shape of the whole clip in one picture. |
| `sheet-N.png` | Frames at even intervals plus every cut, time-stamped, each sheet inside 1568 px so nothing is downscaled. |
| `still-*.png` | Full-resolution frames at the `--at` times, for the close look once the sheets say where. |
| `stats.tsv` | Per sample: brightness, near-black fraction, blown fraction, saturation, motion, loudness. |

The summary also names the dominant hues, the motion median and 90th
percentile, and **motion vs loudness**: the correlation, and the lag at which
it peaks. That is a measurement, not a verdict. A slow pour under a drone can
be right and score zero; a plate that is meant to hit on the beat and scores
zero is not.

And **the shape** over minutes, in the units the footage study measured real
shows in (`shape()` in `scripts/watch.mjs` defines each): swells a minute and
their gap, rise, decay and height; the share of time the plate is calm; how
long motion stays like itself; near black at the 5th and 95th percentile; hues
a frame; composition changes a minute; and motion vs loudness over 1, 5, 10
and 20 s windows. For scale, at `--rate 4`: the Joshua Light Show film reads
3.1 swells a minute, calm 42%, 2 hues, 9.8 changes a minute; the Dregs (2023)
2.0, 23%, 3, 8.7, with r −0.13 at 1 s; a 2016 show in a bar 2.0, 20%, with r
0.22 at 1 s rising to 0.39 at 20 s. Real shows do not follow the beat.

## Setting up

Needs ffmpeg, and yt-dlp for a URL. In a cloud session:
`python3 -m pip install yt-dlp imageio-ffmpeg` (the script finds that ffmpeg
on its own). On a Mac: `brew install ffmpeg yt-dlp`.

## YouTube from a cloud session

The page and the list of formats come through, but YouTube refuses the video
itself to a cloud address ("Sign in to confirm you're not a bot", or a 403).
That is YouTube, not the environment's network setting, and changing the
setting does not fix it. When that happens the tool still saves the four
stills YouTube serves to anyone (the cover at 1280×720, and three 480×360
frames from about 25%, 50% and 75% in) and prints their paths: enough for the
look, nothing about motion. For the video itself, in order of preference:

1. **The owner's Mac.** The same command works there as is; run it through
   Remote Control, or ask the owner to run it and drop the output folder in
   the thread.
2. **The file.** Ask for the video itself (a download, or a screen recording)
   in the thread; attachments land in `/mnt/project-files/uploads/hearth/`.
3. **A mirror.** archive.org keeps many YouTube uploads as
   `archive.org/details/youtube-<id>`; the command takes that URL.

Other sites vary (archive.org and direct `.mp4` links work; Vimeo refused a
search from a cloud session). Never ask for YouTube cookies: they are the
owner's login.

## Doing it properly

1. **Timeline, then sheets, then stills.** The timeline says where the clip
   changes; the sheets show what it looks like there; `--at` gets the detail.
   Do not describe a clip from one sheet of a long video.
2. **Say what you measured.** "Near black 48% of the frame, motion median 0.9"
   beats "mostly dark and calm". For a reference, write down the numbers you
   are aiming at; for the app, the same numbers on its recording are the
   before and after.
3. **Compare like with like.** Reference against app: same `--frames`, and
   `--from/--to` windows of the same length around the part that matters.
   Put the two timelines one above the other when showing the owner.
4. **Big clips.** The `video-watcher` agent reads the sheets in its own context
   and returns prose and numbers; use it when there are several videos, or a
   long one, so the main thread does not fill with images.

## In the QA checks

- **`npm run moving`** (macOS CI, `tools` shard): records the show with the app's
  own Record button and a band in a box playing, watches the take, and fails
  if the plate stands still for two seconds or the take is black, silent or
  short. It prints motion vs loudness without judging it; a threshold waits on
  runs from the owner's machine. Output in `/tmp/chromaglass-moving`.
- **`npm run film`** (by hand, `film.yml`, over six Mac runners): every look
  recorded for two minutes with the band, three times on seeds 1, 2, 3, and
  its shape in one table under the real shows' (the median, with the range).
  One take is not enough: the same look on two seeds read a half-life of 8.3 s
  and 0.3 s. The before and after for any change to how the plate moves, on
  the same seeds. Output in `film/`.
- **`npm run gig`** films the whole worked show (`GIG_FILM=0` to not) and lists
  every freeze and jump cut with the action done just before it; the timeline
  is in `/tmp/chromaglass-gig`.
- From a harness: `import { watchVideo, freezes } from './watch.mjs'`.

## The app's own output

- **A take from the app**: the Record button writes WebM (`useRecorder.ts`),
  with no duration in its header; the tool reads the length from the frames.
  This is the path for "does the plate move with the music": ask the owner for
  a take with sound, and read the motion vs loudness line and strips.
- **The lab** (`look` skill) renders stills, not a running show. For a clip of a
  lab sequence, write the frames as PNGs and join them with
  `ffmpeg -framerate 30 -i f%04d.png clip.mp4`, then watch that.
- The full app cannot be filmed in a cloud session (no GPU; its frames read
  back empty). A recording of it comes from the owner's machine or the macOS CI
  runner.

Outputs go in the scratchpad unless the user asks for them. A picture worth
showing the owner goes in the thread (`attached_outputs`, under
`/mnt/project-files/`).
