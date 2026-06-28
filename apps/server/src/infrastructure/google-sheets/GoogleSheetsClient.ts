import { google, type sheets_v4 } from 'googleapis';
import { env } from '@shared/config/env';
import { logger } from '@infrastructure/logger/Logger';
import { AppError } from '@shared/types';

export type SheetRow = string[];
export type SheetData = SheetRow[];

/**
 * GoogleSheetsClient — thin wrapper atas Google Sheets API v4.
 *
 * Tanggung jawab:
 *  - Autentikasi via Service Account.
 *  - Operasi CRUD baris: read, append, update per baris (by row index).
 *  - Tidak ada logika bisnis di sini — hanya I/O ke Google Sheets.
 *
 * Seluruh akses Spreadsheet HARUS melalui class ini, tidak boleh
 * ada import googleapis di luar file ini.
 */
export class GoogleSheetsClient {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = env.GOOGLE_SPREADSHEET_ID;

    logger.info('GoogleSheetsClient: inisialisasi selesai.');
  }

  /**
   * Baca seluruh baris dari sebuah sheet (termasuk header).
   * Kembalikan array of array of string.
   */
  async readSheet(sheetName: string): Promise<SheetData> {
    try {
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: sheetName,
      });

      return (res.data.values ?? []) as SheetData;
    } catch (err) {
      throw this.wrapError(`readSheet(${sheetName})`, err);
    }
  }

  /**
   * Tambahkan satu baris baru ke bagian paling bawah sheet.
   * Kembalikan row index (1-based) dari baris yang baru ditambahkan.
   */
  async appendRow(sheetName: string, row: SheetRow): Promise<number> {
    try {
      const res = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: sheetName,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      });

      // Parse row index dari updatedRange (misal: "Sheet1!A5:E5" → 5)
      const updatedRange = res.data.updates?.updatedRange ?? '';
      const match = updatedRange.match(/(\d+):/);
      return match ? parseInt(match[1], 10) : -1;
    } catch (err) {
      throw this.wrapError(`appendRow(${sheetName})`, err);
    }
  }

  /**
   * Update satu baris berdasarkan nomor baris (1-based, termasuk header).
   * Kolom dimulai dari A.
   */
  async updateRow(sheetName: string, rowIndex: number, row: SheetRow): Promise<void> {
    try {
      const range = `${sheetName}!A${rowIndex}`;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    } catch (err) {
      throw this.wrapError(`updateRow(${sheetName}, row=${rowIndex})`, err);
    }
  }

  /**
   * Update nilai kolom tertentu pada satu baris.
   * columnIndex: 0-based (0 = kolom A, 1 = kolom B, dst.)
   */
  async updateCell(
    sheetName: string,
    rowIndex: number,
    columnIndex: number,
    value: string,
  ): Promise<void> {
    try {
      const col = String.fromCharCode(65 + columnIndex); // 0→A, 1→B, dst.
      const range = `${sheetName}!${col}${rowIndex}`;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [[value]] },
      });
    } catch (err) {
      throw this.wrapError(`updateCell(${sheetName}, row=${rowIndex}, col=${columnIndex})`, err);
    }
  }

  /**
   * Hapus seluruh baris data (bukan header) dan tulis ulang dari awal.
   * Dipakai untuk operasi yang butuh replace-all (jarang, tapi perlu untuk
   * kasus seperti re-ordering atau bulk update).
   */
  async clearAndWrite(sheetName: string, rows: SheetData): Promise<void> {
    try {
      // 1. Clear mulai baris 2 (baris 1 = header, tidak disentuh)
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A2:ZZ`,
      });

      if (rows.length === 0) return;

      // 2. Tulis ulang data
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A2`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
    } catch (err) {
      throw this.wrapError(`clearAndWrite(${sheetName})`, err);
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private wrapError(context: string, err: unknown): AppError {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`GoogleSheetsClient error di ${context}: ${message}`);
    return AppError.externalService(`Google Sheets error: ${message}`);
  }
}
