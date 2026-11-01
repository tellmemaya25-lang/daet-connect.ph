/**
 * The place fan's geometry: pure maths, no React, no DOM.
 *
 * Every shape is a `clip-path: polygon(...)` with exactly nine points — the
 * apex that all the wedges radiate from, plus eight samples along the outer
 * arc. Nine points everywhere is what lets GSAP interpolate one shape into
 * another: it matches the numbers inside the string token by token.
 *
 * Coordinates are computed in pixels for the hero's real box, then written as
 * percentages of that box, so a string stays correct while the box resizes
 * between frames (or between the server's guess and the first measurement).
 */

export type Point = [number, number];

/** The two arrangements: one fan of six, or two fans of three on a phone. */
export type FanLayout = "desktop" | "phone";

/** How much one wedge widens on hover, as a fraction of the whole span. */
export const HOVER_BUMP = 0.05;

/** Dark seam between wedges, in degrees. */
const GAP_DEGREES = 1.2;

/** Points sampled along each wedge's outer arc; apex + this = 9. */
const ARC_POINTS = 8;

/** What the server renders before it can measure the hero. */
export const DEFAULT_HERO_SIZE = { width: 1440, height: 900 } as const;

const toRad = (degrees: number) => (degrees * Math.PI) / 180;

const pointAt = (vp: Point, degrees: number, radius: number): Point => [
  vp[0] + radius * Math.cos(toRad(degrees)),
  vp[1] + radius * Math.sin(toRad(degrees)),
];

/**
 * Angular width of each wedge. The focused one gains `bump` of the whole span
 * and the others give up that much between them, so the fan never moves.
 */
export function fanWidths(n: number, span: number, focus: number | null, bump = HOVER_BUMP): number[] {
  const base = span / n;
  if (focus === null || focus < 0 || focus >= n) return Array(n).fill(base);

  const extra = span * bump;
  return Array.from({ length: n }, (_, i) => (i === focus ? base + extra : base - extra / (n - 1)));
}

/** Apex plus N points along the arc from `a0` to `a1`, inset by half a gap each side. */
export function wedgePolygon(vp: Point, a0: number, a1: number, radius: number, gap = GAP_DEGREES, n = ARC_POINTS): Point[] {
  const start = a0 + gap / 2;
  const end = a1 - gap / 2;

  return [
    vp,
    ...Array.from({ length: n }, (_, k) => pointAt(vp, start + ((end - start) * k) / (n - 1), radius)),
  ];
}

/**
 * The whole box as the same nine points, ordered to match a wedge: apex at the
 * bottom centre, then clockwise from the bottom-left round to the bottom-right.
 * Opening therefore reads as the slice spreading out from its point.
 */
export function rectPolygon(width: number, height: number): Point[] {
  return [
    [width / 2, height],
    [0, height],
    [0, height / 2],
    [0, 0],
    [width / 3, 0],
    [(2 * width) / 3, 0],
    [width, 0],
    [width, height / 2],
    [width, height],
  ];
}

/** Percentages, three decimals — short enough for GSAP, precise enough to avoid seams. */
export function toClipPath(points: Point[], width: number, height: number): string {
  const tokens = points.map(
    ([x, y]) => `${((x / width) * 100).toFixed(3)}% ${((y / height) * 100).toFixed(3)}%`,
  );
  return `polygon(${tokens.join(", ")})`;
}

export interface Wedge {
  /** The point this wedge radiates from — two fans on a phone have two. */
  vp: Point;
  /** Rest angles, in screen degrees (0 = right, 90 = down). */
  a0: number;
  a1: number;
  /** Middle of the wedge at rest: where its chip and photo offset go. */
  mid: number;
  /** The clip-path at rest. */
  rest: string;
  /** `focusVariants[j]` is this wedge's clip-path while wedge `j` is hovered. */
  focusVariants: string[];
}

export interface FanGeometry {
  width: number;
  height: number;
  layout: FanLayout;
  wedges: Wedge[];
  /** The clip-path that fills the hero when a place is open. */
  open: string;
}

interface Fan {
  vp: Point;
  a0: number;
  a1: number;
  /** Index of this fan's first wedge in the global order. */
  from: number;
  count: number;
}

/**
 * One fan of six (desktop, and landscape phones) or two fans of three (phones),
 * placed as the mock-up has them: the top pair of fans spread upward and the
 * bottom ones downward, leaving the middle band for the headline.
 */
function fansFor(layout: FanLayout, width: number, height: number): Fan[] {
  if (layout === "phone") {
    return [
      { vp: [0.5 * width, 0.479 * height], a0: 188, a1: 352, from: 0, count: 3 },
      { vp: [0.5 * width, 0.659 * height], a0: 8, a1: 172, from: 3, count: 3 },
    ];
  }

  return [{ vp: [0.5 * width, 0.578 * height], a0: 178, a1: 362, from: 0, count: 6 }];
}

export function fanGeometry(width: number, height: number, layout: FanLayout = "desktop"): FanGeometry {
  const fans = fansFor(layout, width, height);
  const radius = 2.5 * Math.max(width, height);
  const total = fans.reduce((sum, fan) => sum + fan.count, 0);

  const restAngles = fans.flatMap((fan) => {
    const widths = fanWidths(fan.count, fan.a1 - fan.a0, null);
    return widths.map((wedgeWidth, i) => {
      const start = fan.a0 + widths.slice(0, i).reduce((sum, w) => sum + w, 0);
      return { fan, a0: start, a1: start + wedgeWidth };
    });
  });

  const wedgeAt = (fan: Fan, a0: number, a1: number): Point[] =>
    wedgePolygon(fan.vp, a0, a1, radius, GAP_DEGREES, ARC_POINTS);

  const wedges: Wedge[] = restAngles.map(({ fan, a0, a1 }) => ({
    vp: fan.vp,
    a0,
    a1,
    mid: (a0 + a1) / 2,
    rest: toClipPath(wedgeAt(fan, a0, a1), width, height),
    focusVariants: [],
  }));

  // While wedge j is hovered its own fan re-spaces; the other fan doesn't move.
  for (let j = 0; j < total; j += 1) {
    const fanOfJ = restAngles[j].fan;
    const widths = fanWidths(fanOfJ.count, fanOfJ.a1 - fanOfJ.a0, j - fanOfJ.from);

    restAngles.forEach(({ fan }, i) => {
      if (fan !== fanOfJ) {
        wedges[i].focusVariants.push(wedges[i].rest);
        return;
      }

      const k = i - fan.from;
      const start = fan.a0 + widths.slice(0, k).reduce((sum, w) => sum + w, 0);
      wedges[i].focusVariants.push(toClipPath(wedgeAt(fan, start, start + widths[k]), width, height));
    });
  }

  return {
    width,
    height,
    layout,
    wedges,
    open: toClipPath(rectPolygon(width, height), width, height),
  };
}

/** The unit vector pointing along a wedge's mid angle, for chip and slide offsets. */
export function midVector(midDegrees: number): Point {
  return [Math.cos(toRad(midDegrees)), Math.sin(toRad(midDegrees))];
}
