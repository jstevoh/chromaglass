/**
 * Watching in words, and what changed between two films (PLAN 47x-1, 47x-2).
 *
 * Vocabulary, sources and the three rules: `docs/watch-words.md`.
 * Every word lives in BANDS below with its area, bold term, source, measure,
 * edge, and why that edge was chosen. No word is said from a NaN or null
 * measure, every text prints its deciding number to at least two significant
 * figures, and unsteady measures (swells, calm, half-life) carry
 * `steady: false` and end with "(may vary from take to take)".
 */

const UNSTEADY_NOTE = '(may vary from take to take)';

/** Format a number to at least two significant figures (or exact integer), never scientific notation. */
export function fmtNum(v) {
  if (!Number.isFinite(v)) return '';
  if (Number.isInteger(v)) return String(v);
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  const d = Math.min(20, Math.max(2, 1 - Math.floor(Math.log10(a))));
  return v.toFixed(d);
}

/** Format a fraction [0, 1] as a percentage with at least two significant figures when non-integer. */
export function fmtPct(v) {
  if (!Number.isFinite(v)) return '';
  const p = v * 100;
  if (Number.isInteger(p)) return `${p}%`;
  const a = Math.abs(p);
  if (a >= 10) return `${p.toFixed(0)}%`;
  if (a >= 1) return `${p.toFixed(1)}%`;
  const d = Math.min(12, Math.max(2, 1 - Math.floor(Math.log10(Math.max(a, 1e-12)))));
  return `${p.toFixed(d)}%`;
}

const finite = x => (x != null && Number.isFinite(x) ? x : null);

/** Extract every single-number measure once so describe() and compareReads() read identical values. */
function extract(read) {
  const sh = read?.shape ?? {};
  const ds = read?.design ?? {};
  const ps = ds.physics ?? read?.physics ?? {};
  const rows = Array.isArray(read?.rows) ? read.rows : [];

  let motionP50 = null;
  let motionP90 = null;
  let motionRatio = null;
  if (rows.length > 1) {
    const ms = rows.slice(1).map(r => r.motion).filter(Number.isFinite).sort((a, b) => a - b);
    if (ms.length) {
      motionP50 = ms[Math.min(ms.length - 1, Math.floor(0.5 * ms.length))];
      motionP90 = ms[Math.min(ms.length - 1, Math.floor(0.9 * ms.length))];
      // A completely frozen clip (p90 < 0.05%) has no timing ratio to judge.
      if (motionP90 >= 0.05) {
        motionRatio = motionP90 / Math.max(motionP50, 0.005);
      }
    }
  }

  const p5 = finite(ds.p5?.med);
  const p95 = finite(ds.p95?.med);
  const lumSpread = p5 != null && p95 != null ? p95 - p5 : null;
  const cx = ds.centroid?.[0];
  const cy = ds.centroid?.[1];
  const centroidOffset = finite(cx) != null && finite(cy) != null ? Math.hypot(cx - 0.5, cy - 0.5) : null;
  const horiz = finite(ps.horizontal);
  const vert = finite(ps.vertical);
  const driftSpeed = horiz != null && vert != null ? Math.hypot(horiz, vert) : null;
  const domHue = Array.isArray(ds.hues) && ds.hues.length >= 2 ? finite(ds.hues[0]?.[1]) : null;
  const minHue = Array.isArray(ds.hues) && ds.hues.length >= 2 ? finite(ds.hues.at(-1)?.[1]) : null;
  const mirror = finite(ds.mirror?.med);
  const halfTurn = finite(ds.halfTurn?.med);
  const symMax = mirror != null || halfTurn != null ? Math.max(mirror ?? -Infinity, halfTurn ?? -Infinity) : null;
  const symMeasure = (halfTurn ?? -Infinity) > (mirror ?? -Infinity) ? 'half-turn symmetry' : 'mirror symmetry';

  return {
    // Motion (Laban)
    motionRatio,
    motionP90,
    curl: finite(ps.curl?.med),
    driftSpeed,
    carried: finite(ps.carried?.med),
    // Build (Laban / Ching, unsteady)
    swellsPerMin: finite(sh.swells?.perMin),
    calm: finite(sh.calm),
    halfLife: finite(sh.halfLife),
    reorgPerMin: finite(sh.reorgPerMin),
    swellsAt: Array.isArray(sh.swells?.at) ? sh.swells.at.length : 0,
    // Colour (Itten)
    colourfulness: finite(ds.colourfulness?.med),
    coloured: finite(ds.coloured?.med),
    huesCount: finite(sh.hues),
    hueGap: finite(ds.hueGap?.med),
    hueSpread: finite(ds.hueSpread?.med),
    warm: finite(ds.warm?.med),
    lumSpread,
    domHue,
    minHue,
    // Light
    blackMean: finite(sh.black?.mean),
    lumMean: finite(ds.lumMean?.med),
    rms: finite(ds.rms?.med),
    p95,
    // Edges (Greenberg)
    edgeWidth: finite(ds.edgeWidth?.med),
    // Form (wet show / Greenberg)
    scaleX: finite(ds.scaleX?.med),
    coherence: finite(ds.coherence?.med),
    forms: finite(ds.forms?.med),
    formArea: finite(ds.formArea?.med),
    elongation: finite(ds.elongation?.med),
    spectrum: finite(ps.spectrum?.med),
    // Composition (Arnheim / Greenberg / Ching)
    spread: finite(ds.spread?.med),
    centroidOffset,
    mirror,
    halfTurn,
    symMax,
    symMeasure,
    lineAngle: finite(ds.lineAngle),
    // Show / Physics (wet show)
    ownSpeed: finite(ps.own?.med),
    wholeShare: finite(ps.wholeShare),
    div: finite(ps.div?.med),
    vert,
    turnover: finite(ps.turnover),
    lifetime: finite(ps.lifetime),
  };
}

