/**
 * AiFallbackService — M7
 *
 * Dipanggil MessageRouter saat pesan customer TIDAK match keyword intent
 * apapun DAN tidak ketemu di FAQ. Tujuannya menjawab pertanyaan umum
 * seputar Kania Happy yang belum ter-cover di FAQ statis, tanpa
 * membiarkan bot menjawab topik di luar konteks bisnis (guardrail).
 *
 * Guardrail diterapkan di DUA lapis:
 *  1. System prompt yang eksplisit membatasi topik & gaya jawaban,
 *     plus instruksi format penolakan baku untuk pertanyaan di luar topik.
 *  2. Daftar FAQ aktif disertakan sebagai konteks (bukan database
 *     eksternal) — supaya jawaban AI konsisten dengan FAQ yang sudah
 *     di-maintain admin, bukan mengarang informasi baru.
 *
 * AI HANYA dipanggil jika:
 *  - AI_ENABLED=true (di env)
 *  - FAQ lookup sebelumnya tidak menemukan match
 * Ini sengaja, supaya tidak boros token untuk pertanyaan yang sudah
 * ada jawaban siapnya di FAQ.
 */

import type { IFaqRepository, ISettingsRepository } from '@domain/repositories';
import type { OpenAiClient, ChatMessage } from '@infrastructure/openai/OpenAiClient';
import { SETTING_KEYS } from '@domain/entities/index';
import { env } from '@shared/config/env';
import { logger } from '@infrastructure/logger/Logger';

const OUT_OF_SCOPE_REPLY =
  'Maaf Kak, untuk pertanyaan itu saya kurang bisa bantu 🙏\n\n' +
  'Saya hanya bisa bantu seputar info layanan, jadwal, booking, dan pembayaran ' +
  'di *Kania Happy*. Untuk hal lain, silakan ketik *5* untuk hubungi admin ya 😊';

export class AiFallbackService {
  constructor(
    private readonly faqRepo:      IFaqRepository,
    private readonly settingsRepo: ISettingsRepository,
    private readonly openAiClient: OpenAiClient,
  ) {}

  /**
   * Apakah fitur AI Fallback aktif (env + Settings).
   * Settings `ai_enabled` boleh override env saat runtime tanpa restart;
   * env AI_ENABLED tetap jadi kill-switch utama (default aman).
   */
  async isEnabled(): Promise<boolean> {
    if (!env.AI_ENABLED) return false;
    if (!this.openAiClient.isConfigured) return false;

    const settingValue = await this.settingsRepo.getValue(SETTING_KEYS.AI_ENABLED, 'true');
    return settingValue !== 'false';
  }

  /**
   * Hasilkan jawaban AI untuk pertanyaan customer di luar FAQ.
   * Tidak pernah throw — kegagalan apapun (API down, guardrail trigger,
   * dll) dikembalikan sebagai pesan fallback yang aman untuk dikirim
   * langsung ke customer.
   */
  async answer(question: string): Promise<string> {
    try {
      const enabled = await this.isEnabled();
      if (!enabled) {
        return OUT_OF_SCOPE_REPLY;
      }

      const businessName = await this.settingsRepo.getValue(
        SETTING_KEYS.BUSINESS_NAME, 'Kania Happy',
      );
      const faqs = await this.faqRepo.findActive();

      const messages = this.buildMessages(businessName, faqs, question);
      const reply = await this.openAiClient.chat(messages);

      // Guardrail lapis ke-2: jika model "menyerah" dan menulis penanda
      // out-of-scope yang diminta system prompt, ganti dengan pesan baku
      // supaya format penolakan tetap konsisten ke semua customer.
      if (reply.includes('[DI_LUAR_TOPIK]')) {
        return OUT_OF_SCOPE_REPLY;
      }

      return reply;
    } catch (err) {
      logger.warn('AiFallbackService: gagal menghasilkan jawaban AI, pakai fallback statis', {
        error: err,
      });
      return OUT_OF_SCOPE_REPLY;
    }
  }

  // ── Prompt building ──────────────────────────────────────────────────────────

  private buildMessages(
    businessName: string,
    faqs: Array<{ question: string; answer: string }>,
    question: string,
  ): ChatMessage[] {
    const faqContext = faqs.length > 0
      ? faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
      : '(belum ada data FAQ)';

    const systemPrompt =
      `Kamu adalah asisten WhatsApp untuk "${businessName}", sebuah sanggar senam. ` +
      `Tugasmu HANYA menjawab pertanyaan customer seputar: layanan/kelas senam, jadwal, ` +
      `cara booking, metode pembayaran, dan info umum sanggar.\n\n` +
      `ATURAN KETAT:\n` +
      `1. Jika pertanyaan customer TIDAK berkaitan dengan topik di atas (mis. ` +
      `politik, coding, soal pribadi, topik umum lain), jangan dijawab — balas ` +
      `PERSIS dengan teks "[DI_LUAR_TOPIK]" saja, tanpa kata lain.\n` +
      `2. Gunakan Bahasa Indonesia santai dan ramah, sapa dengan "Kak", boleh pakai emoji secukupnya.\n` +
      `3. Jawaban singkat, maksimal 4-5 kalimat.\n` +
      `4. Jika ada FAQ yang relevan di bawah, dasarkan jawabanmu pada FAQ tersebut — ` +
      `jangan mengarang info baru (harga, jadwal spesifik, dll) yang tidak ada di FAQ.\n` +
      `5. Jangan pernah mengaku sebagai AI/ChatGPT/OpenAI — kamu adalah asisten ${businessName}.\n\n` +
      `Daftar FAQ yang sudah ada:\n${faqContext}`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ];
  }
}
