# 5. Playing it: sound learn, shutter, and a look link

**Partly shipped** (#154, #155): the bands and sound learn's music source and triggers (`npm run bands`, `npm run learn`). What is open is below. How it was found, built and measured is in [`docs/plan-shipped/05-playing-it.md`](../plan-shipped/05-playing-it.md), under the same number.

`src/lib/soundLearn.ts` (new), `src/hooks/useAudioAnalyzer.ts`, `src/components/MidiPanel.tsx`,
`src/lib/cameraPass.ts`, `src/App.tsx`

Independent of batches 1–4, so it can be built while the Mac is judging a look, and it
is the batch that changes how the show feels to play.

What it leaves open: "press the big dish" and "drop the lead dye" have no matching
`MidiAction` yet; the bar is every fourth beat from lock, with no real downbeat; and
learned mappings do not reach a Cast or network display (triggers do). The downbeat is also what batch 10's accent
selection (step 3) needs.

*Found 2026-09-28, not done:* the downbeat exists now (the bar grid's one, #184, Accent
the One), but sound learn still fires `bar` on every fourth beat it has counted since
the clock locked (`beatIndex % 4`, `soundLearn.ts`), so "Each bar" lands on whichever
beat the lock began on. Take the bar grid's one when the grid is sure of it (its own
0.15), and the count only when it is not. *Measure:* `npm run learn` with a song whose
lock begins on beat 3: the bar fires on the one.

**Shutter** (`shutter`, camera pass). Their trail buffer is a generic VJ smear laid
over everything. Here it belongs in the camera, where it is physically motivated: the
photographs that the Photograph style is built from are long exposures, and their light
trails and motion blur are part of why they read as film rather than as a screen. An
exposure-time control accumulates frames into the camera's existing scene buffer with a
decay, which puts it downstream of aperture and bloom so the three couple the way a
real lens does. Off in the light-show style, on by default in the Photograph presets.

**Look link.** The whole settings state in a URL. Preset files already do this properly
for a look you want to keep; a link is for the other case, showing someone a look right
now, between the laptop, the phone and anyone you want to send it to. Opening one sets
the look only: the projector window, the remote and the show server are untouched.

**An ear per input channel** (*proposed 2026-09-28*). The show hears one input and
splits it into kick, snare and bass by what the spectrum suggests (`audioFeatures.ts`).
A band's desk can send more than that: the kick mic, the bass DI, the vocal bus and a
room mic, on separate channels of one interface. Open the input with its
`channelCount` and a `ChannelSplitter`, and make each channel a named source beside
the analyser's: the kick's onset from the kick mic, the vocal bus for the lyrics and
for presence, the room mic's roar as a sound-learn source. Browsers differ above two
channels, so it is surest in the Mac app (§13 step 1). The phone's Sound sheet gets a
meter and an on/off per channel. *Measure:* `npm run bands` on a four-channel file with
a kick on channel 1 only: the kick onset follows channel 1, not the mix. **Home: 24.1**
(2026-10-04), the audio-voice half of the Patch inputs; Chrome gives a page at most two
input channels, so above two it is the Mac app's alone.

**Follow an instrument** (`5-follow`, *proposed 2026-10-05 by the owner*: "the guitar
can control one aspect of the visuals"). The show hears a mix as drums and bands:
`audioFeatures.ts` names `level`, `kick`, `bass`, `snare`, `hats` and eight log-spaced
bands, and sound learn binds any of them to a setting or a trigger (`soundLearn.ts`).
That is enough for the drums, because each owns a corner of the spectrum and an onset
shape, and the kick and snare onsets look at where the new energy landed. It is not
enough for a guitar, a voice or a keyboard: they share 200 Hz–5 kHz with each other and
with the snare's ring, so the band a guitar falls in moves with whatever else plays
there, and a binding on "band 5" is not a binding on the guitar. The ask is one
instrument driving one aspect of the plate: the guitar's level rides Swirl, its strums
drop dye, the note it plays picks the hue; the voice warms the lamp; the bass line's
pitch tilts the plate.

What it builds on, so none of it is new plumbing:

- **Named sources.** A followed instrument is one more `SourceName` (`guitar`, `voice`,
  `keys`, `note`) with the reading every source has (a value in its own `AutoRange`,
  an onset with its `at`), so sound learn, the music button beside each Learn, the
  patch cord on the `bands` plate source, the desks and the phone take it as they take
  `snare`.
- **The ear per input channel** (above, home 24.1). When the guitar has its own
  channel (a DI, a band's desk, a rack voice), following it is naming the channel, and
  that is the surest route live. This item is the case where it has none, which is the
  home listener's every case (§23): one stereo mix from a stereo or a streaming app.
- **Pitch and chroma already exist offline.** `songMapWorker.ts` works out an
  autocorrelation pitch, a 12-bin chroma and a spectral centroid about four times a
  second for the song map; `useAudioAnalyzer` has a live `spectralCentroid`; and
  `songTrack.ts` decodes a whole file for the render (§6), which is where §17's set of
  files would be analysed too.
- **MIDI notes as voices** (24.3): an instrument that is a synth needs no listening,
  its notes arrive exactly.

Three steps of rising cost, one PR each:

- **5-follow-a. Notes apart from hits, live.** Split each analyser frame into its
  harmonic and percussive parts by median filtering across time and across frequency
  (Fitzgerald, 2010): a held note is a horizontal line in the spectrogram, a hit a
  vertical one. Read the harmonic part by its harmonic series rather than its band: a
  pitch and pitch class with a confidence, its brightness, and an onset only when a
  new note starts there, so a strum counts and a snare does not. That gives a `note`
  source and a low, mid and high `tonal` source, cheap enough for every frame. This is
  what the instrument physically is (a string's harmonic series over a decaying
  envelope, against a drum's broadband burst), and it follows "the guitar" wherever the
  guitar is what plays in its register, which on many band records it is. It cannot
  tell a guitar from a piano on the same notes; that needs the next step.
- **5-follow-b. Real stems, for files.** For a song the show plays itself (§17) or
  renders (§6), separate it before it plays with a source-separation model (Demucs v4
  has a six-stem model with guitar and piano beside drums, bass, vocals and other;
  Open-Unmix has four), once per song in a worker on the GPU (onnxruntime-web on
  WebGPU, or native in the Mac app), and analyse each stem through the same
  `analysePcm` the render uses, so `guitar` is the guitar's own stem. Cached with the
  song map. The model's size and licence, and how long a song takes on a laptop, are
  unmeasured and decide site or Mac app (§23: probably the app).
- **5-follow-c. Stems live.** The same separation on the live input, if a streaming
  model fits a frame's budget at a latency the plate can afford (to measure; a model's
  look-ahead is latency, and §14e already finds the kick late). Until then the live
  show uses 5-follow-a and the channel route.

The phone's Sound sheet lists the followed instruments with a meter each, and Learn
on the phone offers them as sources, in the same PR as each step.

*Measure:* a new node check, `follow`, beside `bands`: a song built from known stems
(a plucked-string guitar part by Karplus–Strong over the band in the box's drums, bass
and pad from `simulatedMusic.ts`), mixed, with the follower run on the mix. The
`guitar` (or `note`) source's level tracks the guitar stem's own envelope (r ≥ 0.7);
it calls nine in ten of the guitar's note starts within two frames and fires on fewer
than one in ten snare hits; and with the guitar stem muted it stays under 0.1, so a
follower that only reads the mids fails. The bars are proposals, set against the first
measured run. 5-follow-b adds the same test on a real multitrack whose licence allows
it, on the Mac shard.