/**
 * The bands table: one entry per word in `docs/watch-words.md`.
 * Every edge states in a comment what set it (test clips, REAL_SHOWS, or design/physics bands).
 */
export const BANDS = [
  // ── Time (Laban) ──
  // Steady drift clips (`drift`, `crisp`) read motion p90/p50 = 1.02–1.04; jumping (`jumps`)
  // reads 508; real shows with swells sit around 2.2–4.5.
  {
    area: 'time', term: 'sustained', source: 'Laban Movement Analysis',
    measure: 'motion p90/p50', steady: true,
    read: m => m.motionRatio,
    test: v => v < 2.2,
    say: v => `sustained (motion p90/p50 ${fmtNum(v)})`,
  },
  {
    area: 'time', term: 'sudden', source: 'Laban Movement Analysis',
    measure: 'motion p90/p50', steady: true,
    read: m => m.motionRatio,
    test: v => v >= 5.0,
    say: v => `sudden (motion p90/p50 ${fmtNum(v)})`,
  },

  // ── Weight (Laban) ──
  // Detail drifting inside a small disc (`crisp`, `soft`) reads motion p90 = 0.28;
  // full-frame drift reads 3.01; whole-frame jumps (`jumps`) read 12.4.
  {
    area: 'weight', term: 'light', source: 'Laban Movement Analysis',
    measure: 'motion p90', steady: true,
    read: m => m.motionP90,
    test: v => v < 1.5,
    say: v => `light (motion 90th ${fmtNum(v)})`,
  },
  {
    area: 'weight', term: 'strong', source: 'Laban Movement Analysis',
    measure: 'motion p90', steady: true,
    read: m => m.motionP90,
    test: v => v >= 8.0,
    say: v => `strong (motion 90th ${fmtNum(v)})`,
  },

  // ── Space (Laban) ──
  // A turned dish (`watchreadtest` `turned`) reads |curl| = 0.20/s; a steady linear drift
  // (`drift`) reads drift speed 7.1%/s with |curl| < 0.03/s; stationary discs read < 1%/s.
  {
    area: 'space', term: 'indirect', source: 'Laban Movement Analysis',
    measure: 'curl', steady: true,
    read: m => m.curl,
    test: v => Math.abs(v) >= 0.05,
    say: v => `indirect, turning flow (curl ${fmtNum(v)}/s)`,
  },
  {
    area: 'space', term: 'direct', source: 'Laban Movement Analysis',
    measure: 'drift speed', steady: true,
    read: m => m.driftSpeed,
    test: (v, m) => v >= 2.0 && (m.curl == null || Math.abs(m.curl) < 0.03),
    say: v => `direct, steady heading (drift speed ${fmtNum(v)} pct/s)`,
  },

  // ── Flow (Laban) ──
  // Weakest on footage: said only when both carried share and calm share agree.
  // `drift` reads carried 0.98 and calm 0 (free); a paused/holding plate has calm >= 0.45 and carried < 0.25 (bound).
  // `REAL_SHOWS` read carried 0.13–0.23 and calm 0.20–0.42 (so neither triggers falsely).
  {
    area: 'flow', term: 'free', source: 'Laban Movement Analysis',
    measure: 'carried share', steady: true,
    read: m => m.carried,
    test: (v, m) => m.calm != null && v >= 0.6 && m.calm < 0.15,
    say: v => `free flow (carried ${fmtPct(v)})`,
  },
  {
    area: 'flow', term: 'bound', source: 'Laban Movement Analysis',
    measure: 'carried share', steady: true,
    read: m => m.carried,
    test: (v, m) => m.calm != null && v < 0.25 && m.calm >= 0.45,
    say: v => `bound flow (carried ${fmtPct(v)})`,
  },

  // ── Build (Ching / Laban, unsteady) ──
  // Swells a minute in `REAL_SHOWS` are 2.0–3.1/min (selftest D: 3.0/min with 1.0 reorg/min).
  // Unsteady across takes of the same look, so always flagged "(may vary from take to take)".
  {
    area: 'build', term: 'rhythm', source: 'Francis D. K. Ching',
    measure: 'swells a minute', steady: false,
    read: m => m.swellsPerMin,
    test: (v, m) => v >= 1.0 && m.swellsAt >= 2 && (m.reorgPerMin == null || m.reorgPerMin > 0),
    say: v => `rhythm (${fmtNum(v)} swells/min) ${UNSTEADY_NOTE}`,
  },
  {
    area: 'build', term: 'repetition', source: 'Francis D. K. Ching',
    measure: 'swells a minute', steady: false,
    read: m => m.swellsPerMin,
    test: (v, m) => v >= 1.0 && m.swellsAt >= 2 && m.reorgPerMin === 0,
    say: v => `repetition (${fmtNum(v)} swells/min) ${UNSTEADY_NOTE}`,
  },

  // ── Colour (Itten) ──
  // Hasler–Süsstrunk band in `watchdesign.mjs` (< 15 not colourful); grey frames read < 1.
  {
    area: 'colour', term: 'greyed', source: 'Johannes Itten',
    measure: 'colourfulness', steady: true,
    read: m => m.colourfulness,
    test: (v, m) => v < 15 || (m.coloured != null && m.coloured < 0.05),
    say: v => `greyed, little colour (colourfulness ${fmtNum(v)})`,
  },
  {
    area: 'colour', term: 'muted', source: 'Johannes Itten',
    measure: 'colourfulness', steady: true,
    read: m => m.colourfulness,
    test: (v, m) => v >= 15 && v < 28 && (m.coloured == null || m.coloured >= 0.05),
    say: v => `muted colour (colourfulness ${fmtNum(v)})`,
  },
  // `REAL_SHOWS` / multi-hue shows have >= 3 hues; `drift`/`jumps` have 2, `crisp`/`soft` have 1.
  {
    area: 'colour', term: 'of hue', source: 'Johannes Itten',
    measure: 'hues a frame', steady: true,
    read: m => m.huesCount,
    test: (v, m) => v >= 3 && (m.colourfulness == null || m.colourfulness >= 15) && (m.coloured == null || m.coloured >= 0.05),
    say: v => `contrast of hue (${fmtNum(v)} hues a frame)`,
  },
  // `jumps` reads hueGap = 180° (opposite); `drift` reads 30° (under 45° in `watchdesign.mjs`).
  {
    area: 'colour', term: 'complementary', source: 'Johannes Itten',
    measure: 'hue gap', steady: true,
    read: m => m.hueGap,
    test: (v, m) => v >= 150 && (m.colourfulness == null || m.colourfulness >= 15),
    say: v => `complementary hues (hue gap ${fmtNum(v)}°)`,
  },
  {
    area: 'colour', term: 'analogous', source: 'Johannes Itten',
    measure: 'hue gap', steady: true,
    read: m => m.hueGap,
    test: (v, m) => v < 45 && (m.colourfulness == null || m.colourfulness >= 15),
    say: v => `analogous hues (hue gap ${fmtNum(v)}°)`,
  },
  // `drift` has warm = 0% (all cool), `crisp`/`soft` have warm = 100% (all warm), `jumps` is 50% (balanced).
  {
    area: 'colour', term: 'cold-warm', source: 'Johannes Itten',
    measure: 'warm share', steady: true,
    read: m => m.warm,
    test: (v, m) => Math.abs(v - 0.5) >= 0.3 && (m.colourfulness == null || m.colourfulness >= 15) && (m.coloured == null || m.coloured >= 0.05),
    say: v => `cold-warm contrast (${fmtPct(v)} warm)`,
  },
  // Wide luminance spread (p95 - p5 >= 0.55): `crisp` reads 0.58, `drift` reads 0.31.
  {
    area: 'colour', term: 'light-dark', source: 'Johannes Itten',
    measure: 'luminance spread', steady: true,
    read: m => m.lumSpread,
    test: (v, m) => v >= 0.55 && (m.colourfulness == null || m.colourfulness >= 15),
    say: v => `light-dark contrast (luminance spread ${fmtNum(v)})`,
  },
  // Vivid colour on a minority of the frame beside dark/grey (`crisp` 11.3% coloured at colourfulness 68).
  {
    area: 'colour', term: 'of saturation', source: 'Johannes Itten',
    measure: 'coloured share', steady: true,
    read: m => m.coloured,
    test: (v, m) => v >= 0.05 && v < 0.45 && m.colourfulness != null && m.colourfulness >= 45,
    say: v => `contrast of saturation (${fmtPct(v)} vivid colour against dark/grey)`,
  },
  // One hue takes most of the coloured area and another a small part (`drift` 53% vs 7%).
  {
    area: 'colour', term: 'of extension', source: 'Johannes Itten',
    measure: 'dominant hue share', steady: true,
    read: m => m.domHue,
    test: (v, m) => v >= 0.5 && m.minHue != null && m.minHue <= 0.15 && v / Math.max(m.minHue, 0.01) >= 4,
    say: v => `contrast of extension (dominant hue ${fmtPct(v)})`,
  },

  // ── Light (the wet show / Itten / Arnheim) ──
  // `crisp` and `soft` read near-black 89%/87%; `drift` and `jumps` read 0%.
  {
    area: 'light', term: 'dark-ground', source: 'the wet show',
    measure: 'near-black share', steady: true,
    read: m => m.blackMean,
    test: v => v >= 0.45,
    say: v => `dark-ground (${fmtPct(v)} near black)`,
  },
  // Bright colour over a dark ground (`crisp`/`soft` p95 0.58/0.55, black 0.89/0.87, colourfulness 68/66).
  {
    area: 'light', term: 'luminous', source: 'the wet show',
    measure: '95th luminance', steady: true,
    read: m => m.p95,
    test: (v, m) => v >= 0.45 && m.blackMean != null && m.blackMean >= 0.45 && m.colourfulness != null && m.colourfulness >= 45,
    say: v => `luminous (95th luminance ${fmtNum(v)} over dark ground)`,
  },
  // Bright everywhere with little dark (e.g. an over-lit white plate: Poster 1969 read lumMean 0.63).
  {
    area: 'light', term: 'washed', source: 'the wet show',
    measure: 'mean luminance', steady: true,
    read: m => m.lumMean,
    test: (v, m) => v >= 0.55 && (m.blackMean == null || m.blackMean <= 0.1),
    say: v => `washed, bright ground (mean luminance ${fmtNum(v)})`,
  },
  // Strong light-dark contrast with large areas of both dark and bright.
  {
    area: 'light', term: 'chiaroscuro', source: 'Johannes Itten',
    measure: 'RMS contrast', steady: true,
    read: m => m.rms,
    test: (v, m) => v >= 0.18 && m.blackMean != null && m.blackMean >= 0.25 && m.blackMean <= 0.85 && m.p95 != null && m.p95 >= 0.65,
    say: v => `chiaroscuro (RMS contrast ${fmtNum(v)})`,
  },

  // ── Edges (Greenberg) ──
  // `crisp` (1 px disc edge) reads edge width 0.62% of width; `soft` (14 px edge) reads 2.67%;
  // smooth sine stripes (`drift`, `jumps`) read ~6%. Both poles share the one `edge width` measure.
  {
    area: 'edges', term: 'hard-edged', source: 'Clement Greenberg',
    measure: 'edge width (% of width)', steady: true,
    read: m => m.edgeWidth,
    test: v => v < 1.0,
    say: v => `hard-edged (edge width ${fmtNum(v)} pct of width)`,
  },
  {
    area: 'edges', term: 'soft', source: 'Clement Greenberg',
    measure: 'edge width (% of width)', steady: true,
    read: m => m.edgeWidth,
    test: v => v >= 2.0 && v < 4.0,
    say: v => `soft edges (edge width ${fmtNum(v)} pct of width)`,
  },
  {
    area: 'edges', term: 'painterly', source: 'Clement Greenberg',
    measure: 'edge width (% of width)', steady: true,
    read: m => m.edgeWidth,
    test: v => v >= 4.0,
    say: v => `painterly, graded edges (edge width ${fmtNum(v)} pct of width)`,
  },

  // ── Form (the wet show / Greenberg) ──
  // `watchdesign.mjs` bands: elongation < 0.35 threads/marbling, 0.35–0.65 lobes, >= 0.75 round cells/beads.
  {
    area: 'form', term: 'marbling', source: 'the wet show',
    measure: 'elongation', steady: true,
    read: m => m.elongation,
    test: (v, m) => v < 0.35 && m.coherence != null && m.coherence >= 0.6 && (m.forms == null || m.forms >= 1),
    say: v => `marbling, aligned filaments (elongation ${fmtNum(v)})`,
  },
  {
    area: 'form', term: 'threads', source: 'the wet show',
    measure: 'elongation', steady: true,
    read: m => m.elongation,
    test: (v, m) => v < 0.35 && (m.coherence == null || m.coherence < 0.6) && (m.forms == null || m.forms >= 1),
    say: v => `threads (elongation ${fmtNum(v)})`,
  },
  {
    area: 'form', term: 'lobes', source: 'the wet show',
    measure: 'elongation', steady: true,
    read: m => m.elongation,
    test: (v, m) => v >= 0.35 && v < 0.65 && (m.forms == null || m.forms >= 1),
    say: v => `lobes (elongation ${fmtNum(v)})`,
  },
  {
    area: 'form', term: 'beads', source: 'the wet show',
    measure: 'elongation', steady: true,
    read: m => m.elongation,
    test: (v, m) => v >= 0.75 && m.forms != null && m.forms >= 12,
    say: v => `beads (elongation ${fmtNum(v)})`,
  },
  {
    area: 'form', term: 'cells', source: 'the wet show',
    measure: 'elongation', steady: true,
    read: m => m.elongation,
    test: (v, m) => v >= 0.75 && m.forms != null && m.forms >= 3 && m.forms < 12,
    say: v => `cells (elongation ${fmtNum(v)})`,
  },
  // Broad even areas with few forms and little line grain (Greenberg's colour field wash).
  {
    area: 'form', term: 'wash', source: 'the wet show',
    measure: 'forms a frame', steady: true,
    read: m => m.forms,
    test: (v, m) => v <= 2 && m.coherence != null && m.coherence < 0.35 && ((m.scaleX != null && m.scaleX >= 15) || (m.formArea != null && m.formArea >= 0.25)),
    say: v => `wash (${fmtNum(v)} broad forms a frame)`,
  },
  // Scale: `drift` reads scaleX 3.3% (fine); `crisp`/`soft` read 10.7%–11.3% (broad).
  {
    area: 'form', term: 'fine', source: 'the wet show',
    measure: 'form scale across (% of width)', steady: true,
    read: m => m.scaleX,
    test: v => v < 4.5,
    say: v => `fine form scale (${fmtNum(v)} pct of width)`,
  },
  {
    area: 'form', term: 'broad', source: 'Clement Greenberg',
    measure: 'form scale across (% of width)', steady: true,
    read: m => m.scaleX,
    test: v => v >= 10.0,
    say: v => `broad form scale (${fmtNum(v)} pct of width)`,
  },

  // ── Composition (Arnheim / Greenberg / Ching) ──
  // `drift` and `jumps` spread light across the whole frame (spread = 0.29 -> all-over);
  // `crisp` and `soft` concentrate one disc at the centre (spread = 0.09 -> centred).
  {
    area: 'composition', term: 'all-over', source: 'Clement Greenberg',
    measure: 'spread of the light', steady: true,
    read: m => m.spread,
    test: v => v >= 0.22,
    say: v => `all-over composition (spread ${fmtNum(v)})`,
  },
  {
    area: 'composition', term: 'centred', source: 'Rudolf Arnheim',
    measure: 'spread of the light', steady: true,
    read: m => m.spread,
    test: (v, m) => v <= 0.16 && (m.centroidOffset == null || m.centroidOffset <= 0.12),
    say: v => `centred composition (spread ${fmtNum(v)})`,
  },
  {
    area: 'composition', term: 'off-centre', source: 'Rudolf Arnheim',
    measure: 'centroid offset', steady: true,
    read: m => m.centroidOffset,
    test: (v, m) => v > 0.15 && (m.spread == null || m.spread <= 0.20),
    say: v => `off-centre weight (centroid offset ${fmtNum(v)})`,
  },
  // Ching's symmetry (`watchdesign.mjs` bands: >= 0.85 kaleidoscopic, >= 0.65 symmetric).
  {
    area: 'composition', term: 'kaleidoscopic', source: 'Francis D. K. Ching',
    measure: 'mirror symmetry', steady: true,
    read: m => m.mirror,
    test: (v, m) => v >= 0.85 && m.halfTurn != null && m.halfTurn >= 0.85,
    say: v => `kaleidoscopic symmetry (mirror ${fmtNum(v)})`,
  },
  {
    area: 'composition', term: 'symmetric', source: 'Francis D. K. Ching',
    measure: 'mirror symmetry', steady: true,
    read: m => m.mirror,
    test: (v, m) => v >= 0.65 && !(v >= 0.85 && m.halfTurn != null && m.halfTurn >= 0.85),
    say: v => `symmetric (mirror ${fmtNum(v)})`,
  },
  // Dominant heading of flow lines (`coherence >= 0.85`).
  {
    area: 'composition', term: 'axis', source: 'Francis D. K. Ching',
    measure: 'flow-line coherence', steady: true,
    read: m => m.coherence,
    test: (v, m) => v >= 0.85 && m.lineAngle != null,
    say: (v, m) => `dominant axis near ${fmtNum(Math.round(m.lineAngle))}° (flow-line coherence ${fmtNum(v)})`,
  },

  // ── The show's own moves (the wet show) ──
  // Matches `guessTechniques()` in `watchphysics.mjs`.
  {
    area: 'show', term: 'bloom', source: 'the wet show',
    measure: 'divergence', steady: true,
    read: m => m.div,
    test: v => v >= 0.03,
    say: v => `bloom spreading outwards (divergence ${fmtNum(v)}/s)`,
  },
  {
    area: 'show', term: 'turned dish', source: 'the wet show',
    measure: 'curl', steady: true,
    read: m => m.curl,
    test: (v, m) => m.wholeShare != null && m.wholeShare >= 0.5 && Math.abs(v) > (4 * Math.PI) / 90,
    say: v => `turned dish (curl ${fmtNum(v)}/s)`,
  },
  {
    area: 'show', term: 'pour', source: 'the wet show',
    measure: 'divergence', steady: true,
    read: m => m.div,
    test: (v, m) => v >= 0.03 && m.reorgPerMin != null && m.reorgPerMin >= 1.0,
    say: v => `pour arriving (divergence ${fmtNum(v)}/s)`,
  },
  {
    area: 'show', term: 'marbling', source: 'the wet show',
    measure: 'own flow speed (% width/s)', steady: true,
    read: m => m.ownSpeed,
    test: (v, m) => v >= 1.5 && m.wholeShare != null && m.wholeShare < 0.5 && m.elongation != null && m.elongation < 0.35 && m.coherence != null && m.coherence >= 0.6,
    say: v => `marbling sheared by flow (own speed ${fmtNum(v)} pct/s)`,
  },
  {
    area: 'show', term: 'cells', source: 'the wet show',
    measure: 'own flow speed (% width/s)', steady: true,
    read: m => m.ownSpeed,
    test: (v, m) => v >= 1.0 && m.elongation != null && m.elongation >= 0.75 && m.forms != null && m.forms >= 6,
    say: v => `cells moving in the flow (own speed ${fmtNum(v)} pct/s)`,
  },
];

