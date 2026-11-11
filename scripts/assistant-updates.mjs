/**
 * The Mac app's updates from the owner's assistant (PLAN 44k-18,
 * 13-update-auto): their lines in `npm run assistant`, beside
 * `scripts/assistant.mjs` because that file is close to the 100 KB `npm run
 * sizes` stops a file growing past.
 *
 * The show server under this check is a plain one, run from the repo, with no
 * Mac app around it and so no updater handed to it. What can be held here is
 * the relay's own part, through the real MCP server:
 *  - app_updates' changes (auto, check, install) need Full, and status does
 *    not;
 *  - in Full, a show with no updater says so, rather than claiming a switch
 *    it does not have;
 *  - none of it ever reaches the display (the updater is the main process's),
 *    and a phone's `assistant-updates` never does either.
 * The updater's own rules under the call (the switch, never mid-show) are
 * `npm run updates`, which drives server/assistantUpdates.js with the real
 * desktop/updates.js on stand-ins.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** In Play: the changes refused for want of Full; status answered. */
export async function updatesPlayLines({ mcp, display, check }) {
  const t = Date.now();
  const r = [await mcp.call('app_updates', { command: 'auto', on: false }), await mcp.call('app_updates', { command: 'install' })];
  const st = await mcp.call('app_updates', { command: 'status' });
  await sleep(150);
  check('updates-full', 'app_updates auto and install are refused in Play, for want of Full; status is not',
    r.every((x) => !x.ok && /Full mode is needed/.test(x.text)) && !/Full mode/.test(st.text) && display.since(t, 'assistant-updates').length === 0,
    [...r, st].map((x) => x.text).join(' | ').slice(0, 200));
}

/** In Full: a show with no Mac app around it says so; a phone's never reaches the display. */
export async function updatesFullLines({ mcp, display, check, phone }) {
  const t = Date.now();
  const r = await mcp.call('app_updates', { command: 'auto', on: false });
  phone.ws.send(JSON.stringify({ type: 'assistant-updates', do: 'auto', on: false }));
  await sleep(250);
  check('-', 'app_updates in a show not run in the Mac app says it has no updater', !r.ok && /not running in it/.test(r.text), r.text.slice(0, 160));
  check('phone-updates', 'a phone\'s assistant-updates never reaches the display, nor does the assistant\'s', display.since(t, 'assistant-updates').length === 0);
}

export const UPDATES_MUTANTS = [
  { rule: 'updates-full', file: 'assistantUpdates.js', find: "if (d !== 'status' && (RANK[mode] ?? 0) < RANK.full)", replace: 'if (false)' },
  { rule: 'phone-updates', file: 'remote-server.js', find: "'assistant-sound', 'assistant-updates', 'assistant-undo',", replace: "'assistant-sound', 'assistant-undo'," },
];
