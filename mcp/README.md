# mcp

The owner's Model Context Protocol servers: two over stdio, each run by a local
assistant on the owner's Mac, and the relay Worker that carries the show's to claude.ai. `chromaglass-mcp.js` is the assistant link (PLAN 44c): it
joins the show server as its `assistant` role. `youtube-mcp.js` is the owner's YouTube
channel (PLAN 44i). A private tool: not shipped inside the
Mac app, and not named on any page a visitor or customer reads.

## Start here

- `chromaglass-mcp.js`: the whole server. No dependencies: newline-delimited JSON-RPC
  (initialize, tools/list, tools/call, ping), Node's own WebSocket (the repo's `ws` on
  Node 20). Finds the show on `127.0.0.1` (`CHROMAGLASS_PORT`, default 3000), takes the
  key from `/remote-info.json`, says hello as `assistant`. Its tools, and the mode each
  needs, are the `TOOLS` table (`look_at_plate {size: large}` is one 1280 still, PLAN 44c-4; `add_song_action` programs the playing song's show, 44f; `pour_text` puts a song's name up as the corner caption, as `song_title` does (it poured ink until 37x-10m), PLAN 37x-10c; `go_live` starts the stream, to named destinations if given, and `set_sound_source` picks what the show hears, both Full, PLAN 44j; `show_state` reads the saved destinations, each one's health on air, and the sound; `bottle`, `finger` and `flick` are the bench and the hand's last two gestures, `tempo` (Play) and `link` (Full) the beat clock, `sequencer select` and `stage` the Sequence, and `show_action` has the Mixer's row takes, PLAN 44k-4 to 44k-8; `set_list` (arm, cancel, go_now, fade, revert) and `back_plate` the set list, `song_show`, `remove_song_action`, `song_show_run` and `nudge` the song shows, PLAN 44k-3 and 44k-5; `play_track` (a shelf track by title, a file in ~/Music by path) and `music` (play, pause, seek, loop, close) the music player, Full, PLAN 44k-2; `calibrate`, `song_detection` and `listen` (start, cancel, name) the ear's presses, Full, PLAN 44k-10; `record_options` (makes, quality, fps, format, sound) and `take` (replay, stop, delete) recording, Full, PLAN 44k-11; `outputs` (osc_out, osc_in, midi, syphon in Full, status in any mode) the outputs, PLAN 44k-14, `show_state`'s `outputs` merging the display's OSC out and MIDI with the relay's OSC in and Syphon; `projector` (cast, mode, test, identify) and `wall` (the geometry and grade, reset) the projector, Full, PLAN 44k-15, read back in `show_state`'s `projector`; `desk_tab` and `hand` (the palette lock, the tool, its amount, the plate in hand) in Play, `desk_tabs`, `desk_panel`, `desk_pins` and `desk_view` (the MIDI activity overlay, Ambient TV) in Full, the desk, PLAN 44k-16 and 44k-17, read back in `show_state`'s `desk`, a tab deleted or the tabs reset from there put back by `undo`; `show_state` reads recording, the ear (the detector, the room's calibration, Listen), the player (where it is carried forward from the display's `at` and `atTime`, `playerNow`),  the bench, the tempo, every sequence, the set list and the shows in brief). A call the display can fail (a song action, the set list, the song shows) waits for the display's own answer after the guard's yes (`askDone`), and says "allowed but not confirmed" when a display one build older gives none; its guide for the assistant is `GUIDE`. The owner's
  notes are a file outside the repo (`CHROMAGLASS_ASSISTANT_NOTES`, default
  `~/.chromaglass/assistant-notes.md`).

- `editTools.js`: `set_list_edit` and `sequence_edit` (Full; a sequence read and a file
  written out from Suggest), the set list and the sequences built, PLAN 44k-16a:
  `EDIT_TOOLS` (spread into `TOOLS`), `EDIT_TOOL_NAMES`, `editCall` (numbers from 1 to
  the display's from 0, a stage's fields in the page's words, read back in
  `show_state`'s `set` and `sequencer`). A file by `path` is read or written here, on
  the owner's Mac: a .json file in the home folder only, never over one already there
  without `overwrite`.
- `tunnel-worker.js`: the owner's assistant over the internet (PLAN 44h): the remote MCP address claude.ai signs in to (OAuth 2.1 with DCR and PKCE S256, only Claude's hosted callbacks, only `OWNER_UID`'s Firebase sign-in made on its page, twenty registrations or pages an address per ten minutes) and the Durable Object `ShowTunnel` the Mac's `mcp/tunnel.js` dials out to; a pipe, every request answered on the Mac. Exports `REDIRECTS`, `redirectAllowed`, `sha256Hex`, `OFFLINE` and its lifetimes. A Worker (`wrangler.tunnel.toml`), kept here with the owner's other private servers, not in `server/`: no visitor's data reaches it (it admits only the owner), so the privacy page, which `npm run privacy` holds to `server/` and `src/`, does not name it, as it does not name the YouTube server's Google; imports `../server/firebase-token.js`.
- `tunnel.js`: the same server for claude.ai on the web and the phone (PLAN 44h):
  `node chromaglass-mcp.js tunnel` holds one outbound WebSocket to the owner's relay
  Worker (`mcp/tunnel-worker.js`) and answers each request it brings with the stdio
  server's own `onRequest(m, write)`, so the tools and the guard are the local ones. Open
  only while the show admits the assistant (the app running, the switch on); `tunnel key`
  makes the Mac's key (`~/.chromaglass/tunnel/key`, 600; `CHROMAGLASS_TUNNEL_DIR`) and
  prints its SHA-256 for the Worker, `tunnel status` and `tunnel revoke` ask the Worker
  with it. The relay's address: `~/.chromaglass/tunnel/relay` or `CHROMAGLASS_RELAY`,
  https only (http on 127.0.0.1 for the check). Uses the repo's `ws`, for the header.

- `youtube-mcp.js`: the channel, with no show running. The YouTube Data API v3 signed in
  as a desktop app (`login` once: loopback, PKCE, the refresh key at 600 in
  `~/.chromaglass/youtube/`, `CHROMAGLASS_YOUTUBE_DIR`, beside the Google client file
  the owner saves there). Tools: `channel`, `list_videos`, `upload_video` (resumable
  8 MiB chunks; resumes a dropped connection, an expired key, and a closed app from
  `uploads.json`), `upload_status`, `update_video` (only the fields named change),
  `set_thumbnail`, `list_playlists`, `create_playlist`, `add_to_playlist`. No delete.

## Contracts

- `youtube-mcp.js` imports nothing from the repo (it may move to a repository of its
  own, 44i-2), uploads private unless told otherwise (Google's own default is public
  since 2026-11-02), and never puts a key, the client secret or an upload session's
  address in a reply or the log. `CHROMAGLASS_YOUTUBE_GOOGLE` points it at a stand-in
  for the check, and only on `http://127.0.0.1`.

- Decides nothing: every rule is the show server's guard (`server/assistant.js`), and a
  refusal is passed on in the guard's words.
- Imports `ROOM_KEYS` from `server/assistant.js` and `EDIT_TEXT_MAX` from
  `server/assistantEdit.js` (and the relay Worker `verifyFirebaseToken` from
  `server/firebase-token.js`); `server/` never imports this folder. The one thing it judges
  itself is where a file it reads or writes for `set_list_edit` or `sequence_edit` may be
  (the home folder, .json), since only this program touches the owner's disk.
- Over stdio, writes nothing to stdout but protocol; logs to stderr. (`tunnel key`, `status` and `revoke` print their answer.)
- Dormant unless the owner's switch is on: `CHROMAGLASS_ASSISTANT`, or one word (off,
  suggest, play, full) in the file the show server reads (`CHROMAGLASS_ASSISTANT_FILE`;
  the Mac app's is `assistant` in its userData folder).

## Checks

`npm run youtube` (scripts/youtube.mjs): the YouTube server over stdio against a stand-in
Google on loopback, every rule with a mutant that must fail.

`npm run assistant` (scripts/assistant.mjs): this server over stdio against the real show
server, every rule with a mutant that must fail.

`npm run relay` (scripts/relay.mjs): this server in tunnel mode, through the relay Worker
run in Node and signed in to as claude.ai does, against the real show server, every rule
with a mutant that must fail.