const EFFORT_TABLE = {
  'sustained|light|indirect': 'float',
  'sustained|light|direct': 'glide',
  'sustained|strong|indirect': 'wring',
  'sustained|strong|direct': 'press',
  'sudden|light|indirect': 'flick',
  'sudden|light|direct': 'dab',
  'sudden|strong|indirect': 'slash',
  'sudden|strong|direct': 'punch',
};

/**
 * Describe a watched video (`watchVideo`'s return object) in the vocabulary of
 * `docs/watch-words.md`. Returns `{ lines, words }`.
 */
export function describe(read) {
  const m = extract(read ?? {});
  const words = [];
  for (const b of BANDS) {
    const v = b.read(m);
    if (v == null || !Number.isFinite(v)) continue;
    if (!b.test(v, m)) continue;
    words.push({
      area: b.area,
      term: b.term,
      value: v,
      measure: b.measure,
      steady: b.steady,
      source: b.source,
      text: b.say(v, m),
    });
  }

  // Laban's basic effort is named only when all three of Time, Weight and Space are clear.
  const tW = words.find(w => w.area === 'time');
  const wW = words.find(w => w.area === 'weight');
  const sW = words.find(w => w.area === 'space');
  if (tW && wW && sW) {
    const effort = EFFORT_TABLE[`${tW.term}|${wW.term}|${sW.term}`];
    if (effort) {
      words.push({
        area: 'effort',
        term: effort,
        value: tW.value,
        measure: tW.measure,
        steady: true,
        source: 'Laban Movement Analysis',
        text: `${effort}: ${tW.term}, ${wW.term} and ${sW.term} (motion p90/p50 ${fmtNum(tW.value)})`,
      });
    }
  }

  const lines = words.map(w => `- **${w.area}**: ${w.text} — ${w.source}`);
  return { lines, words };
}

