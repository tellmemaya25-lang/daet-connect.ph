/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QuestionsCard } from "@/components/assistant/questions-card";
import { pageFromPath, sampleDates, type TripContext } from "@/lib/tours/assistant/context";

const TODAY = "2026-11-05";
const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("sample plans (decision 35)", () => {
  it("stands in a weekend at least a week away, for the asked number of days", () => {
    expect(sampleDates("2026-11-05", 2)).toEqual({ start: "2026-11-14", end: "2026-11-15" });
    expect(sampleDates("2026-11-05", 20).end).toBe("2026-11-27");
  });

  it("No dates yet sends a sample trip without asking for dates", () => {
    const onSubmit = jest.fn();
    render(<QuestionsCard prefill={null} today={TODAY} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText(/No dates yet/));
    expect(screen.queryByLabelText("First day")).toBeNull();
    fill("How many days?", "3");
    fireEvent.click(screen.getByRole("button", { name: "Manila" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft my plan" }));
    expect(onSubmit).toHaveBeenCalledWith({ dates: { start: "2026-11-14", end: "2026-11-16" }, travelers: { adults: 2, children: [] }, origin: { city: "Manila" }, sample: true });
  });
});

describe("real dates survive a sample plan", () => {
  const REAL = { start: "2026-11-10", end: "2026-11-12" };

  it("a sample submit still carries the dates the traveller typed", () => {
    const onSubmit = jest.fn();
    render(<QuestionsCard prefill={null} today={TODAY} onSubmit={onSubmit} />);
    fill("First day", REAL.start);
    fill("Last day", REAL.end);
    fireEvent.click(screen.getByLabelText(/No dates yet/));
    fireEvent.click(screen.getByRole("button", { name: "Manila" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft my plan" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ sample: true, realDates: REAL }));
  });

  it("unticking 'No dates yet' on a stored sample trip brings the real dates back", () => {
    const stored = { dates: { start: "2026-11-14", end: "2026-11-15" }, sample: true, realDates: REAL, travelers: { adults: 2, children: [] }, origin: { city: "Manila" } } as unknown as TripContext;
    render(<QuestionsCard prefill={stored} today={TODAY} onSubmit={jest.fn()} />);
    fireEvent.click(screen.getByLabelText(/No dates yet/));
    expect(screen.getByLabelText("First day")).toHaveValue(REAL.start);
    expect(screen.getByLabelText("Last day")).toHaveValue(REAL.end);
  });
});

describe("origin is never a silent default", () => {
  const trip = { dates: { start: "2026-11-10", end: "2026-11-11" }, travelers: { adults: 2, children: [] }, origin: { city: "Legazpi" } } as TripContext;
  const remembered = "Remembered from your last trip";

  it("a city remembered from a past trip is marked as remembered and can be changed", () => {
    render(<QuestionsCard prefill={trip} today={TODAY} onSubmit={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Legazpi" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(remembered)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cebu" }));
    expect(screen.queryByText(remembered)).toBeNull();
  });

  it("tapping the remembered city itself counts as choosing it, so the label goes", () => {
    render(<QuestionsCard prefill={trip} today={TODAY} onSubmit={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Legazpi" }));
    expect(screen.queryByText(remembered)).toBeNull();
    expect(screen.getByRole("button", { name: "Legazpi" })).toHaveAttribute("aria-pressed", "true");
  });

  it("with nothing remembered, no city is pressed and nothing says 'remembered'", () => {
    render(<QuestionsCard prefill={null} today={TODAY} onSubmit={jest.fn()} />);
    expect(screen.queryByText(remembered)).toBeNull();
    for (const name of ["Manila", "Quezon City", "Naga", "Legazpi", "Cebu"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("a typed city that was remembered is marked too", () => {
    render(<QuestionsCard prefill={{ ...trip, origin: { city: "Davao" } }} today={TODAY} onSubmit={jest.fn()} />);
    expect(screen.getByLabelText("Somewhere else")).toHaveValue("Davao");
    expect(screen.getByText(remembered)).toBeInTheDocument();
  });
});

describe("invalid choices are blocked up front", () => {
  it("the submit button waits for an origin and says why", () => {
    render(<QuestionsCard prefill={null} today={TODAY} onSubmit={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Draft my plan" })).toBeDisabled();
    expect(screen.getByText("Choose where you're travelling from to continue.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Manila" }));
    expect(screen.getByRole("button", { name: "Draft my plan" })).toBeEnabled();
    expect(screen.queryByText("Choose where you're travelling from to continue.")).toBeNull();
  });

  it("the calendar stops at 14 days from the first day", () => {
    render(<QuestionsCard prefill={null} today={TODAY} onSubmit={jest.fn()} />);
    fill("First day", "2026-11-10");
    expect(screen.getByLabelText("Last day")).toHaveAttribute("min", "2026-11-10");
    expect(screen.getByLabelText("Last day")).toHaveAttribute("max", "2026-11-23");
  });
});

describe("moving the first day keeps the range valid", () => {
  it("pulls a too-late last day back to 14 days, and a too-early one up to the first day", () => {
    render(<QuestionsCard prefill={null} today={TODAY} onSubmit={jest.fn()} />);
    fill("First day", "2026-11-06");
    fill("Last day", "2026-11-19");
    fill("First day", "2026-11-08");
    expect(screen.getByLabelText("Last day")).toHaveValue("2026-11-19");
    fill("First day", "2026-11-06");
    fill("Last day", "2026-11-19");
    fill("Last day", "2026-12-30");
    expect(screen.getByLabelText("Last day")).toHaveValue("2026-11-19");
    fill("First day", "2026-11-25");
    expect(screen.getByLabelText("Last day")).toHaveValue("2026-11-25");
    fill("Last day", "2026-12-30");
    expect(screen.getByLabelText("Last day")).toHaveValue("2026-12-08");
    fill("First day", "2026-11-20");
    expect(screen.getByLabelText("Last day")).toHaveValue("2026-12-03");
  });
});

describe("QuestionsCard", () => {
  it("asks for dates, travellers and origin, and sends them together", () => {
    const onSubmit = jest.fn();
    render(<QuestionsCard prefill={null} today={TODAY} onSubmit={onSubmit} />);
    fill("First day", "2026-11-10");
    fill("Last day", "2026-11-12");
    fireEvent.click(screen.getByRole("button", { name: "More children" }));
    fill("Child 1 age", "6");
    fireEvent.click(screen.getByRole("button", { name: "Manila" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft my plan" }));
    expect(onSubmit).toHaveBeenCalledWith({ dates: { start: "2026-11-10", end: "2026-11-12" }, travelers: { adults: 2, children: [6] }, origin: { city: "Manila" } });
  });

  it("will not draft without each child's age, a valid range, or an origin", () => {
    const onSubmit = jest.fn();
    render(<QuestionsCard prefill={null} today={TODAY} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Manila" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft my plan" }));
    expect(screen.getByText("Pick your first and last day.")).toBeInTheDocument();
    fill("First day", "2026-11-10");
    fill("Last day", "2026-11-24");
    fireEvent.click(screen.getByRole("button", { name: "More children" }));
    fireEvent.click(screen.getByRole("button", { name: "Manila" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft my plan" }));
    expect(screen.getByText(/Add each child's age/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("uses typed text over a chip, and starts from what is already known", () => {
    const onSubmit = jest.fn();
    render(<QuestionsCard prefill={{ dates: { start: "2026-11-10", end: "2026-11-11" }, travelers: { adults: 3, children: [] } }} today={TODAY} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Cebu" }));
    fill("Somewhere else", "Davao");
    expect(screen.getByRole("button", { name: "Cebu" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Draft my plan" }));
    expect(onSubmit).toHaveBeenCalledWith({ dates: { start: "2026-11-10", end: "2026-11-11" }, travelers: { adults: 3, children: [] }, origin: { city: "Davao" } });
  });
});

describe("pageFromPath", () => {
  it("knows package and attraction pages only", () => {
    expect(pageFromPath("/tours/packages/abc-123")).toEqual({ kind: "package", id: "abc-123" });
    expect(pageFromPath("/tours/attractions/bagasbas-beach/")).toEqual({ kind: "attraction", id: "bagasbas-beach" });
    expect(pageFromPath("/tours/plan")).toBeNull();
    expect(pageFromPath("/tours/packages/abc/edit")).toBeNull();
  });
});
