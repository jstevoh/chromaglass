# src/hooks

React hooks that own a device, a browser API or a clock (microphone, MIDI, cameras, projector, recorder, remote link) and hand its readings to `App.tsx`. The arithmetic lives in `src/lib`; a hook is the glue.

## Start here

- `useAudioAnalyzer.ts`: `useAudioAnalyzer`, `AudioData`, `Ear`: the show's ear.
- `useMidi.ts`: `MidiHost`, `MidiDevice`, controller maps, clock and timecode.
- `useMusicIntelligence.ts`: song ID, song maps, performances.
- `useShowSequencer.ts`: transport over a `ShowSequence`'s stages.
- `useProjector.ts`: `useProjector`, `pickProjector`, `ProjectorMode`.

## Contracts

- Imports `src/lib`, `src/types`, `presets`, `constants`, React. No components (`useSongRender` takes `FrameDigest`, `VisualizerRender` from `sim/frameTypes.ts`). Never `src/gpu`.
- Mostly called from `App.tsx`. The desk and phone take `useEscape` and the type `TabEdit`; `lib/sceneMap` and `lib/songTrack` take the type `AudioData`.

## Files

- `useCameras.ts`: cameras plugged in.
- `useCastSession.ts`: casting, sender side.
- `useDeskLayout.ts`: `useDeskTabs`, the desk's tabs.
- `useDeviceTilt.ts`: phone tilt as Gravity.
- `useEscape.ts`: Esc closes.
- `useFilmSense.ts`: the film, read back.
- `useGamepad.ts`: game controller as a hand.
- `useMidiTouch.ts`: flash on a controller touch.
- `usePreviewFrame.ts`: where the plate is painted.
- `useRecorder.ts`: record the canvas.
- `useRemoteLink.ts`: laptop side of the phone remote.
- `useSceneCamera.ts`: the room camera.
- `useSongChange.ts`: a new song, on a beat.
- `useSongRender.ts`: render a song.
- `useSongShows.ts`: a song's show.
- `useUserPresets.ts`: own presets.
- `useWakeLock.ts`: screen stays on.

## Checks

`npm run lint` always. Sound (`useAudioAnalyzer`): `shelf`, `music`, `ears`, `renders`, `kicks`, `clicks`. `useCastSession`, `useProjector`: `desktop`. `useRemoteLink`: `applink`, `remotemix`, `phonelink`. `useDeviceTilt`: `phone`, `layout`. `useDeskLayout`: `panel`, `desk`.
