#!/usr/bin/env node
/**
 * The opening's wait for the page's frames before its first compile
 * (src/lib/stillWait.ts, PLAN.md 19aa-7), run on made-up timelines:
 *
 *   npm run stillwait
 *
 * What was wrong: on GitHub's Macs the GPU process often stops presenting
 * just after it gives the device, with nothing of ours asked of it yet, and
 * the opening sat out its whole 1.5 s cap waiting for four frames that were
 * already queued there. That was 43 of 116 `open` shard runs, and 16 of the
 * 18 reds on startup's "moving for good no later than the old way". The rule
 * now stops waiting once the page has been free for half a second with no
 * frame drawn. What this holds is that rule, both ways round, because the
 * wait exists for a reason (the desk's mount frames presented before the
 * first fill): the four frames are still waited for whenever they come, a
 * page that is busy or held from outside is never read as starved, and
 * nothing waits past the old cap. The Mac's timings are startup's to read
 * (its 1b line: the first compile asked against the device given; how each
 * wait ended is saved in the page's `__cgIntro.stillWait`, which startup
 * keeps in its record and does not print); none of them is judged here.
 *
 * The simulation: the page's timer asks to tick every STILL_TICK_MS, and
 * frames are drawn at the times a case gives. While the page's thread is
 * busy (its own long task) or held (from outside) nothing runs, so a tick or
 * a frame due then runs as the stretch ends, late, as a real one would.
 */
import {
  stillWait, stillFrame, stillTick, stillNextTick, STILL_FRAMES, STILL_CAP_MS, STILL_STARVED_MS, STILL_TICK_MS,
} from '../src/lib/stillWait.ts';

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

/** Runs one wait: frames at the given times (ms from the start), blocked stretches [from, to]. */
function run({ frames, blocked = [] }) {
  const free = (t) => { for (const [a, b] of blocked) if (t >= a && t < b) return b; return t; };
  const w = stillWait(0);
  let tick = free(stillNextTick(w, 0));
  // Frames due while the thread is blocked run as one, as it ends: a browser
  // draws one animation frame then, not one for each it missed.
  const due = [...new Set(frames.map(free))].sort((a, b) => a - b);
  let f = 0;
  for (let guard = 0; guard < 10_000; guard++) {
    // A frame and a tick due at the same moment: the frame first, as the
    // harder case for the starved rule (it resets the count).
    if (f < due.length && due[f] <= tick) {
      const at = due[f++];
      if (stillFrame(w, at)) return { why: 'frames', at, frames: w.frames };
    } else {
      const why = stillTick(w, tick);
      if (why) return { why, at: tick, frames: w.frames };
      tick = free(tick + stillNextTick(w, tick));
    }
  }
  return { why: 'never', at: Infinity, frames: w.frames };
}
const say = (r) => `ended by "${r.why}" at ${(r.at / 1000).toFixed(2)} s after ${r.frames} frame(s)`;
const every = (ms, n, from = ms) => Array.from({ length: n }, (_, i) => from + i * ms);

{
  const r = run({ frames: every(16, 10) });
  check(`frames coming at 60 a second: it waits for all ${STILL_FRAMES}, and no longer`, r.why === 'frames' && r.frames === STILL_FRAMES && r.at <= 0.1 * 1000, say(r));
}
{
  // CI's slow mount (the comment on introStill): the desk mounting holds the
  // page's thread 0.3 s, then four frames over 0.39 s with the page free in
  // between, the first of them a while coming.
  const r = run({ frames: [330, 450, 560, 690], blocked: [[0, 300]] });
  check("a slow mount, the page's own work and then slow frames: still waited out to its four frames", r.why === 'frames' && r.frames === STILL_FRAMES, say(r));
}
{
  // Frames just under the starved rule's reach apart, page free: each resets it.
  const gap = STILL_STARVED_MS - 2 * STILL_TICK_MS;
  const r = run({ frames: every(gap, STILL_FRAMES) });
  check(`frames ${gap} ms apart with the page free are slow frames, not none: waited for until the cap`, r.why === (STILL_FRAMES * gap < STILL_CAP_MS ? 'frames' : 'cap'), say(r));
}
{
  // The 43 runs: a frame or two, then none for over 1.5 s, the page free.
  const r = run({ frames: [16, 40, 2400] });
  check(`two frames and then none, the page free (the GPU process holding them): it stops waiting ${STILL_STARVED_MS} ms after the last frame`,
    r.why === 'starved' && r.at >= 40 + STILL_STARVED_MS && r.at <= 40 + STILL_STARVED_MS + 2 * STILL_TICK_MS, say(r));
}
{
  const r = run({ frames: [] });
  check('no frame at all, the page free: starved, well before the cap', r.why === 'starved' && r.at < STILL_CAP_MS / 2, say(r));
}
{
  // The page's thread held from outside for half a second (no tick runs on
  // time), then free: the held time is not free time, so the starved rule
  // counts only from the first tick after it, and still ends the wait.
  const r = run({ frames: [16], blocked: [[100, 600]] });
  check(`the page held 0.5 s with no frame: not read as starved until it has been free ${STILL_STARVED_MS} ms after it`,
    r.why === 'starved' && r.at >= 600 + STILL_STARVED_MS && r.at <= 600 + STILL_STARVED_MS + STILL_TICK_MS, say(r));
}
{
  // Held 1.2 s: what is left before the cap is too short to starve in.
  const r = run({ frames: [16, 1700], blocked: [[100, 1300]] });
  check('the page held 1.2 s with no frame: the cap ends it, on time', r.why === 'cap' && r.at === STILL_CAP_MS, say(r));
}
{
  // Frames due while the thread was blocked are one frame when it frees, not four.
  const r = run({ frames: [100, 200, 300, 400, 560, 620, 680], blocked: [[0, 500]] });
  check('four frames missed while the page was busy count as the one it draws after', r.why === 'frames' && r.at === 680 && r.frames === STILL_FRAMES, say(r));
}
{
  // The slowest mount figure, 0.39 s, as the gap between frames with the page
  // free: slow frames still coming, so it waits them out.
  const r = run({ frames: [16, 406, 796, 1186] });
  check('frames 0.39 s apart with the page free (the slowest mount measured): waited for, all four', r.why === 'frames' && r.at === 1186, say(r));
}
{
  // The page's own long tasks back to back, no frames: never starved, and
  // the cap is read on the first tick it gets.
  const r = run({ frames: [], blocked: [[0, 600], [600, 1200], [1200, 1800]] });
  check('the page busy throughout: never starved, and the cap ends it on the first tick after', r.why === 'cap' && r.at === 1800, say(r));
}
{
  // Frames every 450 ms, free between: slow but coming, so it waits to the cap
  // and not a moment past it.
  const r = run({ frames: every(450, 10) });
  check(`never past the old cap, ${STILL_CAP_MS} ms`, r.why === 'cap' && r.at === STILL_CAP_MS, say(r));
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
