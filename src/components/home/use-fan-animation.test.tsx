/**
 * @jest-environment jsdom
 */

import React, { useRef } from "react";
import { act, render } from "@testing-library/react";
import { fanGeometry } from "./fan-geometry";
import { useFanAnimation } from "./use-fan-animation";

type Call = { kind: "set" | "to"; targets: unknown; vars: Record<string, unknown>; position?: unknown };
type Timeline = {
  steps: Call[];
  callbacks: Record<string, () => void>;
  options?: { defaults?: Record<string, unknown> };
  killed: boolean;
  reversed: boolean;
  set(targets: unknown, vars: Record<string, unknown>): Timeline;
  to(targets: unknown, vars: Record<string, unknown>, position?: unknown): Timeline;
  eventCallback(name: string, callback: () => void): Timeline;
  kill(): Timeline;
  reverse(): Timeline;
};

jest.mock("@/lib/gsap", () => {
  const records = {
    to: [] as Call[],
    set: [] as Call[],
    timelines: [] as Timeline[],
    quickTo: [] as Array<{ target: Element; prop: string; vars: Record<string, unknown>; move: jest.Mock }>,
    conditions: { desktop: true, phone: false, reduce: false },
  };

  const makeTimeline = (options?: Timeline["options"]) => {
    const timeline: Timeline = {
      steps: [],
      callbacks: {},
      options,
      killed: false,
      reversed: false,
      set(targets, vars) {
        this.steps.push({ kind: "set", targets, vars });
        return this;
      },
      to(targets, vars, position) {
        this.steps.push({ kind: "to", targets, vars, position });
        return this;
      },
      eventCallback(name: string, callback: () => void) {
        this.callbacks[name] = callback;
        return this;
      },
      kill() {
        this.killed = true;
        return this;
      },
      // A real timeline finishes reversing over 450ms; answering the callback
      // straight away keeps the assertion about the ordering, not the clock.
      reverse() {
        this.reversed = true;
        this.callbacks.onReverseComplete?.();
        return this;
      },
    };
    records.timelines.push(timeline);
    return timeline;
  };

  const gsap = {
    timeline: (options?: Timeline["options"]) => makeTimeline(options),
    to: (targets: unknown, vars: Record<string, unknown>) => {
      records.to.push({ kind: "to", targets, vars });
      return { kill() {} };
    },
    set: (targets: unknown, vars: Record<string, unknown>) => {
      records.set.push({ kind: "set", targets, vars });
      return {};
    },
    quickTo: (target: Element, prop: string, vars: Record<string, unknown>) => {
      const move = jest.fn();
      records.quickTo.push({ target, prop, vars, move });
      return move;
    },
    utils: {
      toArray: (selector: string, scope: Element) => Array.from(scope.querySelectorAll(selector)),
    },
    matchMedia: () => ({
      add: (_queries: unknown, handler: (context: { conditions: Record<string, boolean> }) => void) => {
        handler({ conditions: records.conditions });
      },
      revert() {},
    }),
  };

  // The real hook runs its callback in a layout effect, once the ref is
  // pointing at the DOM; the mock has to as well.
  const useGSAP = (callback: () => void) => {
    const { useLayoutEffect } = jest.requireActual<typeof import("react")>("react");
    useLayoutEffect(() => {
      callback();
    }, []);
    return { contextSafe: <T,>(fn: T) => fn };
  };

  return { gsap, useGSAP, ScrollTrigger: {}, __records: records };
});

const { __records: records } = jest.requireMock("@/lib/gsap") as {
  __records: {
    to: Call[];
    set: Call[];
    timelines: Timeline[];
    quickTo: Array<{ target: Element; prop: string; vars: Record<string, unknown>; move: jest.Mock }>;
    conditions: { desktop: boolean; phone: boolean; reduce: boolean };
  };
};

const geometry = fanGeometry(1440, 900, "desktop");

type Api = ReturnType<typeof useFanAnimation>;

function Harness({ onOpened, onClosed, api }: { onOpened?: () => void; onClosed?: () => void; api: { current: Api | null } }) {
  const root = useRef<HTMLDivElement>(null);
  const fan = useFanAnimation({ root, geometry, onOpened, onClosed });
  api.current = fan;

  return (
    <div ref={root}>
      {geometry.wedges.map((_, index) => (
        <button type="button" key={index} data-wedge={index}>
          <span data-photo={index} />
          <span data-chip={index} />
        </button>
      ))}
    </div>
  );
}

function mount(options: { onOpened?: () => void; onClosed?: () => void } = {}) {
  const api: { current: Api | null } = { current: null };
  const view = render(<Harness api={api} onOpened={options.onOpened} onClosed={options.onClosed} />);
  const wedges = Array.from(view.container.querySelectorAll<HTMLElement>("[data-wedge]"));
  const photos = Array.from(view.container.querySelectorAll<HTMLElement>("[data-photo]"));
  return { view, api, wedges, photos };
}

const tweensOn = (call: Call[], target: Element) =>
  call.filter((entry) => entry.targets === target || (Array.isArray(entry.targets) && entry.targets.includes(target)));

beforeEach(() => {
  records.to.length = 0;
  records.set.length = 0;
  records.timelines.length = 0;
  records.quickTo.length = 0;
  records.conditions.desktop = true;
  records.conditions.phone = false;
  records.conditions.reduce = false;
});

