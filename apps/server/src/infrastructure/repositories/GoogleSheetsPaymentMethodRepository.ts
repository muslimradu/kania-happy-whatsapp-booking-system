import { v4 as uuidv4 } from 'uuid';
import { BaseSheetRepository } from '../google-sheets/BaseSheetRepository';
import type { GoogleSheetsClient } from '../google-sheets/GoogleSheetsClient';
import type { SheetCache } from '../google-sheets/SheetCache';
import type { IPaymentMethodRepository } from '@domain/repositories';
import type { PaymentMethod, PaymentMethodType } from '@domain/entities/PaymentMethod';

/**
 * Kolom sheet "Payment Method" (0-based):
 * A=0 method_id     | B=1 label         | C=2 type
 * D=3 account_number| E=4 account_name  | F=5 qris_image_url | G=6 is_active
 */
const COL = {
  METHOD_ID:      0,
  LABEL:          1,
  TYPE:           2,
  ACCOUNT_NUMBER: 3,
  ACCOUNT_NAME:   4,
  QRIS_IMAGE_URL: 5,
  IS_ACTIVE:      6,
} as const;

const SHEET = 'Payment Method';

export class GoogleSheetsPaymentMethodRepository
  extends BaseSheetRepository
  implements IPaymentMethodRepository
{
  protected readonly sheetName = SHEET;

  constructor(client: GoogleSheetsClient, cache: SheetCache) {
    super(client, cache);
  }

  async findAll(): Promise<PaymentMethod[]> {
    const rows = await this.readRows();
    return rows.map((r) => this.toEntity(r));
  }

  async findActive(): Promise<PaymentMethod[]> {
    const all = await this.findAll();
    return all.filter((m) => m.isActive);
  }

  async findById(methodId: string): Promise<PaymentMethod | null> {
    const rows = await this.readRows();
    const row = rows.find((r) => r[COL.METHOD_ID] === methodId);
    return row ? this.toEntity(row) : null;
  }

  async save(method: PaymentMethod): Promise<void> {
    // Jika methodId belum diisi, generate otomatis
    const id = method.methodId || `PM-${uuidv4().slice(0, 6).toUpperCase()}`;
    await this.appendRow(this.toRow({ ...method, methodId: id }));
  }

  async update(methodId: string, data: Partial<PaymentMethod>): Promise<void> {
    const rowIndex = await this.findRowIndex(COL.METHOD_ID, methodId);
    if (rowIndex === -1) return;

    const existing = await this.findById(methodId);
    if (!existing) return;

    const updated: PaymentMethod = { ...existing, ...data };
    await this.updateRow(rowIndex, this.toRow(updated));
  }

  async deactivate(methodId: string): Promise<void> {
    const rowIndex = await this.findRowIndex(COL.METHOD_ID, methodId);
    if (rowIndex === -1) return;
    // Hanya update kolom G (is_active) — tidak hapus baris agar audit trail terjaga
    await this.updateCell(rowIndex, COL.IS_ACTIVE, 'false');
  }

  // ── Mapper ─────────────────────────────────────────────────────────────────

  private toEntity(row: string[]): PaymentMethod {
    return {
      methodId:      this.safeCell(row, COL.METHOD_ID),
      label:         this.safeCell(row, COL.LABEL),
      type:          this.safeCell(row, COL.TYPE) as PaymentMethodType,
      accountNumber: this.safeCell(row, COL.ACCOUNT_NUMBER),
      accountName:   this.safeCell(row, COL.ACCOUNT_NAME),
      qrisImageUrl:  this.safeCell(row, COL.QRIS_IMAGE_URL),
      isActive:      this.safeBool(row, COL.IS_ACTIVE),
    };
  }

  private toRow(m: PaymentMethod): string[] {
    return [
      m.methodId,
      m.label,
      m.type,
      m.accountNumber,
      m.accountName,
      m.qrisImageUrl,
      String(m.isActive),
    ];
  }
}