/**
 * Measures compared between two reads in `compareReads(before, after)`.
 * Step sizes match `compareDesign` (`scripts/watchdesign.mjs`) and `comparePhysics`
 * (`scripts/watchphysics.mjs`) wherever those cover the measure, extended to Time
 * and Weight as log ratios against 1.5x.
 */
const COMPARE_SPECS = [
  // Time and Weight (log ratio against 1.5x)
  { area: 'time', measure: 'motion p90/p50', label: 'motion timing', read: m => m.motionRatio, kind: 'ratio', steady: true, up: 'became more sudden', down: 'became more sustained' },
  { area: 'weight', measure: 'motion p90', label: 'motion weight', read: m => m.motionP90, kind: 'ratio', steady: true, up: 'got stronger', down: 'got lighter' },
  // Space and Flow
  { area: 'space', measure: 'curl', label: 'flow turning', read: m => m.curl, kind: 0.05, steady: true, up: 'turned more clockwise', down: 'turned more anticlockwise' },
  { area: 'space', measure: 'drift speed', label: 'drift speed', read: m => m.driftSpeed, kind: 2.0, steady: true, up: 'drifted faster', down: 'drifted slower' },
  { area: 'flow', measure: 'carried share', label: 'carried flow', read: m => m.carried, kind: 0.15, steady: true, up: 'more carried by flow', down: 'changed more in place' },
  // Build (unsteady across takes)
  { area: 'build', measure: 'swells a minute', label: 'swells', read: m => m.swellsPerMin, kind: 1.0, steady: false, up: 'more swells a minute', down: 'fewer swells a minute' },
  { area: 'build', measure: 'calm share', label: 'calm share', read: m => m.calm, kind: 0.15, steady: false, up: 'calmer more of the time', down: 'less calm time' },
  { area: 'build', measure: 'motion half-life', label: 'motion half-life', read: m => m.halfLife, kind: 'ratio', steady: false, up: 'motion held longer', down: 'motion changed quicker' },
  // Colour (compareDesign step sizes)
  { area: 'colour', measure: 'colourfulness', label: 'colourfulness', read: m => m.colourfulness, kind: 15, steady: true, up: 'more vivid', down: 'more muted' },
  { area: 'colour', measure: 'coloured share', label: 'coloured area', read: m => m.coloured, kind: 0.15, steady: true, up: 'more of the frame coloured', down: 'less of the frame coloured' },
  { area: 'colour', measure: 'hue spread', label: 'hue spread', read: m => m.hueSpread, kind: 0.2, steady: true, up: 'more hues at once', down: 'fewer hues at once' },
  { area: 'colour', measure: 'warm share', label: 'warmth', read: m => m.warm, kind: 0.2, steady: true, up: 'warmer', down: 'cooler' },
  { area: 'colour', measure: 'hue gap', label: 'hue gap', read: m => m.hueGap, kind: 45, steady: true, up: 'hues moved further apart', down: 'hues moved closer together' },
  { area: 'colour', measure: 'hues a frame', label: 'hues a frame', read: m => m.huesCount, kind: 1.0, steady: true, up: 'more hues a frame', down: 'fewer hues a frame' },
  { area: 'colour', measure: 'luminance spread', label: 'light-dark spread', read: m => m.lumSpread, kind: 0.15, steady: true, up: 'wider light-dark spread', down: 'narrower light-dark spread' },
  { area: 'colour', measure: 'dominant hue share', label: 'dominant hue share', read: m => m.domHue, kind: 0.15, steady: true, up: 'one hue dominated more', down: 'hue shares evened out' },
  // Light (compareDesign step sizes)
  { area: 'light', measure: 'mean luminance', label: 'mean luminance', read: m => m.lumMean, kind: 0.08, steady: true, up: 'got brighter', down: 'got darker' },
  { area: 'light', measure: 'RMS contrast', label: 'contrast', read: m => m.rms, kind: 0.05, steady: true, up: 'more contrast', down: 'flatter contrast' },
  { area: 'light', measure: 'near-black share', label: 'dark ground', read: m => m.blackMean, kind: 0.15, steady: true, up: 'more near black', down: 'less near black' },
  { area: 'light', measure: '95th luminance', label: 'peak brightness', read: m => m.p95, kind: 0.1, steady: true, up: 'brighter highlights', down: 'dimmer highlights' },
  // Edges (compareDesign ratio 1.5x)
  { area: 'edges', measure: 'edge width (% of width)', label: 'the edges', read: m => m.edgeWidth, kind: 'ratio', steady: true, up: 'got softer', down: 'got crisper' },
  // Form (compareDesign + comparePhysics step sizes)
  { area: 'form', measure: 'form scale across (% of width)', label: 'form scale', read: m => m.scaleX, kind: 'ratio', steady: true, up: 'larger forms', down: 'finer forms' },
  { area: 'form', measure: 'flow-line coherence', label: 'flow lines', read: m => m.coherence, kind: 0.12, steady: true, up: 'more filaments and streaks', down: 'blobbier, fewer flow lines' },
  { area: 'form', measure: 'forms a frame', label: 'form count', read: m => m.forms, kind: 'ratio', steady: true, up: 'more separate forms', down: 'fewer separate forms' },
  { area: 'form', measure: 'elongation', label: 'form shape', read: m => m.elongation, kind: 0.15, steady: true, up: 'rounder forms', down: 'more stretched forms' },
  { area: 'form', measure: 'spectrum slope', label: 'form detail', read: m => m.spectrum, kind: 0.4, steady: true, up: 'got sharper with finer detail', down: 'got smoother, less fine detail' },
  // Composition (compareDesign step sizes)
  { area: 'composition', measure: 'mirror symmetry', label: 'mirror symmetry', read: m => m.mirror, kind: 0.2, steady: true, up: 'more symmetric', down: 'less symmetric' },
  { area: 'composition', measure: 'spread of the light', label: 'composition spread', read: m => m.spread, kind: 0.06, steady: true, up: 'spread wider across the frame', down: 'more concentrated' },
  { area: 'composition', measure: 'centroid offset', label: 'balance', read: m => m.centroidOffset, kind: 0.12, steady: true, up: 'more off-centre', down: 'more centred' },
  // Show / physics (comparePhysics step sizes)
  { area: 'show', measure: 'own flow speed (% width/s)', label: 'fluid flow speed', read: m => m.ownSpeed, kind: 'ratio', steady: true, up: 'faster fluid flow', down: 'slower fluid flow' },
  { area: 'show', measure: 'turnover (s)', label: 'turnover', read: m => m.turnover, kind: 'ratio', steady: true, up: 'more stately turnover', down: 'brisker turnover' },
  { area: 'show', measure: 'lifetime (s)', label: 'form lifetime', read: m => m.lifetime, kind: 'ratio', steady: true, up: 'longer-lived forms', down: 'shorter-lived forms' },
  { area: 'show', measure: 'whole-field share', label: 'whole-field motion', read: m => m.wholeShare, kind: 0.2, steady: true, up: 'more whole-picture motion', down: 'more of the fluid\'s own motion' },
  { area: 'show', measure: 'divergence', label: 'spreading', read: m => m.div, kind: 0.1, steady: true, up: 'more spreading outwards', down: 'drawing in more' },
];

