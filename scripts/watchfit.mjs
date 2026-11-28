/**
 * Fit the report card to one person's own ratings (PLAN 47p-5, the public
 * form of 47x-15), and say how far to trust the fit.
 *
 * Why. The card's bands are the range each measure takes over two or three
 * real liquid light shows (REAL_SHOW_CARDS in watchcard.mjs): a canon's score
 * is a distance from those films. On anyone else's footage, or for anyone
 * whose taste is not those films, that is not a measure of what they like.
 * The owner asked (2026-11-27) that a person can rate their own clips and
 * have the tool learn from them, so the ratings page and this step ship with
 * the tool.
 *
 * What the fit is. The same card, with the bands taken from the clips this
 * person rated highest instead of from the real shows: a measure's band is
 * its range over their best clips, and a clip scores high on a canon when it
 * sits where their best clips sit. "Highest" is every clip rated 4 or 5 of 5
 * (on the 1-5 the rating page gives; any scale is read by its top fifth),
 * or the top third when fewer than two are. That is the card's own idea of a
 * good film (inside the range real good films take), with the person's good
 * films in place of the real shows, so nothing new is invented and every
 * line of the card still reads the same way. It was chosen over the obvious
 * alternative, a regression from measures to marks, because a regression on
 * ten to twenty clips with twenty-five measures fits anything, and its
 * weights would say nothing a person could read.
 *
 * How far to trust it. A fit always agrees with the clips it was fitted on,
 * so that agreement is printed but never relied on. The figure that counts
 * is leave-one-out: each clip scored by a fit made without it. Clips the
 * person marked "keep aside" on the rating page (`heldOut`) are never fitted
 * on and give a second, cleaner figure. The fit is used by later runs
 * (`used` in card-fit.json, read by loadFit) only when leave-one-out agreement
 * is at least USE_RHO over at least MIN_RATED clips: below that the
 * real-show card is no worse a guess, and it is at least calibrated on
 * something real.
 */

import fs from 'node:fs';
import path from 'node:path';
import { REAL_SHOW_CARDS, cardMetrics, ratedRead, reportCard, spearman } from './watchcard.mjs';

export const MIN_RATED = 5;
export const USE_RHO = 0.3;

/** A card's score in one number: the mean of its graded canons, null when none is graded. */
export function cardScore(card) {
  const g = (card?.canons ?? []).filter(c => c.score != null && Number.isFinite(c.score));
  return g.length ? g.reduce((a, c) => a + c.score, 0) / g.length : null;
}

const CANONS = { Unity: 'unity', Complexity: 'complexity', Intensity: 'intensity', Arc: 'arc', Surprise: 'surprise', 'Music fit': 'musicFit', Restraint: 'restraint' };

/** The clips a fit is made from: rated 4 or more on 1-5 (the top fifth of the scale in use), or the top third. */
export function likedOf(items) {
  if (!items.length) return [];
  const top = Math.max(...items.map(x => x.overall)), bottom = Math.min(...items.map(x => x.overall));
  const scaleTop = top <= 5 ? 5 : top <= 10 ? 10 : top;
  const bar = scaleTop === 5 ? 4 : scaleTop * 0.8;
  let liked = items.filter(x => x.overall >= bar);
  if (liked.length < 2) liked = [...items].sort((a, b) => b.overall - a.overall).slice(0, Math.max(2, Math.ceil(items.length / 3)));
  if (top === bottom) return [];
  return liked;
}

const calOf = liked => liked.map(x => ({ name: x.key, ...x.m }));

/**
 * Merge rating files: an entry from a later file replaces the earlier one's
 * marks where it has them (newer `updatedAt` wins when both carry one), and
 * the moment notes of both are kept, once each. So a person who rates half a
 * batch on a phone and half on a laptop loses neither half.
 */
export function mergeRatings(...sets) {
  const out = {};
  for (const set of sets) {
    if (!set || typeof set !== 'object') continue;
    for (const [k, e] of Object.entries(set)) {
      if (!e || typeof e !== 'object') continue;
      const old = out[k];
      if (!old) { out[k] = { ...e }; continue; }
      const newer = !(old.updatedAt && e.updatedAt && e.updatedAt < old.updatedAt);
      const merged = newer ? { ...old, ...e } : { ...e, ...old };
      const seen = new Set(), moments = [];
      for (const m of [...(old.moments ?? []), ...(e.moments ?? [])]) {
        const id = `${Number(m.t).toFixed(1)}|${m.note}`;
        if (!seen.has(id)) { seen.add(id); moments.push(m); }
      }
      if (moments.length) merged.moments = moments.sort((a, b) => a.t - b.t);
      out[k] = merged;
    }
  }
  return out;
}

/**
 * Fit the card to `ratings` (the ratings.json object). Each entry needs a
 * numeric `overall` and a read the card can grade (a kept clip's design.json,
 * or the `read` the rating page stores). Returns the fit, its agreement and
 * the lines to print; nothing is written (writeFit does that).
 */
