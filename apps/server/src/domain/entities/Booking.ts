/**
 * Entity: Booking
 *
 * Perubahan M4: tambah field `scheduleTime` (snapshot jam mulai kelas)
 * agar ReminderService tidak perlu join ke Schedule hanya untuk ambil jam.
 * Snapshot dibuat saat BookingService.confirmBooking() dipanggil.
 *
 * paymentMethodId merujuk ke PaymentMethod.methodId di sheet "Payment Method".
 */
export type BookingStatus = 'Pending' | 'Confirmed' | 'Cancelled';

export interface Booking {
  bookingId:         string;
  invoiceNumber:     string;
  customerPhone:     string;
  customerName:      string;
  serviceId:         string;
  serviceName:       string;   // snapshot nama layanan
  scheduleId:        string;
  bookingDate:       string;   // YYYY-MM-DD
  scheduleTime:      string;   // HH:mm — snapshot jam mulai kelas (tambah M4)
  paymentMethodId:   string;
  bookingStatus:     BookingStatus;
  createdAt:         string;
  reminderH1Sent:    boolean;
  reminderHariHSent: boolean;
}

export type CreateBookingDto = Omit<
  Booking,
  'bookingId' | 'createdAt' | 'reminderH1Sent' | 'reminderHariHSent'
>;
