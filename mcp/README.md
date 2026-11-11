# mcp

The owner's two Model Context Protocol servers over stdio, each run by a local
assistant on the owner's Mac. `chromaglass-mcp.js` is the assistant link (PLAN 44c): it
joins the show server as its `assistant` role. `youtube-mcp.js` is the owner's YouTube
channel (PLAN 44i). A private tool: not shipped inside the
Mac app, and not named on any page a visitor or customer reads.

## Start here

- `chromaglass-mcp.js`: the whole server. No dependencies: newline-delimited JSON-RPC
  (initialize, tools/list, tools/call, ping), Node's own WebSocket (the repo's `ws` on
  Node 20). Finds the show on `127.0.0.1` (`CHROMAGLASS_PORT`, default 3000), takes the
  key from `/remote-info.json`, says hello as `assistant`. Its tools, and the mode each
  needs, are the `TOOLS` table (`look_at_plate {size: large}` is one 1280 still, PLAN 44c-4; `add_song_action` programs the playing song's show, 44f; `pour_text` pours a song's name as ink, PLAN 37x-10c; `go_live` starts the stream, to named destinations if given, and `set_sound_source` picks what the show hears, both Full, PLAN 44j; `show_state` reads the saved destinations, each one's health on air, and the sound; `bottle`, `finger` and `flick` are the bench and the hand's last two gestures, `tempo` (Play) and `link` (Full) the beat clock, `sequencer select` and `stage` the Sequence, and `show_action` has the Mixer's row takes, PLAN 44k-4 to 44k-8; `show_state` reads the bench, the tempo and every sequence); its guide for the assistant is `GUIDE`. The owner's
  notes are a file outside the repo (`CHROMAGLASS_ASSISTANT_NOTES`, default
  `~/.chromaglass/assistant-notes.md`).

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
- Imports `ROOM_KEYS` from `server/assistant.js`; `server/` never imports this folder.
- Writes nothing to stdout but protocol; logs to stderr.
- Dormant unless the owner's switch is on: `CHROMAGLASS_ASSISTANT`, or one word (off,
  suggest, play, full) in the file the show server reads (`CHROMAGLASS_ASSISTANT_FILE`;
  the Mac app's is `assistant` in its userData folder).

## Checks

`npm run youtube` (scripts/youtube.mjs): the YouTube server over stdio against a stand-in
Google on loopback, every rule with a mutant that must fail.

`npm run assistant` (scripts/assistant.mjs): this server over stdio against the real show
server, every rule with a mutant that must fail.
