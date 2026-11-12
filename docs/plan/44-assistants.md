# 44. A person's AI assistant plays the show (asked 2026-11-07)

Asked 2026-11-07: should the app have a skill or an interface so that the assistants
people already use (Claude, ChatGPT, Gemini) can make looks and drive the show? "Make a
slow purple look for this song", "pour blue on the next drop", "build me a set for these
six tracks".

**The owner's answer (2026-11-07): build it for the owner's own use now; do not sell,
market or promote it.** So it is a private tool: dormant on every show but the owner's
(a switch only the owner sets), not shipped inside the Mac app, and named nowhere a
visitor or customer reads (the landing page, the guide, the press page, the store
listings, the app's menus); `npm run assistant` fails if a public page names it. The
owner then asked for it with no limit on what it may control ("Full" mode, the live
stream included), for the assistant to see the plate, to learn the owner's taste, and
for control over the internet (44h, the next piece). The public pieces of the first
design (44a's page and `llms.txt`, 44e's menu and guide section, the tier) are parked
until the owner says otherwise.

## What the app already has to build on

- **The show server's remote role.** The phone remote is a `controller` on the show
  server's WebSocket (`server/remote-server.js`, the wire in `src/lib/remoteProtocol.ts`).
  It already gets the whole show as a `state` snapshot (the settings, the look on the
  plate and the one armed, every preset in the library, the sequencer, the track name,
  blackout, recording, the live stream) and already sends `patch`, `preset`, `cue`,
  `action` and the hand gestures (`drop`, `blow`, `press`, `finger`, `tilt`, `dye`,
  `liquid`). That is two-way, which OSC is not: OSC in (`docs/osc.md`, 13.5-osc) takes
  orders and answers nothing, so an assistant on OSC could not see what it changed.
- **Arm, then Go.** `cue` arms a look without sending it, separate from `preset` on
  purpose ("a phone in a pocket should not be able to do that to a room by accident").
  That is the safety model an assistant needs, already in the protocol.
- **Song shows.** `src/lib/songShows.ts` models a song's show as a look plus actions,
  each a *when* (the first note, a time, entering a section such as `drop`, every Nth
  kick, seconds before the end) and a *what* (another look over a fade, drain, burst,
  zoom, new dyes, any setting glided). Its scheduler (`dueActions`) fires them on the
  song's own clock, and `parseFile` reads them, with the saved looks they use, from a file.
- **Looks and set lists as files.** `src/lib/setList.ts` writes and reads a set list with
  its saved looks; `docs/liquid-format.md` documents the liquids file.
- **The look's own keys.** `src/lib/lookFade.ts` already splits the settings into the
  look and the rig: `RIG_KEYS` and `SETUP_KEYS` (the projector, the room, the outputs)
  are never moved by a look change. An assistant gets the look and never the rig.
- **The show key, local only.** `/remote-info.json` hands the show key only to a request
  from the laptop itself (`isLaptop`), so a program on the same Mac can join with no
  typing and nothing on the network can.

## The finding that shapes it: where each assistant can reach

The Model Context Protocol (MCP) is the one interface all three vendors take, but they
take it in two different ways, and the difference decides the whole design.

- **A local server** (a program the assistant starts on the same computer, talking over
  stdio) works in Claude Desktop (one-click as a desktop extension), Claude Code, the
  Gemini CLI, the Codex CLI, Cursor and most coding tools.
- **Only a remote server** (an `https://` endpoint on the public internet, signed in with
  OAuth) works in the ChatGPT apps (developer mode and apps), the Gemini web and phone
  apps (custom apps from a server URL, since about June 2026), and claude.ai on the web
  and the phone. A server on the person's Mac is not reachable from these at all.

Checked 2026-11-07 against third-party guides; the vendors' own help pages had not
been read and should be before 44h is built. So "one MCP server covers all three" is
true only of a remote one, and a remote one means a cloud relay into a live show on
the person's Mac: the largest and riskiest piece here, and not the place to start.

There is a third reach that needs no server at all: **every assistant can write a
file.** A look, a set list or a song show is JSON the app already reads. An assistant
in any chat app that knows the format can write "a slow purple look for this song" as a
file the person drops on the app. No live control, but it works today in all three,
on the free site too, and it is most of what "make a look for this song" means.

## The four ways, side by side

| Way | Reaches | Live control | Size |
|---|---|---|---|
| A page for assistants: the look, set-list and song-show formats with examples (44a) | Any assistant in any app, today | None: the person loads the file | S (a day, with its check) |
| A skill (a `SKILL.md`) | Claude's apps only; in Claude Code it could send OSC from a shell | One way, blind, Claude Code only | S, and mostly 44a repackaged |
| A local MCP server, in the Mac app (44b–44f) | Claude Desktop (one click), Claude Code, the Gemini CLI, the Codex CLI, Cursor | Two-way, guarded, on the same Mac | M (about a week with the guard and the check) |
| A remote MCP connector (44h) | Also ChatGPT, the Gemini app, claude.ai web and phone | Two-way, over the internet into the Mac | L (two to three weeks, a running cost, a security review) |

A skill on its own is not worth building: it reaches one vendor, and what it would hold
is 44a's page. 44a can be offered as a skill too, for free, by pointing one at the page.

## Physics and timing

An assistant answers in one to ten seconds, so it can never play on the beat. It
programs and the app performs: "pour blue on the next drop" is a song action (*when*
the next `drop` section, or the next eight kicks where there is no song map; *what* a
dye change and a pour) that the app's own scheduler fires on the song's clock. The
assistant moves the plate only through what a person at the desk could move (settings,
looks, the hand's gestures, song actions), so sound still reaches the plate only
through cords and preset patches, and the plate shader is untouched.

## Items

- **44-0. The owner's call.** Answered 2026-11-07: the owner's own tool, not sold or
  promoted; no tier. Revisit only if the owner decides to offer it.
- **44a. A page for assistants.** *Parked (public).* `public/assistants.md` and
  `public/llms.txt` with the look, set-list and song-show formats, generated from the
  code, and its check `npm run assistantdoc`. Not built while the tool stays private;
  the know-how it would hold went into the MCP server's own guide instead (44c).
- **44b.** The assistant role on the show server, behind the owner's switch: **shipped** (`npm run assistant`; story in `docs/plan-shipped.md` §44).
- **44c.** The local MCP server (`mcp/chromaglass-mcp.js`), with its show guide, the owner's notes and a picture of the plate: **shipped** (`npm run assistant`).
- **44d.** The guard (Suggest / Play / Full, glides, Undo, the hand wins, the pace): **shipped** (`npm run assistant`).
- **44g.** The check, with a mutant per rule: **shipped** (`npm run assistant`).
- **44d-2. The switch on the desk and the phone.** *(S, AG lane, only if the owner wants
  it visible.)* Today the switch is a file (see the shipped story) and Off is deleting
  it. A desk status line with one press to Off, `assistant-off` as a learnable action,
  and Undo on the phone, all hidden unless the switch file exists. Pass: `panel`, `desk`
  and `phone`, and the line absent on a show without the file.
- **44d-3. The guard counts the sequencer and auto-pilot as the hand.** The guard tells
  the performer's moves from its own by the display's snapshots, so a setting the
  sequencer or auto-pilot moves is read as the performer's and refused to the assistant
  for ten seconds. Conservative (never fights), but with auto-pilot on the assistant
  can move almost nothing. Fix: the display marks which of its changes were a person's
  (`laterWrites` in `lib/lookFade.ts` already tracks desk writes). Pass: an
  `npm run assistant` line with the stand-in's sequencer moving a key the assistant
  may still set.
- **44d-4. A desk move inside a glide's own path is missed.** A phone's or OSC's patch
  cancels the key's glide at once (`onPerformer`), and a desk move to a value off the
  glide's way stops it at the next snapshot (`echoOf`, `npm run assistant` holds it);
  but a desk move that lands between where the glide began and where it is going reads
  as the glide's own echo, and the glide rides over it. Fix with 44d-3's marking.
  Pass: a desk move inside the path stops the glide within 100 ms.
- **44c-2. Save a made look to the library.** `arm_new_look` arms a look for Go; saving
  it is the desk's own Save after Go. A `save-look` message needs the user-preset store,
  which lives in `App.tsx` (over 100 KB, so it cannot grow): split that piece out first
  (19ai), then add the message and the tool. Pass: a made look appears in the library
  after a reload.
- **44c-3. The settings' travel and help for the assistant.** `get_settings` gives
  values, not ranges or meaning, so the assistant learns a setting's travel by
  `sanitizePatch` clamping it. Generate a table from `PIN_RANGE` (`lib/deskPins.ts`),
  `LEARNABLE_SETTINGS` (`lib/midi.ts`) and `lib/controlHelp.ts` at build time into a
  JSON the MCP server reads (it cannot read TypeScript). Pass: the table's keys match
  the code's, checked in `npm run assistant`.
- **44c-4.** A bigger picture, `look_at_plate {size: large}`, one 1280 still: **shipped** (`npm run assistant`; story in `docs/plan-shipped.md` §44). Owed: a real 1280 still from the Mac's GPU (judging, with the test sweep).
- **44f.** A pour as a song action, programmed with `add_song_action`, and the song show's clock read every frame: **shipped** (`npm run songs`, `npm run assistant`).
- **44f-2. Pour in the Songs panel's menu.** *(S, AG lane, if the owner wants it for
  people.)* A pour arrives today only from the assistant or a file, and its row shows
  as its own sentence (as `set` does). A menu entry with a colour swatch and an amount,
  on the desk's Songs panel and the phone's Play sheet. Pass: `panel`, `desk`, `phone`.
- **44f-3. Other readers of the late position.** The song show's clock now reads the
  song's position at its own tick (`positionNow`), where it read `state.positionSec`,
  which the music hook sets every 500 ms (an action fired up to 558 ms after its
  section began, `npm run songs`). Other code still reads `state.positionSec`: the
  score's playhead and the hooks that start a sequence at the song's place
  (`useSetActions`, `useLookFades`); not yet audited for which of them fire something
  on a section edge. And read sixty times a second, a position that steps back across
  a section edge (a follower's resync, a nudge) refires an action on `any` section or
  on two neighbouring sections of one kind (`dueActions` keys a section action by the
  section's index); it could at two readings a second too, now more often. Pass: each
  reader that fires on an edge reads `positionNow`, with a line in `score`, and a
  `songs` line where a position jittering across an edge fires its action once.
- ~~**44f-4. The display does not answer a song action.**~~ **Shipped** 2026-11-11 with
  44k-3 and 44k-5: the display's `assistant-answer`, through the relay to the assistant
  alone (`npm run assistant`, `song-answer`, `set-answer`, `answer-relay`).
- **44i.** The owner's YouTube channel from the assistant: a second local MCP server, `mcp/youtube-mcp.js` (upload that resumes, update, thumbnails, playlists; private unless told otherwise): **shipped** (`npm run youtube`; story in `docs/plan-shipped.md` §44). Owed: the owner's one-time Google setup and a first real upload (44i-1).
- **44i-1. The owner's Google setup and a first real upload.** *(Owner, about ten
  minutes; then Claude on the Mac.)* A Google Cloud project with the YouTube Data API
  v3 on, its consent screen published (In production, so the sign-in does not lapse
  every 7 days as Testing's does), a "Desktop app" client's JSON saved as
  `~/.chromaglass/youtube/client_secret.json`; then `node mcp/youtube-mcp.js login` and
  the server added to the assistant. Steps in the owner's private setup file. Pass: one
  private upload of a music film, resumed across a pulled connection, and its title
  changed from the assistant.
- **44i-2. Publish it for others?** *(The owner's call, asked 2026-11-08.)* The server
  imports nothing from the repo (`npm run youtube` holds that), so it can move to a
  repository of its own and the public MCP registry unchanged. Each user would still
  make their own Google Cloud project; a one-click sign-in for strangers means Google's
  verification of our app for the `youtube` scope (a privacy policy, a review of
  weeks) and us running the sign-in. Decide after the owner has used it for a few
  uploads. Not in the store, and not named on the site while undecided.
- **44i-3. The channel from claude.ai on the web and the phone.** A local server is
  reachable only from the Mac's own assistant apps. Once 44h's Worker exists, the
  same tools can ride it (the Mac's server doing the upload, since the films are on
  the Mac). Only if the owner wants uploads started from the phone.
- **44i-4. Progress while an upload runs.** `upload_video` answers within 45 s and
  the assistant asks `upload_status` after. MCP's progress notifications would let a
  client show a bar instead; Claude's apps did not all show them when checked. Pass: a
  `youtube` line where a client that sends a `progressToken` receives rising progress.
- **44j.** The live stream and the sound from the assistant: the saved destinations read and picked by name (`go_live`), each destination's health on air, and the sound source read and set (`set_sound_source`, Full; on air too since 44j-2): **shipped** (`npm run assistant`; story in `docs/plan-shipped.md` §44).
- ~~**44j-2. A sound source changed on air follows into the stream.**~~ **Shipped**: the
  encoder half in 37x-4f-2 (`npm run live`, "source opened on air"), the guard's refusal
  lifted 2026-11-10 with 35c-7 (`npm run assistant` line `sound-air`), so the assistant
  runs a stream with no click from the owner. Story in `docs/plan-shipped.md` §44.
- **44j-3. The assistant's sound source on the Mac.** *(Owner's eyes, a minute.)*
  `system` asks macOS for screen-and-sound capture the first time; from the
  assistant there is no click to answer a prompt with. Try it once on the Mac before
  a set, and if a prompt appears, answer it by hand once.
- **44k. Everything at the desk, from the assistant.** *(L. The owner asked
  2026-11-09: "a complete ability to control everything in ChromaGlass from
  Claude".)* **The audit is done (2026-11-11), below; the gaps are 44k-1 to 44k-16,
  each its own PR or a few together, in this order.** What the assistant already
  reaches: every key of `VisualizerSettings`, through `set` (a patch the display runs
  through `sanitizePatch`, which takes any key of `DEFAULT_SETTINGS`; the room's keys,
  `server/assistant-room-keys.json`, in Full), so the Title switch, the corner
  caption, the ink title, the logo melt, the Mixer's row sliders, the macro camera,
  the layers and the rest are already in reach; the library's looks (`list_looks`,
  `arm_look`, `arm_new_look`, `go`, `play_look_now`); the sequencer's transport;
  pours, blows, presses, tilt and the bottle's colour; song actions on the song
  playing; poured words and the corner caption; the desk's actions in `show_action`
  (blackout, clear, drain, seed, Lucky, freeze, evolve, Record, a take, the clean
  screen, preset next and back, Back); the live stream and the sound source. What it
  does not reach is everything that lives in `App()`'s hooks and not in the settings:
  the list below, found by sweeping the desks, the settings, the phone and
  `src/app/` against `mcp/chromaglass-mcp.js` and `server/assistant.js`.

  The way each one is built, the bulk in Antigravity's lane: Claude writes the
  `npm run assistant` lines first (the tool, the guard's mode, the stand-in display
  receiving the message, a mutant that fails), then the door. A door is a message
  in `useRemote` (`src/app/useRemote.ts`) handed to the hook that owns the state,
  through a sink like `app/songCue.ts` where `App.tsx` would have to grow (it is
  208 KB and cannot), and a line in the display's state snapshot so `show_state`
  can read it back. Every door keeps the rails: the hand wins, Undo where a thing
  can be undone, the pace, Full for the room and for anything that changes the
  owner's saved work. Out of the audit on purpose: the account, the store, sign-in
  and keys (only the accounts code touches them), and feedback and the crash report.
  The desk's own layout was out of the first pass (the screen the person works at,
  not the show) and is in on the owner's word (2026-11-11, "add in the desk
  layout"): 44k-17.

  | Rank | What, at the desk | The tool today | Mode it belongs in | Item |
  |---|---|---|---|---|
  | 1 | The Mac's assistant has the current tools | the Mac runs an old copy: 21 tools, no `go_live`, `set_sound_source`, `song_title` | — | 44k-1 |
  | 2 | The music player: open a file, a library track, play, pause, seek, loop, close; what is playing and where | **shipped** 2026-11-11: `play_track`, `music`, `show_state`'s `player` | Full | 44k-2 |
  | 3 | The set list: read it, arm item N, Go now, the Go's fade time, cancel the cue, Revert, the back plate | `arm_look` by library id and `go` only; no fade, no list | Suggest (arm), Play (Go, fade) | 44k-3 |
  | 4 | The Mixer's row takes (fade a row in or out) | the guard allows `mix-fade-*` in Full; `show_action`'s list leaves them out | Full | 44k-4 |
  | 5 | Song shows: read any song's show, take an action out, start and stop a show, Follow songs, nudge to a section | `add_song_action` on the song playing only | Play (read, nudge), Full (edit) | 44k-5 |
  | 6 | The bench: list the bottles, pick one; the Finger and the flick | the guard passes `liquid`, `finger`, `spin`; no tool sends them, `show_state` lists no bottles | Play | 44k-6 |
  | 7 | The tempo: tap, a typed bpm, back to heard; Ableton Link and its transport | none | Play (tempo), Full (Link) | 44k-7 |
  | 8 | Sequences: choose which one, go to a stage, bind one to a song | `sequencer` runs the chosen one only | Play (choose, stage), Full (edit) | 44k-8 |
  | 9 | Saving a made look: save as new, save over, delete | none (44c-2) | Play (new), Full (over, delete) | 44k-9 = 44c-2 |
  | 10 | Calibrate the sound to the room; the song detector on or off; Listen | **shipped** 2026-11-11: `calibrate`, `song_detection`, `listen`, `show_state`'s `ear` | Full | 44k-10 |
  | 11 | Recording's options: what Record makes, quality, fps, format, sound in it; replay or delete a take | **shipped** 2026-11-11: `record_options`, `take`, `show_state`'s `record` | Full | 44k-11 |
  | 12 | The microphone's input device | **shipped** 2026-11-11: `set_sound_source`'s `device`, `show_state`'s `sound.inputs` and `sound.input` | Full | 44k-12 |
  | 13 | Film and room: a film's source (file, camera, window, cartoon), pour an image or a film, the room camera, the mark (logo card) | **shipped** 2026-11-11: `film`, `pour_file`, `room_camera`, `mark`, `show_state`'s `media` | Full | 44k-13 |
  | 14 | The outputs: OSC out on and off and its target, OSC in's mode (the Mac menu), MIDI on and off and its ports, Syphon once it ships (its own thread) | **shipped** 2026-11-11: `outputs` (osc_out, osc_in, midi, syphon, status), `show_state`'s `outputs` | Full | 44k-14 |
  | 15 | The projector: the cast window, projector mode, the test card, the wall's geometry and mapping | none | Full | 44k-15 |
  | 16 | The rest of the desk: palette lock, Ambient TV mode, the tool in hand and its amount, the layer in hand, set lists' and sequences' own editing and files | none | Play (palette, tool), Full (the rest) | 44k-16 |
  | 18 | The Mac app's updates: Install Updates Automatically, check, install | **shipped** 2026-11-11: `app_updates` (status any mode; auto, check, install Full; install refused mid-show) | Full | 44k-18 |
  | 17 | The desk's layout: which tab is up, the tabs' own edits (rename, move, add, delete, reset), a panel docked, floated, folded or popped out, the pins, rides and recipe, the MIDI activity overlay | none (`overlays-off` hides the desk, nothing more) | Play (the tab up), Full (edits) | 44k-17 |

- **44k-1. The Mac's assistant runs the current server.** *(S, Claude on the Mac,
  then the owner's Cmd-Q.)* Found in the audit: the tools the owner's Mac offers
  Claude are 21, the set before `song_title` (37x-10j), `go_live` and
  `set_sound_source` (44j), so the Mac's Claude config still points at an old copy
  of `mcp/chromaglass-mcp.js`, and the stream and the sound cannot be run from there
  yet. Repoint it at the checkout the Mac app is built from (or ship the server
  inside the app, so a release carries it), and cut the Mac release that carries
  #785 (the sound on air). Pass: the Mac lists 24 tools, and `show_state` answers
  with the app open. The repointing half done 2026-11-11 (the Mac lists 24 since,
  seen the same evening); the release with #785 still owed.
- ~~**44k-2. The music player.**~~ **Shipped** 2026-11-11: `show_state`'s `player`,
  `play_track` (a shelf track by its title, a file in ~/Music by its path) and `music`
  (play, pause, seek, loop, close), Full, through `app/musicNow.ts` and
  `server/assistantMusic.js` (`npm run assistant`, `music-full`, `music-folder`,
  `music-real`, `music-type`, `music-laptop`, `music-length`, `music-answer`). Story in
  `docs/plan-shipped.md` §44.
- **44k-2a. A file the player cannot decode says so.** *(S, found building 44k-2.)* The
  display answers a file's `play_track` as done once the player starts loading it; a
  file the element cannot decode (a damaged MP3, a codec Chromium lacks) then fails in
  silence, the player keeping the name with no length. Answer after `canplay` or
  `error`, so the assistant hears that it would not open, and clear the player.
- **44k-2c. The player's real door, in a browser.** *(S, found in review of 44k-2.)*
  `npm run assistant` drives `askMusic` with a door built by hand and the stand-in
  display, so a door in `useSoundSource` that never starts the file, a pause that does
  nothing, or a `usePlayerReport` that stops publishing would pass. Add a line to a
  harness that loads the app: a shelf track through the real door, then the state's
  `player` loaded and playing, then a pause and `playing: false`.
- **44k-2b. More music folders.** *(S, found building 44k-2.)* A path plays from ~/Music
  only (`CHROMAGLASS_MUSIC_DIR` changes it, which the Mac app does not set). If the
  owner keeps songs elsewhere (the films folder, Downloads), let the Sound panel name
  the folders the assistant may open, read by the show server, never widened by the
  assistant itself.
- ~~**44k-3. The set list from the assistant.**~~ **Shipped** 2026-11-11: `show_state`'s
  `set`, `set_list` (arm, cancel, go_now, fade, revert) and `back_plate` (Full), through
  `app/setNow.ts` (`npm run assistant`, `set-past`, `set-fade`, `set-suggest`). Story in
  `docs/plan-shipped.md` §44.
- **44k-3a. A Go now the display refuses still counts as a look change.** *(S, found
  building 44k-3.)* The guard starts Go's gap and puts the Go on Undo's list when it
  passes the call; the display may then refuse it (a look gone from the library), and
  the next Go waits four seconds for nothing, and an Undo sends a Back for a Go that
  never happened. Hold the gap and the Undo entry until the display's answer, now that
  there is one (44f-4).
- ~~**44k-4. The Mixer's row takes in `show_action`.**~~ **Shipped** 2026-11-11: the
  seven `mix-fade-*` in the tool's list, and a line that the list covers every Full
  action the guard allows (`npm run assistant`). Story in `docs/plan-shipped.md` §44.
- ~~**44k-5. Song shows, read and edited.**~~ **Shipped** 2026-11-11: `show_state`'s
  `songs`, `song_show` (read, Suggest), `remove_song_action` (Play: the assistant's own),
  `song_show_run` (start, stop; follow in Full) and `nudge`, through
  `app/songShowNow.ts` (`npm run assistant`, `song-mine`, `song-unknown`, `song-stop`,
  `song-nudge`, `song-follow`).
- **44k-5a. One song shows field in the state.** *(S, found building 44k-5.)* The
  phone controller's owed check (`npm run controller`, PLAN 12-ctl) already fixes
  `RemoteState.songs` as `{ shows: [{ id, title }], runningId, follow }` for the phone
  apps' Songs screen, so the assistant's brief went in as `songShows` (with the song's
  label, the action count and the playing song's show). When 12-ctl's display half
  ships, give both one field and the assistant's guard and tools read it.
- ~~**44k-6. The bench and the last two gestures.**~~ **Shipped** 2026-11-11:
  `show_state`'s `bench`, `bottle`, `finger` (a stroke of five steps) and `flick` (one
  finger a third of the way round), Play (`npm run assistant`, `bottle-bench`).
- ~~**44k-7. The tempo and Link.**~~ **Shipped** 2026-11-11: `tempo` (bpm 60 to 200,
  heard, tap) in Play, `link` (on, transport) in Full, `show_state`'s `tempo`, through
  `app/tempoNow.ts` (`npm run assistant`, `tempo-range`, `phone-tempo`).
- ~~**44k-8. Which sequence.**~~ **Shipped** 2026-11-11: `sequencer` `select` (by name)
  and `stage` (from 1), `show_state` lists the sequences (`npm run assistant`,
  `seq-unknown`, `seq-stage`).
- **44k-7a. Undo of a tempo and a sequence's choice.** *(S, found building 44k-7.)*
  The assistant's Undo walks back settings, a Go and the blackout; a typed bpm, Link
  and a sequence chosen are not on its list, so the tools say Undo leaves them. Put
  them on it (the bpm and source before, the sequence before) if the owner wants it.
- **44k-9.** Saving a made look: 44c-2 above, now at rank 9.
- ~~**44k-10. Calibrate, the song detector and Listen.**~~ **Shipped** 2026-11-11:
  `calibrate` (Recalibrate room), `song_detection` (on, off), `listen` (start, cancel,
  name) and `show_state`'s `ear`, Full, through `app/earNow.ts` and
  `server/assistantEar.js` (`npm run assistant`, `ear-full`, `ear-auto`, `ear-bool`,
  `ear-name`, `ear-answer`, `phone-ear`). Story in `docs/plan-shipped.md` §44.
- **44k-10a. The ear's real doors, in a browser.** *(S, found building 44k-10.)* As
  44k-2c: `npm run assistant` drives `askEar` with doors built by hand, so a door in
  `useBench` or `useListen` that never fires, or a `publishRoom` in `useCastFeed` that
  stops being called, would pass. Add a line to a harness that loads the app with a
  sound playing: `calibrate`, then the state's `ear.room` calibrating and then done;
  `song_detection` off, then `ear.detector` false.
- **44k-10b. The phone's Sound sheet has no Recalibrate, Song Detection or Listen.**
  *(S, found building 44k-10.)* The desk's Sound panel and Songs panel have all three;
  the phone layout's Sound sheet (`PhoneStage.tsx`) has none, so a show run on a phone
  cannot recalibrate the room or name a song by hand. The assistant's tools reach a
  phone-layout display all the same (the doors are App()'s hooks, not the panels).
  Give the sheet the three presses, through the same callbacks.
- ~~**44k-11. Recording's options.**~~ **Shipped** 2026-11-11: `record_options` (makes
  video, take or both; quality; fps; format; sound), `take` (replay, stop, delete, by its
  number in the list) and `show_state`'s `record`, Full, through `app/recordNow.ts` and
  `server/assistantRecord.js` (`npm run assistant`, `record-full`, `record-format`,
  `record-values`, `record-id`, `record-answer`, `record-past`, `phone-record`). Story in
  `docs/plan-shipped.md` §44.
- **44k-11a. The phone's Record sheet has no quality, fps, format, sound or Takes.**
  *(S, found building 44k-11.)* The phone layout's More sheet has Record and Record
  makes; the desk's Record panel also has the Plate video's quality, frame rate,
  container and sound, and the kept Takes with Replay and the bin. A show run on a phone
  can record only at whatever the desk last chose, and cannot replay a Take. The
  assistant reaches a phone-layout display all the same (the door is useRecording's, not
  the panel's). Give the sheet the same controls, through the same callbacks.
- **44k-11b. Recording's real door, in a browser.** *(S, found building 44k-11.)* As
  44k-10a: `npm run assistant` holds the guard against a stand-in display and the page's
  `askRecord` against stand-in doors, but no line mounts `useRecording` and watches a real
  `record_options` light the Record panel's Master, or a real `take replay` re-fire a
  Take's strokes. A browser line (the app in Chromium, no GPU needed for the panel) would.
- **44k-11c. Options changed mid-recording say so.** *(S, found building 44k-11.)* The
  recorder reads its options when it starts, so `record_options` during a running Plate
  video applies to the next one; the tool says "from the next press of Record" every
  time. Better: `show_state`'s `record` carries the options the running video was started
  with, so the assistant can tell the owner what the file being written is.
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
- **44k-12a. Are the inputs named at launch, on the Mac?** *(S, found building 44k-12;
  needs the Mac.)* A browser names its inputs only once the page has microphone
  permission (until then `enumerateDevices` gives empty labels, and the list reads
  "Input 1", "Input 2"); `useSoundState` asks again once the microphone opens. The Mac
  app holds the permission, but whether its labels are there before the first open
  is unmeasured. Read `show_state`'s `sound.inputs` on the Mac with the source none
  after a fresh launch; if they are numbers, open the microphone once at launch for
  the names (and close it), or say so in the tool.
- ~~**44k-13. Film, pours and the room.**~~ **Shipped** 2026-11-11: `film` (a video
  file by path, a cartoon, a camera by name, a window, clear), `pour_file` (a picture or
  a film by path, a cartoon, stop), `room_camera` (on, off, a camera by name) and `mark`
  (a picture by path, or clear), Full, read back in `show_state`'s `media`, through
  `app/mediaNow.ts` and `server/assistantMedia.js`; files from `~/Movies` and
  `~/Pictures` only, served by the show server as the music player's are (`npm run
  assistant`, `media-full`, `-path`, `-kind`, `-folder`, `-cartoon`, `-camera`,
  `-answer`, `phone-media`). Story in `docs/plan-shipped.md` §44.
- **44k-13a. The phone layout has no film file, camera, window, room camera or mark.**
  *(S, found building 44k-13.)* The phone's More sheet has the cartoon shelf (pour or
  film a cartoon), so a cartoon the assistant puts on shows lit there; but a film from a
  file, a camera or a window, the room camera and the mark are the desk's Film, Motion
  camera and Mixer controls alone. A show run on a phone shows none of them, though the
  assistant reaches a phone-layout display all the same (the doors are the hooks', not
  the panels'). Give the sheet a line saying what is filmed and whether the room camera
  and the mark are on, from `useMediaNow`, and the switches beside it.
- **44k-13b. The media doors, in a browser.** *(S, found building 44k-13.)* As 44k-11b:
  `npm run assistant` holds the guard against a stand-in display and the page's
  `askMedia` against stand-in doors, but no line mounts `useFilm`, `usePour`,
  `useSceneSource` and `useCastFeed` and watches a real `film file` put the served
  video on the film, a real `mark` raise the Mixer's mark row, a real `pour_file` lay a
  picture as dye. A browser line (the app in Chromium; the film and the pour read back
  through the check hooks) would, and would measure that `loadFilmUrl` answers "done"
  for a file that will not decode (it does today: its `play()` failure is caught).
- **44k-13c. The owner's own media folders.** *(S, found building 44k-13.)* The
  assistant opens films and pictures from `~/Movies` and `~/Pictures`, or the folders
  `CHROMAGLASS_MEDIA_DIR` names, and the Mac app sets no such variable, so a film kept
  anywhere else (the owner's filmed takes are in a folder of their own in the home
  folder) must be moved first. A Settings row in the Mac app, "Folders Claude may open",
  kept in `show.json` and read by the show server, would let the owner widen it without
  a terminal.
- ~~**44k-14. OSC, MIDI and Syphon.**~~ **Shipped** 2026-11-11: `outputs` (osc_out on or
  off and its target, osc_in off, local or network, midi on or off and its ports by name,
  syphon on or off, status in any mode), Full, read back in `show_state`'s `outputs`;
  OSC out and MIDI through the page's own doors (`app/outputsNow.ts`), OSC in and Syphon
  answered by the relay through the Mac app's Show menu (`server/assistantOutputs.js`,
  `setAppOutputs`). MIDI learning stays the person's (`npm run assistant`,
  `outputs-full`, `-relay-full`, `-target`, `-target-bad`, `-midi-name`, `-midi-port`,
  `-answer`, `-oscin`, `-oscin-mode`, `-oscin-taken`, `phone-outputs`; the Mac's half in
  `npm run desktop`'s OSC block). Story in `docs/plan-shipped.md` §44.
- **44k-14a. Syphon from the assistant, on a real Syphon build.** *(S, found building
  44k-14.)* Syphon out (13.2, PR 723) is not on main, so `outputs syphon` reaches it only
  through the Show menu item `syphon-out` its check holds it to, and says "not in this
  build" until then; nothing has switched a real Syphon server from the assistant. Once
  13.2 ships: run `npm run desktop`'s OSC block on the Mac (its Syphon half then takes
  the item's branch) and add a line that `outputs syphon on` leaves
  `__chromaglassSyphon.serving` true.
- **44k-14b. MIDI's permission on a fresh Mac app.** *(S, found building 44k-14.)*
  `outputs midi on` waits five seconds for Web MIDI to answer and says the browser may be
  asking. Whether the Mac app grants MIDI without a prompt (`grantPermissions`) is
  unmeasured from the assistant: switch it on from Claude on the Mac with MIDI off, and
  read `outputs.midi.open`.
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
- **44k-15a. The cast from the assistant on the Mac, with a real projector.** *(S, found
  building 44k-15.)* The check holds the call to the page's door and the page's door to
  the cast sender's; nothing has opened the show's window from Claude on the Mac app with
  a second screen plugged in. Plug one in, ask Claude to put the show on the projector,
  and read `show_state`'s `projector.cast.casting` and the wall: the window should land on
  that screen, filling it, as a click on the chip puts it. In a browser it is refused (a
  window that no click opened is a blocked popup), and the answer says so.
- **44k-15b. Whether the show's window fills its screen.** *(S, found building 44k-15.)*
  The cast sender knows (`windowFullscreen`, the "fill the screen" chip), but it reaches
  `useControllers` only through App(), which may not grow, so `show_state` does not say
  whether a browser's title bar is on the wall. The Mac app fills the projector's screen
  itself, so this matters only in a browser. Pass it with the next byte App() frees.
- **44k-16. The rest.** *(S each, AG lane, as wanted.)* The palette lock and the tool
  and layer in hand (Play); Ambient TV mode; set lists' and sequences' own editing,
  files and binding to songs (Full). Wanted least in a show: build when the owner
  asks for one by name.
- **44k-17. The desk's layout.** *(M, asked 2026-11-11.)* `show_state`'s `desk` (the
  tabs by id and name, the one up, each tab's panels and whether each is docked,
  floating, folded or in its own window); `desk_tab` (put a tab up, Play: the
  person's screen changes, the plate does not); `desk_tabs` (rename, move, add as a
  copy, delete, reset, as `useDeskLayout`'s `TabEdit`, Full); `desk_panel` (dock,
  float, fold, close, open a panel on a tab, Full); `desk_pins` (pin or unpin a
  setting, the rides' and the recipe's lists, Full). The door: `useDeskTabs` and the
  pins in `App()`, through a sink, as the others. The desk syncs its tabs with the
  owner's account (8-tabs-a), so an edit from the assistant travels there too, as a
  person's would; a delete is Undo's to take back (the tab and its panels as they
  were). Pass: `npm run assistant` lines for each verb at the stand-in, and a `desk`
  line that the edited tab survives a reload.
- **44h. Control over the internet.** *(L. Next, the owner asked 2026-11-07. Claude's
  lane: security.)* For claude.ai on the web and the phone (and, if ever wanted,
  ChatGPT and the Gemini app): an MCP endpoint on a Cloudflare Worker (Streamable HTTP
  over HTTPS), OAuth that admits the owner's ChromaGlass account alone (Firebase
  sign-in, as `account-shows.js` already verifies), and a Durable Object the Mac app's
  show server holds an outbound WebSocket to, joining the relay as the same
  `assistant` role, so nothing on the Mac listens on the internet and the guard (44d)
  still decides everything on the Mac. Owed first: the vendors' current pages on
  custom connectors read (transport, auth), the running cost (expected inside the
  Workers free tier for one user), and a security review. Its check: the Worker
  against a stand-in Mac relay, a token for any other account refused, the switch off
  closing the tunnel. Pass: `npm run assistant` driven through the Worker as well as
  over stdio.

## Order

44k's gaps next, 44k-1 to 44k-8 first (the audit done 2026-11-11, the table under 44k), then 44h, each in its own PR (44i shipped 2026-11-08 beside it, the owner's YouTube connector; 44i-1 waits on the owner's Google setup); then 44c-3; 44d-2 to 44d-4, 44c-2 and 44f-2 to 44f-4 as they
are wanted.
