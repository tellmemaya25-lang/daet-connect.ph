import { filterChoices, ratingText, type CompareChoice } from "@/lib/tours/itinerary/compare";

const peso = (amount: number) => ({ amount, perPerson: true });
const choices: CompareChoice[] = [
  { id: "main", title: "Surf A", price: peso(1500), operatorName: "Kalmado", rating: null, suggested: true },
  { id: "same-cheap", title: "Surf B", price: peso(1200), operatorName: "Bagasbas", rating: { average: 3.5, count: 4 }, sameOffer: true },
  { id: "same-top", title: "Surf C", price: peso(1800), operatorName: "Daet Tours", rating: { average: 5, count: 1 }, sameOffer: true },
  { id: "similar", title: "Beach day", price: peso(900), operatorName: "Other", rating: { average: 4.2, count: 10 } },
];
const ids = (r: { shown: CompareChoice[] }) => r.shown.map((c) => c.id);

describe("filterChoices", () => {
  it("shows only the same tour from other operators, cheapest first", () => {
    expect(ids(filterChoices(choices, { scope: "same", minStars: 0, sort: "price" }))).toEqual(["same-cheap", "main", "same-top"]);
  });

  it("adds tours that share some places", () => {
    expect(ids(filterChoices(choices, { scope: "all", minStars: 0, sort: "price" }))).toEqual(["similar", "same-cheap", "main", "same-top"]);
  });

  it("keeps tours rated at least the picked stars and counts unrated ones hidden", () => {
    const r = filterChoices(choices, { scope: "all", minStars: 4, sort: "price" });
    expect(ids(r)).toEqual(["similar", "same-top"]);
    expect(r.hiddenUnrated).toBe(1);
  });

  it("sorts by rating, unrated last, then by price", () => {
    expect(ids(filterChoices(choices, { scope: "all", minStars: 0, sort: "rating" }))).toEqual(["same-top", "similar", "same-cheap", "main"]);
  });

  it("puts unpriced tours last when sorting by price", () => {
    const unpriced = { ...choices[1], id: "unpriced", price: null };
    expect(ids(filterChoices([unpriced, choices[0]], { scope: "same", minStars: 0, sort: "price" }))).toEqual(["main", "unpriced"]);
  });
});

describe("ratingText", () => {
  it("describes the rating or its absence", () => {
    expect(ratingText({ average: 4.75, count: 12 })).toBe("4.8★ (12 reviews)");
    expect(ratingText({ average: 5, count: 1 })).toBe("5.0★ (1 review)");
    expect(ratingText(null)).toBe("No reviews yet");
  });
});
