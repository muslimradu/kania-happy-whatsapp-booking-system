import { v4 as uuidv4 } from 'uuid';
import { BaseSheetRepository } from '../google-sheets/BaseSheetRepository';
import type { GoogleSheetsClient } from '../google-sheets/GoogleSheetsClient';
import type { SheetCache } from '../google-sheets/SheetCache';
import type { IBookingRepository } from '@domain/repositories';
import type { Booking, CreateBookingDto, BookingStatus } from '@domain/entities/Booking';
import type { PaymentMethod } from '@domain/entities/Booking';

/**
 * Kolom sheet `Booking` (0-based):
 * A=0 booking_id | B=1 invoice_number | C=2 customer_phone | D=3 customer_name
 * E=4 service_id | F=5 schedule_id | G=6 booking_date | H=7 payment_method
 * I=8 booking_status | J=9 created_at | K=10 reminder_h1_sent | L=11 reminder_hariH_sent
 */
const COL = {
  BOOKING_ID:          0,
  INVOICE_NUMBER:      1,
  CUSTOMER_PHONE:      2,
  CUSTOMER_NAME:       3,
  SERVICE_ID:          4,
  SCHEDULE_ID:         5,
  BOOKING_DATE:        6,
  PAYMENT_METHOD:      7,
  BOOKING_STATUS:      8,
  CREATED_AT:          9,
  REMINDER_H1_SENT:    10,
  REMINDER_HARIH_SENT: 11,
} as const;

const SHEET = 'Booking';

export class GoogleSheetsBookingRepository
  extends BaseSheetRepository
  implements IBookingRepository
{
  protected readonly sheetName = SHEET;

  constructor(client: GoogleSheetsClient, cache: SheetCache) {
    super(client, cache);
  }

  async findAll(): Promise<Booking[]> {
    const rows = await this.readRows();
    return rows.map((r) => this.toEntity(r));
  }

  async findById(bookingId: string): Promise<Booking | null> {
    const rows = await this.readRows();
    const row = rows.find((r) => r[COL.BOOKING_ID] === bookingId);
    return row ? this.toEntity(row) : null;
  }

  async findByPhone(phone: string): Promise<Booking[]> {
    const rows = await this.readRows();
    return rows
      .filter((r) => r[COL.CUSTOMER_PHONE] === phone)
      .map((r) => this.toEntity(r));
  }

  async findByDate(date: string): Promise<Booking[]> {
    const rows = await this.readRows();
    return rows
      .filter((r) => r[COL.BOOKING_DATE] === date)
      .map((r) => this.toEntity(r));
  }

  async findPendingReminders(type: 'h1' | 'hariH'): Promise<Booking[]> {
    const all = await this.findAll();
    const colFlag = type === 'h1' ? 'reminderH1Sent' : 'reminderHariHSent';
    return all.filter(
      (b) => b.bookingStatus === 'Confirmed' && !b[colFlag],
    );
  }

  async create(dto: CreateBookingDto): Promise<Booking> {
    const booking: Booking = {
      ...dto,
      bookingId:        `BKG-${uuidv4().slice(0, 8).toUpperCase()}`,
      createdAt:        new Date().toISOString(),
      reminderH1Sent:   false,
      reminderHariHSent: false,
    };
    await this.appendRow(this.toRow(booking));
    return booking;
  }

  async updateStatus(bookingId: string, status: BookingStatus): Promise<void> {
    const rowIndex = await this.findRowIndex(COL.BOOKING_ID, bookingId);
    if (rowIndex === -1) return;
    await this.updateCell(rowIndex, COL.BOOKING_STATUS, status);
  }

  async markReminderSent(bookingId: string, type: 'h1' | 'hariH'): Promise<void> {
    const rowIndex = await this.findRowIndex(COL.BOOKING_ID, bookingId);
    if (rowIndex === -1) return;
    const col = type === 'h1' ? COL.REMINDER_H1_SENT : COL.REMINDER_HARIH_SENT;
    await this.updateCell(rowIndex, col, 'true');
  }

  // ── Mapper ────────────────────────────────────────────────────────────────

  private toEntity(row: string[]): Booking {
    return {
      bookingId:         this.safeCell(row, COL.BOOKING_ID),
      invoiceNumber:     this.safeCell(row, COL.INVOICE_NUMBER),
      customerPhone:     this.safeCell(row, COL.CUSTOMER_PHONE),
      customerName:      this.safeCell(row, COL.CUSTOMER_NAME),
      serviceId:         this.safeCell(row, COL.SERVICE_ID),
      scheduleId:        this.safeCell(row, COL.SCHEDULE_ID),
      bookingDate:       this.safeCell(row, COL.BOOKING_DATE),
      paymentMethod:     this.safeCell(row, COL.PAYMENT_METHOD) as PaymentMethod,
      bookingStatus:     this.safeCell(row, COL.BOOKING_STATUS) as BookingStatus,
      createdAt:         this.safeCell(row, COL.CREATED_AT),
      reminderH1Sent:    this.safeBool(row, COL.REMINDER_H1_SENT),
      reminderHariHSent: this.safeBool(row, COL.REMINDER_HARIH_SENT),
    };
  }

  private toRow(b: Booking): string[] {
    return [
      b.bookingId,
      b.invoiceNumber,
      b.customerPhone,
      b.customerName,
      b.serviceId,
      b.scheduleId,
      b.bookingDate,
      b.paymentMethod,
      b.bookingStatus,
      b.createdAt,
      String(b.reminderH1Sent),
      String(b.reminderHariHSent),
    ];
  }
}
