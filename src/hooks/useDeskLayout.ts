import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeskLayout } from '../lib/deskLayout';
import { useCloudSyncReload } from '../lib/cloudSyncApp';
import {
  TABS_KEY, TAB_KEY, addTab, baseLayout, defaultTabs, deleteTab, loadTabId, loadTabs, moveTab, renameTab, saveTabs, setTabLayout,
  type DeskTab,
} from '../lib/deskTabs';

/** What the tab editor can do to the list (lib/deskTabs.ts). */
export type TabEdit =
  | { op: 'rename'; id: string; name: string }
  | { op: 'move'; id: string; by: number }
  | { op: 'delete'; id: string }
  | { op: 'add'; copyOf?: string }
  | { op: 'reset-all' };

/**
 * The desk's tabs, each with its panels as it was last left (lib/deskTabs.ts).
 *
 * Every tab's layout is held at once rather than the one on screen, so going
 * from Perform to Setup and back finds Perform as it was: a panel floated
 * mid-show is still floating when the show comes back. The list is written to
 * storage when it changes, and only while it differs from the shipped one.
 */
export function useDeskTabs() {
  const [tabs, setTabs] = useState<DeskTab[]>(loadTabs);
  const [tab, setTabState] = useState<string>(() => loadTabId(tabs));
  // The list as last committed, so an edit that also picks a tab reads it
  // rather than setting state inside another state's updater.
  const latest = useRef(tabs);

  const commit = useCallback((change: (t: DeskTab[]) => DeskTab[]): DeskTab[] | null => {
    const prev = latest.current;
    const next = change(prev);
    if (next === prev) return null;
    latest.current = next;
    saveTabs(next);
    setTabs(next);
    return next;
  }, []);

  // The account's tabs, written into storage by the cloud (lib/cloudSync.ts): read
  // again, or the next edit here would save the old list over them, and the scan
  // would read that as this device overruling the new one. The tab that is up
  // stays up if the new list still has it, else `current` below picks the first.
  useCloudSyncReload({
    [TABS_KEY]: () => {
      const next = loadTabs();
      latest.current = next;
      setTabs(next);
    },
  });

  // A tab taken away under the one that is up hands over to its neighbour.
  const current = tabs.some(t => t.id === tab) ? tab : tabs[0].id;
  useEffect(() => { try { localStorage.setItem(TAB_KEY, current); } catch { /* private window */ } }, [current]);

  const setTab = useCallback((id: string) => setTabState(id), []);

  const update = useCallback((id: string, change: (l: DeskLayout) => DeskLayout) => {
    commit(t => setTabLayout(t, id, change));
  }, [commit]);

  /** Back to the layout it shipped with: an empty desk for a tab of the owner's. */
  const reset = useCallback((id: string) => update(id, () => baseLayout(id)), [update]);

  const edit = useCallback((e: TabEdit) => {
    if (e.op === 'rename') commit(t => renameTab(t, e.id, e.name));
    else if (e.op === 'move') commit(t => moveTab(t, e.id, e.by));
    else if (e.op === 'delete') {
      const i = latest.current.findIndex(x => x.id === e.id);
      const next = commit(t => deleteTab(t, e.id));
      if (next) setTabState(cur => (cur === e.id ? next[Math.max(0, i - 1)].id : cur));
    } else if (e.op === 'add') {
      let made = '';
      commit(t => { const r = addTab(t, { copyOf: e.copyOf, after: e.copyOf }); made = r.id; return r.tabs; });
      if (made) setTabState(made);
    } else if (e.op === 'reset-all') {
      commit(() => defaultTabs());
    }
  }, [commit]);

  const layout = tabs.find(t => t.id === current)!.layout;
  return { tabs, tab: current, layout, setTab, update, reset, edit };
}
