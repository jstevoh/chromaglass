import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Cast display — a direct pixel-mirror of the main window's canvas.
 * Reads the source canvas from window.opener via drawImage (same-origin, GPU-to-GPU).
 * Scales to fill the cast display's viewport at native resolution.
 */
export default function CastDisplay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let lastW = 0, lastH = 0;

    const render = () => {
      // Find source canvas in the opener window
      let source: HTMLCanvasElement | null = null;
      try {
        source = (window.opener as Window)?.document?.querySelector('canvas') ?? null;
      } catch {
        // Cross-origin or opener closed
      }

      if (!source || !window.opener || (window.opener as Window).closed) {
        setDisconnected(true);
        animId = requestAnimationFrame(render);
        return;
      }

      setDisconnected(false);

      // Resize canvas to fill viewport at device pixel ratio
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(window.innerWidth * dpr);
      const h = Math.round(window.innerHeight * dpr);
      if (w !== lastW || h !== lastH) {
        canvas.width = w;
        canvas.height = h;
        lastW = w;
        lastH = h;
      }

      // Draw source canvas scaled to fill this display
      ctx.drawImage(source, 0, 0, w, h);

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  // Auto-enter fullscreen on click
  const handleFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen?.();
  }, []);

  // Hide cursor after inactivity
  const [showCursor, setShowCursor] = useState(true);
  const cursorTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const handleMove = () => {
      setShowCursor(true);
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
      cursorTimer.current = setTimeout(() => setShowCursor(false), 3000);
    };
    window.addEventListener('mousemove', handleMove);
    cursorTimer.current = setTimeout(() => setShowCursor(false), 3000);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
    };
  }, []);

  return (
    <div
      className="w-full h-screen bg-black overflow-hidden"
      style={{ cursor: showCursor ? 'default' : 'none' }}
      onClick={handleFullscreen}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />

      {disconnected && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-4 text-center">
            <p className="text-white/60 text-sm">Source window closed</p>
            <p className="text-white/30 text-xs mt-1">Reopen ChromaGlass to resume</p>
          </div>
        </div>
      )}

      <CastHint />
    </div>
  );
}

function CastHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 1s' }}
    >
      <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-4 text-center">
        <p className="text-white/80 text-sm font-medium">ChromaGlass Cast Display</p>
        <p className="text-white/40 text-xs mt-1">Click anywhere for fullscreen</p>
      </div>
    </div>
  );
}
