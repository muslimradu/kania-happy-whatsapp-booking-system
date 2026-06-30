/**
 * Unit test M7 — AI Fallback
 *
 * Test coverage:
 *  1. AiFallbackService.isEnabled — kombinasi env AI_ENABLED, OpenAiClient.isConfigured, Settings ai_enabled
 *  2. AiFallbackService.answer    — happy path, guardrail [DI_LUAR_TOPIK], error OpenAI → fallback statis
 *  3. Prompt building              — system prompt menyertakan FAQ aktif & nama bisnis
 *  4. MessageRouter integrasi      — fallback ke AI saat aktif, fallback statis saat nonaktif
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiFallbackService } from '@application/ai/AiFallbackService';
import { MessageRouter } from '@application/bot/MessageRouter';
import { FaqLookupService } from '@application/faq/FaqLookupService';
import type { IFaqRepository, ISettingsRepository, IServiceRepository } from '@domain/repositories';
import type { OpenAiClient } from '@infrastructure/openai/OpenAiClient';
import type { Faq } from '@domain/entities';

// ── Helpers ────────────────────────────────────────────────────────────────────

const SAMPLE_FAQS: Faq[] = [
  {
    faqId: 'FAQ001', keyword: 'harga,biaya,tarif', isActive: true,
    question: 'Berapa harga kelas?', answer: 'Harga mulai dari Rp80.000 per sesi.',
  },
  {
    faqId: 'FAQ002', keyword: 'pemula,baru mulai', isActive: true,
    question: 'Apakah cocok untuk pemula?', answer: 'Tentu, kami punya kelas khusus pemula.',
  },
];

function makeFaqRepo(faqs: Faq[] = SAMPLE_FAQS): Partial<IFaqRepository> {
  return {
    findActive: vi.fn().mockResolvedValue(faqs.filter((f) => f.isActive)),
  };
}

function makeSettingsRepo(overrides: Record<string, string> = {}): Partial<ISettingsRepository> {
  return {
    getValue: vi.fn().mockImplementation((key: string, def = '') => {
      return Promise.resolve(overrides[key] ?? def);
    }),
  };
}

function makeOpenAiClient(configured = true): Partial<OpenAiClient> {
  return {
    isConfigured: configured,
    chat: vi.fn().mockResolvedValue('Halo Kak! Kelas kami buka setiap hari 😊'),
  };
}

function makeServiceRepo(): Partial<IServiceRepository> {
  return {
    findActive: vi.fn().mockResolvedValue([]),
    findAll:    vi.fn().mockResolvedValue([]),
  };
}

// ── 1. isEnabled ─────────────────────────────────────────────────────────────

describe('AiFallbackService.isEnabled', () => {
  it('true jika OpenAiClient terkonfigurasi dan Settings ai_enabled tidak "false"', async () => {
    const svc = new AiFallbackService(
      makeFaqRepo() as IFaqRepository,
      makeSettingsRepo({ ai_enabled: 'true' }) as ISettingsRepository,
      makeOpenAiClient(true) as OpenAiClient,
    );
    expect(await svc.isEnabled()).toBe(true);
  });

  it('false jika OpenAiClient tidak terkonfigurasi (API key kosong)', async () => {
    const svc = new AiFallbackService(
      makeFaqRepo() as IFaqRepository,
      makeSettingsRepo({ ai_enabled: 'true' }) as ISettingsRepository,
      makeOpenAiClient(false) as OpenAiClient,
    );
    expect(await svc.isEnabled()).toBe(false);
  });

  it('false jika Settings ai_enabled = "false" (override runtime)', async () => {
    const svc = new AiFallbackService(
      makeFaqRepo() as IFaqRepository,
      makeSettingsRepo({ ai_enabled: 'false' }) as ISettingsRepository,
      makeOpenAiClient(true) as OpenAiClient,
    );
    expect(await svc.isEnabled()).toBe(false);
  });

  it('default true jika Settings ai_enabled tidak diisi sama sekali', async () => {
    const svc = new AiFallbackService(
      makeFaqRepo() as IFaqRepository,
      makeSettingsRepo({}) as ISettingsRepository, // tidak ada key ai_enabled
      makeOpenAiClient(true) as OpenAiClient,
    );
    expect(await svc.isEnabled()).toBe(true);
  });
});

// ── 2. answer ────────────────────────────────────────────────────────────────

describe('AiFallbackService.answer', () => {
  it('happy path: kembalikan jawaban dari OpenAiClient apa adanya', async () => {
    const openAi = makeOpenAiClient(true);
    const svc = new AiFallbackService(
      makeFaqRepo() as IFaqRepository,
      makeSettingsRepo({ ai_enabled: 'true' }) as ISettingsRepository,
      openAi as OpenAiClient,
    );

    const result = await svc.answer('Apakah ada kelas malam?');
    expect(result).toBe('Halo Kak! Kelas kami buka setiap hari 😊');
    expect(openAi.chat).toHaveBeenCalledTimes(1);
  });

  it('jika AI tidak aktif, kembalikan pesan out-of-scope baku tanpa memanggil OpenAI', async () => {
    const openAi = makeOpenAiClient(false);
    const svc = new AiFallbackService(
      makeFaqRepo() as IFaqRepository,
      makeSettingsRepo({ ai_enabled: 'true' }) as ISettingsRepository,
      openAi as OpenAiClient,
    );

    const result = await svc.answer('Pertanyaan apa saja');
    expect(result).toContain('Kania Happy');
    expect(openAi.chat).not.toHaveBeenCalled();
  });

  it('jika model membalas penanda [DI_LUAR_TOPIK], ganti dengan pesan baku', async () => {
    const openAi: Partial<OpenAiClient> = {
      isConfigured: true,
      chat: vi.fn().mockResolvedValue('[DI_LUAR_TOPIK]'),
    };
    const svc = new AiFallbackService(
      makeFaqRepo() as IFaqRepository,
      makeSettingsRepo({ ai_enabled: 'true' }) as ISettingsRepository,
      openAi as OpenAiClient,
    );

    const result = await svc.answer('Siapa presiden Indonesia?');
    expect(result).not.toContain('[DI_LUAR_TOPIK]');
    expect(result).toContain('Kania Happy');
  });

  it('jika OpenAiClient.chat melempar error, kembalikan fallback statis (tidak throw)', async () => {
    const openAi: Partial<OpenAiClient> = {
      isConfigured: true,
      chat: vi.fn().mockRejectedValue(new Error('OpenAI down')),
    };
    const svc = new AiFallbackService(
      makeFaqRepo() as IFaqRepository,
      makeSettingsRepo({ ai_enabled: 'true' }) as ISettingsRepository,
      openAi as OpenAiClient,
    );

    await expect(svc.answer('Pertanyaan apapun')).resolves.toContain('Kania Happy');
  });

  it('jika findActive FAQ melempar error, tetap lanjut tanpa throw (fallback statis)', async () => {
    const faqRepo: Partial<IFaqRepository> = {
      findActive: vi.fn().mockRejectedValue(new Error('Sheet error')),
    };
    const openAi = makeOpenAiClient(true);
    const svc = new AiFallbackService(
      faqRepo as IFaqRepository,
      makeSettingsRepo({ ai_enabled: 'true' }) as ISettingsRepository,
      openAi as OpenAiClient,
    );

    await expect(svc.answer('Test')).resolves.toBeTypeOf('string');
  });
});

// ── 3. Prompt building ──────────────────────────────────────────────────────

describe('AiFallbackService — prompt building', () => {
  it('system prompt menyertakan nama bisnis dan daftar FAQ aktif', async () => {
    const openAi: Partial<OpenAiClient> = {
      isConfigured: true,
      chat: vi.fn().mockResolvedValue('OK'),
    };
    const svc = new AiFallbackService(
      makeFaqRepo() as IFaqRepository,
      makeSettingsRepo({ ai_enabled: 'true', business_name: 'Kania Happy' }) as ISettingsRepository,
      openAi as OpenAiClient,
    );

    await svc.answer('Test pertanyaan');

    const callArgs = (openAi.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const systemMessage = callArgs.find((m: { role: string }) => m.role === 'system');

    expect(systemMessage.content).toContain('Kania Happy');
    expect(systemMessage.content).toContain('Berapa harga kelas?');
    expect(systemMessage.content).toContain('DI_LUAR_TOPIK');
  });

  it('FAQ inactive tidak ikut masuk ke prompt', async () => {
    const faqs: Faq[] = [
      ...SAMPLE_FAQS,
      { faqId: 'FAQ003', keyword: 'rahasia', isActive: false, question: 'Pertanyaan rahasia?', answer: 'Jawaban rahasia.' },
    ];
    const openAi: Partial<OpenAiClient> = {
      isConfigured: true,
      chat: vi.fn().mockResolvedValue('OK'),
    };
    const svc = new AiFallbackService(
      makeFaqRepo(faqs) as IFaqRepository,
      makeSettingsRepo({ ai_enabled: 'true' }) as ISettingsRepository,
      openAi as OpenAiClient,
    );

    await svc.answer('Test');

    const callArgs = (openAi.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const systemMessage = callArgs.find((m: { role: string }) => m.role === 'system');
    expect(systemMessage.content).not.toContain('Pertanyaan rahasia');
  });
});

// ── 4. MessageRouter integrasi ─────────────────────────────────────────────────

describe('MessageRouter — integrasi AI Fallback', () => {
  let mockStateStore: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> };
  let mockBookingFlowHandler: { handle: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockStateStore = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      clear: vi.fn(),
    };
    mockBookingFlowHandler = {
      handle: vi.fn().mockResolvedValue({ messages: ['Booking flow...'], done: false }),
    };
  });

  it('panggil AiFallbackService.answer ketika AI aktif dan pesan tidak match apapun', async () => {
    const faqService = new FaqLookupService(makeFaqRepo([]) as IFaqRepository);
    const mockAiFallbackService = {
      isEnabled: vi.fn().mockResolvedValue(true),
      answer:    vi.fn().mockResolvedValue('Jawaban dari AI 🤖'),
    };

    const router = new MessageRouter(
      makeServiceRepo() as IServiceRepository,
      makeSettingsRepo() as ISettingsRepository,
      faqService,
      {} as never,
      mockBookingFlowHandler as never,
      mockStateStore as never,
      mockAiFallbackService as never,
    );

    const result = await router.handle('628111', 'pertanyaan random yang tidak ada di FAQ');

    expect(mockAiFallbackService.answer).toHaveBeenCalledWith('pertanyaan random yang tidak ada di FAQ');
    expect(result.messages[0]).toBe('Jawaban dari AI 🤖');
  });

  it('pakai fallback statis (menu) ketika AI nonaktif, tanpa memanggil .answer', async () => {
    const faqService = new FaqLookupService(makeFaqRepo([]) as IFaqRepository);
    const mockAiFallbackService = {
      isEnabled: vi.fn().mockResolvedValue(false),
      answer:    vi.fn(),
    };

    const router = new MessageRouter(
      makeServiceRepo() as IServiceRepository,
      makeSettingsRepo() as ISettingsRepository,
      faqService,
      {} as never,
      mockBookingFlowHandler as never,
      mockStateStore as never,
      mockAiFallbackService as never,
    );

    const result = await router.handle('628111', 'pertanyaan random yang tidak ada di FAQ');

    expect(mockAiFallbackService.answer).not.toHaveBeenCalled();
    expect(result.messages[0]).toMatch(/1|2|3|4|5/); // menu statis
  });

  it('FAQ match tetap diprioritaskan, AI tidak dipanggil', async () => {
    const faqService = new FaqLookupService(makeFaqRepo(SAMPLE_FAQS) as IFaqRepository);
    const mockAiFallbackService = {
      isEnabled: vi.fn().mockResolvedValue(true),
      answer:    vi.fn(),
    };

    const router = new MessageRouter(
      makeServiceRepo() as IServiceRepository,
      makeSettingsRepo() as ISettingsRepository,
      faqService,
      {} as never,
      mockBookingFlowHandler as never,
      mockStateStore as never,
      mockAiFallbackService as never,
    );

    const result = await router.handle('628111', 'berapa tarifnya?');

    expect(mockAiFallbackService.answer).not.toHaveBeenCalled();
    expect(result.messages[0]).toContain('Rp80.000');
  });
});
