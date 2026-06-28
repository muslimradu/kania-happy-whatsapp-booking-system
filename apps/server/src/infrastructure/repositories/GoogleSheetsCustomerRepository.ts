import { BaseSheetRepository } from '../google-sheets/BaseSheetRepository';
import type { GoogleSheetsClient } from '../google-sheets/GoogleSheetsClient';
import type { SheetCache } from '../google-sheets/SheetCache';
import type { ICustomerRepository } from '@domain/repositories';
import type { Customer } from '@domain/entities';
import { nowJakarta } from '@shared/types';

/**
 * Kolom sheet `Customer` (0-based):
 * A=0 phone | B=1 name | C=2 first_contact_at | D=3 last_booking_at | E=4 total_booking
 */
const COL = {
  PHONE:            0,
  NAME:             1,
  FIRST_CONTACT_AT: 2,
  LAST_BOOKING_AT:  3,
  TOTAL_BOOKING:    4,
} as const;

const SHEET = 'Customer';

export class GoogleSheetsCustomerRepository
  extends BaseSheetRepository
  implements ICustomerRepository
{
  protected readonly sheetName = SHEET;

  constructor(client: GoogleSheetsClient, cache: SheetCache) {
    super(client, cache);
  }

  async findAll(): Promise<Customer[]> {
    const rows = await this.readRows();
    return rows.map((r) => this.toEntity(r));
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const rows = await this.readRows();
    const row = rows.find((r) => r[COL.PHONE] === phone);
    return row ? this.toEntity(row) : null;
  }

  async upsert(data: Pick<Customer, 'phone' | 'name'>): Promise<Customer> {
    const existing = await this.findByPhone(data.phone);
    const now = nowJakarta();

    if (existing) {
      // Update nama jika berubah
      if (existing.name !== data.name) {
        const rowIndex = await this.findRowIndex(COL.PHONE, data.phone);
        if (rowIndex !== -1) {
          await this.updateCell(rowIndex, COL.NAME, data.name);
        }
        return { ...existing, name: data.name };
      }
      return existing;
    }

    // Customer baru
    const customer: Customer = {
      phone:          data.phone,
      name:           data.name,
      firstContactAt: now,
      lastBookingAt:  '',
      totalBooking:   0,
    };
    await this.appendRow(this.toRow(customer));
    return customer;
  }

  async incrementBookingCount(phone: string): Promise<void> {
    const rowIndex = await this.findRowIndex(COL.PHONE, phone);
    if (rowIndex === -1) return;

    const existing = await this.findByPhone(phone);
    if (!existing) return;

    const now = nowJakarta();
    await this.updateCell(rowIndex, COL.TOTAL_BOOKING, String(existing.totalBooking + 1));
    await this.updateCell(rowIndex, COL.LAST_BOOKING_AT, now);
  }

  // ── Mapper ────────────────────────────────────────────────────────────────

  private toEntity(row: string[]): Customer {
    return {
      phone:          this.safeCell(row, COL.PHONE),
      name:           this.safeCell(row, COL.NAME),
      firstContactAt: this.safeCell(row, COL.FIRST_CONTACT_AT),
      lastBookingAt:  this.safeCell(row, COL.LAST_BOOKING_AT),
      totalBooking:   this.safeNumber(row, COL.TOTAL_BOOKING),
    };
  }

  private toRow(c: Customer): string[] {
    return [
      c.phone,
      c.name,
      c.firstContactAt,
      c.lastBookingAt,
      String(c.totalBooking),
    ];
  }
}