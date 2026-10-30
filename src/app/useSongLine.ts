import { useState, useRef, useEffect, type RefObject } from 'react';
import { songShapeLine } from '../lib/songShape';
import { barLine } from '../lib/barGrid';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';

/**
 * The song's shape in a word, the bar grid's line and the tempo the bar grid
 * hears, for the desk's status line and the phone's Sound sheet: sampled from
 * the plate's trackers four times a second, since the render loop owns them and
 * the UI only glances at them.
 */
interface SongLineDeps {
  wallRef: RefObject<LiquidVisualizerHandle | null>;
}

export function useSongLine({
  wallRef,
}: SongLineDeps) {
  /*
    The song's shape in a word, for the desk's status line and the phone's
    Sound sheet (lib/songShape.ts): "drop", "build 40%", "breakdown", or
    nothing while the song simply plays. Sampled four times a second like the
    tempo label, because the render loop owns the tracker and the UI only
    needs to glance at it.
  */
  const [songLine, setSongLine] = useState('');
  /** What the bar grid knows (lib/barGrid.ts barLine), for Accent the One on the phone. */
  const [barKnown, setBarKnown] = useState('');
  /** The tempo the beat grid hears, bpm rounded, or 0: what the strobe ring on Auto Spin is lit by when nothing was tapped or clocked in. */
  const [heardBpm, setHeardBpm] = useState(0);
  const shownShape = useRef({ line: '', bar: '', heard: 0 });
  /** The last song-shape event the sequencer has been handed, by its number. */
  const songCueSeqRef = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => {
      const report = wallRef.current?.songShape();
      // Compared against what was last set, for the reason the tempo label is.
      const next = report ? songShapeLine(report.now) : '';
      if (next !== shownShape.current.line) { shownShape.current.line = next; setSongLine(next); }
      const bar = report ? barLine(report.bar) : '';
      if (bar !== shownShape.current.bar) { shownShape.current.bar = bar; setBarKnown(bar); }
      const heard = report && report.bar.period > 0 && report.bar.beatConfidence >= 0.3 ? Math.round(60 / report.bar.period) : 0;
      // Compared here, not in an updater that hands back the old value (the tempo label's note above): that still renders the App.
      if (heard !== shownShape.current.heard) { shownShape.current.heard = heard; setHeardBpm(heard); }
    }, 250);
    return () => clearInterval(timer);
  }, []);

  return {
    songLine, barKnown, heardBpm, songCueSeqRef,
  };
}
