# src/hooks

React hooks that own a device, a browser API or a clock (microphone, MIDI, cameras, projector, recorder, remote link) and hand its readings to the app. The arithmetic lives in `src/lib`; a hook is the glue.

## Start here

- `useAudioAnalyzer.ts`: `useAudioAnalyzer`, `AudioData`, `Ear`: the show's ear.
- `useMidi.ts` (37 KB, grep it): `useMidi`, `MidiHost`, `MidiDevice`, controller maps, clock and timecode.
- `useMusicIntelligence.ts` (38 KB, grep it): song ID, song maps, performances.
- `useShowSequencer.ts`: transport over a `ShowSequence`'s stages.
- `useProjector.ts`: `useProjector`, `pickProjector`, `ProjectorMode`.

## Contracts

- Imports `src/lib`, `src/types`, `presets`, `constants`, React. No components (`useSongRender` takes `FrameDigest`, `VisualizerRender` from `sim/frameTypes.ts`, types only). Never `src/gpu`.
- Called from `App.tsx` and from the hooks in `src/app/` (several name the hook file they wrap in their headers). Components take `useEscape`, `useMidiTouch`, `useRemoteLink`, `useGamepad`, `useWakeLock` and the types `TabEdit`, `MidiController`, `Recorder`, `SongRenderState`, `SongShowStatus`.
- `lib/sceneMap`, `lib/songTrack`, `constants.ts` and `sim/` take the type `AudioData` from `useAudioAnalyzer`.

## Files

- `useCameras.ts`: cameras plugged in.
- `useCastSession.ts`: casting, sender side (`useCastSender`).
- `useDeskLayout.ts`: `useDeskTabs`, `TabEdit`, the desk's tabs.
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
