# Changelog

## Unreleased

- A structure and light read: what each frame is made of and where its light sits. Cells and
  borders (size, sides, junction angles against Plateau's 120°, border thickness), edge
  profiles (step, line, double line, halo), light against structure (dark-field index, colour
  of interiors, borders and nodes, specular highlights, lateral colour fringe), a speck census,
  focus layers and motion layers (own motion, camera glide with parallax, turn with its centre),
  and an illustrated index with its parts. In every summary, and on its own for stills:
  `node scripts/watchstructure.mjs <video or image>`. Held by `watchstructuretest.mjs`.

## 0.1.0 (2026-11-28)

First public release.

- Watch a file or a link (anything yt-dlp fetches): contact sheets, a slit-scan timeline,
  per-frame numbers, a design read, a motion read, the overall arc in words, a shot list with
  cuts on the beat, and one self-contained `report.html` with the clip's best moment.
- A general read for any footage, and a liquid read (physics, report card) for liquid light
  shows, chosen from the footage itself or by `--liquid` / `--general`.
- `--vs` and `--before/--after` comparisons, a reference library (`--keep`, `--refs`).
- `--batch` over a folder, a playlist or a list, with a ranked table and an offline rating
  page; `--refit` fits the report card to your own ratings; `--notes` finds what your notes
  keep saying.
- A judging skill for Claude (honesty rules, lenses for editors, colourists, VJs and anyone),
  a helper agent, a `/reelreader` command, and a test set of four clips with known answers.
