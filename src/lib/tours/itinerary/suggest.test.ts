import { groupSameOffers, matchPackages, similarPackages, stopReachesPlace } from "@/lib/tours/itinerary/suggest";

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

describe("stopReachesPlace", () => {
  const beach = { name: "Bagasbas Beach", lat: 14.1396, lng: 122.9811 };
  it("counts a stop named for the place even when its pin is in town", () => {
    expect(stopReachesPlace(beach, { name: "Bagasbas Beach", lat: 14.1167, lng: 122.95 })).toBe(true);
    expect(stopReachesPlace(beach, { name: "Bagasbas Beach Main Entrance", lat: 14.1167, lng: 122.95 })).toBe(true);
  });
  it("counts a stop sharing the place's own word, but not a generic one", () => {
    expect(stopReachesPlace(beach, { name: "Bagasbas Seashore", lat: 14.1167, lng: 122.95 })).toBe(true);
    expect(stopReachesPlace(beach, { name: "Daet Town Proper", lat: 14.1167, lng: 122.95 })).toBe(false);
    expect(stopReachesPlace(beach, { name: "Beachside Restaurant", lat: 14.1167, lng: 122.95 })).toBe(false);
  });
});

describe("groupSameOffers", () => {
  const beach = { name: "Bagasbas Beach", lat: 14.1396, lng: 122.9811 };
  const plaza = { name: "Daet Elevated Town Plaza", lat: 14.1129, lng: 122.9556 };
  const at = (name: string, lat: number, lng: number) => ({ name, lat, lng });
  const pkg = (id: string, stops: Array<{ name: string; lat: number; lng: number }>) => ({ id, title: id, coverImageUrl: null, stops });

  it("puts two operators' Bagasbas tours on one card, the better one first", () => {
    const matches = matchPackages(
      [beach, plaza],
      [
        pkg("kalmado", [at("Bagasbas Beach", 14.1396, 122.9811), at("Surfing Area", 14.1402, 122.9818), at("Daet Town Proper", 14.1147, 122.9548)]),
        pkg("other", [at("Bagasbas Beach", 14.1167, 122.95), at("Surfing Area", 14.1167, 122.95)]),
        pkg("heritage", [at("Daet Elevated Town Plaza", 14.1129, 122.9556)]),
      ],
      Infinity,
    );
    const groups = groupSameOffers(matches, (a, b) => (a.id === "other" ? -1 : b.id === "other" ? 1 : 0));
    const beachGroup = groups.find((g) => g.main.primary === "Bagasbas Beach")!;
    expect(beachGroup.main.id).toBe("other");
    expect(beachGroup.same.map((m) => m.id)).toEqual(["kalmado"]);
    expect(groups.find((g) => g.main.id === "heritage")?.same).toEqual([]);
  });
});

describe("matchPackages: what a tour is mainly about", () => {
  const beach = { name: "Bagasbas Beach", lat: 14.135286, lng: 122.984261 };
  const plaza = { name: "Daet Elevated Town Plaza", lat: 14.115928, lng: 122.955202 };
  const town = { lat: 14.1167, lng: 122.95 };

  it("follows the place in the title, even when the stops' pins sit in town", () => {
    const [match] = matchPackages(
      [beach, plaza],
      [
        {
          id: "surf",
          title: "Bagasbas Beach Surf & Chill Experience",
          coverImageUrl: null,
          stops: [
            { name: "Daet Town Proper", ...town },
            { name: "Surfing Area", ...town },
            { name: "Aquino Bagasbas Boulevard", ...town },
            { name: "Bagasbas Seashore", ...town },
          ],
        },
      ],
    );
    expect(match.matched).toContain("Bagasbas Beach");
    expect(match.primary).toBe("Bagasbas Beach");
  });
});
