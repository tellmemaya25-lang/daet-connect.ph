import { formatPeso, parseEventForm, parseMerchForm, parseMerchReview, PROMO_IMAGE_MAX_BYTES, readPromoImage } from "@/lib/tours/promo-validation";

function form(values: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

const validEvent = {
  title: "Pinyasan Festival",
  category: "festival",
  venue: "Daet Freedom Park",
  organizer: "Daet Tourism Office",
  startsAt: "2026-06-15T08:00",
  endsAt: "2026-06-24T22:00",
  description: "Pineapple festival with street dancing.",
  isPublished: "on",
};

describe("parseEventForm", () => {
  it("accepts a linked attraction and a source, and rejects a bad attraction id", () => {
    const ok = parseEventForm(form({ ...validEvent, attractionId: "1f0b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", source: " tpb.gov.ph " }));
    expect(ok.ok && ok.data.attraction_id).toBe("1f0b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d");
    expect(ok.ok && ok.data.source).toBe("tpb.gov.ph");
    const bad = parseEventForm(form({ ...validEvent, attractionId: "bagasbas" }));
    expect(bad.ok ? null : bad.errors.attractionId).toBeDefined();
  });

  it("accepts a valid event and converts Manila times to UTC", () => {
    const result = parseEventForm(form(validEvent));
    expect(result).toEqual({
      ok: true,
      data: {
        title: "Pinyasan Festival",
        description: "Pineapple festival with street dancing.",
        category: "festival",
        venue: "Daet Freedom Park",
        organizer: "Daet Tourism Office",
        starts_at: "2026-06-15T00:00:00.000Z",
        ends_at: "2026-06-24T14:00:00.000Z",
        is_published: true,
        attraction_id: null,
        source: null,
      },
    });
  });

  it("trims text, stores blank optionals as null, and defaults to unpublished", () => {
    const result = parseEventForm(form({ ...validEvent, title: "  Night Market  ", organizer: "   ", description: "", isPublished: "" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toBe("Night Market");
    expect(result.data.organizer).toBeNull();
    expect(result.data.description).toBeNull();
    expect(result.data.is_published).toBe(false);
  });

  it("reports every missing required field", () => {
    const result = parseEventForm(form({}));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["category", "endsAt", "startsAt", "title", "venue"]);
    expect(result.errors.title).toBe("Title is required.");
  });

  it("rejects unknown categories and over-long text", () => {
    const result = parseEventForm(form({ ...validEvent, category: "concert", title: "x".repeat(121), description: "y".repeat(2001) }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.category).toBeDefined();
    expect(result.errors.title).toContain("120");
    expect(result.errors.description).toContain("2000");
  });

  it("rejects an end before the start", () => {
    const result = parseEventForm(form({ ...validEvent, startsAt: "2026-06-15T10:00", endsAt: "2026-06-15T09:59" }));
    expect(result).toEqual({ ok: false, errors: { endsAt: "End must be on or after the start." } });
  });

  it("allows instant events but rejects spans over the limit", () => {
    expect(parseEventForm(form({ ...validEvent, endsAt: validEvent.startsAt })).ok).toBe(true);
    const tooLong = parseEventForm(form({ ...validEvent, startsAt: "2026-01-01T00:00", endsAt: "2026-04-01T00:00" }));
    expect(tooLong.ok).toBe(false);
  });

  it("rejects impossible dates", () => {
    const result = parseEventForm(form({ ...validEvent, startsAt: "2026-02-30T10:00" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.startsAt).toBeDefined();
  });
});

const validMerch = {
  name: "I ♥ Daet T-shirt",
  category: "tshirt",
  price: "350",
  sellerName: "Bagasbas Surf Shop",
  whereToBuy: "Bagasbas Beach",
  contactInfo: "0917 123 4567",
  description: "Cotton shirt.",
  isActive: "on",
};

describe("parseMerchForm", () => {
  it("accepts a valid product", () => {
    const result = parseMerchForm(form(validMerch));
    expect(result).toEqual({
      ok: true,
      data: {
        name: "I ♥ Daet T-shirt",
        description: "Cotton shirt.",
        category: "tshirt",
        price: 350,
        seller_name: "Bagasbas Surf Shop",
        where_to_buy: "Bagasbas Beach",
        contact_info: "0917 123 4567",
        is_featured: false,
        is_active: true,
      },
    });
  });

  it("treats a blank price as 'ask seller'", () => {
    const result = parseMerchForm(form({ ...validMerch, price: "" }));
    expect(result.ok && result.data.price).toBeNull();
  });

  it("accepts centavos", () => {
    const result = parseMerchForm(form({ ...validMerch, price: "349.50" }));
    expect(result.ok && result.data.price).toBe(349.5);
  });

  it.each(["-1", "abc", "1.234", "1e3", "NaN", "Infinity", "123456789"])("rejects price %p", (price) => {
    const result = parseMerchForm(form({ ...validMerch, price }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.price).toBeDefined();
  });

  it("requires name, seller and a known category", () => {
    const result = parseMerchForm(form({ category: "car" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["category", "name", "sellerName"]);
  });
});

describe("readPromoImage", () => {
  it("returns null when no file was chosen", () => {
    expect(readPromoImage(form({}))).toEqual({ file: null });
    expect(readPromoImage(form({ image: new File([], "") }))).toEqual({ file: null });
  });

  it("accepts supported image types", () => {
    const file = new File(["img"], "shirt.png", { type: "image/png" });
    expect(readPromoImage(form({ image: file })).file?.name).toBe("shirt.png");
  });

  it("rejects other types and oversized files", () => {
    expect(readPromoImage(form({ image: new File(["x"], "a.gif", { type: "image/gif" }) })).error).toContain("JPG");
    const big = new File([new Uint8Array(PROMO_IMAGE_MAX_BYTES + 1)], "big.jpg", { type: "image/jpeg" });
    expect(readPromoImage(form({ image: big })).error).toContain("5 MB");
  });
});

describe("formatPeso", () => {
  it("formats pesos", () => {
    expect(formatPeso(null)).toBeNull();
    expect(formatPeso(350)).toBe("₱350");
    expect(formatPeso(1299.5)).toBe("₱1,299.5");
  });
});

describe("parseMerchReview", () => {
  it("approves with an optional note and needs a reason to reject", () => {
    expect(parseMerchReview(form({ decision: "approved" }))).toEqual({ ok: true, status: "approved", notes: null });
    expect(parseMerchReview(form({ decision: "rejected", notes: "  Add a clearer photo " }))).toEqual({ ok: true, status: "rejected", notes: "Add a clearer photo" });
    expect(parseMerchReview(form({ decision: "rejected", notes: "no" })).ok).toBe(false);
    expect(parseMerchReview(form({ decision: "maybe" })).ok).toBe(false);
    expect(parseMerchReview(form({ decision: "approved", notes: "x".repeat(301) })).ok).toBe(false);
  });
});
