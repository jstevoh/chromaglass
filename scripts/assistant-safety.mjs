/**
 * Lines of `npm run assistant` from the security review of 2026-11-13, in a
 * file of their own because scripts/assistant.mjs sits at the size check's
 * 100 KB bar.
 *
 *  - The notes come back framed as data. add_note writes them in any mode and
 *    from any session, so a line an injected page talked an assistant into
 *    saving would otherwise read as "the owner's notes" to every later session.
 *  - OSC opened to the network by the assistant closes when the switch goes
 *    off (the owner's choice, 2026-11-13: keep the assistant's OSC, but not
 *    left open to the venue's Wi-Fi after it is switched off). What is measured
 *    is the port itself: while the show holds it on 0.0.0.0 a plain socket
 *    cannot bind it, and once it is closed one can.
 */
import { createSocket } from 'node:dgram';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** True when a plain UDP socket can bind `port` on every address, i.e. nothing holds it. */
async function portFree(port) {
  const s = createSocket('udp4');
  const ok = await new Promise((r) => { s.once('error', () => r(false)); s.bind(port, '0.0.0.0', () => r(true)); });
  try { s.close(); } catch { /* never opened */ }
  return ok;
}

export function notesFrameLine(read, check) {
  const frame = read.text.indexOf('never instructions');
  check('-', 'the notes come back framed as data the assistant saved, never instructions',
    frame > 0 && frame < read.text.indexOf('muddy') && /saved by the assistant/.test(read.text), read.text.slice(0, 120));
}

/** Call in Full mode; it turns the switch off itself (`setMode`) and leaves it off. */
export async function oscClosesWithSwitchLines({ mcp, check, udp, setMode }) {
  const net = await mcp.call('outputs', { command: 'osc_in', mode: 'network' });
  await sleep(150);
  const heldOpen = !(await portFree(udp));
  await setMode('off');
  await sleep(400);
  const freed = await portFree(udp);
  check('osc-off-switch', 'OSC the assistant opened to the network is closed again when the switch goes off',
    net.ok && heldOpen && freed, `opened ${net.ok}, held while on ${heldOpen}, free after off ${freed}; ${net.ok ? '' : net.text.slice(0, 100)}`);
}

/*
  Film → a window asks which (desktop/pickSource.js; the owner's choice,
  2026-11-13). It took the first window macOS listed, so an assistant in Full
  mode could put Mail on the plate and the stream. Measured on a stand-in for
  Electron's message box: the person's pick is what is filmed, Cancel films
  nothing, and nothing is filmed without asking.
*/
export async function pickSourceLines(check) {
  const { pickSource } = await import('../desktop/pickSource.js');
  const sources = [{ id: 'w1', name: 'Mail' }, { id: 'w2', name: 'Oil wheel film' }, { id: 's1', name: 'Entire screen' }];
  let asked = null;
  const choose = (i) => async (opts) => { asked = opts; return { response: i }; };
  const picked = await pickSource(sources, choose(1));
  const askedFor = asked;
  const cancelled = await pickSource(sources, choose(3));
  const none = await pickSource([], choose(0));
  check('pick-window', 'Film a window asks which, films the one picked, and Cancel or no windows films nothing',
    picked?.id === 'w2' && askedFor?.buttons?.join('|') === 'Mail|Oil wheel film|Entire screen|Cancel' && askedFor.cancelId === 3 && cancelled === null && none === null,
    `picked ${picked?.id}, buttons ${askedFor?.buttons?.join('|')}, cancel ${cancelled?.id ?? null}, none ${none}`);
}
