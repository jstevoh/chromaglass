# reelreader, the link watcher, in this repository

`npm run watch -- <file or URL> --out DIR` watches a video (a file, or a link) and turns it into
pictures and numbers a person or Claude can read: contact sheets, a slit-scan timeline, a shot
list, a design read, a motion read, a physics read for liquid footage, and one `report.html`.

The tool is **reelreader**, MIT, and since PLAN 47p-7 (2026-11-28) it is made in its own public
repository, **jstevoh/reelreader**, and installed here from npm like any other package, pinned to
an exact version in `package.json` (`devDependencies`). Its README there is the front page: what
it makes, every flag, liquid or general, the config file, its limits. Its judging skill, words
guide, test set and evals ship inside the package, at
`node_modules/reelreader/skills/reelreader/`; `.claude/skills/watch/SKILL.md` is ChromaGlass's
layer on top and says to read that skill first.

## Why it moved

It began here (47v, 47x) as the way ChromaGlass judges its plate against real liquid light shows,
and was then packaged for anyone (47p). For a release, a pack script copied its modules from
`scripts/` into the public repository, one commit a release. The owner asked (2026-11-28) for
reelreader to be developed in its own project, and this repository is going private, so the
public repository became the source of truth and the pack script, its test and the in-repo copy
went: one copy of the code, tested where it is made (its CI runs `npm test` on Node 20 and 22),
and used here at a version we chose.

## What stays here

Only what knows about ChromaGlass:

- `reelreader.config.json` at the repository's root (reelreader looks in the folder it runs from,
  and every npm script runs from here): the reference library (`$CHROMAGLASS_REFERENCES`, the
  shared folder, the Mac's), the Mac fetch route for YouTube links, the scratch name, and the
  settings map.
- `scripts/watchsettings.mjs`, the settings map: a gap against a reference as ChromaGlass dials
  ("Settings to try").
- The four checks that need the app: `npm run watchcard` (footage robustness, the report card and
  the settings map, with mutants of the installed modules), `npm run watchconfig` (the project's
  places live only in the config; the installed package names none of them), `npm run watchmode`
  (Settings to try goes with the liquid read), `npm run ratepage` (the rating page in Chromium).
  `npm run watch -- --selftest` runs the installed package's own self-test with this machine's
  ffmpeg.
- The scripts that film the app and read the takes import the package by path, for example
  `import { watchVideo } from 'reelreader/scripts/watch.mjs'` (film, showreel, moving, gig, pacing,
  loopseam, codecblip, classichand).

## Changing reelreader

A new measure, a misread or a new flag is a pull request to jstevoh/reelreader (its `CLAUDE.md`
and `PLAN.md` say how work is done there), then a release there, then a PR here that raises the
pin and shows the numbers it moved. Never patch `node_modules`. To try a change against our takes
before it is released, `npm install --no-save ../reelreader` from a checkout of that repository.
