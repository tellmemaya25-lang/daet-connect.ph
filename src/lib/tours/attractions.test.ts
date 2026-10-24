import { parseAttractionForm, parseAttractionsCsv, parseCsv, slugify, toAttraction, validateAttraction } from "@/lib/tours/attractions";

const base = { name: "Bagasbas Beach", category: "beach", source: "Daet Tourism Office, 2026" };

describe("slugify", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("First José Rizal Monument")).toBe("first-jose-rizal-monument");
    expect(slugify("  Tinaga Island (Calaguas)! ")).toBe("tinaga-island-calaguas");
    expect(slugify("x".repeat(100))).toHaveLength(80);
  });
});

describe("validateAttraction", () => {
  it("accepts a minimal row and derives slug and defaults", () => {
    const result = validateAttraction(base);
    expect(result.ok && result.data).toMatchObject({ slug: "bagasbas-beach", municipality: "Daet", latitude: null, opening_hours: null, is_active: true, location_verified: false });
  });

  it("parses coordinates, hours, fee and visit length", () => {
    const result = validateAttraction({ ...base, latitude: "14.1316", longitude: "122.9851", hours: "Daily 06:00-18:00", entranceFee: "₱1,250.50", dwellMinutes: "180", locationVerified: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.latitude).toBe(14.1316);
    expect(result.data.entrance_fee).toBe(1250.5);
    expect(result.data.dwell_minutes).toBe(180);
    expect(result.data.location_verified).toBe(true);
    expect(Object.keys(result.data.opening_hours ?? {})).toHaveLength(7);
  });

  it("never marks a missing pin as verified", () => {
    const result = validateAttraction({ ...base, locationVerified: true });
    expect(result.ok && result.data.location_verified).toBe(false);
  });

  it("reports each problem", () => {
    const result = validateAttraction({ name: "x", category: "zoo", source: "", latitude: "14.1", hours: "whenever", dwellMinutes: "2", entranceFee: "free" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["category", "dwellMinutes", "entranceFee", "hours", "longitude", "name", "source"]);
  });

  it("catches swapped or far-away pins", () => {
    const swapped = validateAttraction({ ...base, latitude: "122.9851", longitude: "14.1316" });
    expect(!swapped.ok && swapped.errors.latitude).toBeTruthy();
    const manila = validateAttraction({ ...base, latitude: "14.5995", longitude: "120.9842" });
    expect(!manila.ok && manila.errors.latitude).toMatch(/far from Camarines Norte/);
  });
});

describe("parseAttractionForm / toAttraction", () => {
  it("reads checkboxes from the form", () => {
    const form = new FormData();
    for (const [k, v] of Object.entries({ ...base, latitude: "14.1", longitude: "122.9" })) form.set(k, v);
    form.set("locationVerified", "on");
    const result = parseAttractionForm(form);
    expect(result.ok && result.data).toMatchObject({ is_active: false, location_verified: true });
  });

  it("normalises numeric strings from Supabase", () => {
    const row = toAttraction({ id: "1", latitude: "14.113100", longitude: "122.954500", entrance_fee: null, dwell_minutes: 20, opening_hours: { mon: [["08:00", "17:00"]] } });
    expect(row.latitude).toBe(14.1131);
    expect(row.opening_hours).toEqual({ mon: [["08:00", "17:00"]] });
  });
});

describe("CSV import", () => {
  it("parses quoted fields, commas, doubled quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });

  it("imports valid rows and reports bad ones by line", () => {
    const csv = [
      "name,category,latitude,longitude,hours,source",
      'Bagasbas Beach,Beach,14.1316,122.9851,,"MTO, 2026"',
      "Daet Heritage Center,heritage,14.1132,122.9548,Mon-Fri 08:00-17:00,MTO 2026",
      "Bad Place,zoo,,,,MTO",
      "Bagasbas Beach,beach,,,,MTO",
    ].join("\n");
    const result = parseAttractionsCsv(csv);
    expect(result.rows.map((r) => r.slug)).toEqual(["bagasbas-beach", "daet-heritage-center"]);
    expect(result.errors.map((e) => e.line)).toEqual([4, 5]);
    expect(result.errors[1].message).toContain("repeats line 2");
  });

  it("requires the key columns", () => {
    expect(parseAttractionsCsv("name,category\nX Y,beach").errors[0].message).toContain("Missing column(s): source");
    expect(parseAttractionsCsv("").errors).toHaveLength(1);
  });
});
