/**
 * OpenAiClient — M7
 *
 * Thin wrapper di sekitar OpenAI SDK. Tanggung jawabnya HANYA komunikasi
 * dengan API OpenAI — semua logika guardrail/prompt-building ada di
 * AiFallbackService (application layer), bukan di sini.
 *
 * Desain fail-safe: jika OPENAI_API_KEY tidak diisi, client tetap bisa
 * dibuat (constructor tidak throw), tapi setiap pemanggilan `chat()`
 * akan langsung melempar AppError tanpa memanggil API — supaya
 * AiFallbackService bisa menangkapnya dan fallback ke pesan default,
 * bukan meng-crash server.
 */

import OpenAI from 'openai';
import { env } from '@shared/config/env';
import { AppError } from '@shared/types';
import { logger } from '@infrastructure/logger/Logger';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class OpenAiClient {
  private readonly client: OpenAI | null;

  constructor() {
    this.client = env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
      : null;

    if (!this.client) {
      logger.warn('OpenAiClient: OPENAI_API_KEY tidak diisi — AI Fallback tidak akan berfungsi');
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Kirim percakapan ke OpenAI Chat Completions, kembalikan teks balasan.
   * Melempar AppError (EXTERNAL_SERVICE_ERROR) jika client belum
   * dikonfigurasi atau API mengembalikan error/respons kosong.
   */
  async chat(messages: ChatMessage[], maxTokens = 300): Promise<string> {
    if (!this.client) {
      throw AppError.externalService('OpenAI API key belum dikonfigurasi');
    }

    try {
      const completion = await this.client.chat.completions.create({
        model:       env.OPENAI_MODEL,
        messages,
        max_tokens:  maxTokens,
        temperature: 0.4,
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) {
        throw AppError.externalService('OpenAI mengembalikan respons kosong');
      }

      return text;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('OpenAiClient: gagal memanggil OpenAI API', { error: err });
      throw AppError.externalService('Gagal menghubungi layanan AI');
    }
  }
}
