/**
 * InvoiceGenerator
 *
 * Menghasilkan nomor invoice unik yang mudah dibaca admin.
 * Format: INV-YYYYMMDD-XXXX
 *   - YYYYMMDD = tanggal booking (GMT+7)
 *   - XXXX = 4 karakter random alphanumeric uppercase
 *
 * Contoh: INV-20260629-A3F7
 *
 * Tidak menyimpan counter ke sheet — probabilitas tabrakan 4 karakter
 * random (36^4 = 1.67 juta kombinasi) sangat kecil untuk skala sanggar senam.
 * Jika suatu saat butuh counter sekuensial, cukup swap implementasi ini.
 */
export class InvoiceGenerator {
  generate(): string {
    const date = new Date()
      .toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' })
      .replace(/-/g, '');

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // hindari 0/O, 1/I
    const suffix = Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)],
    ).join('');

    return `INV-${date}-${suffix}`;
  }
}
