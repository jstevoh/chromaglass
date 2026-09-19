import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * The grid sweep's progress, and its result as something to copy.
 *
 * The measurement it runs takes the better part of a minute and changes what
 * is on screen while it runs, so it says what it is doing and roughly how far
 * along it is — an app that silently rebuilds the solver five times looks
 * broken. And the result is a block of text with a button that copies it,
 * because the reason the sweep exists is to be pasted somewhere else.
 */
export const BenchOverlay: React.FC<{
  running: boolean;
  done: number;
  total: number;
  label: string;
  text: string | null;
  onClose: () => void;
}> = ({ running, done, total, label, text, onClose }) => {
  const [copied, setCopied] = useState(false);
  if (!running && !text) return null;

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused outright — the text is on screen and
      // selectable either way, so say nothing and let it be selected by hand.
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4" data-bench-overlay>
      <div className="w-full max-w-2xl rounded-lg border border-white/20 bg-neutral-950 p-5 text-white shadow-2xl">
        {running ? (
          <>
            <div className="mb-3 text-[13px] font-medium">Measuring the grid sweep…</div>
            <div className="mb-3 text-[12px] font-mono opacity-60">
              {label} · {done} of {total}
            </div>
            <div className="h-1 w-full overflow-hidden rounded bg-white/10">
              <div
                className="h-full bg-white/60 transition-all duration-500"
                style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-4 text-[12px] leading-relaxed opacity-50">
              The plate is being rebuilt on each grid in turn and left to settle before
              anything is read. It will look busy; that is the measurement. About a minute.
            </p>
          </>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-medium">Grid sweep</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={copy}
                  className="flex items-center gap-1.5 rounded border border-white/20 px-2.5 py-1 text-[12px] hover:bg-white/10"
                  data-bench-copy
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={onClose}
                  className="rounded border border-white/20 px-2.5 py-1 text-[12px] hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>
            <pre
              className="max-h-[60vh] overflow-auto whitespace-pre rounded bg-black/60 p-3 text-[11px] leading-relaxed font-mono opacity-90 select-text"
              data-bench-text
            >
              {text}
            </pre>
          </>
        )}
      </div>
    </div>
  );
};
