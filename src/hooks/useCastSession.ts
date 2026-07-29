import { useState, useRef, useCallback, useEffect } from 'react';

export function useCastSender() {
  const [isCasting, setIsCasting] = useState(false);
  const windowRef = useRef<Window | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
    windowRef.current = null;
    setIsCasting(false);
  }, []);

  const startCast = useCallback(async () => {
    const castUrl = `${window.location.origin}${window.location.pathname}?cast=true`;

    // Try Presentation API first (shows native device picker with Chromecast)
    if ('PresentationRequest' in window) {
      try {
        const request = new (window as any).PresentationRequest([castUrl]);
        const connection = await request.start();
        connection.addEventListener('close', cleanup);
        connection.addEventListener('terminate', cleanup);
        setIsCasting(true);
        return;
      } catch {
        // User cancelled or API unavailable — fall through to popup
      }
    }

    // Fallback: open popup window
    const castWindow = window.open(
      castUrl,
      'chromaglass-cast',
      'popup,width=1920,height=1080'
    );

    if (castWindow) {
      windowRef.current = castWindow;
      setIsCasting(true);

      // Detect when cast window is closed
      checkIntervalRef.current = setInterval(() => {
        if (castWindow.closed) cleanup();
      }, 1000);
    }
  }, [cleanup]);

  const stopCast = useCallback(() => {
    try { windowRef.current?.close(); } catch {}
    cleanup();
  }, [cleanup]);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  return { isCasting, startCast, stopCast };
}
