import { BaseSheetRepository } from '../google-sheets/BaseSheetRepository';
import type { GoogleSheetsClient } from '../google-sheets/GoogleSheetsClient';
import type { SheetCache } from '../google-sheets/SheetCache';
import type { IScheduleRepository } from '@domain/repositories';
import type { Schedule } from '@domain/entities/Schedule';
import type { DayOfWeek } from '@domain/entities/Schedule';

/**
 * Kolom sheet `Schedule` (0-based index):
 * A=0 schedule_id | B=1 service_id | C=2 day_of_week | D=3 time_start | E=4 time_end | F=5 is_active
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

  // ── Mapper ────────────────────────────────────────────────────────────────

  private toEntity(row: string[]): Schedule {
    return {
      scheduleId:  this.safeCell(row, COL.SCHEDULE_ID),
      serviceId:   this.safeCell(row, COL.SERVICE_ID),
      dayOfWeek:   parseInt(this.safeCell(row, COL.DAY_OF_WEEK), 10) as DayOfWeek,
      timeStart:   this.safeCell(row, COL.TIME_START),
      timeEnd:     this.safeCell(row, COL.TIME_END),
      isActive:    this.safeBool(row, COL.IS_ACTIVE),
    };
  }

  private toRow(schedule: Schedule): string[] {
    return [
      schedule.scheduleId,
      schedule.serviceId,
      String(schedule.dayOfWeek),
      schedule.timeStart,
      schedule.timeEnd,
      String(schedule.isActive),
    ];
  }
}
