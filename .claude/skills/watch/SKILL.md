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

## Setting up

Needs ffmpeg, and yt-dlp for a URL. In a cloud session:
`python3 -m pip install yt-dlp imageio-ffmpeg` (the script finds that ffmpeg
on its own). On a Mac: `brew install ffmpeg yt-dlp`.

## YouTube from a cloud session

The page and the list of formats come through, but YouTube refuses the video
itself to a cloud address ("Sign in to confirm you're not a bot", or a 403).
That is YouTube, not the environment's network setting, and changing the
setting does not fix it. In order of preference:

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
