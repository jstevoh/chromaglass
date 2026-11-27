import { useState, useEffect, useCallback } from 'react';
import type { VisualizerSettings } from '../types';
import { useDeskTabs } from '../hooks/useDeskLayout';
import { DEFAULT_RECIPE, DEFAULT_RIDES, loadPins, savePins, togglePin, type DeskSurface } from '../lib/deskPins';
import { publishDesk, setDeskDoor } from './deskNow';

const MIDI_ACTIVITY_KEY = 'chromaglass-midi-activity';

/**
 * The desk's own state, beside the plate's: the tabs and their panels
 * (useDeskTabs), what is pinned to each surface, and whether the MIDI
 * activity overlay is up. Moved out of App() whole (PLAN 44k-17) so the
 * owner's assistant can read and change them through app/deskNow.ts without
 * App(), which may not grow, carrying the doors.
 */
export function useDesk() {
  /*
    The desk's tabs (lib/deskTabs.ts): the owner's to make since 2026-10-27,
    each a set of panels, with Perform, Sequence and Setup shipped as the
    three to start from. The tab that is up is kept under the old desk mode's
    key, so a laptop left on Gig or Build opens on Perform and one left on
    Load-in opens on Setup. Each tab remembers where its panels were.
  */
  const deskTabs = useDeskTabs();
  /*
    What is out on each surface.

    A property of this desk rather than of a look: two rooms with the same
    presets want different things under the hand, and a saved look that
    rearranged your faders would be unusable. Both lists come from the one
    registry in `deskPins`, so a control the settings panel draws can be put on
    either surface — which is the thing that could not be done before, and the
    reason the panel was the only place most of the app existed.
  */
  const [rideKeys, setRideKeys] = useState<(keyof VisualizerSettings)[]>(() => loadPins('perform', DEFAULT_RIDES));
  useEffect(() => { savePins('perform', rideKeys, DEFAULT_RIDES); }, [rideKeys]);
  const [recipeKeys, setRecipeKeys] = useState<(keyof VisualizerSettings)[]>(() => loadPins('design', DEFAULT_RECIPE));
  useEffect(() => { savePins('design', recipeKeys, DEFAULT_RECIPE); }, [recipeKeys]);
  /** Put a control on a surface, or take it off, from the settings panel. */
  const pinSetting = useCallback((desk: DeskSurface, key: keyof VisualizerSettings, on: boolean) => {
    const set = desk === 'perform' ? setRideKeys : setRecipeKeys;
    set(prev => togglePin(prev, key, on));
  }, []);
  /*
    The controller's own readout, and whether it is up.

    A property of this desk rather than of a look: whether you want to see what
    the hardware is doing depends on how well you know the map, not on which
    preset is loaded. Remembered, because someone who wants it wants it all
    night and someone who does not should not have to hide it every time.
  */
  const [showActivity, setShowActivity] = useState<boolean>(() => {
    try { return localStorage.getItem(MIDI_ACTIVITY_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(MIDI_ACTIVITY_KEY, showActivity ? '1' : '0'); } catch { /* private window */ }
  }, [showActivity]);

  // The owner's assistant reads the desk and changes it through the same calls as the tab strip, the panel menu and the pins (PLAN 44k-17).
  const { tabs, tab, setTab, edit, update, restore } = deskTabs;
  useEffect(() => { publishDesk(tabs, tab, rideKeys, recipeKeys, showActivity); }, [tabs, tab, rideKeys, recipeKeys, showActivity]);
  useEffect(() => {
    setDeskDoor({ setTab, edit, update, restore, pin: (s, k, on) => pinSetting(s, k as keyof VisualizerSettings, on), activity: setShowActivity });
    return () => setDeskDoor(null);
  }, [setTab, edit, update, restore, pinSetting]);

  return { deskTabs, rideKeys, setRideKeys, recipeKeys, setRecipeKeys, pinSetting, showActivity, setShowActivity };
}
