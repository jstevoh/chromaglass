import { useEffect, useState } from 'react';

/*
  How long the look on the wall has been up, counting on its own tick
  (PLAN.md 46f).

  The clock was state in App() (app/useWallLook.ts), set once a second, and
  its header said why once a second and not per frame: "the alternative is a
  re-render of the whole shell sixty times a second for a number that changes
  once". Once a second was still the whole shell. Measured on the owner's
  Mac, 2026-11-13 (main c778019, the Perform desk, no sound): a 13.8 ms
  render at every tick, 32 of them in a 31 s profile, on a page whose frame
  is 16.7 ms; every knob and panel of the desk drawn again so that four
  characters in the plate's bar could change. A plate that misses one frame
  a second, on the second, is a tick anybody watching the wall can see.

  So the four characters are this component and the tick is its own. It is
  mounted only where the bar shows it (the plate is Live), so no timer runs
  for a clock nobody sees, as the App's did not.
*/
export function LiveFor({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, (Date.now() - since) / 1000);
  return <span data-testid="live-for">{`${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`}</span>;
}
