import {
  DEFAULT_HERO_SIZE,
  HOVER_BUMP,
  fanGeometry,
  fanWidths,
  midVector,
  rectPolygon,
  toClipPath,
  wedgePolygon,
  type Point,
} from "./fan-geometry";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const SPAN = 184; // 178° → 362°, the desktop fan

/** The numeric pairs inside a clip-path string. */
const tokens = (clip: string) => clip.match(/-?\d+(\.\d+)?%/g) ?? [];

describe("fanWidths", () => {
  it("splits the span evenly when nothing is focused", () => {
    const widths = fanWidths(6, SPAN, null);

    expect(widths).toHaveLength(6);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(SPAN, 10);
    expect(new Set(widths).size).toBe(1);
  });

  it("still sums to the span while one wedge is focused", () => {
    const widths = fanWidths(6, SPAN, 3);

    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(SPAN, 10);
  });

  it("widens the focused wedge by exactly the hover bump", () => {
    const base = SPAN / 6;
    const widths = fanWidths(6, SPAN, 2);

    expect(widths[2] - base).toBeCloseTo(SPAN * HOVER_BUMP, 10);
    expect(widths[2] - base).toBeCloseTo(SPAN * 0.05, 10);
  });

  it("takes the extra width out of the other wedges equally", () => {
    const widths = fanWidths(6, SPAN, 0);
    const others = widths.slice(1);

    expect(new Set(others.map((w) => w.toFixed(6))).size).toBe(1);
    expect(others[0]).toBeLessThan(widths[0]);
  });

  it("falls back to an even fan when the focus index is out of range", () => {
    expect(fanWidths(6, SPAN, 9)).toEqual(fanWidths(6, SPAN, null));
    expect(fanWidths(6, SPAN, -1)).toEqual(fanWidths(6, SPAN, null));
  });
});

describe("polygons", () => {
  it("gives every wedge nine points: the apex and eight along the arc", () => {
    const wedge = wedgePolygon([720, 520], 178, 208, 3600);

    expect(wedge).toHaveLength(9);
    expect(wedge[0]).toEqual([720, 520]);
  });

  it("gives the open rectangle the same nine points, so GSAP can morph", () => {
    const rect = rectPolygon(DESKTOP.width, DESKTOP.height);

    expect(rect).toHaveLength(9);
    expect(rect[0]).toEqual([DESKTOP.width / 2, DESKTOP.height]);
  });

  it("insets the arc by half a gap at each end", () => {
    const [, first, ...rest] = wedgePolygon([0, 0], 0, 90, 100, 2);
    const last = rest[rest.length - 1];

    // 0° is due right; half a degree of gap tips it slightly down.
    expect(first[0]).toBeGreaterThan(99);
    expect(first[1]).toBeGreaterThan(0);
    // 90° is due down; half a degree of gap stops it a hair short of vertical.
    expect(last[1]).toBeGreaterThan(99);
    expect(last[0]).toBeGreaterThan(0);
    expect(last[0]).toBeLessThan(2);
  });

  it("writes clip-paths as percentages", () => {
    const clip = toClipPath(wedgePolygon([720, 520], 178, 208, 3600), 1440, 900);

    expect(clip.startsWith("polygon(")).toBe(true);
    expect(tokens(clip)).toHaveLength(18); // nine points, x and y
    expect(clip).toContain("%");
    expect(clip).not.toMatch(/\d+px/);
  });
});

describe("fanGeometry", () => {
  it("builds the desktop fan from six wedges in left-to-right order", () => {
    const geo = fanGeometry(DESKTOP.width, DESKTOP.height, "desktop");

    expect(geo.wedges).toHaveLength(6);
    expect(geo.wedges[0].a0).toBeCloseTo(178, 6);
    expect(geo.wedges[5].a1).toBeCloseTo(362, 6);

    const mids = geo.wedges.map((wedge) => wedge.mid);
    expect([...mids].sort((a, b) => a - b)).toEqual(mids);
  });

  it("keeps every polygon string at nine points, rest and focused alike", () => {
    const geo = fanGeometry(DESKTOP.width, DESKTOP.height, "desktop");

    expect(tokens(geo.open)).toHaveLength(18);

    geo.wedges.forEach((wedge) => {
      expect(tokens(wedge.rest)).toHaveLength(18);
      expect(wedge.focusVariants).toHaveLength(6);
      wedge.focusVariants.forEach((clip) => expect(tokens(clip)).toHaveLength(18));
    });
  });

  it("moves only the hovered wedge's own fan", () => {
    const geo = fanGeometry(PHONE.width, PHONE.height, "phone");
    const topWedgeIndex = 0;
    const bottomWedgeIndex = 4;

    // Focusing a top-fan wedge leaves the bottom fan exactly where it was.
    expect(geo.wedges[bottomWedgeIndex].focusVariants[topWedgeIndex]).toBe(
      geo.wedges[bottomWedgeIndex].rest,
    );
    // …and does change the wedge it belongs to.
    expect(geo.wedges[topWedgeIndex].focusVariants[topWedgeIndex]).not.toBe(
      geo.wedges[topWedgeIndex].rest,
    );
  });

  it("renders a usable fan for the server's default size", () => {
    const geo = fanGeometry(DEFAULT_HERO_SIZE.width, DEFAULT_HERO_SIZE.height, "desktop");

    expect(geo.wedges).toHaveLength(6);
    geo.wedges.forEach((wedge) => expect(wedge.rest.startsWith("polygon(")).toBe(true));
  });
});

describe("phone layout", () => {
  const geo = fanGeometry(PHONE.width, PHONE.height, "phone");

  it("splits six places into two fans of three", () => {
    expect(geo.wedges).toHaveLength(6);

    const apexes = new Set(geo.wedges.map((wedge) => wedge.vp[1].toFixed(3)));
    expect(apexes.size).toBe(2);
  });

  it("leaves the middle band clear for the headline", () => {
    const middleTop = 0.479 * PHONE.height;
    const middleBottom = 0.659 * PHONE.height;

    /** Every polygon point, in pixels. */
    const pointsOf = (clip: string): Point[] => {
      const values = clip.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      const points: Point[] = [];
      for (let i = 0; i < values.length; i += 2) {
        points.push([(values[i] / 100) * PHONE.width, (values[i + 1] / 100) * PHONE.height]);
      }
      return points;
    };

    geo.wedges.slice(0, 3).forEach((wedge) => {
      // The top fan spreads upward: it never reaches below its own apex.
      const lowest = Math.max(...pointsOf(wedge.rest).map(([, y]) => y));
      expect(lowest).toBeLessThanOrEqual(middleTop + 0.001);
    });

    geo.wedges.slice(3).forEach((wedge) => {
      // The bottom fan spreads downward from the lower apex.
      const highest = Math.min(...pointsOf(wedge.rest).map(([, y]) => y));
      expect(highest).toBeGreaterThanOrEqual(middleBottom - 0.001);
    });
  });
});

describe("midVector", () => {
  it("points right at 0°, down at 90°, left at 180°", () => {
    expect(midVector(0)[0]).toBeCloseTo(1, 10);
    expect(midVector(90)[1]).toBeCloseTo(1, 10);
    expect(midVector(180)[0]).toBeCloseTo(-1, 10);
  });
});
