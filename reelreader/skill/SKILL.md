---
name: reelreader
description: Watch a video (a link or a file) as contact sheets, a slit-scan timeline and numbers for motion, colour, light, form and cuts, then judge it honestly for the person asking (an editor, a colourist, a VJ or liquid light artist, or anyone) and say what is in it. Use when someone sends a video or animation, asks what is in it, how it looks, moves, is cut or graded, how two versions differ, or whether a take is good or broken.
---

# reelreader: watch a video, then judge it honestly

Claude reads pictures, not video. reelreader turns a clip into the pictures and numbers that
carry how it looks and moves: contact sheets, a timeline of the whole clip in one image, and
measures of motion, colour, light, form, cuts and sound. It reads **how a video looks and
moves**, never what is in it: no people, objects, text or speech. What is in it comes from
your own eyes on the sheets and stills. This skill says how to run it, in what order to read
what it makes, how to judge a clip for the person in front of you, and, first, what you must
not claim.

Run it however it is installed: `npx reelreader …`, or `node scripts/watch.mjs …` from its
source. Below, `reelreader` stands for either.

## Honesty rules (read these first)

1. **Every claim carries its evidence.** A measured claim names its number ("near black 46%
   of the frame, motion median 1.0"). A seen claim names where ("sheet 2, 0:11.3"). Never
   write a number you did not read, and never describe a long clip from one sheet.
2. **Read the Footage and Read as sections before anything else.** Footage says what the file
   itself does to the reads: letterbox bars cropped, still overlays masked, title cards left
   out, how much of the motion is the camera, and when compression makes detail measures
   unreliable. A measure Footage flags is reported as flagged, or not at all.
3. **One take is one take.** A word marked `(may vary from take to take)` (swells, calm share,
   motion half-life, the strongest moment) did not hold between two takes of the same thing.
   Do not build a verdict on it, and do not call a change real from one take on each side:
   film or fetch a second take first. Near black and hues a frame do hold.
4. **The numbers miss faults; your eyes must not.** The summary describes; it does not
   inspect. On the test set (below) it calls a take that freezes for five seconds "one steady
   pace from start to end", and a take whose whole picture turns like a record "fast,
   churning" flow of its own. Check every clip for: a flat run in the timeline's motion strip
   (a freeze), the same shapes moved round the centre together from frame to frame (the
   whole picture turning, not the content flowing), the picture emptying to black or to a
   flat field (drained), a ring or halo that sits around every form, a hard seam. When the
   summary and the frames disagree, say so, give both, and trust the frames.
5. **The report card is not a quality score.** Its seven canons are calibrated on two real
   liquid light shows, and only liquid footage gets one. It graded the frozen test take
   exactly as it graded the same take unbroken. Quote it as "the card, calibrated on two
   shows, says …", never as a verdict, unless the person's own eval set agrees with it
   ([evals.md](evals.md)).
6. **Spend images where they count.** The timeline first, then each sheet, then `--at` stills
   only where the sheets point. For several videos, or a long one, hand the watching to the
   helper ([agents/video-watcher.md](agents/video-watcher.md)) so the images stay out of the
   main conversation.
7. **Say the limits of the content read.** The sheets sample the clip (24 frames by default,
   plus one at every cut): name the sampling, and say a shot shorter than the gap could be
   missed. There is no speech or music read beyond loudness, so never report dialogue or
   lyrics. Read on-screen text only from a still sharp enough to read. Never name a real
   person from a face.
8. **Liquid or general is a measurement, not a fact.** The **Read as** line says which read
   the clip got and the numbers that chose it. When your eyes disagree, re-run with
   `--liquid` or `--general` and say so: a real 1969 light show read general on a minute with
   three splices in it (the test set's link), and a neon street filmed on a tripod can read
   liquid.
9. **Rights and fetching.** Analyse only videos the person has the right to: their own
   footage, films they licensed or were sent, Creative Commons or public domain. YouTube
   serves the video only to a home connection; from a cloud machine the tool saves four
   stills and prints a one-line fetch to run at home. Never ask for cookies (they are a
   login). Vimeo cannot be fetched: ask for a screen recording or the file.

## Run it

```sh
reelreader <file or URL> --out <dir>                    # the read; summary.md, sheets, timeline
reelreader clip.mp4 --out <dir> --from 30 --to 90 --frames 36 --at 41.5,62
reelreader room.mkv --out <dir> --crop 0.52,0.10,0.22,0.40   # only the screen (fractions x,y,w,h)
reelreader clip.mp4 --out <dir> --liquid                # or --general: choose the read yourself
reelreader ours.mp4 --out <dir> --vs <reference dir or kept name>   # gaps, biggest first
reelreader --before A.mp4 --after B.mp4 --out <dir>     # what changed: diff.md, pairs.png
reelreader clip.mp4 --out <dir> --keep <name> --note "why"   # into your reference library
reelreader --refs                                       # the library
reelreader --selftest                                   # synthetic clips with known answers
```

It needs Node 20 and ffmpeg (with ffprobe); yt-dlp only for links. Where it keeps things (the
reference library, where to fetch a refused link, a settings map) is its config file,
`reelreader.config.json`; every field is optional.

## Read it in this order

1. **`timeline.png`**: the centre column of every sample side by side, time running right,
   with a motion strip, a loudness strip and red lines at cuts (a dim band under a
   dissolve). A streak's slope is a speed; a flat stretch of the motion strip is a stillness.
   The shape of the whole clip in one picture.
2. **`sheet-N.png`**: frames at even times plus every cut, stamped with the time.
3. **`summary.md`**, top down: the header (size, length, cuts, motion, sound), **Footage**,
   **Read as**, **Overall** (the whole film's arc and feel in one paragraph), **In words**
   (each word with the number that chose it and its source in
   [watch-words.md](watch-words.md)), **Design** (palette, colourfulness, hues and harmony,
   light, edges, scale, flow lines, forms, symmetry, composition), then **Motion** for general
   footage or **Physics**, **Techniques** and the **Report card** for liquid footage.
4. **Stills** (`--at`) where the sheets say something happens.
5. `stats.tsv` (every sample: brightness, near black, blown, saturation, motion, loudness) and
   `design.json` when a number needs checking against a moment.

## What is in it: the content read

The tool cannot see content; you can. From the sheets and stills, write:

- **The shots**, one line each, from the cut list in the header: time in and out, shot size
  (wide, medium, close), angle (eye level, low, high, overhead), what is in frame and what
  happens. Cross-check camera moves against the Motion section (camera share, zoom, roll).
- **Subjects and setting**: who or what (described, never identified from a face), where,
  day or night, real or animated, graphics or text on screen.
- **Continuity and style**: what repeats across shots, what each cut joins (action,
  reaction, a match on shape or motion), anything that breaks (a jump, a flash frame).

Keep it to what the frames show. "A large white rabbit sniffs a flower" is seen; "the rabbit
is happy" is a reading, and is marked as one.

## Lenses: judge for the person asking

Pick the lens from who is asking and what for; say which you used. Each lens reads the same
outputs and leads with different ones.

**Anyone (the general read).** What happens, in time order, with the content read; how it
feels from the Overall paragraph (does it build, settle, swell or hold; where its strongest
moment and longest rest fall); the look in one line; one or two things worth changing.

**Editor.** The cut list and cuts a minute; each shot's length and the spread of lengths;
dissolves and how long each runs; where the pace rises and rests (the swells and rests in
Overall, hedged as one take's); whether cuts land on motion peaks or loudness (motion vs
loudness in the header); what each cut joins (the content read). A batch run adds a shot list
with each shot's length, palette and whether it cut on a beat.

**Colourist.** The palette and each colour's share; colourfulness on the Hasler–Süsstrunk
scale; the two strongest hues' angle (analogous, complementary) and the warm share; luminance
percentiles, near black and blown (crushed blacks and clipped highlights); RMS contrast; how
the light and colour drift across the film (Overall); whether shots match each other (the
batch's per-shot palettes, or `--before/--after` on two grades). Check skin and memory
colours on stills, never from the palette alone, and say when compression flags the detail.

**VJ or liquid light artist.** Use the liquid read (`--liquid` if the Read as line said
general). The fluid's own flow speed, the share of change that is material carried rather
than fading in place, turnover and lifetime, each against the range real shows read (the
summary prints it); edges and form scale (cells, threads, a combed field); motion vs loudness
(real shows do not follow the beat: a high number is a style, not a merit); then the faults
of rule 4, which a performer's audience sees first. The report card comes last, under rule 5.
For video QA of any rendered output the same fault list applies.

## Comparing two films

- **Reference against yours**: run both with the same `--frames` and windows of the same
  length, yours with `--vs` pointing at the reference's out folder or kept name. The gaps come
  ranked in just-noticeable steps, biggest first; name the two or three that matter and the
  frames that show them.
- **Before and after**: `--before A --after B` writes `diff.md` (changes ranked, what held,
  words near an edge, how each felt), `diff-timeline.png` and `pairs.png`. Two takes of one
  look also differ: a change counts when it is bigger than the take-to-take spread (rule 3).

## The helper and the words guide

- [agents/video-watcher.md](agents/video-watcher.md) watches one or more videos in its own
  context and returns a written account with numbers. Install it as an agent, or hand its
  text to a subagent as the prompt, with the videos and the lens.
- [watch-words.md](watch-words.md) is where every word comes from (Laban's Effort factors for
  motion, Itten's contrasts for colour, Ching, Greenberg and Arnheim for form and composition,
  the wet show's own words for liquid footage) and which measure decides it.

## Check yourself: the test set and your own eval set

- [testset/README.md](testset/README.md) holds four short clips with known answers (an edited
  cartoon, a good liquid take, the same take frozen, the same take turned as a whole) and a
  linked real show. Watch each with this skill and hold your account to the answer key before
  you trust the routine on someone's footage.
- [evals.md](evals.md) walks a person through building an eval set from their own clips: the
  rating page a batch run writes, `ratings.json`, the agreement every later run prints, and
  when a verdict can be trusted.
- [example.md](example.md) is one worked account, with the lens, the content read and the
  honesty notes in place.

## Writing the account

Lead with what the person asked. Then: what happens (the content read, in time order); how it
moves and feels; the look; the lens's points, each with its number or its frame; the faults
found or the faults checked for and not found; and what you could not see (no audio, a clip
too short for motion, the camera's share, compression). Keep it under about 500 words a video
unless asked for more. Give the paths of the sheets and stills you relied on, so they can be
shown.
