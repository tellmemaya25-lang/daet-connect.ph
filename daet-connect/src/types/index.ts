export type BookingStatus = 'To Confirm' | 'Confirmed' | 'Completed' | 'Declined' | 'Refunded';

export interface Booking {
  id: string;
  packageName: string;
  packageSlug: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  guestNotes: string;
  tourDate: string; // YYYY-MM-DD
  pax: number;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  refundRef?: string;
  status: BookingStatus;
  assignedGuide?: string;
  assignedGuideId?: string;
}

export interface Guide {
  id: string;
  name: string;
  specialty: string;
}
