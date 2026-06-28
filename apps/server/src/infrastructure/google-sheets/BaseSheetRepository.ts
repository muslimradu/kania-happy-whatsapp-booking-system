import type { GoogleSheetsClient, SheetData, SheetRow } from './GoogleSheetsClient';
import type { SheetCache } from './SheetCache';

/**
 * BaseSheetRepository — abstract class yang menyediakan helper umum untuk
 * semua repository berbasis Google Sheets.
 *
 * Pola yang digunakan:
 *  - `readCached()`: baca sheet dengan cache; kosongkan cache setelah write.
 *  - `toRecord()` / `fromRecord()`: konversi antara SheetRow (array string)
 *    dan domain entity (typed object) — harus diimplementasi tiap subclass.
 *  - `findRowIndex()`: cari nomor baris (1-based) berdasarkan nilai di kolom
 *    tertentu. Dipakai untuk operasi update.
 *
 * Aturan penting:
 *  - Baris 1 selalu header; data dimulai dari baris 2.
 *  - Setelah setiap operasi tulis, `cache.invalidate(sheetName)` WAJIB
 *    dipanggil agar read berikutnya selalu fresh.
 */
export abstract class BaseSheetRepository {
  protected abstract readonly sheetName: string;

  constructor(
    protected readonly client: GoogleSheetsClient,
    protected readonly cache: SheetCache,
  ) {}

  /**
   * Baca seluruh baris data (baris 2 ke bawah, header dibuang).
   * Hasil di-cache; cache di-invalidate setelah write.
   */
  protected async readRows(): Promise<SheetData> {
    const cached = this.cache.get<SheetData>(this.sheetName);
    if (cached) return cached;

    const all = await this.client.readSheet(this.sheetName);
    const data = all.slice(1); // buang header
    this.cache.set(this.sheetName, data);
    return data;
  }

  /**
   * Append satu baris baru dan invalidate cache.
   * Kembalikan row index (1-based termasuk header) dari baris baru.
   */
  protected async appendRow(row: SheetRow): Promise<number> {
    const rowIndex = await this.client.appendRow(this.sheetName, row);
    this.cache.invalidate(this.sheetName);
    return rowIndex;
  }

  /**
   * Update satu baris berdasarkan row index dan invalidate cache.
   */
  protected async updateRow(rowIndex: number, row: SheetRow): Promise<void> {
    await this.client.updateRow(this.sheetName, rowIndex, row);
    this.cache.invalidate(this.sheetName);
  }

  /**
   * Update satu cell dan invalidate cache.
   */
  protected async updateCell(
    rowIndex: number,
    columnIndex: number,
    value: string,
  ): Promise<void> {
    await this.client.updateCell(this.sheetName, rowIndex, columnIndex, value);
    this.cache.invalidate(this.sheetName);
  }

  /**
   * Cari row index (1-based, termasuk header) dari baris yang memiliki
   * nilai `value` di kolom `columnIndex` (0-based).
   *
   * Kembalikan -1 jika tidak ditemukan.
   */
  protected async findRowIndex(columnIndex: number, value: string): Promise<number> {
    const rows = await this.readRows();
    const dataRowIndex = rows.findIndex((row) => row[columnIndex] === value);
    if (dataRowIndex === -1) return -1;
    return dataRowIndex + 2; // +1 untuk header, +1 karena findIndex 0-based
  }

  /**
   * Baca cell tunggal berdasarkan kolom tertentu, kembalikan nilai string atau ''.
   */
  protected safeCell(row: SheetRow, index: number): string {
    return row[index] ?? '';
  }

  protected safeBool(row: SheetRow, index: number): boolean {
    const val = this.safeCell(row, index).toLowerCase();
    return val === 'true' || val === '1' || val === 'yes';
  }

  protected safeNumber(row: SheetRow, index: number): number {
    return parseFloat(this.safeCell(row, index)) || 0;
  }
}
