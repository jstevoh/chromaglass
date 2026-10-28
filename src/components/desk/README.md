# src/components/desk

The desk: the laptop's control surface around the plate. Perform and Design are layouts of one `Desk` (`lib/deskLayout.ts`), with tabs, panels that dock or float, rides and the cue list.

## Start here

- `Desk.tsx`: `Desk`, the layout, its slots and panels.
- `deskProps.ts`: `DeskProps`, `Cue`, `SetAction`, `SetItemAction`: everything `App.tsx` passes in.
- `DeskPanels.tsx`: `PanelBody`, `panelMeta`, `DEFAULT_RIDES`: what each panel draws.
- `DeskHeader.tsx`: `DeskHeader`, `DeskDots`, the top bar and status dots.
- `TabStrip.tsx`: `TabStrip`, the tabs and their editor.

## Contracts

- `App.tsx` owns settings and show state and hands them down through `DeskProps`; the desk changes them only through those callbacks.
- Layout and tabs come from `lib/deskLayout`, `lib/deskTabs` via `hooks/useDeskLayout`.
- Imports `src/lib`, `src/types`, `../ui` and a few siblings (`MixerPanel`, `CartoonShelf`, `SongScore`, `PanelGuard`, `ToolAmount`). Never `src/gpu` or `LiquidVisualizer`.
- `phone/PhoneStage.tsx` reuses `TabStrip`.

## Files

- `AddToSetSheet.tsx`: add a look to a set list.
- `CommandPalette.tsx`: the Cmd-K box.
- `PanelBrowser.tsx`: every panel, Cmd-P.
- `PanelWindow.tsx`: a panel in its own window.
- `PickList.tsx`: what rides on a strip.
- `RecordControls.tsx`: the one Record button.
- `SaveLookSheet.tsx`: save a look, tied to a song.
- `tools.ts`: `DESK_TOOLS`, tools and their letters.
- `Desk.tsx`, `deskProps.ts`, `DeskPanels.tsx`, `DeskHeader.tsx`, `TabStrip.tsx`: above.

## Checks

`npm run panel` and `npm run desk`, layout at 1440, 1280 and 1024 wide in a browser, and `desklayout` (layouts and tabs, in node). The mixer's panel: `mixer`, `rowfade`. A new or changed setting: `panel`, `desk` and the `setting-auditor` agent. Every desk feature ships its phone version in the same PR.
