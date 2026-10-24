import { filterPackages, placesOf, spanOf } from "./package-filters";

const pkg = (id: string, location_name: string, duration_value: number, duration_type: string) => ({
  id,
  title: id,
  location_name,
  duration_value,
  duration_type,
  cover_image_url: null,
});

describe("package filters", () => {
  const all = [
    pkg("surf", "Bagasbas", 3, "hours"),
    pkg("hop", "Mercedes", 1, "days"),
    pkg("camp", "Calaguas", 2, "days"),
    pkg("lesson", "Bagasbas", 8, "hours"),
  ];

  it("buckets durations", () => {
    expect(spanOf(all[0])).toBe("hours");
    expect(spanOf(all[1])).toBe("day");
    expect(spanOf(all[2])).toBe("nights");
    expect(spanOf(all[3])).toBe("day");
  });

  it("lists places, most tours first", () => {
    expect(placesOf(all)).toEqual(["Bagasbas", "Calaguas", "Mercedes"]);
  });

  it("combines length and place", () => {
    expect(filterPackages(all, "all", null)).toHaveLength(4);
    expect(filterPackages(all, "day", null).map((p) => p.id)).toEqual(["hop", "lesson"]);
    expect(filterPackages(all, "day", "Bagasbas").map((p) => p.id)).toEqual(["lesson"]);
    expect(filterPackages(all, "nights", "Mercedes")).toEqual([]);
  });
});
