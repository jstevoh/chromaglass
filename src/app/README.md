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
| `useTempo` | the beat clock's tempo source and the label the desk shows |
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
| `useRemote` | the phone remote's link, both ways |
| `useShowFeed` | the plate's colour to the rig, and colour, sound and the beat to a VJ app (OSC out's switch) |
| `useSongScore` | a song's show while it plays, and its score |
| `useSongRendering` | a song rendered to a film |
| `useControllers` | MIDI, the gamepad, the projector window |
| `useCommandPalette` | the palette's commands and the keyboard |
| `useCheckHooks` | the checks' `?debug` doors (`lib/checkHooks.ts` declares them) |
| `useCrashState` | the black box's half from here |

`shared.ts` holds what App and several hooks read: the look the page opens on, the shapes
of an armed look and the wall's look, and the keys the sound and the room camera are kept
under. A check that reads App's source as text reads App and these together
(`scripts/appSource.mjs`). What has not moved yet, and why, is PLAN 19ai-8a.
