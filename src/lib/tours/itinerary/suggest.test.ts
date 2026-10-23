import { matchPackages } from "@/lib/tours/itinerary/suggest";

const rizal = { name: "Rizal Monument", lat: 14.1131, lng: 122.9545 };
const bagasbas = { name: "Bagasbas Beach", lat: 14.131583, lng: 122.985083 };

describe("matchPackages", () => {
  it("ranks packages by how many planned places their stops pass", () => {
    const result = matchPackages([rizal, bagasbas], [
      { id: "surf", title: "Surf Lesson", coverImageUrl: null, stops: [{ name: "Beach", lat: 14.1318, lng: 122.9849 }] },
      { id: "town", title: "Town + Beach", coverImageUrl: null, stops: [{ name: "Plaza", lat: 14.1133, lng: 122.9548 }, { name: "Beach", lat: 14.1312, lng: 122.986 }] },
      { id: "far", title: "Calaguas", coverImageUrl: null, stops: [{ name: "Tinaga", lat: 14.4692, lng: 122.945 }] },
    ]);
    expect(result.map((m) => m.id)).toEqual(["town", "surf"]);
    expect(result[0].matched).toEqual(["Rizal Monument", "Bagasbas Beach"]);
  });

  it("returns nothing when no stop is close", () => {
    expect(matchPackages([rizal], [{ id: "far", title: "Far", coverImageUrl: null, stops: [{ name: "x", lat: 14.3, lng: 123.2 }] }])).toEqual([]);
  });
});
