/** @jest-environment jsdom */

import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { BookingForm } from "./booking-form";
import { createBooking } from "./actions";

jest.mock("./actions", () => ({ createBooking: jest.fn() }));
jest.mock("./door-pickup-picker", () => ({ DoorPickupPicker: () => null }));
const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const mockCreate = createBooking as jest.MockedFunction<typeof createBooking>;

function renderForm() {
  return render(
    <BookingForm
      packageId="pkg-1"
      priceVariants={[{ id: "v1", variant_name: "Standard", price_per_pax: 1000, flat_price: null, min_pax: 1, max_pax: 20, is_default: true }]}
      dateOptions={[{ date: "2099-01-10", seatsLeft: 10, full: false } as never]}
      userProfile={{ fullName: "Ana Cruz", email: "ana@example.com" }}
      prefill={{ date: "2099-01-10", pax: "2" }}
    />,
  );
}

describe("BookingForm double submit", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    push.mockReset();
  });

  it("sends one booking when the form is submitted twice before the first reply", async () => {
    let resolve: (value: Awaited<ReturnType<typeof createBooking>>) => void = () => {};
    mockCreate.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const { container } = renderForm();
    const form = container.querySelector("form")!;

    // Two submits in the same tick: React has not re-rendered the disabled button yet.
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ success: true, bookingId: "b-1" }));
    expect(push).toHaveBeenCalledWith("/tours/bookings/b-1");
  });

  it("allows another try after the server says no", async () => {
    mockCreate.mockResolvedValueOnce({ success: false, error: "Only 1 seat(s) left on this date." });
    const { container } = renderForm();
    const form = container.querySelector("form")!;

    await act(async () => { fireEvent.submit(form); });
    expect(await screen.findByText("Only 1 seat(s) left on this date.")).toBeInTheDocument();

    mockCreate.mockResolvedValueOnce({ success: true, bookingId: "b-2" });
    await act(async () => { fireEvent.submit(form); });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
