# 17. Hear the set ahead, from files

Specified 2026-11-08, with its check written first (`npm run hearahead`, every line
owed until its build; 17a–17f below). Came out of asking what a streaming service's
API could add (2026-09-27): the one idea worth having was the show knowing each song
before it plays, and it needs no service at all, only the files.

Live, the show can only react. A song map (sections, energy, pitch) is made by
recording the song's first play (`ListenRecorder` in `src/lib/songMap.ts`, from
`useMusicIntelligence.ts`) and is cached by ISRC for the next time, so the first
time a song is played at a gig, nothing is known ahead of the note that is sounding.
Only the film render reads a song ahead: `src/lib/songTrack.ts` decodes the whole
file and works out every frame's bands and kicks before drawing (§6).

The idea is that the live show does what the render does, for a whole set:

- **Load the set as files.** Drop a folder or a playlist of files (bought FLAC or
  MP3; store downloads such as Qobuz's carry no DRM) onto the desk, or the Mac app
  (§13). Each song is decoded and analysed before the show, through the same code
  the render uses, and its song map is ready before its first note.
- **The show plays the files itself**, so it knows which song is on and where in it,
  to the sample, with no fingerprint service (`fingerprint.ts`) and no guessing at the
  gap between songs (`songBoundary.ts`). Offline at the venue, which is §14h.
- **Anticipate, don't react.** With every kick and section known ahead, a song show
  (`songShows.ts`) can fire an action a bar or two *before* a drop or on the last
  beat of a song, not after it: start a pour ahead of the build, black on the last
  hit, pick the next look from what the next song will do.
- **From the files' own tags:** the ISRC, so per-song looks attach exactly
  (`songRef.ts`), with MusicBrainz for files that lack one; embedded cover art as a
  source of the song's dyes; a loudness measured during the analysis so a quiet
  record and a loud master drive the plate the same amount without recalibrating
  (`audioCalibration.ts`).
- **When something else is the player** (a DJ, a phone), the show carries on as it
  does today, through the mic or the interface.

## The two open questions, answered (2026-11-08)

**What a whole set's analysis costs up front.** Measured in node on a cloud
session's CPU (a scratch script over a made-up song; an M-series Mac is faster and
has not been timed): the render's ear, `SongEar` at 60 fps, reads **0.81 s per
minute of song**; today's section analysis (`songMapAnalysis.ts` at 22.05 kHz)
**0.15 s per minute**; BS.1770 loudness is a pair of biquads and a sum, a few ms. So
about **one second per minute of song**, about a minute for a sixty-minute set,
and the first four-minute song is ready in about four seconds while the rest go on
behind it. Memory, not time, is the limit: a decode at 48 kHz is 23 MB a minute in
stereo (a ten-minute song 230 MB, its mono mix 115 MB). Hence:

- one song at a time: the page decodes (`decodeSong`; an `OfflineAudioContext` is
  not offered in a worker), mixes to mono, *transfers* the mono buffer to a worker
  (`hearAheadWorker.ts`, as `songMapWorker.ts` does), and lets go of the channels
  before the next song is decoded; the peak is one song's decode, ~350 MB for ten
  minutes, ~140 MB for four;
