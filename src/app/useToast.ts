import { useState, useEffect, type RefObject } from 'react';

/**
 * The one-line notice at the foot of the screen, gone after 2.4 s. Before the
 * film's hooks, which tell a missing camera through it.
 */
interface ToastDeps {
  setToastRef: RefObject<(m: string) => void>;
}

export function useToast({
  setToastRef,
}: ToastDeps) {
  const [toast, setToast] = useState<string | null>(null);
  setToastRef.current = setToast;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  return {
    toast, setToast,
  };
}
