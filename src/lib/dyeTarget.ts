/**
 * How full the regulator holds a plate that was laid with a composition.
 *
 * A look whose opening picture covers less of the dish than its own Dye Budget
 * (`seedMean < seedBudget`: Jellyfish Bloom lays 0.40 to 0.47 (it varies per load)
 * against the default budget of 0.85, Comet 0.16 against 0.85) holds what it was laid with, not the
 * budget, so the music turns the bodies over instead of filling the black void
 * up to the slider. That was `min(dyeBudget, seedMean)`, and it made the slider
 * dead from the look's own composition up to its maximum: on Jellyfish Bloom the
 * target was its laid mass for every slider position from there up to 1.2, and
 * the slider did nothing across all of it (review of #401).
 *
 * The composition is now the target AT the look's own budget, and the slider
 * scales it on both sides, so the whole range is live:
 *
 *   seedMean <  seedBudget    seedMean * dyeBudget / seedBudget
 *   seedMean >= seedBudget    min(dyeBudget, seedMean)        as it was
 *
 * At `dyeBudget == seedBudget` the first line gives `seedMean`, so a preset left
 * alone behaves exactly as it did. Moved down it dries toward the floor, moved
 * up it fills, in proportion: Jellyfish Bloom at 0.85 holds what it laid (0.40 to
 * 0.47) and at 0.14 holds about 0.07. Moved down between `seedMean` and `seedBudget` it used to sit
 * still; that is the one place a slider position that was dead is now live, and
 * the point of the change. A look laid fuller than its budget is capped by the
 * slider itself, as it always was.
 *
 * A heavy composition (`seedMean > 0.85`) is held at what it was laid with
 * while the slider sits at its own value, so a plate laid thick is not dried
 * to 0.85. Above 0.85 it scales from there, with the divisor the look's own
 * budget (never less than 0.85), so a look whose own budget is 1.0 and which
 * was laid at 0.9 is still held at 0.9 at 1.0 and changes only when the slider
 * is moved.
 *
 * Named shortcut (PLAN 28d-A): this is a ratio, not physics. The honest answer
 * is the volume model (PLAN 18c-2), where a pour adds volume and the glass has
 * a capacity; until then the target is the look's own picture, scaled.
 */
export const lookTarget = (seedMean: number | null, dyeBudget: number, seedBudget = 0.85): number => {
  if (seedMean === null || !(seedMean > 0)) return dyeBudget;
  if (seedMean > 0.85 && dyeBudget >= 0.85) return seedMean * dyeBudget / Math.max(0.85, seedBudget);
  if (seedMean < seedBudget) return seedMean * dyeBudget / seedBudget;
  return Math.min(dyeBudget, seedMean);
};

/**
 * A look that sits on black with little dye: no lamp behind the plate
 * (`lampGround < 0.05`) and a target under 0.45. The looks in the grey-wash
 * fix (#401) are these. Three things are gated on it and change only for them:
 * the continuous pours' style (`contStyle`), the treble sparkle's strength and
 * the surface-to-volume clearing in `decayDye`, plus the hand pour's allowance
 * (`handBank`). Every other look runs those as it did (`npm run lampzero`).
 * The pour room and step (`pourRoom`, `pourDt`) are not gated: they scale
 * every seeded look's pours.
 *
 * Named shortcut: 0.45 is a cliff. A slider dragged across the point where a
 * look's target meets it switches the four on or off at once, where the
 * regulator around it blends.
 */
export const sparseDark = (lampGround: number | undefined, target: number): boolean =>
  (lampGround ?? 0) < 0.05 && target < 0.45;
