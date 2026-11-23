# Sharing the watch tool as a Claude Code plugin (PLAN 47x-4)

A plan, not built. The owner decides on packaging after the test on real films (47x-3).

## What goes in the first plugin

**watch**, with **check-skeptic** beside it. Both are useful to anyone who builds things
with Claude Code, and neither needs ChromaGlass to run.

- `watch` lets Claude look at a video: a YouTube or other link, a phone recording, a screen
  capture of an app. It returns contact sheets, a slit-scan timeline, numbers for motion,
  colour, form and flow, and (after 47x) a plain-language read and a before/after diff.
  Anyone making animation, motion graphics, games, generative art, UI transitions or
  shaders has the same problem the owner had: Claude cannot watch a film, only stills.
- `check-skeptic` reviews a new test or check for the ways it can pass while measuring
  nothing (a fallback that swallows a null, a bar that holds whatever the input, a check
  that reads its own answer from a file name). It is project-independent once its examples
  are general.

## What it needs

- Node 20 or later, `ffmpeg` and `ffprobe` on the PATH; `yt-dlp` only for links. No npm
  packages: the scripts import only Node's own modules (fs, os, path, zlib,
  child_process), so the plugin installs nothing.
- macOS, Linux and Windows (WSL at least; native Windows to be tried).

## Layout

```
chromaglass-watch/            (the plugin's own repository, or a folder in a marketplace)
  .claude-plugin/plugin.json  name, version, description, author "the ChromaGlass project"
  skills/watch/SKILL.md       the skill, made general (below)
  skills/watch/scripts/       watch.mjs, watchdesign.mjs, watchphysics.mjs, watchcuts.mjs,
                              watchrefs.mjs, watchwords.mjs, watchpair.mjs, the self-tests
  skills/watch/watch-words.md the vocabulary page (docs/watch-words.md)
  agents/video-watcher.md     watches long or several videos in its own context
  agents/check-skeptic.md
  commands/watch.md           /watch <link or file> [--vs ref] [--before A --after B]
  README.md, LICENSE
```

The skill calls `node ${CLAUDE_PLUGIN_ROOT}/skills/watch/scripts/watch.mjs`, not
`npm run watch`, so it runs in any project.

## What must change first

1. **One source.** The repo keeps the scripts where they are; a small script
   (`scripts/pluginpack.mjs`) copies them into the plugin layout and checks nothing in them
   reaches outside the set. The plugin is built from main, never edited by hand.
2. **Take the app out of the skill.** SKILL.md today has about a dozen ChromaGlass lines
   (the plate, the app's own takes, the Mac's recorder). They move to a project note the
   repo's own copy keeps; the shared copy says "your app" or "your film".
3. **References.** `REAL_SHOWS` and the ref store (watchrefs.mjs) hold the liquid light
   show films the owner chose. The plugin ships the code and an empty store, with the
   liquid shows as an optional example set, links only (no film files, no copyrighted
   frames).
4. **The vocabulary stays general.** Laban, Itten, Ching, Greenberg and Arnheim apply to any
   moving picture. The wet show's own words (cells, threads, a turned dish) are for liquid
   footage; they stay, marked as one domain's words, and the doc says how to add another
   domain's (a game's, a dancer's).
5. **check-skeptic's examples.** Its rules come from `docs/roadmap.md` and ChromaGlass
   checks; the shared copy keeps the rules and swaps the examples for general ones.
6. **Self-test on install.** `watch.mjs --selftest` and `npm run watchwords`'s clips run
   with only ffmpeg, so `/watch --selftest` tells a new user at once whether it works.

## How it is shared

- **A marketplace in a public repo** (`.claude-plugin/marketplace.json`), installed with
  `/plugin marketplace add <owner>/<repo>` then `/plugin install chromaglass-watch`. This is
  the simple route and needs nobody's approval.
- Later, if it is used, a pull request to a community plugin directory.
- MIT, like the scripts; the vocabulary page credits its sources.

## The second wave (each its own plugin, after the first is out)

- **steward and ship**: drive a red PR to green, then merge and confirm the deploy. The
  Firebase and ChromaGlass parts become settings (the deploy workflow's name, the time zone).
- **The Antigravity handoff kit**: the brief format, the handoff block in a PR body, the
  audit of a run's log, the queue. Useful to anyone running a second coding agent beside
  Claude Code.
- **Keeping a session small**: the CLAUDE.md rules (read the section not the file, batch
  tool calls, one thread per PR, compaction at 200k) as a write-up, not a plugin.

Not shared: `look`, `crash-triage`, the chromaglass and YouTube MCP servers (they need the
app).

## The film half of the realism audit

PLAN 31s-5's realism audit reads the code for each phenomenon; the watch tool is its film
half. The plugin keeps that working inside the repo: `--vs` against a real-show reference
and `--before/--after` both print the same "What changed" and "In words" sections the audit
can quote. Nothing in the packaging may drop them.

## Open questions for the owner

1. The plugin's name: `watch`, `film-eye`, or `chromaglass-watch`.
2. Its own repository, or a folder in this one with a marketplace file.
3. Whether the liquid light show references ship as an example set.
