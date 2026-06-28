/**
 * Entity: Schedule (Template Jadwal Mingguan)
 *
 * Menyimpan pola berulang (recurring) — bukan tanggal spesifik.
 * Tanggal aktual (occurrence) dihitung oleh GetAvailableScheduleService.
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Minggu, 1 = Senin, dst.

export const DAY_NAMES: Record<DayOfWeek, string> = {
  0: 'Minggu',
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
};

export interface Schedule {
  scheduleId: string;  // contoh: 'SCH001'
  serviceId: string;   // FK ke Service
  dayOfWeek: DayOfWeek;
  timeStart: string;   // format HH:mm
  timeEnd: string;     // format HH:mm
  isActive: boolean;
}

/**
 * Occurrence = jadwal template yang sudah dikonversi ke tanggal aktual.
 * Dihasilkan oleh GetAvailableScheduleService, bukan disimpan di sheet.
 */
export interface ScheduleOccurrence {
  schedule: Schedule;
  date: string;       // YYYY-MM-DD, tanggal aktual pertemuan
  serviceName: string;
  servicePrice: number;
}
