/**
 * The projector from the owner's assistant (PLAN 44k-15): the guard's rules
 * for `assistant-projector`, beside assistant.js because that file is past the
 * 40 KB line `npm run sizes` warns at (as assistantMedia.js and
 * assistantOutputs.js are).
 *
 * Asked as part of the owner's goal of 2026-11-09, complete control of the
 * show from Claude. The projector is two things on the page, and both stay
 * where they are kept, so nothing here holds a second copy of either:
 *
 *  - the cast window and the projector mode (app/useControllers.ts, the
 *    hint's chip and Settings → Wall's three buttons): `cast` opens the show,
 *    full size, on the second screen the page found (or a window, when it
 *    found none) and closes it; `mode` is ask, auto or off;
 *  - the wall (app/useOutput.ts, `lib/outputConfig.ts`): the projector's
 *    geometry and grade, kept on this machine and never in a look, and the
 *    test card and Identify beside it. `wall` patches the geometry and
 *    grade, `wall-reset` squares it (the mapped shapes stay, as the desk's
 *    Reset leaves them), `test` puts the test card up or takes it down, and
 *    `identify` flashes the screen's name for three seconds.
 *
 * The mapping's shapes are not here. Dragging a surface onto a panel on a
 * real wall is a job done by eye, in the room, against the picture; an
 * assistant that placed one would be guessing where the panel is.
 *
 * Two rules an assistant could not learn from the desk alone:
 *
 *  - The flash guard (`flashGuard`, lib/flashGuard.ts) may be turned on, and
 *    never off from here. It holds the whole field under three flashes a
 *    second for the room's sake, and outputConfig.ts keeps it out of the
 *    settings so that a preset cannot switch a safety off; the same reason
 *    holds for an assistant. Off stays the person's, in Settings → Wall.
 *  - A geometry that puts the picture off the screen is refused, not
 *    clamped. The page would clamp each corner into -1 to 2 (normalizeOutput
 *    allows a corner past the edge, since a projector aimed past a screen is
 *    corrected by pulling the picture in from beyond it), but four corners
 *    each in range can still fold the picture over itself, shrink it to a
 *    dot, or leave most of it beyond the screen's edge, where it is dark: a
 *    wall that went black in front of the room on one call. So the corners
 *    must run clockwise from the top left without crossing (a convex quad,
 *    which the corner pin's homography maps without folding), at least half
 *    of the picture must land on the screen, and it must cover at least a
 *    fiftieth of it. Out-of-range masks, feather, gain and gamma are refused
 *    with their ranges for the same reason: a number the page would quietly
 *    clamp is a call that did not do what it said.
 *
 * Everything here is Full: the projector and the wall are the room, not the
 * look (lookFade.ts keeps them out of every look), as the room's settings are.
 */

export const PROJECTOR_DOES = ['cast', 'mode', 'test', 'identify', 'wall', 'wall-reset'];
export const PROJECTOR_MODES = ['ask', 'auto', 'off'];

/** The wall's numbers and their ranges, as normalizeOutput clamps them (lib/outputConfig.ts). */
export const WALL_RANGES = {
  maskTop: [0, 0.45], maskRight: [0, 0.45], maskBottom: [0, 0.45], maskLeft: [0, 0.45],
  maskFeather: [0, 0.25], gain: [0.2, 3], gamma: [0.5, 2.5],
};
/** A corner's range, as normalizeOutput's (past the edge is allowed). */
export const CORNER_RANGE = [-1, 2];
/** Of the picture, at least this much on the screen; of the screen, at least this much covered. */
export const ON_SCREEN_MIN = 0.5;
export const COVER_MIN = 0.02;

const area = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
};

/** The polygon cut to the screen (0..1 each way), Sutherland and Hodgman's way, one edge at a time. */
function clipToScreen(pts) {
  const edges = [[(p) => p[0], 0, 1], [(p) => p[0], 1, -1], [(p) => p[1], 0, 1], [(p) => p[1], 1, -1]];
  let out = pts;
  for (const [axis, at, sign] of edges) {
    const inside = (p) => sign * (axis(p) - at) >= 0;
    const cross = (a, b) => { const t = (at - axis(a)) / (axis(b) - axis(a)); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; };
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      if (inside(b)) { if (!inside(a)) next.push(cross(a, b)); next.push(b); } else if (inside(a)) next.push(cross(a, b));
    }
    out = next;
    if (!out.length) break;
  }
  return out;
}

