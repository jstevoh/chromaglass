#!/usr/bin/env node
/**
 * Does a desk's position actually reach the show, and land on the right frame?
 *
 *   npm run timecode
 *
 * MTC is a format with one famous trap in it: the position arrives as eight
 * quarter-frame messages spread over two frames of real time, so by the time
 * the last nibble lands the desk has moved on and a reader that takes the
 * bytes at face value runs permanently two frames — about eighty milliseconds
 * — behind the sound. That is not visible in a console log and is very visible
 * on a wall next to a cue.
 *
 * Everything here drives `TimecodeReader` the way the MIDI callback does, a
 * byte at a time, so what is checked is the thing the show runs.
 */

import { TimecodeReader, formatTimecode } from '../src/lib/timecode.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** The eight quarter-frame data bytes a desk sends for one position. */
const quarters = (h, m, s, f, rateBits = 3) => [
  (0 << 4) | (f & 0x0f),
  (1 << 4) | ((f >> 4) & 0x01),
  (2 << 4) | (s & 0x0f),
  (3 << 4) | ((s >> 4) & 0x03),
  (4 << 4) | (m & 0x0f),
  (5 << 4) | ((m >> 4) & 0x03),
  (6 << 4) | (h & 0x0f),
  (7 << 4) | (((h >> 4) & 0x01) | (rateBits << 1)),
];

const roll = (r, h, m, s, f, at = 1000, rateBits = 3) => {
  let out = null;
  for (const b of quarters(h, m, s, f, rateBits)) out = r.quarter(b, at) ?? out;
  return out;
};

// ── 1. A position arrives ────────────────────────────────────────────
{
  const r = new TimecodeReader();
  const p = roll(r, 1, 23, 45, 10);
  check('eight quarter-frames make one position', !!p, p ? formatTimecode(p) : 'nothing came out');
  // The trap: two frames go by while those eight messages are sent, so the
  // position they spell is two frames old and has to be put back.
  check('and it is put forward the two frames the message itself took',
    p?.frames === 12, `frame ${p?.frames} from a message spelling 10`);
  check('and the rest of it is the timecode the desk sent',
    p?.hours === 1 && p?.minutes === 23 && p?.seconds === 45, formatTimecode(p));
  check('and seconds from the top is what a show can use',
    Math.abs(p.at - (1 * 3600 + 23 * 60 + 45 + 12 / 30)) < 1e-6, `${p.at.toFixed(3)}s`);
}

// ── 2. The carry ─────────────────────────────────────────────────────
// Adding two frames to frame 29 at 30fps is the next second, not frame 31.
{
  const r = new TimecodeReader();
  const p = roll(r, 0, 0, 12, 29);
  check('two frames past the end of a second carries into the next one',
    p?.seconds === 13 && p?.frames === 1, formatTimecode(p));
  const q = roll(new TimecodeReader(), 0, 59, 59, 29);
  check('and all the way up through the hour', q?.hours === 1 && q?.minutes === 0 && q?.seconds === 0,
    formatTimecode(q));
}

// ── 3. The rates ─────────────────────────────────────────────────────
{
  for (const [bits, rate] of [[0, 24], [1, 25], [2, 29.97], [3, 30]]) {
    const p = roll(new TimecodeReader(), 2, 0, 0, 0, 1000, bits);
    check(`a desk running at ${rate} is read as ${rate}`, p?.rate === rate, `got ${p?.rate}`);
  }
}

// ── 4. Joining mid-frame ─────────────────────────────────────────────
// A show that is started while the desk is already rolling hears the back half
// of a frame first. Assembling a position out of that gives a timecode made of
// two different moments, which lands the show somewhere it has never been.
{
  const r = new TimecodeReader();
  const all = quarters(3, 0, 0, 0);
  let got = null;
  for (const b of all.slice(4)) got = r.quarter(b, 1000) ?? got;
  check('half a frame heard on the way in produces no position', got === null);
  // The next whole one does.
  const p = roll(r, 3, 0, 0, 8);
  check('and the next whole frame does', p?.hours === 3 && p?.frames === 10, formatTimecode(p));
}

// ── 5. A locate ──────────────────────────────────────────────────────
// Full-frame SysEx: the whole position at once, which is what a desk sends
// when the operator jumps rather than rolls.
{
  const r = new TimecodeReader();
  const p = r.full([0xf0, 0x7f, 0x7f, 0x01, 0x01, (3 << 5) | 2, 30, 15, 7, 0xf7], 1000);
  check('a locate lands the whole position in one message',
    p?.hours === 2 && p?.minutes === 30 && p?.seconds === 15 && p?.frames === 7 && p?.rate === 30,
    formatTimecode(p));
  // No two-frame offset here: nothing was spelled out over time.
  check('and it is not put forward, because it took no time to send',
    p?.frames === 7, `frame ${p?.frames}`);
  check('a SysEx that is not timecode is ignored',
    r.full([0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7], 1000) === null);
}

// ── 6. The desk stops ────────────────────────────────────────────────
// A rolling desk sends a hundred messages a second, so silence means stopped —
// and a show that keeps following the last position it heard is a show frozen
// on one cue for the rest of the night.
{
  const r = new TimecodeReader();
  roll(r, 0, 1, 0, 0, 5000);
  check('a position just heard is live', r.read(5000) !== null && r.running(5000));
  check('and is still live between frames', r.read(5050) !== null);
  check('but a desk that went quiet hands the show back its own clock',
    r.read(5400) === null && !r.running(5400), 'null after 400ms of silence');
  check('and says so as a readout rather than a stale number',
    formatTimecode(r.read(5400)) === '--:--:--:--');
}

// ── 7. Where a sequence would sit ────────────────────────────────────
// The arithmetic the sequencer does with the position: which stage covers this
// second. Done here because it is the part a wrong answer makes visible.
{
  const stages = [30, 45, 60, 20];
  const stageAt = (t) => {
    let acc = 0, i = 0;
    for (; i < stages.length - 1; i++) { if (acc + stages[i] > t) break; acc += stages[i]; }
    return { i, into: t - acc };
  };
  check('the top of the show is the first stage', stageAt(0).i === 0);
  check('a second before a boundary is still the stage before it', stageAt(29.9).i === 0);
  check('and the boundary itself is the next one', stageAt(30).i === 1 && stageAt(30).into === 0);
  check('a locate into the middle lands in the right stage, at the right point',
    stageAt(100).i === 2 && Math.abs(stageAt(100).into - 25) < 1e-9,
    `stage ${stageAt(100).i}, ${stageAt(100).into}s in`);
  check('and past the end parks on the last stage rather than falling off it',
    stageAt(9999).i === stages.length - 1);
}

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
