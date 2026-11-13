import { matchPackages, similarPackages } from "@/lib/tours/itinerary/suggest";

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

describe("similarPackages", () => {
  const place = (name: string, lat: number, lng: number) => ({ name, lat, lng });
  const falls = place("Falls", 14.1, 122.9);
  const beach = place("Beach", 14.2, 122.95);
  const pkg = (id: string, stops: Array<{ name: string; lat: number; lng: number }>) => ({ id, title: id, coverImageUrl: null, stops });

  it("lists other tours that pass the same planned places, most shared first", () => {
    const main = { id: "a", title: "a", coverImageUrl: null, matched: ["Falls", "Beach"] };
    const result = similarPackages(main, [falls, beach], [pkg("a", [falls, beach]), pkg("b", [falls]), pkg("c", [falls, beach]), pkg("d", [place("Far", 13, 121)])], new Set(["a"]));
    expect(result.map((r) => r.id)).toEqual(["c", "b"]);
    expect(result[0].shared).toEqual(["Falls", "Beach"]);
  });

  it("skips tours already suggested on their own", () => {
    const main = { id: "a", title: "a", coverImageUrl: null, matched: ["Falls"] };
    expect(similarPackages(main, [falls], [pkg("b", [falls])], new Set(["a", "b"]))).toEqual([]);
  });

  it("only compares the places the main tour matched", () => {
    const main = { id: "a", title: "a", coverImageUrl: null, matched: ["Falls"] };
    expect(similarPackages(main, [falls, beach], [pkg("b", [beach])], new Set(["a"]))).toEqual([]);
  });
});
