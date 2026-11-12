---
name: watch
description: Watch a video (a YouTube or other link, a phone recording of a real show, or a take from the app's Record button) as contact sheets, a slit-scan timeline, motion/colour/sound numbers, a design read (palette, colourfulness, edges, form scale, flow lines, symmetry, composition), a physics read (flow speed, turning, spreading, carried vs fading in place, lifetime, detail spectrum) and the techniques used. Use when the user sends any video or animation link or file as a reference, asks what we can learn from one, asks how the app's output moves or looks, or wants our visuals judged against a reference.
---

# Watch: a video as pictures and numbers

Claude reads images, not video. `npm run watch` turns a clip into the pictures
and numbers that carry what a liquid light show is made of: how it moves, how
that changes over the piece, whether it moves with the music, what it is made
of (colour, form, light, composition), what is physically happening, and how
it was made. The owner asked (2026-11-12) to be able to point Claude at any
video or animation and get meaningful feedback, with a physics read and the
techniques used, and to judge our own visuals the same way.

```sh
npm run watch -- <file or URL> --out <scratchpad>/<name>
npm run watch -- clip.webm --out … --from 30 --to 90 --frames 36 --at 41.5,62
npm run watch -- room.mkv --out … --crop 0.52,0.10,0.22,0.40   # only the projection
npm run watch -- our-take.webm --out … --vs <scratchpad>/<reference>   # ours against it
npm run watch -- --selftest     # synthetic clips, frames and flows with known answers
```

## The routine for a link the owner sends

1. **Fetch it.** In a cloud session try `npm run watch -- <URL>` once. If
   YouTube refuses (it always does to cloud addresses), the error prints the
   exact one-line command for the owner's Mac. Run it there with Desktop
   Commander's `start_process` (no Remote Control needed; it downloads into
   `~/chromaglass-films/watch/<name>/`, a folder threads may stage from), then
   `device_stage_files` the `source.mkv` and `source.info.json` and watch the
   staged `source.mkv`. The info file is what gives the techniques section the
   page's description, tags, chapters and links. Vimeo wants a login from
   anyone now and its copies are DRM-locked: ask for a screen recording.
2. **Look at the first sheet, then crop.** If the camera shows the room (a
   tutorial, a gig from the floor), find the projection or the plate on a
   sheet and run again with `--crop x,y,w,h` (fractions), or the design read
   measures the room. A circular projection inside a square crop reads some
   symmetry from the mask; say so.
3. **Read** the timeline, the sheets, then the summary's Design, Physics and
   Techniques sections. Take `--at` stills of what matters.
4. **Scan the pages.** Open the links the Techniques section lists
   (WebFetch), the maker's site and gear lists, for what they say they used.
   Where nothing says, the "Guessed from the footage" lines are a start: check
   each against the stills, keep what holds.
5. **Compare with ours.** Film or find the closest look of ours (the owner's
   Mac has takes under `~/chromaglass-films/presets-*/clips/`, `npm run film`
   makes more, the Record button makes one) and watch it with `--vs` pointing
   at the reference's out folder. The gaps come ranked, biggest first.
6. **Write the account**: what happens; the design critique (palette and
   harmony, light, edges, scale and form, composition); the physics (what
   phenomenon makes each thing seen: immiscible drops and surface tension,
   diffusion, shear, buoyancy, refraction at a meniscus); the techniques;
   and, against ours, the two or three changes that would close the biggest
   gaps, each named in the solver's terms (physics first: never a shader trick
   for what the solver should produce) and as a PLAN item where it is new.

It prints a summary (also `summary.md`) and writes:

