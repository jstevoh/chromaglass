import { useState, useEffect, useRef, useCallback, type RefObject, type Dispatch, type SetStateAction } from 'react';

export interface ToastItem {
  id: number;
  title: string;
  /** Optional location/explanation hint shown beside or below the title (e.g. panel reopen path). */
  meta?: string;
  /** Optional button label (e.g. "Undo"). */
  actionLabel?: string;
  onAction?: () => void;
  /** Runs when the toast dismisses without the action firing (timeout or replacement). */
  onExpire?: () => void;
  durationMs: number;
}

export interface ShowToastOptions {
  title: string;
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
  onExpire?: () => void;
  durationMs?: number;
}

interface ToastDeps {
  setToastRef: RefObject<(m: string) => void>;
}

/**
 * Timed toast bar for status lines and 8 s Undo safety nets (PLAN 49a).
 * Keeps `setToast(string | null)` compatible with existing callers while
 * supporting rich Undo toasts through `showToast`.
 */
export function useToast({ setToastRef }: ToastDeps) {
  const [toastItem, setToastItem] = useState<ToastItem | null>(null);
  const nextIdRef = useRef(1);
  const expireRef = useRef<(() => void) | undefined>(undefined);
  const currentRef = useRef<ToastItem | null>(null);
  currentRef.current = toastItem;

  const dismissPending = useCallback(() => {
    const exp = expireRef.current;
    expireRef.current = undefined;
    if (exp) exp();
  }, []);

  const showToast = useCallback((opts: ShowToastOptions) => {
    dismissPending();
    expireRef.current = opts.onExpire;
    const item: ToastItem = {
      id: nextIdRef.current++,
      title: opts.title,
      meta: opts.meta,
      actionLabel: opts.actionLabel,
      onAction: opts.onAction,
      onExpire: opts.onExpire,
      durationMs: opts.durationMs ?? 2400,
    };
    setToastItem(item);
    return item.id;
  }, [dismissPending]);

  const clearToast = useCallback(() => {
    dismissPending();
    setToastItem(null);
  }, [dismissPending]);

  const triggerToastAction = useCallback(() => {
    const cur = currentRef.current;
    if (!cur?.onAction) return;
    // Clear expire callback first so restoring does not also trigger expiry cleanup.
    expireRef.current = undefined;
    setToastItem(null);
    cur.onAction();
  }, []);

  const setToast: Dispatch<SetStateAction<string | null>> = useCallback((val) => {
    const prevTitle = currentRef.current?.title ?? null;
    const next = typeof val === 'function' ? val(prevTitle) : val;
    if (next === null) clearToast();
    else showToast({ title: next, durationMs: 2400 });
  }, [clearToast, showToast]);

  setToastRef.current = (m: string) => { showToast({ title: m, durationMs: 2400 }); };

  useEffect(() => {
    if (!toastItem) return;
    const t = setTimeout(() => {
      dismissPending();
      setToastItem(null);
    }, toastItem.durationMs);
    return () => clearTimeout(t);
  }, [toastItem, dismissPending]);

  useEffect(() => () => { dismissPending(); }, [dismissPending]);

  return {
    toast: toastItem?.title ?? null,
    toastItem,
    setToast,
    showToast,
    clearToast,
    triggerToastAction,
  };
}
