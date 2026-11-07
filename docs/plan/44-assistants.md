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
- **44d-4. A glide fights a fader the desk moves mid-glide.** A phone's or OSC's patch
  cancels the key's glide at once (`onPerformer`); a desk move is only seen in the next
  snapshot, so up to a glide's remaining steps land over it. Glides default to 1 s.
  Fix with 44d-3's marking. Pass: a desk move mid-glide stops the glide within 100 ms.
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
- **44c-4. A bigger picture.** `look_at_plate` rides the remote's Draw picture, at most
  480 px wide (`PAD_PICTURE_MAX_WIDTH`), enough to judge mud and balance, not fine
  detail. A one-off still at 1024 px for the assistant, through the same grab
  (`gpu/padGrab.ts`). Pass: the image's width read from its JPEG header.
- **44f. A pour as a song action.** *(S.)* `songShows.ts` has no *what* that drops a
  colour: `dyes` takes the look's next palette, and `burst` presses. Add `{ do: 'pour';
  color; amount }` so "blue on the next drop" is a song action and not a timed call,
  and a `make_song_show` / `on_next` tool so the assistant can program it. The check is
  `npm run songs`, extended: a pour at the second drop fires on the frame the section
  starts and not before.
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

44h next, in its own PR; then 44c-3 and 44f; 44d-2 to 44d-4, 44c-2 and 44c-4 as they
are wanted.
