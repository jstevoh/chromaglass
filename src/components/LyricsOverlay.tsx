import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LyricLine } from '../lib/musicTypes';

interface LyricsOverlayProps {
  line: LyricLine | null;
  sentiment: number; // -1..1 shades the text warm/cool
}

// Kinetic typography overlay — independent of the fluid layer.
export const LyricsOverlay: React.FC<LyricsOverlayProps> = ({ line, sentiment }) => {
  if (!line) return null;
  const warm = Math.max(0, sentiment);
  const cool = Math.max(0, -sentiment);
  const color = `rgb(${Math.round(255 - cool * 90)}, ${Math.round(235 - warm * 40 - cool * 40)}, ${Math.round(255 - warm * 110)})`;

  return (
    <div className="absolute inset-x-0 bottom-24 z-20 flex justify-center pointer-events-none px-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${line.time}-${line.text}`}
          initial={{ opacity: 0, y: 24, scale: 0.92, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -18, scale: 1.04, filter: 'blur(4px)' }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="max-w-3xl text-center"
        >
          <span
            className="text-2xl md:text-3xl font-light italic font-serif tracking-tight leading-snug"
            style={{ color, textShadow: '0 2px 24px rgba(0,0,0,0.85), 0 0 60px rgba(0,0,0,0.5)' }}
          >
            {line.text}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
