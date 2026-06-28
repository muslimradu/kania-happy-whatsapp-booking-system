/**
 * Entity: Booking
 */
export type PaymentMethod = 'Cash' | 'Transfer' | 'QRIS';
export type BookingStatus = 'Pending' | 'Confirmed' | 'Cancelled';

export interface Booking {
  bookingId: string;
  invoiceNumber: string;   // FK ke Payment
  customerPhone: string;   // FK ke Customer (format E.164: 628xxx)
  customerName: string;    // snapshot nama saat booking
  serviceId: string;
  scheduleId: string;
  bookingDate: string;     // YYYY-MM-DD, tanggal aktual pertemuan
  paymentMethod: PaymentMethod;
  bookingStatus: BookingStatus;
  createdAt: string;       // ISO datetime
  reminderH1Sent: boolean;
  reminderHariHSent: boolean;
}

export type CreateBookingDto = Omit<
  Booking,
  'bookingId' | 'createdAt' | 'reminderH1Sent' | 'reminderHariHSent'
>;
