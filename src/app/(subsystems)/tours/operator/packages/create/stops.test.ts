import { fromCreateStops, toCoordinates, toCreateStop, validCoordinates } from "./stops";
import { validateDraft } from "./draft-validation";
import { parseDraftPayload } from "./draft-payload";
import type { EditPackageFormData } from "../[id]/edit/edit-types";

/**
 * Stops are chosen from the attractions list or picked on the map, so the only
 * thing worth defending is the point itself: the picker filters attractions
 * with it, and the server refuses a draft whose stops do not have one.
 */

const stop = {
  locationName: "Bagasbas Beach",
  description: "Meet at the lifeguard station.",
  latitude: 14.1122,
  longitude: 122.9553,
  estimatedDurationMinutes: null,
  stopOrder: 1,
};

function draftWithStops(stops: EditPackageFormData["stops"]): EditPackageFormData {
  return {
    title: "Bagasbas surf lesson",
    locationName: "Bagasbas Beach, Daet",
    description: null,
    durationValue: 3,
    durationType: "hours",
    coverImageUrl: null,
    priceVariants: [],
    inclusions: [],
    stops,
    galleryImages: [],
  };
}

describe("validCoordinates", () => {
  it("accepts real points, including zero and the edges of the ranges", () => {
    expect(validCoordinates(14.1122, 122.9553)).toBe(true);
    expect(validCoordinates(0, 0)).toBe(true);
    expect(validCoordinates(90, 180)).toBe(true);
    expect(validCoordinates(-90, -180)).toBe(true);
  });

  it("refuses what is missing, out of range or not a number", () => {
    expect(validCoordinates(null, 122.9)).toBe(false);
    expect(validCoordinates(14.1, null)).toBe(false);
    expect(validCoordinates("14.1", "122.9")).toBe(false);
    expect(validCoordinates(91, 122.9)).toBe(false);
    expect(validCoordinates(14.1, -181)).toBe(false);
    expect(validCoordinates(Number.POSITIVE_INFINITY, 122.9)).toBe(false);
    expect(validCoordinates(Number.NaN, Number.NaN)).toBe(false);
  });
});

describe("toCoordinates", () => {
  it("normalises the numeric strings PostgREST returns", () => {
    expect(toCoordinates("14.131583", "122.985083")).toEqual({ latitude: 14.131583, longitude: 122.985083 });
    expect(toCoordinates(14.1, 122.9)).toEqual({ latitude: 14.1, longitude: 122.9 });
  });

  it("returns nothing for a place without a usable point", () => {
    expect(toCoordinates(null, null)).toBeNull();
    expect(toCoordinates("", "")).toBeNull();
    expect(toCoordinates("not a number", "122.9")).toBeNull();
    expect(toCoordinates(120, 122.9)).toBeNull();
  });
});

describe("a draft's stops must carry their own point", () => {
  it("accepts a stop chosen from an attraction", () => {
    expect(validateDraft(draftWithStops([stop]), { requireComplete: false })).toEqual({});
  });

  it("refuses a stop with no coordinates", () => {
    const errors = validateDraft(draftWithStops([{ ...stop, latitude: Number.NaN }]), { requireComplete: false });
    expect(errors["stops.0.latitude"]).toMatch(/between -90 and 90/);
  });

  it("refuses a point outside the ranges", () => {
    const errors = validateDraft(
      draftWithStops([
        { ...stop, latitude: 91 },
        { ...stop, longitude: -181, stopOrder: 2 },
      ]),
      { requireComplete: false },
    );
    expect(errors["stops.0.latitude"]).toBeTruthy();
    expect(errors["stops.1.longitude"]).toBeTruthy();
  });

  it("does not turn a posted string into an invented location", () => {
    const parsed = parseDraftPayload({
      ...draftWithStops([]),
      stops: [{ locationName: "Bagasbas Beach", description: "", latitude: "14.1", longitude: "122.9" }],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.stops[0].latitude).toBeNaN();
    expect(validateDraft(parsed.draft, { requireComplete: false })["stops.0.latitude"]).toBeTruthy();
  });
});

describe("moving stops between the picker and the draft", () => {
  it("keeps a chosen stop's name, note and point", () => {
    expect(toCreateStop({ ...stop, id: "stop-1" })).toEqual({
      locationName: "Bagasbas Beach",
      description: "Meet at the lifeguard station.",
      latitude: 14.1122,
      longitude: 122.9553,
    });
  });

  it("numbers the stops in the order they were added", () => {
    const converted = fromCreateStops([
      { locationName: "Bagasbas Beach", description: "", latitude: 14.13, longitude: 122.98 },
      { locationName: "Apuao Grande", description: "Lunch on the sand.", latitude: 14.2, longitude: 123.0 },
    ]);

    expect(converted.map((item) => [item.locationName, item.stopOrder])).toEqual([
      ["Bagasbas Beach", 1],
      ["Apuao Grande", 2],
    ]);
    expect(converted[0].description).toBeNull();
    expect(converted[1].description).toBe("Lunch on the sand.");
    // A stop's own point travels with it; nothing is defaulted to Daet.
    expect(converted[1].latitude).toBe(14.2);
  });

  it("round-trips without losing anything the operator entered", () => {
    const chosen = { locationName: "Bagasbas Beach", description: "Surf", latitude: 14.13, longitude: 122.98 };
    expect(toCreateStop(fromCreateStops([chosen])[0])).toEqual(chosen);
  });
});
