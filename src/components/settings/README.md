# src/components/settings: the settings panel's sections

`SettingsPanel.tsx` was 201 KB until PLAN 19ai-9, and 160 KB of it was one JSX tree:
twenty-nine sections, each `{keep(id) && (<section ...>)}`, reading the panel's props and
locals by name. Each section is now a component here, its markup moved verbatim, and the
panel draws them in the order they stood. A section is handed one object, `SectionCtx`
(`props.ts`), and destructures the names its markup reads; the panel keeps the shells (the
sheet with its rail and search, the Stage sheet, a desk panel), the engine's polling and
the section state.

Files follow the rail's groups (`lib/settingsMap.ts`), with Feed cut by section because it
holds the three longest:

| File | Sections (by id) |
|---|---|
| `PlaySections.tsx` | `master`, `mixer` |
| `SoundSection.tsx` | `audio-input` |
| `RoomFilmSections.tsx` | `room`, `film` |
| `PatchesSection.tsx` | `patches` |
| `MidiSection.tsx` | `midi` |
| `LookSections.tsx` | `look`, `show`, `camera`, `stock`, `lamp`, `macro` |
| `MotionSections.tsx` | `kaleidoscope`, `tilt`, `spin`, `physics`, `automation` |
| `ChemistrySections.tsx` | `squish`, `oil`, `ferro`, `reactions` |
| `PourSections.tsx` | `interaction`, `liquids` |
| `StageSections.tsx` | `projectors`, `mapping`, `mark`, `simulation`, `layers` |
| `controls.tsx` | `Slider` and `PinChips` (with `PinContext`), which every section draws |
| `patchLists.ts` | what a patch listens to and is plugged into |
| `props.ts` | `SettingsPanelProps` and `SectionCtx` |

A new section is a component in its group's file, a `<XSection c={c} />` line in the
panel's `sections` at its place in the sheet, and a row in `SETTINGS_SECTIONS`. A name a
section starts reading goes into `SectionCtx` and the object the panel builds; the
typecheck says which is missing. The checks that read the panel's markup as text (`panel`,
`desklayout`, `rowfade`) read the panel and this folder as one text through
`scripts/settingsSource.mjs`, so a section's `<Slider>` is found wherever it lives.
