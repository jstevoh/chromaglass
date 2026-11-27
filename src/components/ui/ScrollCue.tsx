import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks whether a scrollable container has hidden content past its edges, so
 * overflowing columns, decks, and rails can render a visible scroll cue
 * without overlapping interactive controls inside them.
 */
export function useScrollEdges<T extends HTMLElement = HTMLDivElement>(axis: 'x' | 'y', deps: readonly unknown[] = []) {
  const ref = useRef<T | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = axis === 'x' ? el.scrollLeft : el.scrollTop;
    const span = axis === 'x' ? el.clientWidth : el.clientHeight;
    const total = axis === 'x' ? el.scrollWidth : el.scrollHeight;
    const start = pos > 2;
    const end = pos + span < total - 2;
    setEdges(prev => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [axis]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Child additions/removals change scrollWidth/scrollHeight without resizing the box.
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);

  const scrollBy = useCallback((delta: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ [axis === 'x' ? 'left' : 'top']: delta, behavior: 'smooth' });
  }, [axis]);

  return { ref, ...edges, scrollBy, measure };
}