- what is kept is the analysis, not the readings: a beat grid, sections, loudness,
  under 8 KB a minute as JSON (the check's bound; the throwaway build was 3.2), kept
  in IndexedDB under the file's SHA-256 (and its ISRC when it has one), so the set
  loaded again at the venue is not analysed again. The render's per-frame readings
  are a few KB a frame, tens of MB a song: never kept for a set;
- playing decodes a song again just before it is due: at most two songs decoded at
  once (the one playing and the next), ~180 MB for four-minute songs.

**Whether anticipation is a new *when* or a new kind of action.** A new *when*: a
lead, in beats, on the triggers whose moment can be known ahead (a section, and the
song's last beat). The action is the same action, a pour is a pour; only its moment
moves, so every kind of action gets a lead at once, where a new
kind of action ("pour ahead", "black ahead") would double them. And the score
(`songScore.ts`) already places a cue where the runtime fires it from the *when*
alone (the reason `sectionsAt` is shared), so the lead's moment is one function both
read. In beats, not seconds, because a build is counted in bars: two bars at 90 BPM
are 5.3 s, at 174 BPM 2.8 s.

## Items

- **17a. A song analysed ahead, by the render's ear.** `analyseSongAhead(pcm,
  sampleRate): SongAhead` in a new `src/lib/hearAhead.ts`, run in a worker one song
  at a time. `SongAhead` is `{ durationSec, hits, grid, sections, loudnessLufs }`
  (more fields are allowed; the 8 KB a minute bound holds). `hits` are exactly the
  frames where `SongEar` at 60 fps hears a beat (`features.beat.hit`), at `i / 60`
  s: the render's own ear, not a second beat tracker that could disagree with it.
  `grid` is the song's beat grid from its first hit to its last, at the song's pace,
  carried on through a stretch with no beat (a breakdown) and ignoring a hit off the
  pace (a hat or a fill), following the pace where it changes. Pass (`hearahead`
  line `files`): on the made-up song (126 BPM, 128 from the drop, off-beat kicks
  ending the verse), the hits equal `SongEar`'s; a grid beat within 25 ms of every true beat and none more
  than 25 ms from one; the duration exact; two runs the same JSON; at most 8 KB a
  minute. *(AG; owed `files`.)*
- **17b. Sections on the beat, the drums' entrance seen, the drop named.** The
  analysis's `sections` cover the song end to end, a boundary within one beat of
  every true change and none more than a beat from one, every boundary on a grid
  beat (within 25 ms), and exactly one section a `drop` (by `sectionKind`): where
  the beat comes back after eight or more beats without one. Today's segmenter does not do this: on the
  check's song it gives `0.0–92.0 chorus, 92.0–122.0 bridge, 122.0–140.0 outro`,
  merging the intro, the drums coming in (15.2 s), the verse and the chorus's chord
  change (45.7 s), and rounding to whole seconds, because it reads ~1 s super-frames
  of harmony and brightness only. The throwaway build passed with three rules over
  the grid (the first hit, a stretch without hits and the beat's return) plus a
  harmony novelty over eight beats either side, snapped to the bar. Pass
  (`sections`). Only `drop` is owed by name: the other sections may be labelled
  anything, so on a file a lead on `chorus` or `verse` does not fire until
  **17b-2** names them by recurrence (the same harmony coming back is the same kind
  of section), and the desk says so beside such a lead; `drop` and `any` work from
  17b. The live listen's own map (`songMapWorker.ts`) keeps today's
  segmenter until a later item moves it to this one. *(AG; owed `sections`.)*
- **17c. A lead on a *when*.** `ActionWhen`'s section trigger takes `beatsAhead?:
  number` (whole beats, 1–64), and a new `{ at: 'last-beat'; beatsAhead?: number }`.
  `SongClock` takes `ahead?: { grid: number[]; sections } | null`, the song's
  `SongAhead` when it is known. With it, `dueActions` fires a lead once per matching
  section (keyed by that section's index, `nth` counted over `ahead.sections`), on
  the first tick at or after the grid beat `beatsAhead` before the first grid beat
  at or after the section's start (the grid's first beat if that is before it), while
  the clock still reads the section before; a last-beat action fires on the last
  grid beat, or `beatsAhead` before it. Without it (a first live listen), a lead
  fires on the section itself, late but never lost, and a last-beat action not at
  all. `parseSongAction` keeps the lead (a file, the assistant, PLAN 44f) and
  `describeWhen` says it ("4 beats before every drop", "8 beats before the last
  beat", "On the last beat"). A cached live song map has sections but no grid: its
  `ahead` gives the lead in seconds from the beat clock's period (`beatClock`), a
  later item, 17c-2. Pass (`ahead`, three lines: on a hand-made song with an
  uneven grid, so a lead in seconds is caught; on the made-up song with its own
  analysis as `ahead`, so the two shapes are one; and the file and words; `late`
  holds on main). *(AG; owed
  `ahead`.)*
- **17d. The song's loudness, from the file.** `songLoudness(pcm, sampleRate)`:
  ITU-R BS.1770 on the mono mix the ear hears (K-weighting, 400 ms blocks
  overlapping 75%, the −70 LUFS absolute gate and the −10 LU relative gate). The
  show puts `clamp(−14 − loudness, −12, +12)` dB of gain on the analyser's branch
  only, never on the speakers: the plate hears every song at one loudness from its
  first second, and the room hears the record as it was mastered. Any sample rate
  (the filter's coefficients from its analogue prototype), though `decodeSong`
  hands it 48 kHz. Measured, not read
  from a ReplayGain tag: the analysis runs anyway, and a tag may be ReplayGain 1 or 2
  and of the stereo file, not the mono mix. Pass (`loudness`): a 1 kHz sine at −20
  dBFS reads −23.0 LUFS (±0.1), at 60 Hz −26.60 and at 10 kHz −19.66 (the
  K-weighting, which a plain RMS misses: at 1 kHz alone it passes), and −23.0 at 1
  kHz at 44.1 kHz; the analysis's `loudnessLufs` is this reading; the song 12 dB down reads 12.0 lower (±0.05); thirty
  seconds of silence after it move it under 0.1, and thirty seconds of pad 25 dB down
  under 0.5. *(AG; owed `loudness`.)*
- **17e. The show plays the set, and knows where it is.** One `AudioContext`; each
  song an `AudioBufferSourceNode` started at a scheduled context time, gapless or
  with the set's gap; its output to the speakers and through the 17d gain to the
  analyser the plate already reads. `setPosition(durations, gapSec, elapsedSec)` is
  the place in the set, `{ index, t }`, `t` negative in the gap before a song (a
  count-in a show can read), null after the last; elapsed is `ctx.currentTime` minus
  the set's start, so it is to the sample. The song show's `positionNow` reads it,
  and the fingerprint (`fingerprint.ts`) and boundary guess (`songBoundary.ts`) stand
  down while the player plays. Pass (`clock`) for the arithmetic; the player itself
  with 17g. *(AG; owed `clock`.)*
- **17f. The file's own tags.** `readSongTags(bytes)` → `{ isrc?, title?, artist?,
  cover?: { mime, bytes } }` (the front cover, picture type 3, where there are
  several) from ID3v2.4 (synchsafe sizes), ID3v2.3 (UTF-16 text) and a FLAC's Vorbis
  comment and PICTURE block; the ISRC normalised to its twelve characters (hyphens
  dropped, upper case, two letters, three letters or digits, seven digits),
  anything else no ISRC; no tags an empty object; a truncated
  tag never throws. The ISRC attaches a per-song show exactly (`songRef.ts`); the
  cover is a source of the song's dyes (a later item). MP4/M4A tags (`covr`, the iTunes ISRC
  atom) are 17f-2. Pass (`tags`). *(AG; owed `tags`.)*
- **17g. Load a set on the desk and the phone.** Drop a folder or files on the
  Perform desk (and the Mac app's window): the set list (`setList.ts`) gains an item
  per file in name order, each with its analysis's progress and, once ready, its
  length, tempo and sections; the transport plays, pauses, skips and sets the gap. The
  phone (`src/components/phone/`) shows the same set list, the song playing and the
  song show's next cue, from the same lib calls. The check, a desk and phone line
  that loads two short generated files and waits for both analyses and a play, is
  owed by Claude before this is built. *(Claude writes the check; then AG.)*
- **17h. Pick the next look from what the next song will do.** With the set's
  analyses known, a song's last-beat action can name "the next song's look" (its
  per-song show, or the look whose sound patches fit its tempo and loudness). After
  17g. *(Spec owed.)*

Build order: 17a–17f are one AG brief (one module, `hearAhead.ts`, and the song-show
change in `songShows.ts`; no UI), checked by `hearahead`; 17g after it, once its
check is written; 17h last. A throwaway build that passed every owed line was made while the
check was written (its numbers are in the PR that added the check); it proves the
lines can pass, and is not the design to copy.

**Not doing:** a streaming service's API for this. Qobuz's API terms (researched
2026-09-27) forbid earning anything around the service and indexing its catalogue,
and a consumer subscription is for personal listening, so a stream at a gig is
outside its terms whatever the app does. Files the performer owns carry none of that.
