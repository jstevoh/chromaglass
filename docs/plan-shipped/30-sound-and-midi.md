# 30. Shaping the sound and the MIDI: what Imaginando's VS rig showed (2026-10-11): what shipped

How §30's shipped items were found, built and measured. The open work is in
[`docs/plan/30-sound-and-midi.md`](../plan/30-sound-and-midi.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## Second pass (moved 2026-10-04)

### 30a. Shaped sound cords and dragged spectrum bands (shipped 2026-10-26)

From §30 (Imaginando VS / VS 2): a patch cord whose source is `sound` or `bands` (`SceneMapping` in `src/types.ts`)
now shapes its reading with `mode` (`'follow' | 'gate'`, absent = `'follow'` on whole-plate cords even when
`threshold`, `attack` or `release` are present; area cords keep `CordGate`'s rule), `gain` (absent = 1, applied to
the reading and clamped to `0..1` before the threshold in both modes), `threshold`, `attack` and `release`, and on
a `bands` cord a custom `band` (`[loHz, hiHz]`) dragged across a live log-frequency spectrum strip (`40 Hz`–`16 kHz`).
When `band` is present on a `bands` cord it wins over `feature`, while the panel writes `feature` as the named band
(`bandForHz`, `src/lib/audioFeatures.ts`) holding the drag's geometric middle so an older build falls back cleanly.
`AudioReading` carries the frame's spectrum (`db.slice(0, this.top + 1)`), `hzPerBin`, reference `floor`
(`this.ref - FLOOR_BELOW_REF_DB`) and `silent` flag, and `BandRange` (`src/lib/audioFeatures.ts`) hears `[loHz, hiHz]`
with the exact same `binsFor`, reference floor and `AutoRange` (6 dB minimum span, 30 dB cap) as `band1`..`band8`, so
a dragged band on `band5`'s edges matches `band5` to 0.000 across the track on both the live analyser and
`songAudioTrack`. `PatchBay.fold` (`src/lib/sceneMap.ts`) steps a `CordGate` per gated whole-plate cord (closing
**25h-2**), keyed by what the cord is (with twin numbering, matching `AreaHands`) and clocked from `fold`'s `now`
(never a frame count or `performance.now` inside). A cord with none of 30a's fields folds to the bit across all
2394 preset-cord frames. On the desk and the phone, the patch bay cord editor (`src/components/SettingsPanel.tsx`)
and `src/components/phone/BandStrip.tsx` draw the mode, gain, threshold, rise and fall controls and the live
spectrum strip with pointer/finger dragging and the threshold line drawn on the cord's own live reading. On a
laptop's second screen (`StageMirror` in `CastDisplay.tsx`), the projector mirrors `#liquid-canvas` directly and
displays the laptop's fold; a standalone network `CastReceiver` rebuilds `AudioData` from `CastAudio` with no
spectrum behind it, so `sound` cords fold and gate there while `bands` cords read nothing as before (30a-1).
Held by `npm run soundcords` (34/34 lines in `scripts/checks.json`).

## Third pass (moved 2026-10-29, 19m)

### 30. Shaping the sound and the MIDI: what Imaginando's VS rig showed (2026-10-11)

#### ~~30a. A sound cord has only a depth~~ (shipped 2026-10-26)

Shipped (`npm run soundcords`, 34/34 lines in `scripts/checks.json`). Each `sound` or `bands`
cord on `SceneMapping` (`src/types.ts`) now carries `mode` (`'follow' | 'gate'`, absent =
`'follow'` on whole-plate cords even when `threshold`, `attack` or `release` are present;
area cords keep `CordGate`'s rule), `gain` (absent = 1, applied to the reading before the
threshold in both modes), `threshold`, `attack`, `release`, and on `bands` cords a custom
dragged `band` (`[loHz, hiHz]`, winning over `feature` while the panel writes `feature` as
the named band holding the drag's middle for fallback). `BandRange` (`src/lib/audioFeatures.ts`)
hears `[loHz, hiHz]` from `AudioReading`'s spectrum with the same `binsFor`, reference floor
and `AutoRange` (6 dB minimum, 30 dB cap) as `band1`..`band8`, and `PatchBay.fold`
(`src/lib/sceneMap.ts`) steps a `CordGate` per gated whole-plate cord clocked from `fold`'s
`now` (closing **25h-2**). The patch bay editor (`src/components/SettingsPanel.tsx`) and
`src/components/phone/BandStrip.tsx` draw the mode, gain, threshold, rise and fall controls
and the live log-frequency spectrum strip on both the desk and the phone. Story in
`docs/plan-shipped/30-sound-and-midi.md` §30a.
