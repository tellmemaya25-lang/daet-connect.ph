import { pickupForCrew } from "@/components/tours/pickup-for-crew";

describe("pickup for the guide", () => {
  it("gives the place, vehicle, distance, directions and the guest's phone", () => {
    expect(pickupForCrew({ pickup_lat: "14.1395", pickup_lng: 122.993, pickup_note: " Surf shop gate ", pickup_vehicle: "van", pickup_km: "6.9", contact_name: "Ana", contact_phone: "09171234567" })).toEqual({
      lat: 14.1395,
      lng: 122.993,
      place: "Surf shop gate",
      vehicle: "Van",
      km: 6.9,
      directions: "https://www.google.com/maps/dir/?api=1&destination=14.1395,122.993",
      name: "Ana",
      phone: "09171234567",
    });
  });
  it("is null without a pickup pin", () => {
    expect(pickupForCrew({ pickup_lat: null, pickup_lng: null })).toBeNull();
  });
});
