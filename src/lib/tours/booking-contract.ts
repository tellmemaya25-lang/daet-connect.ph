import "server-only";

/**
 * Booking system contracts and types
 * Verified against tours_bookings, tours_booking_participants, tours_booking_payments tables
 */

export const BOOKING_TABLE = "tours_bookings";
export const BOOKING_PARTICIPANTS_TABLE = "tours_booking_participants";
export const BOOKING_PAYMENTS_TABLE = "tours_booking_payments";

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed" | "rejected";
export type PaymentMethod = "cash" | "gcash" | "bank_transfer" | "card" | "other";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export const BOOKING_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  REJECTED: "rejected",
} as const satisfies Record<string, BookingStatus>;

export const PAYMENT_METHOD = {
  CASH: "cash",
  GCASH: "gcash",
  BANK_TRANSFER: "bank_transfer",
  CARD: "card",
  OTHER: "other",
} as const satisfies Record<string, PaymentMethod>;

export const PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
} as const satisfies Record<string, PaymentStatus>;

export const BOOKING_FIELDS = {
  id: "id",
  packageId: "package_id",
  userId: "user_id",
  priceVariantId: "price_variant_id",
  bookingReference: "booking_reference",
  tourDate: "tour_date",
  numberOfPax: "number_of_pax",
  pricePerPax: "price_per_pax",
  totalAmount: "total_amount",
  contactName: "contact_name",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
  specialRequests: "special_requests",
  status: "status",
  cancellationReason: "cancellation_reason",
  cancelledAt: "cancelled_at",
  cancelledBy: "cancelled_by",
  createdAt: "created_at",
  updatedAt: "updated_at",
} as const;

// Database record types
export interface BookingRecord {
  id: string;
  package_id: string;
  user_id: string;
  price_variant_id: string | null;
  booking_reference: string;
  tour_date: string;
  number_of_pax: number;
  price_per_pax: number | null;
  total_amount: number;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  special_requests: string | null;
  status: BookingStatus;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingParticipantRecord {
  id: string;
  booking_id: string;
  full_name: string;
  age: number | null;
  special_requirements: string | null;
  created_at: string;
}

export interface BookingPaymentRecord {
  id: string;
  booking_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  receipt_url: string | null;
  transaction_reference: string | null;
  paid_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Input types for creating bookings
export interface CreateBookingInput {
  packageId: string;
  priceVariantId: string | null;
  tourDate: string; // ISO date string
  numberOfPax: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  specialRequests?: string;
  /** Guests at the option's child price (only on options that have one). */
  numberOfChildren?: number;
  /** Chosen extras; the database prices them from the package's own list. */
  addons?: Array<{ addonId: string; quantity: number }>;
}

export interface BookingParticipantInput {
  fullName: string;
  age?: number;
  specialRequirements?: string;
}

// Validation functions
export function validateCreateBooking(input: CreateBookingInput): string | null {
  if (!input || typeof input !== "object") return "Booking details are invalid.";
  
  if (typeof input.packageId !== "string" || !input.packageId.trim()) {
    return "Package ID is required.";
  }
  
  if (typeof input.tourDate !== "string" || !input.tourDate.trim()) {
    return "Tour date is required.";
  }
  
  const tourDate = new Date(input.tourDate);
  if (isNaN(tourDate.getTime())) {
    return "Invalid tour date format.";
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (tourDate < today) {
    return "Tour date cannot be in the past.";
  }
  
  if (!Number.isInteger(input.numberOfPax) || input.numberOfPax < 1) {
    return "Number of participants must be at least 1.";
  }

  if (input.numberOfChildren !== undefined && (!Number.isInteger(input.numberOfChildren) || input.numberOfChildren < 0 || input.numberOfChildren > input.numberOfPax)) {
    return "The number of children must be between 0 and the number of guests.";
  }

  if (input.addons !== undefined) {
    if (!Array.isArray(input.addons) || input.addons.length > 20) return "Too many extras.";
    for (const addon of input.addons) {
      if (!addon || typeof addon.addonId !== "string" || !/^[0-9a-f-]{36}$/i.test(addon.addonId) || !Number.isInteger(addon.quantity) || addon.quantity < 1 || addon.quantity > 20) {
        return "An extra is not valid.";
      }
    }
  }
  
  if (input.numberOfPax > 50) {
    return "Maximum 50 participants per booking.";
  }
  
  if (typeof input.contactName !== "string" || input.contactName.trim().length < 2) {
    return "Contact name must be at least 2 characters.";
  }
  
  if (typeof input.contactEmail !== "string" || !input.contactEmail.includes("@")) {
    return "Valid email address is required.";
  }
  
  if (typeof input.contactPhone !== "string" || input.contactPhone.trim().length < 10) {
    return "Valid phone number is required (at least 10 digits).";
  }
  
  return null;
}

export function validateParticipant(input: BookingParticipantInput): string | null {
  if (!input || typeof input !== "object") return "Participant details are invalid.";
  
  if (typeof input.fullName !== "string" || input.fullName.trim().length < 2) {
    return "Participant name must be at least 2 characters.";
  }
  
  if (input.age !== undefined) {
    if (!Number.isInteger(input.age) || input.age < 1 || input.age > 150) {
      return "Age must be between 1 and 150.";
    }
  }
  
  return null;
}

// Query select strings
export const BOOKING_LIST_SELECT = `
  id,
  package_id,
  booking_reference,
  tour_date,
  number_of_pax,
  total_amount,
  status,
  created_at
`;

export const BOOKING_DETAIL_SELECT = `
  *,
  tours_packages (
    id,
    title,
    location_name,
    duration_value,
    duration_type,
    cover_image_url
  )
`;
