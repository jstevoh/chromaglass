# src/components/desk

The desk: the laptop's control surface around the plate. Perform and Design are layouts of one `Desk` (`lib/deskLayout.ts`), with tabs, panels that dock or float, rides and the cue list.

## Start here

- `Desk.tsx` (44 KB, grep it): `Desk`, the layout, its slots and panels.
- `deskProps.ts`: `DeskProps`, `Cue`, `SetAction`, `SetItemAction`: everything `App.tsx` passes in.
- `DeskPanels.tsx` (54 KB, grep it): `PanelBody`, `panelMeta`: what each panel draws.
- `DeskHeader.tsx`: `DeskHeader`, `DeskDots`, the top bar and status dots.
- `TabStrip.tsx`: `TabStrip`, the tabs and their editor.

## Contracts

- `App.tsx` owns settings and show state, with the hooks in `src/app/`, and hands them down through `DeskProps`; the desk changes them only through those callbacks.
- One panel, one kind of control (PLAN 8d-3): `RidesBody` draws sliders, `ControlGrid` (the Recipe and every section's knobs panel) draws knobs, whatever a control is learned to. `DeskProps.kindFor` is gone with that rule; `controlKindOf` in `lib/midi.ts` still names a board's faders but nothing draws by it.
- Layout and tabs come from `lib/deskLayout`, `lib/deskTabs` via `hooks/useDeskLayout`.
- Imports `src/lib`, `src/types`, `src/brand`, `../ui` and a few siblings (`MixerPanel`, `VideoShelf`, `SongScore`, `PanelGuard`, `ToolAmount`, `AlphaBadge`, `portalBody`). Never `src/gpu` or `LiquidVisualizer`.
- `phone/PhoneStage.tsx` reuses `TabStrip`. `App.tsx` and the hooks in `src/app/` import the desk's types (`Cue`, `SetAction`, `Command`).

## Files

- `AddToSetSheet.tsx`: add a look to a set list.
- `CommandPalette.tsx`: the Cmd-K box (`Command`).
- `LooksGrid.tsx`: the desk's Looks grid (`LooksGrid`, `looks-grid-open`, `looks-grid-<id>`, PLAN 34b-1).
- `PanelBrowser.tsx`: every panel, Cmd-P.
- `PanelWindow.tsx`: a panel in its own window (`openPanelWindow`).
- `PickList.tsx`: what rides on a strip.
- `RecordControls.tsx`: the one Record button.
- `SaveLookSheet.tsx`: save a look, tied to a song.
- `tools.ts`: `DESK_TOOLS`, tools and their letters.
- `LiveFor.tsx`: `LiveFor`, the plate bar's "live for m:ss" clock on its own one-second tick (`DeskProps.liveSince`; PLAN 46f: it was a string from `App()`, which rendered once a second for it).
- `Desk.tsx`, `deskProps.ts`, `DeskPanels.tsx`, `DeskHeader.tsx`, `TabStrip.tsx`: above. `DeskProps.status.audio` is a node, not a string: the level in it is `EarPercent`, which renders itself.

## Checks

`npm run panel`, `npm run desk` and `npm run panelkinds` (no panel draws both knobs and sliders), layout at 1440, 1280 and 1024 wide in a browser, and `desklayout` (layouts and tabs, in node). The mixer's panel: `mixer`, `rowfade`. A new or changed setting: `panel`, `desk` and the `setting-auditor` agent. Every desk feature ships its phone version in the same PR.

`DeskProps.screens` holds `songs` and `sequences`. The `player` screen (Music & Drone) is
the top of the Sound section since PLAN 35c-7, and its id is in `MERGED_SECTIONS`
(`lib/settingsMap.ts`), so a saved layout with it opens Sound.
