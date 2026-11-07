# 44. A person's AI assistant plays the show (asked 2026-11-07)

Asked 2026-11-07: should the app have a skill or an interface so that the assistants
people already use (Claude, ChatGPT, Gemini) can make looks and drive the show? "Make a
slow purple look for this song", "pour blue on the next drop", "build me a set for these
six tracks". **Design only: nothing here is built until the owner answers 44-0.** Its
priority is below the YouTube launch (§37x) and the Release kit (§43).

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

- **44-0. The owner's call: the tier, and whether to go remote.** Recommended: 44a free
  for everyone (it is files, and presets as files are free already); the live connection
  (44b–44f) **Pro**, beside OSC in and Art-Net, since it rides the same show server and is
  the same kind of pro integration (§23's table); the remote connector (44h) not built
  until local has people asking for it. The alternative worth weighing: Suggest mode
  (44d) in Home, since the phone remote is Home and Suggest can do less than the phone.
- **44a. A page for assistants.** *(S. Works in all three today.)* `public/assistants.md`,
  served at `chromaglass.art/assistants.md`, pointed at by a new `public/llms.txt` and by the guide: what
  a look is, the look keys with each one's travel and its one line of help (generated
  from `LEARNABLE_SETTINGS` in `src/lib/midi.ts` and `src/lib/controlHelp.ts`, never
  written by hand), the built-in looks by id, the liquids, and the set-list and song-show
  file shapes, with three worked examples ("slow purple for a ballad", "a drop that
  pours", "a six-song set"). Its check, `npm run assistantdoc`: every example on the page
  loads through the real readers (`readSetListFile`, `parseFile`) with no key unknown, and
  the key table matches the code, so the page cannot rot. Phone: the files load on the
  phone as they do on the desk. Pass: the three examples load, and a page with a key
  renamed fails.
- **44b. The assistant role on the show server.** *(S. Claude's lane: it is the show
  server's security.)* A fourth `hello` role, `assistant`, beside `display`, `controller`
  and `mirror`: admitted only from the laptop itself, only with the show key, only at the
  tier 44-0 picks (the relay already knows it, `proLinks()`), and only while the
  Assistant switch (44d) is not Off. The display is told how many are connected, as it is
  for phones. Its own role, not a controller with a new name, so the display can hold it
  to 44d's limits and never mistake it for the performer's phone.
- **44c. The local MCP server.** *(M.)* `mcp/chromaglass-mcp.js`, its own folder and
  package like `desktop/` (it uses the MCP SDK, which `server/` must not import), shipped
  inside the Mac app. It finds the show server on `127.0.0.1` (port 3000, or
  `CHROMAGLASS_PORT`), reads the key from `/remote-info.json`, joins as `assistant`, and
  turns MCP calls into the remote messages above. It runs with no Node installed, on the
  app's own Electron (`ELECTRON_RUN_AS_NODE=1`). What it offers:
  - Resources (read): the show now (the `state` snapshot, trimmed to the look's keys),
    the library of looks, the look keys with travel and help (44a's table), the song
    playing and its sections where a song map has them, the beat clock's tempo.
  - Tools that need only Suggest: `make_look` (a name, a base look and the keys to change:
    saved to the library, the plate untouched), `cue_look` (arm one for the performer's
    Go), `make_song_show` (a song show with its actions, saved; the app plays it when that
    song comes on), `describe_show` (the state in words).
  - Tools that need Play: `go` (fire the armed look over its fade), `set` (look keys only,
    glided), `pour`, `blow`, `press`, `tilt`, `dye`, `on_next` (one song action at the
    next section, bar or Nth kick), the sequencer's transport, and `undo`.
  - Never offered: clear, drain, blackout, record, the live stream, overlays, the rig and
    setup keys, OSC, Art-Net, Link, MIDI maps, the licence, files, quitting. Clear and
    drain stay possible inside a song show, where the performer saw them in the plan.
- **44d. The guard.** *(M. Ships in the same PR as 44c; the display enforces it, not the
  MCP server, because the server is the side an assistant controls.)*
  - **The switch.** *Show → Assistant: Off / Suggest / Play*, Off at every launch. On the
    desk's status line and the phone's, with one press to Off; `assistant-off` as a desk
    action, so MIDI and OSC can learn it. Suggest is the first step on.
  - **Limits.** A look change at most every 4 s; settings at most four patches a second,
    merged, each glided over at least half a second through the look fade (never a jump);
    gestures at most ten a second. Over a limit the call is refused with the reason, which
    the assistant reads and can say.
  - **The hand wins.** A key the performer moved in the last ten seconds is refused to
    the assistant, so it never fights a fader under a finger.
  - **Undo.** The display keeps the look's keys from before each of the assistant's last
    ten changes; Undo glides back to the one before, on the desk, the phone, MIDI and as a
    tool.
  - **Flashes.** Everything the assistant sets passes `src/lib/flashGuard.ts`'s limits as
    the desk's own patches do (check that every patch path does before relying on it).
  - **Text is data.** What the show hands back (a track's name from song ID, a shared
    look's name) is marked as data in every tool's answer, so a title cannot instruct the
    assistant.
- **44e. Connecting an assistant.** *(S. AG lane: UI and copy.)* *Show → Connect an
  assistant…* in the Mac app: a Claude Desktop extension file (`.mcpb`) that installs on a
  double-click, and the config lines for Claude Code, the Gemini CLI, the Codex CLI and
  Cursor, each with a Copy button and the app's own path filled in. A section of
  `docs/guide.md` with the same, and a line in Show Server Details naming who is
  connected. Phone: the phone shows the Assistant switch, its mode, the armed look's
  "from your assistant" label, and Undo.
- **44f. A pour as a song action.** *(S.)* `songShows.ts` has no *what* that drops a
  colour: `dyes` takes the look's next palette, and `burst` presses. Add `{ do: 'pour';
  color; amount }` so "blue on the next drop" is a song action and not a timed call. The
  check is `npm run songs`, extended: a pour at the second drop fires on the frame the
  section starts and not before.
- **44g. The check, written first.** *(S. Claude's lane: written and shown red on main
  before the build, the builder removes the id from `--owed`.)* `npm run assistant`:
  starts the show server and a stand-in display, drives the MCP server over stdio with a
  real MCP client, and asserts, from the messages the display receives: each tool sends
  the message it should; Off refuses the role; Suggest refuses `go`, `set` and gestures;
  a rig key is refused; the fifth patch inside a second is refused; a key moved by the
  stand-in performer is refused for ten seconds; Undo restores the keys exactly; a
  below-tier key is refused. Each assertion also run against a mutant that drops the
  rule, which must fail.
- **44h. A remote connector, if 44-0 says so.** *(L.)* For ChatGPT, the Gemini app and
  claude.ai: an MCP endpoint on a Cloudflare Worker (Streamable HTTP over HTTPS), OAuth
  with the person's ChromaGlass account (Firebase sign-in, as `account-shows.js` already
  verifies), and a Durable Object per account that the Mac app's show server holds an
  outbound WebSocket to, so nothing on the Mac listens on the internet. The Mac still
  enforces 44d; the cloud only relays. Owed before it is built: the vendors' own pages
  read (which transports, which plans, the review each store asks for), the running cost
  measured, and a security review (Claude's lane). Not started until local has users.

## Order, if the owner says yes

44a first (one day, all three assistants, no tier question), then 44g, then 44b with
44c and 44d as one PR and 44e as the AG brief, then 44f. 44h waits on 44-0 and on demand.