| File | What it is for |
|---|---|
| `timeline.png` | **Read first.** The centre column of every sample side by side (time runs right; a streak's slope is its speed), a motion strip, a loudness strip, red lines at cuts. The shape of the whole clip in one picture. |
| `sheet-N.png` | Frames at even intervals plus every cut, time-stamped, each sheet inside 1568 px so nothing is downscaled. |
| `still-*.png` | Full-resolution frames at the `--at` times, for the close look once the sheets say where. |
| `stats.tsv` | Per sample: brightness, near-black fraction, blown fraction, saturation, motion, loudness. |
| `palette.png` | The clip's six main colours, each as wide as its share. |
| `design.json` | The design and physics reads, for a later `--vs`. |

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

## The design, physics and techniques sections

Definitions, with why each measure and what its bands mean, are at the top of
`scripts/watchdesign.mjs` and `scripts/watchphysics.mjs`. In short:

- **Design:** palette (k-means, hex and share); colourfulness (Hasler and
  Süsstrunk: 33 moderate, 59 quite, 82 highly, 109 extremely); hue harmony
  (the two strongest hues' angle, spread, warm share); light (luminance,
  percentiles, RMS contrast); edge width (% of the frame's width: crisp under
  0.4, soft over 1); form scale (correlation length); flow lines (structure
  tensor coherence: blobs near 0, combed filaments over 0.5); forms (count,
  size, elongation: threads near 0, round cells near 1); symmetry (mirror,
  half-turn); composition (where the light sits, how spread).
- **Physics:** the fluid's own flow speed (% of width a second; ×0.25 for cm/s
  on a 25 cm projector stage), whole-field motion set apart (camera, a turned
  or slid dish) with its rotation period and divergence (spreading from a pour);
  **carried** (how much of the change is material transported, against
  changing in place: near 0 is fading, light changes, crossfades: the number
  for "physics writes, rendering reads"); turnover (seconds to carry a form
  its own size); lifetime (how long a picture stays like itself); the
  luminance spectrum's slope (shallow: fine filaments; steep: smooth, soft).
  The frames cannot give viscosity or the glass's real size.
- **Techniques:** technique words found in the page (rig, oils, dyes,
  surfactants, heat, magnets, optics, camera speed, digital tools), its
  chapters and links, then guesses from the numbers with their evidence.

Proved on 2026-11-12 on Liquid Light Lab's *Quick Tutorial* (cropped to the
projection) against our *Poster 1969* take: theirs 22 round cells a frame
(elongation 0.87) with crisp dark rims and soft washes, edge width 2.2%;
ours 12 forms, combed streaks inside each dye body (coherence 0.75), edges
1.8× softer, a white ground (luminance 0.63 against 0.36).

## Setting up

Needs ffmpeg, and yt-dlp for a URL. In a cloud session:
`python3 -m pip install yt-dlp imageio-ffmpeg` (the script finds that ffmpeg
on its own). On a Mac: `brew install ffmpeg yt-dlp` (both are installed on
the owner's Mac as of 2026-11-12). yt-dlp is handed ffmpeg's full path: given
a bare `ffmpeg` it silently skipped the merge and left the picture and sound
as two files (PLAN.md 47w); the tool also joins such a pair itself and
refuses an audio-only fetch.

## YouTube from a cloud session

The page and the list of formats come through, but YouTube refuses the video
itself to a cloud address ("Sign in to confirm you're not a bot", or a 403).
That is YouTube, not the environment's network setting, and changing the
setting does not fix it. When that happens the tool still saves the four
stills YouTube serves to anyone (the cover at 1280×720, and three 480×360
frames from about 25%, 50% and 75% in) and prints their paths: enough for the
look, nothing about motion. For the video itself, in order of preference:

1. **The owner's Mac.** Run the one-line fetch the error prints with Desktop
   Commander (`start_process`), stage the file back, watch it here (the
   routine above). Remote Control works too; so does asking the owner.
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
  and 0.3 s. A fixed seed does not make a take repeat either (the same code
  on seed 3 read 1.0 s and 11.3 s on two runs), so read the range, not the
  median: a change to how the plate moves shows when its range leaves the
  one before it. Near-black and hues hold from run to run; swells, calm and
  half-life do not. Output in `film/`.
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
