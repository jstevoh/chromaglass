# Archive: 44. A person's AI assistant plays the show (asked 2026-11-07)

The closed items of [`docs/plan/44-assistants.md`](../44-assistants.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## Items

- **44b.** The assistant role on the show server, behind the owner's switch: **shipped** (`npm run assistant`; story in `docs/plan-shipped.md` §44).
- **44c.** The local MCP server (`mcp/chromaglass-mcp.js`), with its show guide, the owner's notes and a picture of the plate: **shipped** (`npm run assistant`).
- **44d.** The guard (Suggest / Play / Full, glides, Undo, the hand wins, the pace): **shipped** (`npm run assistant`).
- **44g.** The check, with a mutant per rule: **shipped** (`npm run assistant`).
- **44c-4.** A bigger picture, `look_at_plate {size: large}`, one 1280 still: **shipped** (`npm run assistant`; story in `docs/plan-shipped.md` §44). Owed: a real 1280 still from the Mac's GPU (judging, with the test sweep).
- **44f.** A pour as a song action, programmed with `add_song_action`, and the song show's clock read every frame: **shipped** (`npm run songs`, `npm run assistant`).
- ~~**44f-4. The display does not answer a song action.**~~ **Shipped** 2026-11-11 with
  44k-3 and 44k-5: the display's `assistant-answer`, through the relay to the assistant
  alone (`npm run assistant`, `song-answer`, `set-answer`, `answer-relay`).
- **44i.** The owner's YouTube channel from the assistant: a second local MCP server, `mcp/youtube-mcp.js` (upload that resumes, update, thumbnails, playlists; private unless told otherwise): **shipped** (`npm run youtube`; story in `docs/plan-shipped.md` §44). Owed: the owner's one-time Google setup and a first real upload (44i-1).
- **44j.** The live stream and the sound from the assistant: the saved destinations read and picked by name (`go_live`), each destination's health on air, and the sound source read and set (`set_sound_source`, Full; on air too since 44j-2): **shipped** (`npm run assistant`; story in `docs/plan-shipped.md` §44).
- ~~**44j-2. A sound source changed on air follows into the stream.**~~ **Shipped**: the
  encoder half in 37x-4f-2 (`npm run live`, "source opened on air"), the guard's refusal
  lifted 2026-11-10 with 35c-7 (`npm run assistant` line `sound-air`), so the assistant
  runs a stream with no click from the owner. Story in `docs/plan-shipped.md` §44.
- ~~**44k-2. The music player.**~~ **Shipped** 2026-11-11: `show_state`'s `player`,
  `play_track` (a shelf track by its title, a file in ~/Music by its path) and `music`
  (play, pause, seek, loop, close), Full, through `app/musicNow.ts` and
  `server/assistantMusic.js` (`npm run assistant`, `music-full`, `music-folder`,
  `music-real`, `music-type`, `music-laptop`, `music-length`, `music-answer`). Story in
  `docs/plan-shipped.md` §44.
- ~~**44k-3. The set list from the assistant.**~~ **Shipped** 2026-11-11: `show_state`'s
  `set`, `set_list` (arm, cancel, go_now, fade, revert) and `back_plate` (Full), through
  `app/setNow.ts` (`npm run assistant`, `set-past`, `set-fade`, `set-suggest`). Story in
  `docs/plan-shipped.md` §44.
- ~~**44k-4. The Mixer's row takes in `show_action`.**~~ **Shipped** 2026-11-11: the
  seven `mix-fade-*` in the tool's list, and a line that the list covers every Full
  action the guard allows (`npm run assistant`). Story in `docs/plan-shipped.md` §44.
- ~~**44k-5. Song shows, read and edited.**~~ **Shipped** 2026-11-11: `show_state`'s
  `songs`, `song_show` (read, Suggest), `remove_song_action` (Play: the assistant's own),
  `song_show_run` (start, stop; follow in Full) and `nudge`, through
  `app/songShowNow.ts` (`npm run assistant`, `song-mine`, `song-unknown`, `song-stop`,
  `song-nudge`, `song-follow`).
- ~~**44k-6. The bench and the last two gestures.**~~ **Shipped** 2026-11-11:
  `show_state`'s `bench`, `bottle`, `finger` (a stroke of five steps) and `flick` (one
  finger a third of the way round), Play (`npm run assistant`, `bottle-bench`).
- ~~**44k-7. The tempo and Link.**~~ **Shipped** 2026-11-11: `tempo` (bpm 60 to 200,
  heard, tap) in Play, `link` (on, transport) in Full, `show_state`'s `tempo`, through
  `app/tempoNow.ts` (`npm run assistant`, `tempo-range`, `phone-tempo`).
- ~~**44k-8. Which sequence.**~~ **Shipped** 2026-11-11: `sequencer` `select` (by name)
  and `stage` (from 1), `show_state` lists the sequences (`npm run assistant`,
  `seq-unknown`, `seq-stage`).
- ~~**44k-10. Calibrate, the song detector and Listen.**~~ **Shipped** 2026-11-11:
  `calibrate` (Recalibrate room), `song_detection` (on, off), `listen` (start, cancel,
  name) and `show_state`'s `ear`, Full, through `app/earNow.ts` and
  `server/assistantEar.js` (`npm run assistant`, `ear-full`, `ear-auto`, `ear-bool`,
  `ear-name`, `ear-answer`, `phone-ear`). Story in `docs/plan-shipped.md` §44.
- ~~**44k-11. Recording's options.**~~ **Shipped** 2026-11-11: `record_options` (makes
  video, take or both; quality; fps; format; sound), `take` (replay, stop, delete, by its
  number in the list) and `show_state`'s `record`, Full, through `app/recordNow.ts` and
  `server/assistantRecord.js` (`npm run assistant`, `record-full`, `record-format`,
  `record-values`, `record-id`, `record-answer`, `record-past`, `phone-record`). Story in
  `docs/plan-shipped.md` §44.
