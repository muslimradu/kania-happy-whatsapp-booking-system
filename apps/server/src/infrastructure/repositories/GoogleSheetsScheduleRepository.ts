import { BaseSheetRepository } from '../google-sheets/BaseSheetRepository';
import type { GoogleSheetsClient } from '../google-sheets/GoogleSheetsClient';
import type { SheetCache } from '../google-sheets/SheetCache';
import type { IScheduleRepository } from '@domain/repositories';
import type { Schedule } from '@domain/entities/Schedule';
import { DAY_NAMES, DAY_NAME_TO_NUMBER } from '@domain/entities/Schedule';

/**
 * Kolom sheet `Schedule` (0-based):
 * A=0 schedule_id | B=1 service_id | C=2 day_of_week | D=3 time_start | E=4 time_end | F=5 is_active
 *
 * Kolom day_of_week disimpan sebagai NAMA HARI ("Senin", "Selasa", dst.)
 * agar admin bisa membaca dan mengedit langsung di spreadsheet tanpa
 * perlu tahu konvensi angka 0–6.
 *
 * Di memory, tetap digunakan DayOfWeek (number) sesuai interface Schedule.
 * Konversi hanya terjadi di toEntity() (baca) dan toRow() (tulis).
 */
const COL = {
  SCHEDULE_ID: 0,
  SERVICE_ID:  1,
  DAY_OF_WEEK: 2,
  TIME_START:  3,
  TIME_END:    4,
  IS_ACTIVE:   5,
} as const;

const SHEET = 'Schedule';

export class GoogleSheetsScheduleRepository
  extends BaseSheetRepository
  implements IScheduleRepository
{
  protected readonly sheetName = SHEET;

  constructor(client: GoogleSheetsClient, cache: SheetCache) {
    super(client, cache);
  }

  async findAll(): Promise<Schedule[]> {
    const rows = await this.readRows();
    return rows.map((r) => this.toEntity(r));
  }

  async findById(scheduleId: string): Promise<Schedule | null> {
    const rows = await this.readRows();
    const row = rows.find((r) => r[COL.SCHEDULE_ID] === scheduleId);
    return row ? this.toEntity(row) : null;
  }

  async findActive(): Promise<Schedule[]> {
    const all = await this.findAll();
    return all.filter((s) => s.isActive);
  }

  async findActiveByServiceId(serviceId: string): Promise<Schedule[]> {
    const all = await this.findAll();
    return all.filter((s) => s.serviceId === serviceId && s.isActive);
  }

  async save(schedule: Schedule): Promise<void> {
    await this.appendRow(this.toRow(schedule));
  }

  async update(scheduleId: string, data: Partial<Schedule>): Promise<void> {
    const rowIndex = await this.findRowIndex(COL.SCHEDULE_ID, scheduleId);
    if (rowIndex === -1) return;

    const existing = await this.findById(scheduleId);
    if (!existing) return;

    const updated: Schedule = { ...existing, ...data };
    await this.updateRow(rowIndex, this.toRow(updated));
  }

  // ── Mapper ─────────────────────────────────────────────────────────────────

  private toEntity(row: string[]): Schedule {
    const dayRaw = this.safeCell(row, COL.DAY_OF_WEEK);

    // Terima nama hari ("Senin") ATAU angka lama ("1") agar backwards-compatible
    // dengan data sheet yang mungkin masih pakai angka.
    const dayOfWeek =
      DAY_NAME_TO_NUMBER[dayRaw] ??
      (Number.isInteger(Number(dayRaw)) ? (Number(dayRaw) as import('@domain/entities/Schedule').DayOfWeek) : 1);

    return {
      scheduleId: this.safeCell(row, COL.SCHEDULE_ID),
      serviceId:  this.safeCell(row, COL.SERVICE_ID),
      dayOfWeek,
      timeStart:  this.safeCell(row, COL.TIME_START),
      timeEnd:    this.safeCell(row, COL.TIME_END),
      isActive:   this.safeBool(row, COL.IS_ACTIVE),
    };
  }

  private toRow(schedule: Schedule): string[] {
    return [
      schedule.scheduleId,
      schedule.serviceId,
      DAY_NAMES[schedule.dayOfWeek], // simpan nama hari, bukan angka
      schedule.timeStart,
      schedule.timeEnd,
      String(schedule.isActive),
    ];
  }
}
