/**
 * A take: the show recorded the way the owner records it, with the app's own
 * Record button (the canvas and the sound, `useRecorder.ts`), shared by the
 * harnesses that watch the app over time (`npm run moving`, `npm run film`).
 * (Not `take.mjs`: that is `npm run take`, the performance recorder.)
 *
 * Why the Record button and not Playwright's page video. The page video is
 * the whole page at its own frame rate, with no sound, and the desk's meters
 * move with the music whether the plate does or not; the Record button gives
 * the plate alone, with the music in the same file, which is what "does it
 * move with the music" has to be measured on.
 *
 * Three things learned the hard way, each a silent failure:
 *
 *   - The round Record button is hidden while a desk is up, and a desk is up
 *     at the laptop sizes these run at, so everything goes through the command
 *     palette, as qa.mjs reaches things under a desk.
 *   - A palette row carries its key after its name ("Freeze the liquidF"), so
 *     the top row is matched on how it starts, and a wrong top row is an
 *     error, not a wrong command run quietly.
 *   - Without `--autoplay-policy=no-user-gesture-required` the band in a box
 *     never starts (nobody has clicked the page, so its AudioContext stays
 *     suspended), the recorder's audio track gives no data, MediaRecorder
 *     hands back an empty file, and the app quietly does not save it: no
 *     download, no error. `AUTOPLAY` is that flag, for `launchChromium`.
 */
export const AUTOPLAY = '--autoplay-policy=no-user-gesture-required';

/** Before `goto`: the synthesised band plays instead of asking for a microphone. */
export const withBand = page => page.addInitScript(() => { try { localStorage.setItem('chromaglass-audio-source', 'simulated'); } catch {} });

/**
 * Resolves once the show's loop has beaten in every quarter second for two
 * seconds running (up to `limit` ms), to `{ ok, waited }` in seconds.
 *
 * Why not a fixed wait. Every fresh Mac runner opens with a freeze of about
 * nine seconds a few seconds after load: no animation frames, no loop
 * heartbeat, while the page's timers keep firing (the depth check found it;
 * the likeliest reading, inferred, is Metal compiling the solver's pipelines
 * cold). A take started inside it is short by however much of it was left,
 * since a canvas that draws nothing gives MediaRecorder nothing: the first
 * film run lost 8.7 s of Classic's 120 that way and failed on its length,
 * which says nothing about Classic. So the take starts on a running show, and
 * how long that took is said on every run rather than hidden. A freeze that
 * comes after this is still in the take, and still fails it.
 *
 * Counted by `crash.beats()`, the loop's own heartbeat, as `npm run crash`
 * does, not by the stage's frames, which a grab can draw by itself.
 */
export async function untilRunning(page, limit = 45000) {
  return page.evaluate(async (limit) => {
    const t0 = performance.now();
    const beats = () => window.chromaglassDebug?.()?.crash?.beats?.() ?? null;
    const seen = [];
    const steady = () => seen.length >= 9 && seen.slice(-9).every((b, i, r) => i === 0 || (b !== null && r[i - 1] !== null && b > r[i - 1]));
    while (!steady() && performance.now() - t0 < limit) {
      seen.push(beats());
      if (!steady()) await new Promise((r) => setTimeout(r, 250));
    }
    return { ok: steady(), waited: (performance.now() - t0) / 1000 };
  }, limit);
}

/** Run a command from the palette. Resolves once it has been chosen. */
export async function viaPalette(page, query) {
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(400);
  await page.evaluate((q) => {
    const input = document.querySelector('[data-testid="palette-input"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, q);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }, query);
  await page.waitForTimeout(400);
  const row = await page.evaluate(() => document.querySelector('[data-row="0"]')?.textContent ?? '');
  if (!row.startsWith(query)) throw new Error(`the palette offered "${row}" for "${query}"`);
  await page.keyboard.press('Enter');
}

/**
 * Record `seconds` of the show into `file`. `cues` are palette commands to
 * run at given seconds into the take ({ at, query }); each comes back with
 * `ran`, the second it was actually chosen (the palette takes most of a
 * second, and a check that plants something must know where it landed).
 * Resolves to `{ ok, cues, reason }`; `ok` is false when no file came back.
 */
export async function recordTake(page, seconds, file, cues = []) {
  await viaPalette(page, 'Record the plate');
  const t0 = Date.now();
  const at = s => page.waitForTimeout(Math.max(0, t0 + s * 1000 - Date.now()));
  const ran = [];
  for (const c of [...cues].sort((a, b) => a.at - b.at)) {
    await at(c.at);
    await viaPalette(page, c.query);
    ran.push({ ...c, ran: (Date.now() - t0) / 1000 });
  }
  await at(seconds);
  const download = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await viaPalette(page, 'Stop recording');
  const got = await download;
  if (!got) return { ok: false, cues: ran, reason: 'no download within 20 s of Stop: an empty recording, or the recorder failed to start' };
  await got.saveAs(file);
  return { ok: true, cues: ran };
}
