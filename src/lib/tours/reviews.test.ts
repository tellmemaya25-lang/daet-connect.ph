import { distribution, formatRating, parseReply, parseReviewForm, ratingLabel, toSummary } from "@/lib/tours/reviews";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

describe("parseReviewForm", () => {
  it("accepts 1-5 stars with an optional comment", () => {
    expect(parseReviewForm(form({ rating: "5", comment: "  Great!  " }))).toEqual({ ok: true, rating: 5, comment: "Great!" });
    expect(parseReviewForm(form({ rating: "1" }))).toEqual({ ok: true, rating: 1, comment: "" });
  });
  it("rejects bad ratings and long comments", () => {
    for (const rating of ["0", "6", "4.5", "", "five"]) expect(parseReviewForm(form({ rating })).ok).toBe(false);
    expect(parseReviewForm(form({ rating: "4", comment: "x".repeat(2001) })).ok).toBe(false);
  });
});

describe("parseReply", () => {
  it("allows clearing, rejects 1 char and too long", () => {
    expect(parseReply("  ")).toEqual({ ok: true, reply: "" });
    expect(parseReply("a").ok).toBe(false);
    expect(parseReply("Thank you!")).toEqual({ ok: true, reply: "Thank you!" });
    expect(parseReply("x".repeat(1001)).ok).toBe(false);
  });
});

describe("summaries", () => {
  it("reads the rating views and formats them", () => {
    expect(toSummary({ review_count: 3, average_rating: "4.33" })).toEqual({ count: 3, average: 4.33 });
    expect(toSummary({ review_count: 0, average_rating: null })).toBeNull();
    expect(toSummary(null)).toBeNull();
    expect(formatRating({ count: 1, average: 5 })).toBe("5.0 (1 review)");
    expect(formatRating(null)).toBe("No reviews yet");
    expect(ratingLabel(4)).toBe("Very good");
    expect(distribution([5, 5, 4, 1])).toEqual([{ stars: 5, count: 2 }, { stars: 4, count: 1 }, { stars: 3, count: 0 }, { stars: 2, count: 0 }, { stars: 1, count: 1 }]);
  });
});
