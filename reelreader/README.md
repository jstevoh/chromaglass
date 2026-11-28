# reelreader/: the parts of the public watch tool that are not code

The watch tool (`scripts/watch.mjs` and its modules, README [docs/watch.md](../docs/watch.md))
ships to anyone as **reelreader**, under the MIT licence (PLAN 47p). Its scripts stay in
`scripts/`, where this repository's checks run them; this folder holds what goes with them
and is copied into the release as it stands:

- `skill/`: the public judging skill, a self-contained Claude skill folder.
  - `SKILL.md`: honesty rules first, how to run and read the tool, the content read, the
    lenses (anyone, editor, colourist, VJ or liquid light artist), comparing two films.
  - `watch-words.md`: the words guide (where every word in a summary comes from). The watch
    tool's tests read it here (`npm run watchwords`, `npm run watchmode`).
  - `agents/video-watcher.md`: the helper that watches long or several videos in its own
    context.
  - `example.md`: one worked account; `evals.md`: building an eval set from your own ratings
    (a batch run's rating page, ratings.json, the agreement, the notes' themes and the refit).
  - `testset/`: four short clips with known answers (`README.md` is the key, `answers.json`
    its measured half), plus a linked real show that is not shipped.

- `release/`: what only the public repository has: its README (the front page, with a demo
  run), `package.json` (the copy's `files` list and test line are written by the build), the
  MIT licence, the changelog, `bin/reelreader.mjs` (the npx command), `claude-plugin/` (the
  plugin and its own marketplace, `.claude-plugin/` in the copy), the `/reelreader` command,
  `gitignore` and `github-workflows/` (its CI, and a release run from the Actions tab or on a `v` tag: the skill zip on the
  GitHub release and the package on npm with the repository's `NPM_TOKEN`). Dotted names are
  kept undotted here so this repository's own tools never read them as their own.

The public repository is built from this folder and `scripts/` by
`node scripts/reelreaderpack.mjs --out DIR --demo --zip --test` (PLAN 47p-6), one commit a
release; never edit the copy by hand. `npm run reelpack` holds the build.

`npm run reelset` holds the folder: every link inside it resolves, no page names this project,
its owner, its places, its plan or a model, and every test clip still measures what the key
says (`-- --fetch` adds the linked real show).

ChromaGlass's own layer stays in this repository, on top of the public skill:
`.claude/skills/watch/SKILL.md` (the owner's links and the Mac route, our takes, the solver's
terms, the real shows and the reference library, our faults, the settings map) and the
project's helper `.claude/agents/video-watcher.md`.
