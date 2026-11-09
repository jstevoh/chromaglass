import { useState, useRef, useCallback } from 'react';
import { type SetList, loadSetList, starterSet, loadSavedSets, storeSavedSets, saveSetList } from '../lib/setList';
import { PRESETS } from '../presets';
import type { Cue } from '../components/desk/deskProps';
import type { ShowSequence } from '../lib/sequencer';
import { DEFAULT_FADE_SECONDS } from '../lib/lookFade';
import type { ArmedLook } from './shared';

/**
 * The set list and the cue: the working set and the sets kept by name, the
 * armed look and the fade it goes over, how far a Go has got. The actions on
 * them are `useLookFades` (Go, Back, Revert) and `useSetActions` (the set's
 * own edits).
 */
export function useSetListState() {
  // ── Cue and Go ────────────────────────────────────────────────────
  //
  // `applyPreset` (in App) clears every layer and reseeds, which is what you want
  // while you are building a look and exactly what you do not want at 11pm
  // with the plate on a wall: the clear is a hard cut through near-black in
  // front of a room.
  //
  // So a look can also be *armed* and then faded in. The fade adopts the new
  // preset's dyes without touching the plate and walks the settings across
  // over a few seconds, so nothing is ever wiped. `npm run desk` drives a
  // whole fade and checks the stage never darkens; today's clearing path is
  // the control, and it fails that check by a mile.
  const [cued, setCued] = useState<ArmedLook | null>(null);
  /** The armed look, for the action handlers that are defined above the state they read. */
  const cuedRef = useRef(cued);
  cuedRef.current = cued;
  /*
    The set: the operator's own cue list (lib/setList.ts), and what the desk
    lists, in its order; each row arms its item. A first visit opens on the
    starter set, every look as an item that can be removed. It used to list
    every look whenever the set was empty, and those rows were not the set's,
    so nothing on the desk could be taken off it.
  */
  const [setList, setSetList] = useState<SetList>(() => loadSetList(() => starterSet(PRESETS.map(p => p.id))));
  /** Sets kept by name (the set menu's Save and Open). The working set above is kept on its own. */
  const [savedSets, setSavedSets] = useState<SetList[]>(loadSavedSets);
  const changeSaved = useCallback((f: (prev: SetList[]) => SetList[]) => {
    setSavedSets(prev => { const v = f(prev); storeSavedSets(v); return v; });
  }, []);
  const setListRef = useRef(setList);
  setListRef.current = setList;
  const changeSet = useCallback((next: SetList | ((prev: SetList) => SetList)) => {
    setSetList(prev => {
      const v = typeof next === 'function' ? next(prev) : next;
      saveSetList(v);
      return v;
    });
  }, []);
  /** The set item on stage, so its row reads live even when another row holds the same look. */
  const [liveItemId, setLiveItemId] = useState<string | null>(null);
  /** The desk's list as last drawn, for the keys and pads that step it. */
  const cuesRef = useRef<Cue[]>([]);
  /** The sequencer, from above where it is created (a set item can be a sequence). */
  const sequencerRef = useRef<{ startAt: (id: string, positionSec: number) => void; sequences: ShowSequence[] } | null>(null);
  const [fadeSeconds, setFadeSeconds] = useState<number>(DEFAULT_FADE_SECONDS);
  const [fading, setFading] = useState(0);        // 0..1 while a Go is running

  return {
    cued, setCued, cuedRef, setList, setSetList, savedSets, setSavedSets, changeSaved, setListRef,
    changeSet, liveItemId, setLiveItemId, cuesRef, sequencerRef, fadeSeconds, setFadeSeconds,
    fading, setFading,
  };
}
