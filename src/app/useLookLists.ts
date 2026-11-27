import { useCallback, useMemo, type MutableRefObject } from 'react';
import type { Preset } from '../presets';
import { livePresetId } from '../presets';
import { PRESET_CONTRACTS } from '../presetPlate';
import { PALETTE } from '../constants';
import { isUserPresetId, type UserPreset } from '../lib/userPresets';
import { songLabel } from '../lib/songRef';
import type { VisualizerSettings } from '../types';
import type { Cue } from '../components/desk/deskProps';
import type { PhoneLook } from '../components/phone/PhoneStage';
import type { SetList } from '../lib/setList';
import type { ShowSequence } from '../lib/sequencer';

/**
 * The lists of looks the desks and the phone draw: each look's swatch, the
 * phone's grouped list, and the set's cue items (PLAN 34b-6).
 *
 * Moved out of App.tsx as it was, when the look chips needed each item's look
 * id (`lookId`, which the chip's picture is found by): App.tsx is at its size
 * ceiling (`npm run sizes`), so the lists came here rather than growing it.
 */
export function useLookLists({ allPresets, userPresetsRef, setList, fadeSeconds, sequences }: {
  allPresets: Preset[];
  userPresetsRef: MutableRefObject<UserPreset[]>;
  setList: SetList;
  fadeSeconds: number;
  /** The sequences as the sequencer holds them now (read when the set changes). */
  sequences: () => ShowSequence[] | undefined;
}) {
  /**
   * Two of a look's own dyes as a gradient: the chip's picture until a saved
   * look has been photographed, and the swatch everywhere a look is a dot.
   */
  const swatchOf = useCallback((presetId: string | undefined): string => {
    const contract = !presetId ? null : isUserPresetId(presetId)
      ? userPresetsRef.current.find(u => u.id === presetId)?.contract
      : PRESET_CONTRACTS[presetId];
    const [a, b] = contract && contract.length
      ? [PALETTE[contract[0]]?.hex ?? '#666', PALETTE[contract[1] ?? contract[0]]?.hex ?? '#333']
      : ['#52525B', '#27272A'];
    return `linear-gradient(135deg, ${a}, ${b})`;
  }, [userPresetsRef]);
  /*
    The phone's list of looks: the preset menu's groups (the projected show,
    the photographs, the closeups) and then the ones saved here, each with
    the two colours the desks' cue rows show for it.
  */
  const phoneLooks = useMemo<PhoneLook[]>(() => {
    const groupOf = (p: { id: string; settings: Partial<VisualizerSettings> }) =>
      isUserPresetId(p.id) ? 'Yours' : p.settings.macroMode ? 'Closeup' : p.settings.renderStyle === 'photo' ? 'Photograph' : 'Light show';
    const order = ['Light show', 'Photograph', 'Closeup', 'Yours'];
    return allPresets
      .map(p => ({ id: p.id, name: p.name, description: p.description, group: groupOf(p), swatch: swatchOf(p.id) }))
      .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }, [allPresets, swatchOf]);
  /**
   * The cue list: the looks, in order, each carrying the look its chip shows
   * (a sequence shows its first stage's) and two of its own dyes. The live one
   * is what is on the wall; the next one is whatever is armed.
   */
  const cues = useMemo<Cue[]>(() => {
    return setList.items.map(item => {
      const seq = item.kind === 'sequence' ? sequences()?.find(q => q.id === item.ref) : undefined;
      const look = item.kind === 'sequence' ? undefined : allPresets.find(p => p.id === (isUserPresetId(item.ref) ? item.ref : livePresetId(item.ref)));
      const name = item.name ?? look?.name ?? seq?.name ?? item.ref;
      const lookId = look?.id ?? seq?.stages[0]?.presetId;
      return {
        id: item.id,
        name,
        lookId,
        swatch: swatchOf(lookId),
        fade: item.fade ?? fadeSeconds,
        song: item.song ? songLabel(item.song) : undefined,
        kind: item.kind,
        missing: item.kind === 'sequence' ? !seq : !look,
      };
    });
    // `sequences` reads a ref: the set's items are what change the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPresets, fadeSeconds, setList, swatchOf]);
  return { swatchOf, phoneLooks, cues };
}
