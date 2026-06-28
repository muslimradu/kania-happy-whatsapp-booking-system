/**
 * Utilitas tanggal & waktu — selalu mengacu ke timezone Asia/Jakarta (GMT+7).
 */

const TZ = 'Asia/Jakarta';

/**
 * Kembalikan tanggal hari ini dalam format YYYY-MM-DD (GMT+7).
 */
export function todayJakarta(): string {
  return new Date()
    .toLocaleDateString('sv-SE', { timeZone: TZ }); // sv-SE = ISO date format
}

/**
 * Format tanggal ke representasi ramah untuk pesan WhatsApp.
 * Contoh: '2026-06-29' → 'Senin, 29 Juni 2026'
 */
export function formatDateDisplay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00+07:00`);
  return date.toLocaleDateString('id-ID', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Format jam ke representasi ramah.
 * Contoh: '08:00', '09:30' → '08.00', '09.30'
 */
export function formatTimeDisplay(hhmm: string): string {
  return hhmm.replace(':', '.');
}

/**
 * Tambah N hari ke tanggal ISO dan kembalikan hasilnya.
 * Contoh: addDays('2026-06-28', 3) → '2026-07-01'
 */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00+07:00`);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('sv-SE', { timeZone: TZ });
}

/**
 * Hitung tanggal berikutnya yang jatuh pada hari tertentu (0=Minggu, 1=Senin, ...).
 * Jika hari tersebut sudah lewat minggu ini, ambil minggu depan.
 * fromDate dalam format YYYY-MM-DD (dipakai sebagai titik awal).
 */
export function nextOccurrence(fromDate: string, dayOfWeek: number): string {
  const from = new Date(`${fromDate}T00:00:00+07:00`);
  const fromDay = from.getDay(); // 0=Minggu
  let diff = dayOfWeek - fromDay;
  if (diff < 0) diff += 7;
  return addDays(fromDate, diff);
}

/**
 * Bandingkan dua tanggal ISO (YYYY-MM-DD).
 * Kembalikan negative jika a < b, 0 jika sama, positive jika a > b.
 */
export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Format angka rupiah.
 * Contoh: 75000 → 'Rp 75.000'
 */
export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}
