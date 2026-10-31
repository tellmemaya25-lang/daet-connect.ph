import assert from "node:assert/strict";
import { test } from "node:test";
import { buildKalmadoPlan, KALMADO } from "./seed-kalmado.mjs";

const plan = buildKalmadoPlan();
const byKey = Object.fromEntries(plan.map((p) => [p.key, p]));

test("four packages with the advert's published prices", () => {
  assert.deepEqual(plan.map((p) => p.key), ["2d1n", "3d2n", "day", "boat"]);
  const prices = (key) => byKey[key].variants.map((v) => v.price_per_pax ?? v.flat_price);
  assert.deepEqual(prices("2d1n"), [2799, 4799]);
  assert.deepEqual(prices("3d2n"), [3799, 5799]);
  assert.deepEqual(prices("day"), [1999]);
  assert.deepEqual(prices("boat"), [1100, 20000]);
  for (const p of plan) assert.equal(p.variants.filter((v) => v.is_default).length, 1, `${p.key} has one default option`);
});

test("camping trips carry the group deal, the day tour the child price, and the boat neither", () => {
  for (const key of ["2d1n", "3d2n"]) for (const v of byKey[key].variants) assert.deepEqual([v.group_min_pax, v.group_discount_per_pax, v.group_free_pax], [16, 200, 1]);
  assert.deepEqual([byKey.day.variants[0].child_max_age, byKey.day.variants[0].child_price_percent], [6, 50]);
  assert.ok(byKey.boat.variants.every((v) => v.group_min_pax === null && v.child_price_percent === null));
  assert.equal(byKey.boat.variants[1].max_pax, 25);
});

test("itineraries run day by day, and the 3D2N has a third day", () => {
  const days = (key) => [...new Set(byKey[key].itinerary.map((r) => r.day_number))];
  assert.deepEqual(days("2d1n"), [1, 2]);
  assert.deepEqual(days("3d2n"), [1, 2, 3]);
  for (const p of plan) assert.deepEqual(p.itinerary.map((r) => r.display_order), p.itinerary.map((_, i) => i + 1));
});

test("extras, reservation fee and terms", () => {
  const extras = byKey["2d1n"].addons;
  assert.equal(extras.find((a) => a.name === "Tent upgrade for 3 people").price, 200);
  assert.equal(extras.find((a) => a.name === "Closed cabana").unit, "per_night");
  assert.equal(extras.find((a) => a.unit === "per_hour").bookable, false);
  assert.equal(byKey["2d1n"].pkg.deposit_per_pax, 500);
  assert.equal(byKey["2d1n"].pkg.deposit_refundable, false);
  assert.equal(byKey.boat.pkg.deposit_per_pax, null);
});

test("stops only where the app already has coordinates", () => {
  for (const p of plan) for (const s of p.stops) assert.ok(Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  assert.equal(KALMADO.operator.business_name, "Kalmado Tour Services");
});
