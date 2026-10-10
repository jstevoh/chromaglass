import { useCallback, useState } from 'react';
import {
  LAYOUT_NAMES, loadLayout, saveLayout, shippedLayout,
  type DeskLayout, type LayoutName,
} from '../lib/deskLayout';

/**
 * The desk's three layouts, each as it was last left (lib/deskLayout.ts).
 *
 * All three are held at once rather than the one on screen, so switching from
 * Gig to Build and back finds Gig as it was: a panel floated mid-show is
 * still floating when the show comes back. Each is written to storage when it
 * changes, and only while it differs from the shipped one.
 */
export function useDeskLayouts() {
  const [layouts, setLayouts] = useState<Record<LayoutName, DeskLayout>>(() =>
    Object.fromEntries(LAYOUT_NAMES.map(n => [n, loadLayout(n)])) as Record<LayoutName, DeskLayout>);

  const update = useCallback((name: LayoutName, change: (l: DeskLayout) => DeskLayout) => {
    setLayouts(prev => {
      const next = change(prev[name]);
      if (next === prev[name]) return prev;
      saveLayout(name, next);
      return { ...prev, [name]: next };
    });
  }, []);

  /** Back to the layout that shipped: the stored copy goes, so the next shipped one reaches it too. */
  const reset = useCallback((name: LayoutName) => {
    update(name, () => shippedLayout(name));
  }, [update]);

  return { layouts, update, reset };
}
