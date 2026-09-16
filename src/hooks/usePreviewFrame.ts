import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Where on the screen the plate should be painted, measured from a hole left
 * for it in an ordinary layout.
 *
 * The desk wants the plate to be a preview inside a control surface. The
 * canvas cannot be moved in the DOM to get there — a remount takes the WebGL
 * context with it and the whole show restarts, mid-song — so instead the desk
 * lays out normally with an empty box where the preview belongs, this measures
 * that box, and the canvas (which is `position: fixed` and never moves in the
 * tree) is painted over it.
 *
 * Returns a ref to put on the empty box, and the rectangle it currently
 * occupies. Null means no frame: the plate fills the window, as it always has.
 */
export function usePreviewFrame(enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!enabled || !el) { setFrame(null); return; }
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    setFrame(prev => (prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5
      && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5)
      ? prev                                   // same box: don't re-render the tree
      : { top: r.top, left: r.left, width: r.width, height: r.height });
  }, [enabled]);

  useEffect(() => {
    measure();
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The box also moves when the window does, which a ResizeObserver on it
    // will not always see (its own size can be unchanged while it slides).
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [enabled, measure]);

  return { ref, frame, remeasure: measure };
}
