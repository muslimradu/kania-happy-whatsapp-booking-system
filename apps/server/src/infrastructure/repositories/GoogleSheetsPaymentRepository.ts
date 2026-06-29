import { BaseSheetRepository } from '../google-sheets/BaseSheetRepository';
import type { GoogleSheetsClient } from '../google-sheets/GoogleSheetsClient';
import type { SheetCache } from '../google-sheets/SheetCache';
import type { IPaymentRepository } from '@domain/repositories';
import type { Payment, CreatePaymentDto, PaymentStatus } from '@domain/entities/Payment';

/**
 * Kolom sheet `Payment` (0-based):
 * A=0 invoice_number | B=1 booking_id | C=2 amount | D=3 method_id
 * E=4 status | F=5 proof_image_url | G=6 verified_by | H=7 verified_at | I=8 created_at
 */
const COL = {
  INVOICE_NUMBER:  0,
  BOOKING_ID:      1,
  AMOUNT:          2,
  METHOD_ID:       3,
  STATUS:          4,
  PROOF_IMAGE_URL: 5,
  VERIFIED_BY:     6,
  VERIFIED_AT:     7,
  CREATED_AT:      8,
} as const;

const SHEET = 'Payment';

export class GoogleSheetsPaymentRepository
  extends BaseSheetRepository
  implements IPaymentRepository
{
  protected readonly sheetName = SHEET;

  constructor(client: GoogleSheetsClient, cache: SheetCache) {
    super(client, cache);
  }

  async findByInvoiceNumber(invoiceNumber: string): Promise<Payment | null> {
    const rows = await this.readRows();
    const row = rows.find((r) => r[COL.INVOICE_NUMBER] === invoiceNumber);
    return row ? this.toEntity(row) : null;
  }

  async findByBookingId(bookingId: string): Promise<Payment | null> {
    const rows = await this.readRows();
    const row = rows.find((r) => r[COL.BOOKING_ID] === bookingId);
    return row ? this.toEntity(row) : null;
  }

  async findByStatus(status: PaymentStatus): Promise<Payment[]> {
    const rows = await this.readRows();
    return rows.filter((r) => r[COL.STATUS] === status).map((r) => this.toEntity(r));
  }

  async create(dto: CreatePaymentDto): Promise<Payment> {
    const payment: Payment = {
      ...dto,
      proofImageUrl: '',
      verifiedBy:    '',
      verifiedAt:    '',
      createdAt:     new Date().toISOString(),
    };
    await this.appendRow(this.toRow(payment));
    return payment;
  }

  async updateStatus(
    invoiceNumber: string,
    status: PaymentStatus,
    meta?: { verifiedBy?: string; proofImageUrl?: string },
  ): Promise<void> {
    const rowIndex = await this.findRowIndex(COL.INVOICE_NUMBER, invoiceNumber);
    if (rowIndex === -1) return;

    await this.updateCell(rowIndex, COL.STATUS, status);
    if (meta?.proofImageUrl) await this.updateCell(rowIndex, COL.PROOF_IMAGE_URL, meta.proofImageUrl);
    if (meta?.verifiedBy) {
      await this.updateCell(rowIndex, COL.VERIFIED_BY, meta.verifiedBy);
      await this.updateCell(rowIndex, COL.VERIFIED_AT, new Date().toISOString());
    }
  }

  private toEntity(row: string[]): Payment {
    return {
      invoiceNumber:  this.safeCell(row, COL.INVOICE_NUMBER),
      bookingId:      this.safeCell(row, COL.BOOKING_ID),
      amount:         this.safeNumber(row, COL.AMOUNT),
      methodId:       this.safeCell(row, COL.METHOD_ID),
      status:         this.safeCell(row, COL.STATUS) as PaymentStatus,
      proofImageUrl:  this.safeCell(row, COL.PROOF_IMAGE_URL),
      verifiedBy:     this.safeCell(row, COL.VERIFIED_BY),
      verifiedAt:     this.safeCell(row, COL.VERIFIED_AT),
      createdAt:      this.safeCell(row, COL.CREATED_AT),
    };
  }

  private toRow(p: Payment): string[] {
    return [
      p.invoiceNumber,
      p.bookingId,
      String(p.amount),
      p.methodId,
      p.status,
      p.proofImageUrl,
      p.verifiedBy,
      p.verifiedAt,
      p.createdAt,
    ];
  }
}
