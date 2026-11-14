jest.mock("server-only", () => ({}), { virtual: true });
import { validateCreateBooking, type CreateBookingInput } from "./booking-contract";

const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const base = {
  packageId: "pkg-1",
  tourDate: tomorrow,
  numberOfPax: 2,
  contactName: "Ana Cruz",
  contactEmail: "ana@example.com",
  contactPhone: "09171234567",
} as CreateBookingInput;

describe("booking contact email", () => {
  it("accepts a normal address", () => {
    expect(validateCreateBooking(base)).toBeNull();
  });
  it.each(["a@", "@b.com", "no-at-sign", "a b@example.com", "a@b", ""])("rejects %j", (contactEmail) => {
    expect(validateCreateBooking({ ...base, contactEmail })).toBe("Valid email address is required.");
  });
  it("rejects an address over 254 characters", () => {
    expect(validateCreateBooking({ ...base, contactEmail: `${"a".repeat(250)}@example.com` })).toBe(
      "Valid email address is required.",
    );
  });
});
