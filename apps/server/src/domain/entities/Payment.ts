/**
 * Entity: Payment
 */
import type { PaymentMethod } from './Booking';

export type PaymentStatus = 'Cash' | 'Waiting Verification' | 'Paid' | 'Rejected';

export interface Payment {
  invoiceNumber: string;   // PK, format: INV-YYYYMMDD-XXXX
  bookingId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  proofImageUrl: string;   // bukti transfer, diisi saat customer kirim foto
  verifiedBy: string;      // username admin yang verifikasi
  verifiedAt: string;      // ISO datetime
  createdAt: string;       // ISO datetime
}

export type CreatePaymentDto = Pick<
  Payment,
  'invoiceNumber' | 'bookingId' | 'amount' | 'method' | 'status'
>;
