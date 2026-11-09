# src/components/phone

The app laid out for a thumb: the phone's stage for performing and Play for listening. `App.tsx` picks this layout with `app/usePhoneLayout.ts`, which asks `lib/phone.ts` (`wantsPhoneLayout`).

## Start here

- `PhoneStage.tsx` (72 KB, grep it): `PhoneStage`, `PhoneStageProps`, `PhoneTool`, `PhoneLook`, `PhoneTabs`: the phone's desk.
- `PhonePlay.tsx`: `PhonePlay`, `PhonePlayProps`: Play, for someone listening.
- `BandStrip.tsx`: `BandStrip`, a patch cord's frequency band.
- `AreaPicker.tsx`: `AreaPicker`, which area of the dish a cord works in.

## Contracts

- `App.tsx` owns the settings and passes them in as props, like the desk.
- What a finger does is read in `lib/playGesture.ts`; the touch handlers on the plate are in `LiquidVisualizer.tsx`; tilt is `hooks/useDeviceTilt`.
- Imports `src/lib`, `src/types`, `../ui`, `hooks/useEscape`, `hooks/useDeskLayout`, `desk/TabStrip`, `settings/FeedbackPane` (the More sheet's Feedback, the same pane as Settings) and a few siblings (`MixerPanel`, `CartoonShelf`, `SongScore`, `PanelGuard`). Never `src/gpu`.
- `settings/PatchesSection.tsx` reuses `BandStrip` and `AreaPicker` on the laptop.
- Every feature ships its phone version in the same PR.

## Files

- `AreaPicker.tsx`: area picked on a plate thumbnail.
- `BandStrip.tsx`: the band, dragged on a spectrum.
- `PhonePlay.tsx`: Play.
- `PhoneMoire.tsx`: `PhoneMoire`, the moiré pack's sheets on the Looks sheet (the desk's lists and try-it rule, PLAN 45a).
- `PhoneStage.tsx`: the stage.
- `TvLink.tsx`: the `?tvlink` page: sign in, then type the code a TV shows, to link it to the account's Home or Pro (PLAN 12-tv-signin). `main.tsx` routes it before the show, like the remote; it loads no engine.

## Checks

`npm run phone` (with `PW_WEBGPU=1` for the fingers) and `npm run layout`. The mixer on the phone: `mixer`, `rowfade`, `remotemix`. Cartoons: `cartoons`. Feedback: `feedbackpane`, `feedback-worker`. Areas and cords: `areacords`. Linking a TV: `tvcode` (the Worker's routes and `lib/tvCode.ts`'s code format).
