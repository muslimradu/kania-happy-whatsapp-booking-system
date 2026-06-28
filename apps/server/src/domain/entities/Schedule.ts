/**
 * Entity: Schedule (Template Jadwal Mingguan)
 *
 * Menyimpan pola berulang (recurring) — bukan tanggal spesifik.
 * Tanggal aktual (occurrence) dihitung oleh GetAvailableScheduleService.
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Minggu, 1 = Senin, dst.

/** Number → nama hari (untuk tampil ke customer & bot) */
export const DAY_NAMES: Record<DayOfWeek, string> = {
  0: 'Minggu',
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
};

/**
 * Nama hari → number (untuk parsing dari sheet).
 * Sheet menyimpan teks "Senin", "Selasa", dst. — bukan angka.
 * Lebih mudah dibaca & diedit admin langsung di spreadsheet.
 */
export const DAY_NAME_TO_NUMBER: Record<string, DayOfWeek> = {
  Minggu:  0,
  Senin:   1,
  Selasa:  2,
  Rabu:    3,
  Kamis:   4,
  Jumat:   5,
  'Jum\'at': 5, // toleransi typo umum
  Sabtu:   6,
};

export interface Schedule {
  scheduleId: string;  // contoh: 'SCH001'
  serviceId:  string;  // FK ke Service
  dayOfWeek:  DayOfWeek;
  timeStart:  string;  // format HH:mm
  timeEnd:    string;  // format HH:mm
  isActive:   boolean;
}

/**
 * Occurrence = jadwal template yang sudah dikonversi ke tanggal aktual.
 * Dihasilkan oleh GetAvailableScheduleService, bukan disimpan di sheet.
 */
export interface ScheduleOccurrence {
  schedule:     Schedule;
  date:         string; // YYYY-MM-DD, tanggal aktual pertemuan
  serviceName:  string;
  servicePrice: number;
}
