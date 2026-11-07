import { useRef, useState, useEffect } from 'react';
import { TimecodeReader, type TimecodePosition } from '../lib/timecode';

/**
 * MIDI timecode: the position a sequence follows, sampled from the reader
 * the MIDI callback feeds (`useControllers`) four times a second, and set as
 * state only when the second changes.
 */
export function useTimecode() {
  /*
    MIDI timecode, and the position the sequence follows.

    The reader is fed from the MIDI callback (`useControllers`) at a hundred messages a
    second and never touches React. This poll reads it four times a second,
    which is as often as a stage boundary can matter, and sets state only when
    the second changes — a set that lasts an hour is then 3600 renders rather
    than 360,000.
  */
  const timecodeRef = useRef(new TimecodeReader());
  const [timecode, setTimecode] = useState<TimecodePosition | null>(null);
  const shownTimecode = useRef<TimecodePosition | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const p = timecodeRef.current.read(performance.now());
      // Compared against what was last set, for the reason the tempo label is.
      const prev = shownTimecode.current;
      if (p === null ? prev === null : !!prev && prev.seconds === p.seconds && prev.minutes === p.minutes && prev.hours === p.hours) return;
      shownTimecode.current = p;
      setTimecode(p);
    }, 250);
    return () => clearInterval(id);
  }, []);

  return {
    timecodeRef, timecode,
  };
}
