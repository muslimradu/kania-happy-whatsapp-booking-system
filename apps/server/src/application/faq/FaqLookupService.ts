import type { IFaqRepository } from '@domain/repositories';
import type { Faq } from '@domain/entities';
import { logger } from '@infrastructure/logger/Logger';

/**
 * FaqLookupService
 *
 * Tanggung jawab: mencari jawaban FAQ yang paling cocok untuk pesan customer.
 *
 * Strategi matching (berurutan, berhenti di match pertama):
 *  1. Cek setiap keyword (dipisah koma) dari FAQ aktif.
 *  2. Matching case-insensitive substring — pesan customer mengandung keyword.
 *  3. Jika lebih dari 1 FAQ cocok, ambil yang keywordnya paling panjang
 *     (lebih spesifik = lebih relevan).
 */
export class FaqLookupService {
  constructor(private readonly faqRepo: IFaqRepository) {}

  /**
   * Cari FAQ yang cocok untuk pesan masuk.
   * Kembalikan FAQ jika ditemukan, null jika tidak ada.
   */
  async lookup(message: string): Promise<Faq | null> {
    const normalized = message.toLowerCase().trim();

    let faqs: Faq[];
    try {
      faqs = await this.faqRepo.findActive();
    } catch (err) {
      logger.error('FaqLookupService: gagal mengambil FAQ', { error: err });
      return null;
    }

    const matches: Array<{ faq: Faq; longestKeyword: number }> = [];

    for (const faq of faqs) {
      const keywords = faq.keyword
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k.length > 0);

      for (const kw of keywords) {
        if (normalized.includes(kw)) {
          const prev = matches.find((m) => m.faq.faqId === faq.faqId);
          if (prev) {
            if (kw.length > prev.longestKeyword) prev.longestKeyword = kw.length;
          } else {
            matches.push({ faq, longestKeyword: kw.length });
          }
          break; // satu FAQ cukup satu match, tidak perlu cek keyword lain
        }
      }
    }

    if (matches.length === 0) return null;

    // Ambil FAQ dengan keyword terpanjang (paling spesifik)
    matches.sort((a, b) => b.longestKeyword - a.longestKeyword);
    const result = matches[0].faq;

    logger.debug('FaqLookupService: FAQ ditemukan', {
      faqId: result.faqId,
      message: normalized.slice(0, 50),
    });

    return result;
  }
}
