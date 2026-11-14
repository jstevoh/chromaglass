/**
 * `npm run startup`'s wait for the half of the pipelines built behind the
 * show (`gpu/prepare.ts`), and what its line says when that half was not
 * done. Beside startup.mjs, which is over 100 KB and may not grow.
 *
 * What was reported (PLAN.md 19ah-9b, and the black-lines thread's comment
 * on #857): the Mac `open` shard's "every pipeline it asked for ahead was
 * built ahead ... nothing built behind it" went red on GitHub's slower Macs.
 * startup waited a fixed 45 s for the half's record, and the half, grown to
 * 113 builds beside a running show, took 28 to 46 s there (42.84 s on the
 * green run 43570470863, ~0.38 s a build one at a time): 13 of 154 runs of
 * 10 to 14 November went red with every build still arriving, each on an
 * opening of 12.6 s or more, six of them on 14 November across five branches
 * (`npm run flakes -- --days 4 --check 'every pipeline it asked for ahead'`).
 * The line then said "nothing built behind it", which read as the show
 * asking for nothing.
 *
 * How long the half may take is not what the line claims. It claims every
 * build asked for ahead was built ahead, which the app answers when the half
 * is done; and the app's own cap on one build that never settles
 * (PREPARE_TIMEOUT_MS, read here from its progress as `cap` so the two cannot
 * drift) is what ends a hung half, recorded as timed out, which the line
 * fails. A longer clock would only have moved the red to the next slower
 * runner. So the wait follows the app (`prepareProgress` in `gpu/prepare.ts`,
 * through `chromaglassDebug().pipelines().progress`) and ends:
 *
 *   - when the half's record is in (`prepares`, stage `later`, on the device
 *     the show opened on);
 *   - when the progress shows no build settled for longer than the app's cap
 *     and BEHIND_SLACK_MS, which the app should never let happen;
 *   - where the half never began, after BEHIND_START_MS, the old wait (an app
 *     with no progress record reads this way, as it did before);
 *   - after BEHIND_MAX_MS in all, a bound that only keeps a runner from being
 *     held for good by a half whose every build takes just under the cap:
 *     about four times the slowest half seen.
 *
 * The line holds the half's pace to the opening's on the same runner
 * (BEHIND_PACE_MAX, below), so a half that slows is red there and not hidden
 * by the wait.
 */
export const BEHIND_START_MS = 45_000;
export const BEHIND_SLACK_MS = 5_000;
export const BEHIND_MAX_MS = 180_000;

/** `{ done, why, going }`: the half's record or null, why the wait ended without it, and its progress then. */
export function waitBehind(page) {
  return page.evaluate(async ([startMs, maxMs, slackMs]) => {
    const t0 = performance.now();
    const pipes = () => window.chromaglassDebug?.()?.pipelines?.();
    const mine = (list) => {
      const first = (pipes()?.prepares ?? []).find((p) => p.stage === 'opening');
      return first ? (list ?? []).find((p) => p.stage === 'later' && p.device === first.device) ?? null : null;
    };
    for (;;) {
      const done = mine(pipes()?.prepares);
      const going = mine(pipes()?.progress);
      const now = performance.now();
      const why = done ? null
        : !going ? (now - t0 > startMs ? 'never began' : null)
        : now - going.lastAt > going.cap + slackMs ? "no build settled within the app's cap"
        : now - t0 > maxMs ? "still going at the harness's bound" : null;
      if (done || why) return { done, why, going: going && { ...going, now: Math.round(now) } };
      await new Promise((r) => setTimeout(r, 100));
    }
  }, [BEHIND_START_MS, BEHIND_MAX_MS, BEHIND_SLACK_MS]);
}

/*
  The most the half behind the show may take a build, as a multiple of the
  opening's on the same runner. The fixed 45 s wait this file replaces was,
  in effect, the only thing that made a slow half red: a half four times
  slower now finishes inside BEHIND_MAX_MS. So its pace is held instead, to
  the runner's own pace and not to a clock, which a slower runner moved the
  red past. What was read: one at a time the half took 0.38 s a build
  against the opening's 0.13 s three at a time (2.9x, run 43570470863);
  two at a time (LATER_LANES) it should take less. Six times catches a half
  held behind something it should not be (a lane serialised behind the
  frames, a compile per frame) with room for a runner's noise.
*/
export const BEHIND_PACE_MAX = 6;

/**
 * Both halves whole: each asked for something, built all of it, never timed
 * out, and the half behind at no more than BEHIND_PACE_MAX times the
 * opening's pace. `asked > 0` because a record missing its fields compared
 * `undefined === undefined` and passed.
 */
export function halvesWhole(p, b) {
  const whole = (x) => !!x && x.asked > 0 && x.ready === x.asked && !x.timedOut;
  return whole(p) && whole(b) && b.ms / b.asked <= BEHIND_PACE_MAX * (p.ms / p.asked);
}

/** The line's account of the half: done, with its pace against the opening's, or how far it got. */
export function behindSaid(b, p, w) {
  const each = (x) => `${(x.ms / Math.max(1, x.asked)).toFixed(0)} ms a build`;
  if (b) return `${b.ready} of ${b.asked} behind it in ${(b.ms / 1000).toFixed(2)} s${b.timedOut ? ', and it stopped waiting' : ''} (${each(b)}, against ${each(p)} ahead; at most ${BEHIND_PACE_MAX}×)`;
  if (!w) return 'nothing built behind it (not waited for)';
  const g = w.going;
  if (!g) return `nothing began building behind it in ${(BEHIND_START_MS / 1000).toFixed(0)} s`;
  return `still building behind it when the wait ended (${w.why}): ${g.settled} of ${g.asked} settled in ${((g.now - g.at) / 1000).toFixed(2)} s, the last ${((g.now - g.lastAt) / 1000).toFixed(2)} s before`;
}
