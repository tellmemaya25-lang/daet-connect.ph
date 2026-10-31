import { buildStopDetails, matchStopAttraction, normalizeName, shortText, type AttractionRef } from "@/lib/tours/stop-details";
import { matchPlacePhoto } from "@/lib/tours/trip-board";

const attractions: AttractionRef[] = [
  { name: "First José Rizal Monument", slug: "first-rizal-monument", description: "Raised in 1898. It stands in Rizal Park.", latitude: "14.1131", longitude: "122.9545", photo_url: null },
  { name: "Daet Heritage Center and Museum", slug: "daet-heritage-center", description: null, latitude: "14.1132", longitude: "122.9548", photo_url: "https://example.supabase.co/storage/heritage.jpg" },
  { name: "Bagasbas Beach", slug: "bagasbas-beach", description: "Surf beach.", latitude: "14.1316", longitude: "122.9851", photo_url: null },
  { name: "Cathedral of the Most Holy Trinity", slug: "cathedral-most-holy-trinity", description: null, latitude: null, longitude: null, photo_url: null },
];

describe("normalizeName", () => {
  it("drops case, accents and punctuation", () => {
    expect(normalizeName("First José Rizal Monument")).toBe("firstjoserizalmonument");
    expect(normalizeName(" Bagasbas-Beach! ")).toBe("bagasbasbeach");
  });
});

describe("matchStopAttraction", () => {
  it("matches the same name, ignoring accents", () => {
    expect(matchStopAttraction({ name: "First Jose Rizal Monument", lat: null, lng: null }, attractions)?.slug).toBe("first-rizal-monument");
  });

  it("matches a shorter or longer form of the name", () => {
    expect(matchStopAttraction({ name: "Daet Heritage Center", lat: null, lng: null }, attractions)?.slug).toBe("daet-heritage-center");
  });

  it("does not match a different place that is merely nearby", () => {
    expect(matchStopAttraction({ name: "Meeting point by the plaza", lat: 14.1131, lng: 122.9545 }, attractions)).toBeNull();
  });

  it("does not match short generic names", () => {
    expect(matchStopAttraction({ name: "Park", lat: null, lng: null }, attractions)).toBeNull();
  });

  it("picks the nearest when several places share the name", () => {
    const twins: AttractionRef[] = [
      { ...attractions[2], slug: "bagasbas-far", latitude: "14.2", longitude: "123.1" },
      { ...attractions[2], slug: "bagasbas-near" },
    ];
    expect(matchStopAttraction({ name: "Bagasbas Beach", lat: 14.1315, lng: 122.985 }, twins)?.slug).toBe("bagasbas-near");
  });
});

describe("shortText", () => {
  it("keeps the first sentence and caps the length", () => {
    expect(shortText("Raised in 1898. It stands in Rizal Park.")).toBe("Raised in 1898.");
    expect(shortText("a".repeat(250), 20)).toBe(`${"a".repeat(19)}…`);
    expect(shortText("   ")).toBeNull();
  });
});

describe("buildStopDetails", () => {
  const stops = [
    { id: "s3", location_name: "Bagasbas Beach", description: "Surf lesson.", latitude: "14.131583", longitude: "122.985083", stop_order: 2 },
    { id: "s1", location_name: "First José Rizal Monument", description: null, latitude: "14.113100", longitude: "122.954500", stop_order: 0 },
    { id: "s2", location_name: "Daet Heritage Center", description: "", latitude: "14.113187", longitude: "122.954828", stop_order: 1 },
    { id: "s4", location_name: "Lunch at a carinderia", description: "Local lunch.", latitude: null, longitude: null, stop_order: 3 },
  ];
  const details = buildStopDetails(stops, attractions);

  it("orders stops and reads their pins", () => {
    expect(details.map((d) => d.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(details[0]).toMatchObject({ lat: 14.1131, lng: 122.9545 });
    expect(details[3]).toMatchObject({ lat: null, lng: null });
  });

  it("links listed places and uses the operator's text, else the place's first sentence", () => {
    expect(details[0].href).toBe("/tours/attractions/first-rizal-monument");
    expect(details[0].description).toBe("Raised in 1898.");
    expect(details[2].description).toBe("Surf lesson.");
    expect(details[3].href).toBeNull();
  });

  it("uses the place's own photo, else our photo of that place, else none", () => {
    expect(details[1].photo?.src).toBe("https://example.supabase.co/storage/heritage.jpg");
    expect(details[0].photo?.src).toBe("/photos/rizal-monument.jpg");
    expect(details[2].photo?.src).toBe("/photos/bagasbas-beach.jpg");
    expect(details[3].photo).toBeNull();
  });

  it("never shows the St John church photo for the cathedral", () => {
    expect(matchPlacePhoto("Cathedral of the Most Holy Trinity")).toBeNull();
    expect(buildStopDetails([{ id: "c", location_name: "Cathedral of the Most Holy Trinity", description: null, latitude: null, longitude: null, stop_order: 0 }], attractions)[0].photo).toBeNull();
  });
});
