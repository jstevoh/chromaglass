# mcp

The owner's assistant link (PLAN 44c): a Model Context Protocol server over stdio that
joins the show server as its `assistant` role. A private tool: not shipped inside the
Mac app, and not named on any page a visitor or customer reads.

## Start here

- `chromaglass-mcp.js`: the whole server. No dependencies: newline-delimited JSON-RPC
  (initialize, tools/list, tools/call, ping), Node's own WebSocket (the repo's `ws` on
  Node 20). Finds the show on `127.0.0.1` (`CHROMAGLASS_PORT`, default 3000), takes the
  key from `/remote-info.json`, says hello as `assistant`. Its tools, and the mode each
  needs, are the `TOOLS` table; its guide for the assistant is `GUIDE`. The owner's
  notes are a file outside the repo (`CHROMAGLASS_ASSISTANT_NOTES`, default
  `~/.chromaglass/assistant-notes.md`).

## Contracts

- Decides nothing: every rule is the show server's guard (`server/assistant.js`), and a
  refusal is passed on in the guard's words.
- Imports `ROOM_KEYS` from `server/assistant.js`; `server/` never imports this folder.
- Writes nothing to stdout but protocol; logs to stderr.
- Dormant unless the owner's switch is on: `CHROMAGLASS_ASSISTANT`, or one word (off,
  suggest, play, full) in the file the show server reads (`CHROMAGLASS_ASSISTANT_FILE`;
  the Mac app's is `assistant` in its userData folder).

## Checks

`npm run assistant` (scripts/assistant.mjs): this server over stdio against the real show
server, every rule with a mutant that must fail.