export function refit(ratings, { libDirs = [] } = {}) {
  const all = [];
  for (const [key, e] of Object.entries(ratings ?? {})) {
    if (!e || typeof e !== 'object' || typeof e.overall !== 'number' || !Number.isFinite(e.overall)) continue;
    const read = ratedRead(key, ratings, libDirs);
    if (!read) continue;
    all.push({ key, overall: e.overall, entry: e, held: !!e.heldOut, m: cardMetrics(read) });
  }
  const train = all.filter(x => !x.held), held = all.filter(x => x.held);
  const unread = Object.keys(ratings ?? {}).filter(k => typeof ratings[k]?.overall === 'number' && !all.some(x => x.key === k));
  if (train.length < MIN_RATED) {
    return { ok: false, n: train.length, lines: [`Refit needs at least ${MIN_RATED} rated clips with a read (have ${train.length}${unread.length ? `; ${unread.length} rated without one: ${unread.slice(0, 5).join(', ')}` : ''}). Rate more, then run it again.`] };
  }
  const liked = likedOf(train);
  if (!liked.length) return { ok: false, n: train.length, lines: ['Every clip has the same mark, so there is nothing to fit: rate the ones you like and dislike apart.'] };
  const cal = calOf(liked);
  const scoreWith = (m, c) => cardScore(reportCard(m, { cal: c }));
  const rhoOf = (xs, ys) => {
    const p = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x != null && y != null);
    return p.length >= 3 ? { rho: spearman(p.map(q => q[0]), p.map(q => q[1])), n: p.length } : null;
  };
  const inSample = rhoOf(train.map(x => scoreWith(x.m, cal)), train.map(x => x.overall));
  const loo = rhoOf(train.map(x => {
    const rest = likedOf(train.filter(y => y !== x));
    return rest.length ? scoreWith(x.m, calOf(rest)) : null;
  }), train.map(x => x.overall));
  const heldOut = held.length ? rhoOf(held.map(x => scoreWith(x.m, cal)), held.map(x => x.overall)) : null;
  const stock = rhoOf(train.map(x => scoreWith(x.m, REAL_SHOW_CARDS)), train.map(x => x.overall));
  const canons = {};
  for (const [name, key] of Object.entries(CANONS)) {
    const rated = train.filter(x => typeof x.entry[key] === 'number');
    if (rated.length < 3) continue;
    const cards = rated.map(x => reportCard(x.m, { cal }).canons.find(c => c.name === name)?.score ?? null);
    const r = rhoOf(cards, rated.map(x => x.entry[key]));
    if (r) canons[name] = r;
  }
  const used = !!loo && loo.rho >= USE_RHO;
  const f2 = r => (r ? `rho ${r.rho.toFixed(2)} over ${r.n}` : 'too few clips');
  const lines = [
    `Fitted the card to ${train.length} rated clips: bands from the ${liked.length} you rated highest (${liked.map(x => x.key).join(', ')}).`,
    `- on clips left out of the fit, one at a time (the figure to trust): ${f2(loo)}`,
    ...(held.length ? [`- on the ${held.length} clips you kept aside: ${f2(heldOut)}`] : ['- no clips kept aside: mark three or four "keep aside" on the rating page for a second check']),
    `- on the clips it was fitted on (always flatters a fit): ${f2(inSample)}`,
    `- the real-show card on the same clips, before the fit: ${f2(stock)}`,
    ...Object.entries(canons).map(([n, r]) => `- ${n} against your ${n} marks: ${f2(r)}`),
    used
      ? `Later runs grade with these bands (left-out agreement ${loo.rho.toFixed(2)} >= ${USE_RHO}), on any footage, and say so on the card.`
      : `Not used: on clips it was not fitted on it agrees ${loo ? `only ${loo.rho.toFixed(2)}` : 'on too few'} (needs ${USE_RHO}), no better a guess than the real-show card. Rate more clips, spread from bad to good, and refit.`,
    ...(unread.length ? [`- ${unread.length} rated clips had no read and were left out: ${unread.slice(0, 5).join(', ')}${unread.length > 5 ? ', …' : ''}`] : []),
  ];
  return { ok: true, n: train.length, liked: liked.map(x => x.key), cal, used, agreement: { leaveOneOut: loo, heldOut, inSample, stock, canons }, lines };
}

/** Write card-fit.json into `dir` (beside ratings.json), where later runs read it. */
export function writeFit(fit, dir) {
  const f = path.join(dir, 'card-fit.json');
  fs.writeFileSync(f, JSON.stringify({ fittedAt: new Date().toISOString(), n: fit.n, liked: fit.liked, used: fit.used, agreement: fit.agreement, cal: fit.cal }, null, 1) + '\n');
  return f;
}
