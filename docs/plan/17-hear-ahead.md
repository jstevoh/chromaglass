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

- **17a. A song analysed ahead, by the render's ear.** *(Shipped 2026-11-14; see [`docs/plan-shipped.md`](../plan-shipped.md).)* `analyseSongAhead` in `src/lib/hearAhead.ts` + `src/lib/hearAheadWorker.ts`.
- **17b. Sections on the beat, the drums' entrance seen, the drop named.** *(Shipped 2026-11-14; see [`docs/plan-shipped.md`](../plan-shipped.md).)* **17b-2** (chorus/verse labels by recurrence) remains open; `songMapWorker.ts` keeps today's segmenter.
- **17c. A lead on a *when*.** *(Shipped 2026-11-14; see [`docs/plan-shipped.md`](../plan-shipped.md).)* `beatsAhead`, `last-beat`, `SongClock.ahead`, `aheadMoments` in `src/lib/songShows.ts` and `src/lib/songScore.ts`. **17c-2** (cached live song maps without a grid) remains open.
- **17d. The song's loudness, from the file.** *(Shipped 2026-11-14; see [`docs/plan-shipped.md`](../plan-shipped.md).)* `songLoudness` in `src/lib/hearAhead.ts`.
- **17e. The show plays the set, and knows where it is.** `setPosition` arithmetic *(shipped 2026-11-14; see [`docs/plan-shipped.md`](../plan-shipped.md))*. The Web Audio set player (`AudioContext`, scheduled `AudioBufferSourceNode`s, gain into the analyser, `positionNow`, standing down `fingerprint.ts` and `songBoundary.ts`) ships with **17g**.
- **17f. The file's own tags.** *(Shipped 2026-11-14; see [`docs/plan-shipped.md`](../plan-shipped.md).)* `readSongTags` in `src/lib/hearAhead.ts`. **17f-2** (MP4/M4A `covr` and ISRC atom) remains open.
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