/**
 * Compare two `watchVideo` reads in just-noticeable steps.
 * Returns `{ changed, held, lines }`, `changed` sorted descending by `steps`.
 */
export function compareReads(before, after) {
  const bWords = before?.words?.words ? before.words : describe(before);
  const aWords = after?.words?.words ? after.words : describe(after);
  const wordByMeasure = (ws, measure) => ws.words.find(w => w.measure === measure) ?? null;

  const bm = extract(before ?? {});
  const am = extract(after ?? {});
  const changed = [];
  const held = [];

  for (const s of COMPARE_SPECS) {
    const bw = wordByMeasure(bWords, s.measure);
    const aw = wordByMeasure(aWords, s.measure);
    const from = bw ? bw.value : s.read(bm);
    const to = aw ? aw.value : s.read(am);
    if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to)) continue;

    let steps = 0;
    if (s.kind === 'ratio') {
      if (from <= 0 || to <= 0) continue;
      steps = Math.abs(Math.log(to / from)) / Math.log(1.5);
    } else {
      steps = Math.abs(to - from) / s.kind;
    }

    const steady = bw ? bw.steady : (aw ? aw.steady : s.steady);
    if (steps < 1) {
      held.push({ area: s.area, measure: s.measure });
      continue;
    }

    const nums = `(${s.measure} ${fmtNum(from)} to ${fmtNum(to)})`;
    let phrase;
    if (bw && aw && bw.term !== aw.term) {
      phrase = `${s.label} went from ${bw.term} to ${aw.term} ${nums}`;
    } else if (!bw && aw) {
      phrase = `${s.label} became ${aw.term} ${nums}`;
    } else if (bw && !aw) {
      phrase = `${s.label} left ${bw.term} (${s.label} ${to > from ? s.up : s.down}) ${nums}`;
    } else {
      phrase = `${s.label} ${to > from ? s.up : s.down} ${nums}`;
    }
    if (steady === false) phrase += ` ${UNSTEADY_NOTE}`;

    changed.push({
      area: s.area,
      measure: s.measure,
      from,
      to,
      steps,
      steady,
      text: phrase,
    });
  }

  changed.sort((u, v) => v.steps - u.steps);

  const lines = [
    changed.length ? '## Changes' : '## Changes\n\nNo measure moved by one just-noticeable step.',
    ...changed.map(c => `- (${c.steps.toFixed(1)} steps, ${c.area}) ${c.text}`),
    '',
    '## Held',
    '',
    ...(held.length ? [held.map(h => `${h.area} (${h.measure})`).join(', ')] : ['none']),
  ];
  return { changed, held, lines };
}