- ~~**44k-18. The Mac app's updates.**~~ **Shipped** 2026-11-11 with 13-update-auto:
  `app_updates` status, auto, check, install, answered by the show server from the Mac
  app's updater (`server/assistantUpdates.js`, `setAppUpdates`), never sent to the
  display (`npm run updates`, `npm run assistant`: `updates-full`, `phone-updates`).
  Story in `docs/plan-shipped.md` §44.
- ~~**44k-12. The microphone's input.**~~ **Shipped** 2026-11-11: `show_state`'s
  `sound.inputs` (the Sound panel's input names) and `sound.input` (the one chosen, null
  for the default), and `set_sound_source microphone` with `device` (a name in any case,
  or `default`), through `app/soundNow.ts` and `server/assistantSound.js` (`npm run
  assistant`, `sound-device`, `sound-device-name`, `sound-device-mic`,
  `sound-device-answer`). Story in `docs/plan-shipped.md` §44.
- ~~**44k-13. Film, pours and the room.**~~ **Shipped** 2026-11-11: `film` (a video
  file by path, a cartoon, a camera by name, a window, clear), `pour_file` (a picture or
  a film by path, a cartoon, stop), `room_camera` (on, off, a camera by name) and `mark`
  (a picture by path, or clear), Full, read back in `show_state`'s `media`, through
  `app/mediaNow.ts` and `server/assistantMedia.js`; files from `~/Movies` and
  `~/Pictures` only, served by the show server as the music player's are (`npm run
  assistant`, `media-full`, `-path`, `-kind`, `-folder`, `-cartoon`, `-camera`,
  `-answer`, `phone-media`). Story in `docs/plan-shipped.md` §44.
- ~~**44k-14. OSC, MIDI and Syphon.**~~ **Shipped** 2026-11-11: `outputs` (osc_out on or
  off and its target, osc_in off, local or network, midi on or off and its ports by name,
  syphon on or off, status in any mode), Full, read back in `show_state`'s `outputs`;
  OSC out and MIDI through the page's own doors (`app/outputsNow.ts`), OSC in and Syphon
  answered by the relay through the Mac app's Show menu (`server/assistantOutputs.js`,
  `setAppOutputs`). MIDI learning stays the person's (`npm run assistant`,
  `outputs-full`, `-relay-full`, `-target`, `-target-bad`, `-midi-name`, `-midi-port`,
  `-answer`, `-oscin`, `-oscin-mode`, `-oscin-taken`, `phone-outputs`; the Mac's half in
  `npm run desktop`'s OSC block). Story in `docs/plan-shipped.md` §44.
- ~~**44k-15. The projector.**~~ **Shipped** 2026-11-11: `projector` (cast the show's
  window on or off, the projector mode ask, auto or off, the test card, Identify) and
  `wall` (flips, corners, masks, feather, gain, gamma, the flash guard on only, reset),
  Full, read back in `show_state`'s `projector`; through the chip's and Settings → Wall's
  own calls (`app/projectorNow.ts`), the geometry judged by the guard
  (`server/assistantProjector.js`: corners convex, half the picture on the screen, a
  fiftieth of the screen covered). The mapping's shapes stay the desk's (`npm run
  assistant`, `projector-full`, `-answer`, `-cast`, `-mode`, `-test`, `wall-patch`,
  `-off-screen`, `-fold`, `-tiny`, `-range`, `-flash`, `phone-projector`). Story in
  `docs/plan-shipped.md` §44.
- ~~**44k-16. The rest.**~~ **Shipped** 2026-11-12 but its editing (44k-16a): `hand` (the
  palette lock by name, the tool, its amount, the plate in hand), Play, and `desk_view`'s
  Ambient TV, Full, read back in `show_state`'s `desk` (`app/deskNow.ts`, `app/useHand.ts`;
  `npm run assistant`, `desk-hand`, `desk-hand-range`, `desk-pin`). Story in
  `docs/plan-shipped.md` §44.
- ~~**44k-17. The desk's layout.**~~ **Shipped** 2026-11-12: `desk_tab` (Play), and
  `desk_tabs` (rename, move, add or copy, delete, reset every tab), `desk_panel` (open,
  dock, float, close, fold, fold all, the deck folded, a tab's plate mode), `desk_pins`
  and `desk_view`'s MIDI activity overlay (Full), read back in `show_state`'s `desk`;
  through the tab strip's, the panel menu's and the pins' own calls (`app/deskNow.ts`,
  `app/useDesk.ts`), the guard `server/assistantDesk.js`; a delete or a reset is Undo's
  to put back (`npm run assistant`, `desk-play`, `desk-tab`, `desk-answer`, `desk-tabs`,
  `desk-move`, `desk-undo`, `desk-panel`, `desk-pin`, `phone-desk`, and the page line on
  the real `deskTabs.ts`). Story in `docs/plan-shipped.md` §44.
- ~~**44i-5. An upload queue that waits out the daily limit.**~~ **Shipped** 2026-11-22:
  `queue_upload` (saves queued jobs with optional `key` and `replaces` without
  uploading), `upload_video` queuing instead of failing on `uploadLimitExceeded`
  (`max(now + 2h, lastUploadAt + 24h + 10m)`) or `quotaExceeded` (next midnight Pacific
  + 10m), `drain` CLI mode (oldest due first, `busyElsewhere` lock, stops on limit),
  `install-agent` / `uninstall-agent` LaunchAgent plist, and Pacific-time queue status
  in `upload_status` and `GUIDE` (`npm run youtube`, lines `limitQueue`, `drainWait`,
  `drainUpload`, `drainLock`, `queueTool`, `plist`, and mutants).
- ~~**44i-6. A manifest of the channel.**~~ **Shipped** 2026-11-22:
  `~/.chromaglass/youtube/manifest.json` (mode 600), `manifest` tool (`sync: true`
  pages all uploads at 1 unit/page while preserving local fields `key`, `source`,
  `status`, `reason`, `replacedBy`, `replaces`, `notes`, keeping gone videos as
  `removed`), `mark_video` (single or batch `video_ids`), upload completion recording
  `replaces` → `replaced` / `ok`, and `manifest [--sync] [--md <file>]` CLI (`npm run
  youtube`, lines `manifestReplace`, `manifestSync`, `leakFiles`).
