/**
 * Entity: Payment
 *
 * Field `methodId` merujuk ke PaymentMethod.methodId di sheet "Payment Method".
 * Disimpan sebagai string ID (bukan embed seluruh object) agar Payment sheet
 * tetap ringkas dan tidak duplikasi data.
 */
export type PaymentStatus = 'Cash' | 'Waiting Verification' | 'Paid' | 'Rejected';

export interface Payment {
  invoiceNumber: string;   // PK, format: INV-YYYYMMDD-XXXX
  bookingId:     string;
  amount:        number;
  methodId:      string;   // FK ke PaymentMethod.methodId
  status:        PaymentStatus;
  proofImageUrl: string;   // bukti transfer, diisi saat customer kirim foto
  verifiedBy:    string;   // username admin yang verifikasi
  verifiedAt:    string;   // ISO datetime
  createdAt:     string;   // ISO datetime
}

export type CreatePaymentDto = Pick<
  Payment,
  'invoiceNumber' | 'bookingId' | 'amount' | 'methodId' | 'status'
>;
