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
| `useSetListState` | the set list, the armed look, the Go's fade; publishes them to `setNow.ts` for the assistant, and its fade and cancel |
| `usePhoneLayout` | phone, desks or the narrow overlay; Perform or Design |
| `useWallLook` | Preview's copy for the wall, and Send to wall |
| `useBlackout` | blackout and the dimmer's fades |
| `useLookFades` | Go, Go now, the back plate, Revert; sets `setNow.ts`'s Go door for the assistant |
| `useTimecode` | MIDI timecode, for the sequence |
| `useShowLibrary` | songs' shows, action sets, what a cloud sync reloads; Follow songs for the assistant (`songShowNow.ts`) |
| `useSetActions` | the set list's own edits and files |
| `useLucky` | Lucky, and its one ask in Perform |
| `useSongChangeFades` | a new song, a new look |
| `useCastFeed` | the cast window, mirror and network display kept in step; the mark |
| `useRecording` | the one Record button |
| `useGlides` | a setting walked to a value over seconds |
| `useRowFades` | a mixer row's take button |
| `useRemote` | the phone remote's link, both ways; and the TVs at home, `tv` (a `TvAtHome`: watching, asking to pair, paired, and Allow, No, Forget; PLAN 12-tv, 12-tv-2, `lib/tvFeed.ts`) |
| `useInkTitle` | the identified song's title poured as ink when it changes and the Title switch is on (PLAN 37x-10), called by `useRemote` |
| `useLogoMelt` | the wordmark poured and melted when the Live Show goes live or a Record take starts, with Logo melt on (PLAN 37x-11), called by `useRemote` |
| `useShowFeed` | the plate's colour to the rig, and colour, sound and the beat to a VJ app (OSC out's switch) |
| `useSongSequences` | the set item, sequence or preset made for a song, up when it is identified; a song's sequence stopped at its end (moved out of App for 28h-8) |
| `useSongScore` | a song's show while it plays, and its score (`lookPlaying`: the look that is up, as a show names it); publishes the shows to `songShowNow.ts` and sets its door for the assistant |
| `useListen` | Listen in the Songs panel: the song named, added, and its show designed once heard through (PLAN 28h-8) |
| `musicNow.ts` (not a hook) | the music player, for the remote link to report (`usePlayerNow`, `publishPlayer`, `usePlayerReport` from `useSoundState`), and the door the owner's assistant opens, plays, seeks, loops and closes it through (`askMusic`, `setMusicDoor` from `useSoundSource`, `setLoopDoor`, `shelfTrack`, `ASSISTANT_MUSIC_PATH`) (PLAN 44k-2) |
| `earNow.ts` (not a hook) | the ear's presses, for the remote link to report (`useEarNow`, `publishRoom` from `useCastFeed`, `publishListen` from `useListen`), and the doors the owner's assistant calibrates, switches the song detector and Listens through (`askEar`, `setCalibrateDoor` from `useBench`, `setDetectorDoor`, `setListenDoor` from `useListen`, `LISTEN_NAME_MAX`) (PLAN 44k-10) |
| `recordNow.ts` (not a hook) | recording's options and the kept Takes, for the remote link to report (`useRecordNow`, `publishRecord` and `setRecordDoor` from `useRecording`, `readRecord`, `TAKES_LISTED`), and the door the owner's assistant sets what Record makes, the Plate video's quality, fps, container and sound, and replays, stops and deletes a Take through (`askRecord`) (PLAN 44k-11) |
| `mediaNow.ts` (not a hook) | film, pours, the room camera and the mark, for the remote link to report (`useMediaNow`, `publishMedia` from `useFilm`, `usePour`, `useSceneSource` and `useCastFeed`, `publishCameras` and `cameraName` from `useFilm`, `readMedia`), and the doors the owner's assistant drives them through (`setMediaDoor`, `askMedia`, `ASSISTANT_MEDIA_PATH`; PLAN 44k-13). `useFilm`'s `startFilmCamera` and `startFilmWindow` now return why they failed (null once on); `usePour` gains `pourImageFrom` internally |
| `projectorNow.ts` (not a hook) | The projector, for the remote link to report (`useProjectorNow`, `publishCast` from `useControllers`, `publishWall` from `useOutput`, `readProjector`), and the doors the owner's assistant runs it through (`setCastDoor`, `setWallDoor`, `askProjector`; PLAN 44k-15): the show's window, the projector mode, the wall's geometry and grade, the test card and Identify. The types are `remoteProtocol.ts`'s `ProjectorNow`. `useControllers` takes `stopCast` |
| `deskNow.ts` (not a hook) | The desk, for the remote link to report (`useDeskNow`, `publishDesk` from `useDesk`, `publishPalette` from `usePaletteLock`, `publishHand` from `useHand`, `publishAmbient` from `useAmbientMode`, `readDesk`), and the doors the owner's assistant runs it through (`setDeskDoor`, `setHandDoor`, `setPaletteDoor`, `setAmbientDoor`, `askDesk`; PLAN 44k-16, 44k-17): the tab up, the tabs' edits, a panel docked, floated, opened, closed or folded, a tab's plate mode, the pins, the MIDI activity overlay, Ambient TV, the palette lock, the tool, its amount and the plate in hand. Finds tabs, panels and palettes by name, and keeps a delete or a reset once for Undo (`tab-restore`). `HAND_TOOLS`, `HAND_AMOUNT`. |
| `useDesk` | The desk's own state, moved out of App() whole: the tabs (`useDeskTabs`), the rides' and the recipe's pins, the MIDI activity overlay; publishes them and sets the desk's door |
| `useHand` | What is in the hand, moved out of App() whole: the tool (`HandTool`), each tool's amount, the plate in hand (held to the stage's plates, `setStageLayers`); publishes them and sets the hand's door |
| `outputsNow.ts` (not a hook) | OSC out and MIDI, for the remote link to report (`useOutputsNow`, `publishOscOut` from `useShowFeed`, `publishMidi` from `useControllers`, `readOutputs`), and the doors the owner's assistant switches them through (`setOscOutDoor`, `setMidiDoor`, `midiDoorOf`, `askOutputs`; PLAN 44k-14). Ports by name, ids kept here. The types are `remoteProtocol.ts`'s `OutputsNow` |
| `soundNow.ts` (not a hook) | what the show hears, for the remote link to report (`useSoundNow`, `publishSound`, `readSound`), the microphone's inputs by name and the one chosen (`publishInputs`, from `useSoundState`, PLAN 44k-12), and the door the owner's assistant changes it through (`askSound(source, device?)`, `setSoundDoor`, `ASSISTANT_SOURCES`, `DEFAULT_INPUT`), set by `useSoundSource` (PLAN 44j) |
| `tempoNow.ts` (not a hook) | the beat clock's tempo and Link, for the remote link to report (`useTempoNow`, `publishTempo`), and the door the owner's assistant sets them through (`askTempo`, `askLink`, `setTempoDoor`, `TEMPO_MIN_BPM`, `TEMPO_MAX_BPM`), set by `useTempo` (PLAN 44k-7) |
| `setNow.ts` (not a hook) | the set list, the armed item, the live item and the fade, for the remote link to report (`useSetNow`, `publishSet`), and the door the owner's assistant arms and Goes through (`askSet`, `setGoDoor`, `setCueDoor`), and the phone controller arms an item by its id through (`armSetItem`, PLAN 12-ctl-1), set by `useLookFades` and `useSetListState` (PLAN 44k-3) |
| `songShowNow.ts` (not a hook) | the song shows in brief, for the remote link to report (`useSongsNow`, `publishSongs`, `showBrief`, which carries the song's own `title` for the phone controller), and the door the owner's assistant reads, edits, runs and nudges them through (`askSongs`, `readShow`, `setSongsDoor`, `setFollowDoor`, `ASSISTANT_ACTION_PREFIX`, `SONG_NUDGE_MAX_S`), set by `useSongScore` and `useShowLibrary` (PLAN 44k-5) |
| `songCue.ts` (not a hook) | where the owner's assistant's song action lands: `setSongCueSink`, set by `useSongScore`; `addSongCue`, called by `useRemote` (PLAN 44f) |
| `songTitle.ts` (not a hook) | where a song's title goes: `setSongTitleSink`, set by `useRemote` (the corner caption only since the ink was shelved, 37x-10m; `titleCaption` deleted); `showSongTitle`, called by `useSongScore` and `useInkTitle` (PLAN 37x-10j) |
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
