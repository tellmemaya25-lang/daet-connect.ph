import { userFacingDbError } from "@/lib/tours/db-errors";

describe("userFacingDbError", () => {
  it("passes through messages raised by our triggers and RPCs", () => {
    expect(userFacingDbError({ code: "23514", message: "Only 2 seat(s) left on this date." }, "x")).toBe("Only 2 seat(s) left on this date.");
    expect(userFacingDbError({ code: "P0002", message: "Booking not found." }, "x")).toBe("Booking not found.");
    expect(userFacingDbError({ code: "42501", message: "You are not allowed to change this booking." }, "x")).toBe(
      "You are not allowed to change this booking.",
    );
  });

  it("hides raw Postgres wording and unknown codes", () => {
    expect(userFacingDbError({ code: "42501", message: 'new row violates row-level security policy for table "tours_bookings"' }, "Nope")).toBe("Nope");
    expect(userFacingDbError({ code: "42501", message: "permission denied for table tours_bookings" }, "Nope")).toBe("Nope");
    expect(userFacingDbError({ code: "23505", message: 'duplicate key value violates unique constraint "x"' }, "Nope")).toBe("Nope");
    expect(userFacingDbError({ code: "23514", message: 'new row for relation "t" violates check constraint "c"' }, "Nope")).toBe("Nope");
    expect(userFacingDbError({ code: "08006", message: "connection failure" }, "Nope")).toBe("Nope");
    expect(userFacingDbError(null, "Nope")).toBe("Nope");
  });
});