/**
 * Where four corners (x, y clockwise from the top left, screen 0..1) put the
 * picture: why not, or null. Screen y runs down, so clockwise on the screen
 * is a positive shoelace area here.
 */
export function cornersWhy(corners) {
  if (!Array.isArray(corners) || corners.length !== 8 || !corners.every((n) => typeof n === 'number' && Number.isFinite(n))) return 'corners: eight numbers, x and y of each corner clockwise from the top left (the square is [0,0, 1,0, 1,1, 0,1])';
  if (corners.some((n) => n < CORNER_RANGE[0] || n > CORNER_RANGE[1])) return `corners: each from ${CORNER_RANGE[0]} to ${CORNER_RANGE[1]} (0 to 1 is the screen)`;
  const pts = [0, 1, 2, 3].map((i) => [corners[2 * i], corners[2 * i + 1]]);
  const turns = pts.map((p, i) => {
    const q = pts[(i + 1) % 4], r = pts[(i + 2) % 4];
    return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
  });
  if (!turns.every((z) => z > 1e-6)) return 'corners: they cross or fold the picture over; give them clockwise from the top left, top left, top right, bottom right, bottom left';
  const whole = area(pts);
  const seen = Math.abs(area(clipToScreen(pts)));
  if (seen < ON_SCREEN_MIN * whole) return `that geometry puts the picture off the screen (${Math.round((100 * seen) / whole)}% of it on the screen; at least ${ON_SCREEN_MIN * 100}%)`;
  if (seen < COVER_MIN) return `that geometry shrinks the picture to ${(100 * seen).toFixed(1)}% of the screen (at least ${COVER_MIN * 100}%)`;
  return null;
}

/** The guard's call on one `assistant-projector`: `{ out }` for the display, or `{ reason }`. */
export function projectorGuard(message) {
  const d = message?.do;
  if (!PROJECTOR_DOES.includes(d)) return { reason: `projector: ${PROJECTOR_DOES.join(', ')}, not ${String(d)}` };
  if (d === 'cast' || d === 'test') return typeof message.on === 'boolean' ? { out: { do: d, on: message.on } } : { reason: `${d}: on, as true or false` };
  if (d === 'mode') return PROJECTOR_MODES.includes(message.mode) ? { out: { do: d, mode: message.mode } } : { reason: `mode: ${PROJECTOR_MODES.join(', ')}, not ${String(message.mode)}` };
  if (d === 'identify' || d === 'wall-reset') return { out: { do: d } };
  const w = message.wall;
  if (!w || typeof w !== 'object') return { reason: 'wall: one or more of flipX, flipY, corners, the masks, maskFeather, gain, gamma, flashGuard' };
  const wall = {};
  for (const k of ['flipX', 'flipY']) {
    if (w[k] === undefined) continue;
    if (typeof w[k] !== 'boolean') return { reason: `${k}: true or false` };
    wall[k] = w[k];
  }
  for (const [k, [lo, hi]] of Object.entries(WALL_RANGES)) {
    if (w[k] === undefined) continue;
    if (typeof w[k] !== 'number' || !Number.isFinite(w[k]) || w[k] < lo || w[k] > hi) return { reason: `${k}: from ${lo} to ${hi}, not ${String(w[k])}` };
    wall[k] = w[k];
  }
  if (w.flashGuard !== undefined) {
    if (w.flashGuard !== true) return { reason: 'the flash guard is a safety for the room: it can be turned on from here, and only the person turns it off (Settings, Wall)' };
    wall.flashGuard = true;
  }
  if (w.corners !== undefined) {
    const why = cornersWhy(w.corners);
    if (why) return { reason: why };
    wall.corners = [...w.corners];
  }
  if (!Object.keys(wall).length) return { reason: 'wall: one or more of flipX, flipY, corners, the masks, maskFeather, gain, gamma, flashGuard' };
  return { out: { do: d, wall } };
}
