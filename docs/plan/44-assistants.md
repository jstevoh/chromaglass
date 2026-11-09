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
- **44f-4. The display does not answer a song action.** The guard's yes means it
  passed the guard; the display can still drop it (no song playing by the time it
  lands, 24 actions from the assistant already in that song's show, a *what* it does
  not know, a `set` that names no setting), and says so only in its console. The MCP
  checks the track first, which covers the usual case. A `song-action-reply` from the
  display through the relay would close it, and with it a check of the page's own half
  (`parseSongAction` to `addSongCue` to the pinned cue), which `npm run assistant`
  stops short of at its stand-in display. Pass: an `npm run assistant` line where the
  display refuses and the tool says why.
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

44h next, in its own PR (44i shipped 2026-11-08 beside it, the owner's YouTube connector; 44i-1 waits on the owner's Google setup); then 44c-3; 44d-2 to 44d-4, 44c-2 and 44f-2 to 44f-4 as they
are wanted.
