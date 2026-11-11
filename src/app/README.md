# src/app: App()'s hooks

`App()` in `src/App.tsx` was one function of 577 statements until PLAN 19ai-8 moved its
domains here, each a run of App's statements moved whole and called where the run stood.
So App reads top to bottom as it did, and this list is in the order App calls them: a hook
reads only what is above it (its parameters) and gives back what App and the hooks below
use. Each file's header says what it is for; the reasons for each piece are in its
comments, which moved with it.

| Hook | What it holds |
|---|---|
| `useOutput` | the projector's geometry and grade, the wall's test card |
| `useTempo` | the beat clock's tempo source and the label the desk shows; publishes both to `tempoNow.ts` for the assistant |
| `useAmbientMode` | Ambient TV mode's switch |
| `useSoundState` | what the show listens to, as state |
| `useSongLine` | the song's shape, the bar and the heard tempo, for the status lines |
| `usePour` | an image or a film poured into the dish |
| `useSoundSource` | changing what the show hears; the music player; the drone |
| `useBench` | the engine's status, Calibrate and the grid sweep (`?bench`) |
| `useToast` | the one-line notice |
| `useFilm` | the film that drives the plate: a file, a cartoon, a camera, a window |
| `useSceneSource` | the room camera as a sensor |
| `usePaletteLock` | the palette held across looks |
| `useLayerReport` | each layer's fill and colour, for the desk in Preview |
| `useSetListState` | the set list, the armed look, the Go's fade |
| `usePhoneLayout` | phone, desks or the narrow overlay; Perform or Design |
| `useWallLook` | Preview's copy for the wall, and Send to wall |
| `useBlackout` | blackout and the dimmer's fades |
| `useLookFades` | Go, Go now, the back plate, Revert |
| `useTimecode` | MIDI timecode, for the sequence |
| `useShowLibrary` | songs' shows, action sets, what a cloud sync reloads |
| `useSetActions` | the set list's own edits and files |
| `useLucky` | Lucky, and its one ask in Perform |
| `useSongChangeFades` | a new song, a new look |
| `useCastFeed` | the cast window, mirror and network display kept in step; the mark |
| `useRecording` | the one Record button |
| `useGlides` | a setting walked to a value over seconds |
| `useRowFades` | a mixer row's take button |
| `useRemote` | the phone remote's link, both ways; and the TVs at home, `tvCount` (PLAN 12-tv, `lib/tvFeed.ts`) |
| `useInkTitle` | the identified song's title poured as ink when it changes and the Title switch is on (PLAN 37x-10), called by `useRemote` |
| `useLogoMelt` | the wordmark poured and melted when the Live Show goes live or a Record take starts, with Logo melt on (PLAN 37x-11), called by `useRemote` |
| `useShowFeed` | the plate's colour to the rig, and colour, sound and the beat to a VJ app (OSC out's switch) |
| `useSongSequences` | the set item, sequence or preset made for a song, up when it is identified; a song's sequence stopped at its end (moved out of App for 28h-8) |
| `useSongScore` | a song's show while it plays, and its score (`lookPlaying`: the look that is up, as a show names it) |
| `useListen` | Listen in the Songs panel: the song named, added, and its show designed once heard through (PLAN 28h-8) |
| `soundNow.ts` (not a hook) | what the show hears, for the remote link to report (`useSoundNow`, `publishSound`), and the door the owner's assistant changes it through (`askSound`, `setSoundDoor`, `ASSISTANT_SOURCES`), set by `useSoundSource` (PLAN 44j) |
| `tempoNow.ts` (not a hook) | the beat clock's tempo and Link, for the remote link to report (`useTempoNow`, `publishTempo`), and the door the owner's assistant sets them through (`askTempo`, `askLink`, `setTempoDoor`, `TEMPO_MIN_BPM`, `TEMPO_MAX_BPM`), set by `useTempo` (PLAN 44k-7) |
| `songCue.ts` (not a hook) | where the owner's assistant's song action lands: `setSongCueSink`, set by `useSongScore`; `addSongCue`, called by `useRemote` (PLAN 44f) |
| `songTitle.ts` (not a hook) | where a song's title goes: `setSongTitleSink`, set by `useRemote` (the corner caption, or ink when `titleCaption` is off); `showSongTitle`, called by `useSongScore` and `useInkTitle` (PLAN 37x-10j) |
| `useSongRendering` | a song rendered to a film |
| `useControllers` | MIDI, the gamepad, the projector window |
| `useCommandPalette` | the palette's commands and the keyboard |
| `useCheckHooks` | the checks' `?debug` doors (`lib/checkHooks.ts` declares them) |
| `useCrashState` | the black box's half from here |

`shared.ts` holds what App and several hooks read: the look the page opens on, `randomLook` (the phone's Surprise me and a new song's look, through `pickLook`, PLAN 45a-13), the shapes
of an armed look and the wall's look, and the keys the sound and the room camera are kept
under (`MAC_SYSTEM_AUDIO_KEY` since PLAN 14y-2: the Mac app's System audio, kept across a
relaunch). A check that reads App's source as text reads App and these together
(`scripts/appSource.mjs`). What has not moved yet, and why, is PLAN 19ai-8a.
