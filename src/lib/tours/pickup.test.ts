import { pickupFee, pickupFeeLabel, toPickupPoints, validatePickupDrafts } from "./pickup";

const peso = (n: number) => `₱${n}`;

describe("pickupFee", () => {
  it("charges a per-booking fee once", () => {
    expect(pickupFee({ fee: 300, feePer: "booking" }, 4)).toBe(300);
  });
  it("multiplies a per-person fee by the guests", () => {
    expect(pickupFee({ fee: 150, feePer: "person" }, 4)).toBe(600);
  });
  it("is zero with no pickup chosen", () => {
    expect(pickupFee(null, 4)).toBe(0);
  });
});

describe("pickupFeeLabel", () => {
  it("names free and paid pickups", () => {
    expect(pickupFeeLabel({ fee: 0, feePer: "booking" }, peso)).toBe("Free");
    expect(pickupFeeLabel({ fee: 150, feePer: "person" }, peso)).toBe("₱150 per person");
  });
});

describe("toPickupPoints", () => {
  it("keeps active rows and reads numeric fees", () => {
    const points = toPickupPoints([
      { id: "a", name: "Daet Plaza", fee: "0.00", fee_per: "booking", note: null },
      { id: "b", name: "Labo", fee: "250.50", fee_per: "person", note: "By the church", is_active: true },
      { id: "c", name: "Old", fee: 1, fee_per: "booking", note: null, is_active: false },
    ]);
    expect(points).toEqual([
      { id: "a", name: "Daet Plaza", fee: 0, feePer: "booking", note: null },
      { id: "b", name: "Labo", fee: 250.5, feePer: "person", note: "By the church" },
    ]);
  });
});

describe("validatePickupDrafts", () => {
  const draft = (name: string, fee: string, feePer: "booking" | "person" = "booking") => ({ name, fee, feePer, note: "" });

  it("accepts a list and treats a blank fee as free", () => {
    expect(validatePickupDrafts([draft("Daet Plaza", ""), draft("Mercedes port", "150", "person")])).toEqual({
      ok: true,
      points: [
        { name: "Daet Plaza", fee: 0, fee_per: "booking", note: null },
        { name: "Mercedes port", fee: 150, fee_per: "person", note: null },
      ],
    });
  });
  it("skips empty rows", () => {
    expect(validatePickupDrafts([draft("", "")])).toEqual({ ok: true, points: [] });
  });
  it("rejects letters in the fee", () => {
    expect(validatePickupDrafts([draft("Labo", "1oo")])).toMatchObject({ ok: false });
  });
  it("rejects duplicates and missing names", () => {
    expect(validatePickupDrafts([draft("Labo", "1"), draft("labo", "2")])).toMatchObject({ ok: false, error: expect.stringMatching(/twice/) });
    expect(validatePickupDrafts([draft("", "100")])).toMatchObject({ ok: false, error: expect.stringMatching(/name/) });
  });
});
