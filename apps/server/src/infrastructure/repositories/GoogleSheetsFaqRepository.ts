import { BaseSheetRepository } from '../google-sheets/BaseSheetRepository';
import type { GoogleSheetsClient } from '../google-sheets/GoogleSheetsClient';
import type { SheetCache } from '../google-sheets/SheetCache';
import type { IFaqRepository } from '@domain/repositories';
import type { Faq } from '@domain/entities';

/**
 * Kolom sheet `FAQ` (0-based):
 * A=0 faq_id | B=1 keyword | C=2 question | D=3 answer | E=4 is_active
 *
 * Kolom `keyword` berisi kata kunci dipisah koma, contoh:
 *   "harga,biaya,tarif,berapa"
 * Matching dilakukan case-insensitive terhadap query dari customer.
 */
const COL = {
  FAQ_ID:    0,
  KEYWORD:   1,
  QUESTION:  2,
  ANSWER:    3,
  IS_ACTIVE: 4,
} as const;

const SHEET = 'FAQ';

export class GoogleSheetsFaqRepository
  extends BaseSheetRepository
  implements IFaqRepository
{
  protected readonly sheetName = SHEET;

  constructor(client: GoogleSheetsClient, cache: SheetCache) {
    super(client, cache);
  }

  async findAll(): Promise<Faq[]> {
    const rows = await this.readRows();
    return rows.map((r) => this.toEntity(r));
  }

  async findActive(): Promise<Faq[]> {
    const all = await this.findAll();
    return all.filter((f) => f.isActive);
  }

  /**
   * Cari FAQ yang keyword-nya ada di dalam query customer.
   * Algoritma: untuk setiap FAQ aktif, split keyword by koma, cek apakah
   * salah satu keyword muncul di dalam query (substring match, case-insensitive).
   * Kembalikan FAQ pertama yang cocok, atau null jika tidak ada.
   */
  async search(query: string): Promise<Faq | null> {
    const active = await this.findActive();
    const lowerQuery = query.toLowerCase();

    for (const faq of active) {
      const keywords = faq.keyword
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);

      const matched = keywords.some((kw) => lowerQuery.includes(kw));
      if (matched) return faq;
    }

    return null;
  }

  async save(faq: Faq): Promise<void> {
    await this.appendRow(this.toRow(faq));
  }

  async update(faqId: string, data: Partial<Faq>): Promise<void> {
    const rowIndex = await this.findRowIndex(COL.FAQ_ID, faqId);
    if (rowIndex === -1) return;

    const existing = await this.findById(faqId);
    if (!existing) return;

    const updated: Faq = { ...existing, ...data };
    await this.updateRow(rowIndex, this.toRow(updated));
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async findById(faqId: string): Promise<Faq | null> {
    const rows = await this.readRows();
    const row = rows.find((r) => r[COL.FAQ_ID] === faqId);
    return row ? this.toEntity(row) : null;
  }

  private toEntity(row: string[]): Faq {
    return {
      faqId:     this.safeCell(row, COL.FAQ_ID),
      keyword:   this.safeCell(row, COL.KEYWORD),
      question:  this.safeCell(row, COL.QUESTION),
      answer:    this.safeCell(row, COL.ANSWER),
      isActive:  this.safeBool(row, COL.IS_ACTIVE),
    };
  }

  private toRow(f: Faq): string[] {
    return [f.faqId, f.keyword, f.question, f.answer, String(f.isActive)];
  }
}
