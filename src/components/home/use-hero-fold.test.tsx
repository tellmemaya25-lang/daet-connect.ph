/**
 * @jest-environment jsdom
 */

import React, { useRef } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { useHeroFold } from "./use-hero-fold";

type ToCall = { target: Element; vars: Record<string, unknown> };

jest.mock("@/lib/gsap", () => {
  const records = {
    queries: [] as string[],
    tweens: [] as ToCall[],
    refresh: jest.fn(),
    killed: 0,
  };

  const gsap = {
    to: (target: Element, vars: Record<string, unknown>) => {
      records.tweens.push({ target, vars });
      return {
        scrollTrigger: {
          kill: () => {
            records.killed += 1;
          },
        },
        kill: () => {
          records.killed += 1;
        },
      };
    },
    matchMedia: () => ({
      add: (query: string, handler: () => unknown) => {
        records.queries.push(query);
        return handler();
      },
      revert() {},
    }),
  };

  const useGSAP = (callback: () => (() => void) | undefined) => {
    const { useLayoutEffect } = jest.requireActual<typeof import("react")>("react");
    useLayoutEffect(() => {
      const cleanup = callback();
      return () => cleanup?.();
    }, []);
    return { contextSafe: <T,>(fn: T) => fn };
  };

  return {
    gsap,
    useGSAP,
    ScrollTrigger: { refresh: () => records.refresh() },
    __records: records,
  };
});

const { __records: records } = jest.requireMock("@/lib/gsap") as {
  __records: { queries: string[]; tweens: ToCall[]; refresh: jest.Mock; killed: number };
};

function Harness({ onCleanup }: { onCleanup?: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useHeroFold(root);
  return (
    <div ref={root} data-hero>
      <div role="group" aria-label="Places in Daet" data-fan>
        wedges
      </div>
      <div data-headline>headline</div>
      <button type="button" onClick={onCleanup}>
        noop
      </button>
    </div>
  );
}

beforeEach(() => {
  records.queries.length = 0;
  records.tweens.length = 0;
  records.killed = 0;
});

describe("useHeroFold", () => {
  it("only folds on a desktop, and only when motion is welcome", () => {
    render(<Harness />);

    expect(records.queries).toHaveLength(1);
    expect(records.queries[0]).toContain("min-width: 768px");
    expect(records.queries[0]).toContain("prefers-reduced-motion: no-preference");
  });

  it("leaves the hero itself at full width, and scrubs its insides instead", () => {
    const { container } = render(<Harness />);

    const hero = container.querySelector("[data-hero]");
    records.tweens.forEach((tween) => expect(tween.target).not.toBe(hero));
    records.tweens.forEach((tween) => expect(tween.vars).not.toHaveProperty("scale"));
  });

  it("lifts the fan's group as it leaves, starting at the very top of the page", () => {
    const { container } = render(<Harness />);

    const tween = records.tweens.find((candidate) => candidate.target === container.querySelector("[data-fan]"));
    expect(tween).toBeDefined();
    expect(tween!.vars).toMatchObject({ yPercent: -8, ease: "none" });
    expect(tween!.vars.scrollTrigger).toMatchObject({ start: "top top", end: "bottom top", scrub: true });
    expect(tween!.vars.scrollTrigger).not.toMatchObject({ pin: true });
  });

  it("fades the headline out over the first 60% of the fold", () => {
    const { container } = render(<Harness />);

    const tween = records.tweens.find(
      (candidate) => candidate.target === container.querySelector("[data-headline]"),
    );
    expect(tween).toBeDefined();
    expect(tween!.vars).toMatchObject({ opacity: 0, ease: "none" });
    expect(tween!.vars.scrollTrigger).toMatchObject({ start: "top top", end: "60% top", scrub: true });
  });

  it("refreshes the triggers once the photos and fonts have landed", async () => {
    render(<Harness />);

    await waitFor(() => expect(records.refresh).toHaveBeenCalled());

    act(() => {
      window.dispatchEvent(new Event("load"));
    });
    await waitFor(() => expect(records.refresh.mock.calls.length).toBeGreaterThan(1));
  });
});