describe("useFanAnimation", () => {
  it("lays the rest shapes down as soon as the fan mounts", () => {
    const { wedges } = mount();

    wedges.forEach((_, index) => {
      const rest = records.set.find(
        (call) => call.targets === wedges[index] && call.vars.clipPath === geometry.wedges[index].rest,
      );
      expect(rest).toBeDefined();
    });
  });

  it("widens the hovered wedge and dims the rest, over 350ms of power3.out", () => {
    const { api, wedges } = mount();

    act(() => api.current?.hover(1));

    records.to.forEach((call) => {
      expect(call.vars.duration).toBeGreaterThanOrEqual(0.2);
      expect(call.vars.ease).toBe("power3.out");
    });

    const hovered = tweensOn(records.to, wedges[1]);
    expect(hovered[0].vars.clipPath).toBe(geometry.wedges[1].focusVariants[1]);
    expect(hovered.some((call) => call.vars.clipPath === geometry.wedges[1].rest)).toBe(false);

    const other = tweensOn(records.to, wedges[3]);
    expect(other[0].vars.clipPath).toBe(geometry.wedges[3].focusVariants[1]);
    expect(other.some((call) => call.vars.filter === "brightness(0.78)")).toBe(true);
    expect(hovered.some((call) => call.vars.filter === "brightness(1)")).toBe(true);
  });

  it("gives the wedges their rest shape back when the pointer leaves", () => {
    const { api, wedges } = mount();

    act(() => api.current?.hover(1));
    records.to.length = 0;
    act(() => api.current?.hover(null));

    expect(tweensOn(records.to, wedges[1])[0].vars.clipPath).toBe(geometry.wedges[1].rest);
    expect(tweensOn(records.to, wedges[1])[0].vars.filter).toBe("brightness(1)");
  });

  it("morphs an opening wedge to the full hero over 450ms, and the others outward", () => {
    const onOpened = jest.fn();
    const { api, wedges, photos } = mount({ onOpened });

    act(() => api.current?.openAt(2));

    const [timeline] = records.timelines;
    expect(timeline.options?.defaults).toMatchObject({ ease: "power3.inOut" });

    const grow = timeline.steps.find((step) => step.targets === wedges[2] && step.vars.clipPath === geometry.open);
    expect(grow?.vars.duration).toBe(0.45);

    const shrink = timeline.steps.find((step) => step.targets === photos[2]);
    expect(shrink?.vars).toMatchObject({ x: 0, y: 0, scale: 1 });

    const fadeOut = timeline.steps.filter(
      (step) => step.vars.autoAlpha === 0 && step.targets !== photos[2] && step.targets !== wedges[2],
    );
    expect(fadeOut).toHaveLength(geometry.wedges.length - 1);
    fadeOut.forEach((step) => {
      expect(step.vars.duration).toBe(0.45);
      expect(Math.abs(Number(step.vars.x)) + Math.abs(Number(step.vars.y))).toBeGreaterThan(0);
    });

    timeline.callbacks.onComplete();
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("reverses the open timeline to fold the fan back", () => {
    const onClosed = jest.fn();
    const { api, wedges } = mount({ onClosed });

    act(() => api.current?.openAt(4));
    act(() => api.current?.close());

    const [timeline] = records.timelines;
    expect(timeline.reversed).toBe(true);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(
      records.set.some((call) => call.targets === wedges[4] && call.vars.clipPath === geometry.wedges[4].rest),
    ).toBe(true);
  });

  it("closes without a timeline when nothing was open", () => {
    const onClosed = jest.fn();
    const { api } = mount({ onClosed });

    act(() => api.current?.close());

    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("cross-fades to a neighbouring place when stepping", () => {
    const { api, wedges } = mount();

    act(() => api.current?.openAt(0));
    records.to.length = 0;
    act(() => api.current?.swapTo(3));

    const arrive = records.set.find((call) => call.targets === wedges[3] && call.vars.clipPath === geometry.open);
    expect(arrive).toBeDefined();
    expect(tweensOn(records.to, wedges[3])[0].vars.autoAlpha).toBe(1);
    expect(tweensOn(records.to, wedges[0])[0].vars.autoAlpha).toBe(0);
    records.to.forEach((call) => expect(call.vars.duration).toBe(0.3));
  });

  it("opens a place a link names instantly, with no morph", () => {
    const onOpened = jest.fn();
    const { api, wedges } = mount({ onOpened });

    act(() => api.current?.openAt(5, { instant: true }));

    expect(records.timelines).toHaveLength(0);
    expect(records.set.some((call) => call.targets === wedges[5] && call.vars.clipPath === geometry.open)).toBe(true);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("drops the morph for reduced motion but still opens the place", () => {
    records.conditions.reduce = true;
    const onOpened = jest.fn();
    const { api, wedges } = mount({ onOpened });

    act(() => api.current?.openAt(1));

    expect(records.timelines).toHaveLength(0);
    expect(records.set.some((call) => call.targets === wedges[1] && call.vars.clipPath === geometry.open)).toBe(true);
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it("nudges the photo through one reused tween per wedge", () => {
    const { api, photos } = mount();

    act(() => {
      api.current?.parallax(2, 12);
      api.current?.parallax(2, -8);
    });

    expect(records.quickTo).toHaveLength(1);
    expect(records.quickTo[0].target).toBe(photos[2]);
    expect(records.quickTo[0].prop).toBe("x");
    expect(records.quickTo[0].move.mock.calls).toEqual([[12], [-8]]);
  });

  it("leaves the photo alone under reduced motion", () => {
    records.conditions.reduce = true;
    const { api } = mount();

    act(() => api.current?.parallax(0, 10));

    expect(records.quickTo).toHaveLength(0);
  });
});
