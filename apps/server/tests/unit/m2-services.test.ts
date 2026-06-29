import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FaqLookupService } from '@application/faq/FaqLookupService';
import { GetAvailableScheduleService } from '@application/schedule/GetAvailableScheduleService';
import { MessageRouter } from '@application/bot/MessageRouter';
import type { IFaqRepository, IScheduleRepository, IServiceRepository, ISettingsRepository } from '@domain/repositories';
import type { Faq } from '@domain/entities';
import type { Schedule } from '@domain/entities/Schedule';
import type { Service } from '@domain/entities/Service';
import { addDays, todayJakarta } from '@shared/utils/dateHelper';

// ── Mock Factories ─────────────────────────────────────────────────────────────

function makeFaqRepo(faqs: Faq[]): IFaqRepository {
  return {
    findAll:    vi.fn().mockResolvedValue(faqs),
    findActive: vi.fn().mockResolvedValue(faqs.filter((f) => f.isActive)),
    search:     vi.fn(),
    save:       vi.fn(),
    update:     vi.fn(),
  } as unknown as IFaqRepository;
}

function makeScheduleRepo(schedules: Schedule[]): IScheduleRepository {
  return {
    findAll:               vi.fn().mockResolvedValue(schedules),
    findById:              vi.fn(),
    findActive:            vi.fn().mockResolvedValue(schedules.filter((s) => s.isActive)),
    findActiveByServiceId: vi.fn().mockImplementation((id: string) =>
      Promise.resolve(schedules.filter((s) => s.isActive && s.serviceId === id)),
    ),
    save:   vi.fn(),
    update: vi.fn(),
  } as unknown as IScheduleRepository;
}

function makeServiceRepo(services: Service[]): IServiceRepository {
  return {
    findAll:    vi.fn().mockResolvedValue(services),
    findById:   vi.fn().mockImplementation((id: string) =>
      Promise.resolve(services.find((s) => s.serviceId === id) ?? null),
    ),
    findActive: vi.fn().mockResolvedValue(services.filter((s) => s.isActive)),
    save:       vi.fn(),
    update:     vi.fn(),
  } as unknown as IServiceRepository;
}

function makeSettingsRepo(overrides: Record<string, string> = {}): ISettingsRepository {
  return {
    findAll:   vi.fn().mockResolvedValue([]),
    findByKey: vi.fn(),
    getValue:  vi.fn().mockImplementation((key: string, def = '') =>
      Promise.resolve(overrides[key] ?? def),
    ),
    set: vi.fn(),
  } as unknown as ISettingsRepository;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_FAQS: Faq[] = [
  { faqId: 'FAQ001', keyword: 'harga,biaya,tarif,berapa', question: 'Berapa harganya?',   answer: 'Harga mulai Rp80.000',    isActive: true  },
  { faqId: 'FAQ002', keyword: 'lokasi,alamat,dimana',     question: 'Di mana lokasinya?', answer: 'Jl. Kania No. 1',        isActive: true  },
  { faqId: 'FAQ003', keyword: 'parkir',                   question: 'Ada parkir?',         answer: 'Parkir gratis tersedia', isActive: false },
];

const SAMPLE_SERVICES: Service[] = [
  { serviceId: 'SVC001', name: 'Senam Aerobik', price: 80000,  isActive: true  },
  { serviceId: 'SVC002', name: 'Zumba',         price: 90000,  isActive: true  },
  { serviceId: 'SVC003', name: 'Yoga',          price: 100000, isActive: false },
];

// today = Senin (1), schedule di hari Senin = immediate occurrence hari ini
const today = todayJakarta();
const SAMPLE_SCHEDULES: Schedule[] = [
  { scheduleId: 'SCH001', serviceId: 'SVC001', dayOfWeek: 1, timeStart: '07:00', timeEnd: '08:00', isActive: true  }, // Senin
  { scheduleId: 'SCH002', serviceId: 'SVC001', dayOfWeek: 3, timeStart: '07:00', timeEnd: '08:00', isActive: true  }, // Rabu
  { scheduleId: 'SCH003', serviceId: 'SVC002', dayOfWeek: 5, timeStart: '09:00', timeEnd: '10:00', isActive: true  }, // Jumat
  { scheduleId: 'SCH004', serviceId: 'SVC002', dayOfWeek: 2, timeStart: '09:00', timeEnd: '10:00', isActive: false }, // Selasa, inactive
];

// ── FaqLookupService ──────────────────────────────────────────────────────────

describe('FaqLookupService', () => {
  let service: FaqLookupService;

  beforeEach(() => {
    service = new FaqLookupService(makeFaqRepo(SAMPLE_FAQS));
  });

  it('menemukan FAQ berdasarkan keyword yang ada di pesan', async () => {
    const result = await service.lookup('berapa harga kelas senamnya?');
    expect(result?.faqId).toBe('FAQ001');
  });

  it('matching case-insensitive', async () => {
    const result = await service.lookup('LOKASI nya dimana ya kak');
    expect(result?.faqId).toBe('FAQ002');
  });

  it('mengembalikan null jika tidak ada FAQ yang cocok', async () => {
    const result = await service.lookup('apakah ada promo bulan ini?');
    expect(result).toBeNull();
  });

  it('tidak mengembalikan FAQ yang is_active=false', async () => {
    const result = await service.lookup('parkir');
    expect(result).toBeNull();
  });

  it('memilih FAQ dengan keyword terpanjang jika ada lebih dari 1 match', async () => {
    // "harga lokasi" cocok dengan FAQ001 (keyword "harga") dan FAQ002 (keyword "lokasi")
    // FAQ002 keyword terpanjang yang match adalah "lokasi" (6 char) vs "harga" (5 char)
    const result = await service.lookup('harga dan lokasi');
    expect(result?.faqId).toBe('FAQ002');
  });
});

// ── GetAvailableScheduleService ───────────────────────────────────────────────

describe('GetAvailableScheduleService', () => {
  let service: GetAvailableScheduleService;

  beforeEach(() => {
    service = new GetAvailableScheduleService(
      makeScheduleRepo(SAMPLE_SCHEDULES),
      makeServiceRepo(SAMPLE_SERVICES),
      makeSettingsRepo({ 'schedule_lookahead_days': '7' }),
    );
  });

  it('mengembalikan occurrence dari jadwal aktif saja', async () => {
    const result = await service.getOccurrences(today);
    const scheduleIds = result.map((o) => o.schedule.scheduleId);
    expect(scheduleIds).not.toContain('SCH004'); // inactive
  });

  it('tidak menggunakan service yang inactive', async () => {
    const result = await service.getOccurrences(today);
    const serviceIds = result.map((o) => o.schedule.serviceId);
    expect(serviceIds).not.toContain('SVC003'); // inactive
  });

  it('occurrence diurutkan berdasarkan tanggal terdekat', async () => {
    const result = await service.getOccurrences(today);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].date >= result[i - 1].date).toBe(true);
    }
  });

  it('semua occurrence berada dalam window lookahead', async () => {
    const result = await service.getOccurrences(today);
    const toDate = addDays(today, 6); // 7 hari inclusive
    result.forEach((o) => {
      expect(o.date >= today).toBe(true);
      expect(o.date <= toDate).toBe(true);
    });
  });

  it('occurrence mengandung nama dan harga service yang benar', async () => {
    const result = await service.getOccurrences(today);
    const aerobik = result.find((o) => o.schedule.serviceId === 'SVC001');
    expect(aerobik?.serviceName).toBe('Senam Aerobik');
    expect(aerobik?.servicePrice).toBe(80000);
  });

  it('filter per serviceId bekerja', async () => {
    const result = await service.getOccurrences(today, 'SVC001');
    expect(result.every((o) => o.schedule.serviceId === 'SVC001')).toBe(true);
  });
});

// ── MessageRouter ─────────────────────────────────────────────────────────────

describe('MessageRouter', () => {
  let router: MessageRouter;
  let faqService: FaqLookupService;
  let scheduleService: GetAvailableScheduleService;

  beforeEach(() => {
    faqService = new FaqLookupService(makeFaqRepo(SAMPLE_FAQS));
    scheduleService = new GetAvailableScheduleService(
      makeScheduleRepo(SAMPLE_SCHEDULES),
      makeServiceRepo(SAMPLE_SERVICES),
      makeSettingsRepo({ 'schedule_lookahead_days': '7' }),
    );
    const mockBookingFlowHandler = {
      handle: vi.fn().mockResolvedValue({ messages: ['Booking flow...'], done: false }),
    };
    const mockStateStore = {
      get: vi.fn().mockReturnValue(null), // tidak ada flow aktif
      set: vi.fn(),
      clear: vi.fn(),
    };
    router = new MessageRouter(
      makeServiceRepo(SAMPLE_SERVICES),
      makeSettingsRepo(),
      faqService,
      scheduleService,
      mockBookingFlowHandler as any,
      mockStateStore as any,
    );
  });

  it('menu "1" mengembalikan daftar layanan', async () => {
    const result = await router.handle('628111', '1');
    const reply = result.messages[0];
    expect(reply).toContain('Layanan');
    expect(reply).toContain('Senam Aerobik');
    expect(reply).toContain('Zumba');
    // Yoga tidak muncul karena inactive
    expect(reply).not.toContain('Yoga');
  });

  it('menu "2" mengembalikan jadwal', async () => {
    const result = await router.handle('628111', '2');
    const reply = result.messages[0];
    expect(reply).toContain('Jadwal');
  });

  it('menu "3" mengembalikan pesan booking', async () => {
    const result = await router.handle('628111', '3');
    const reply = result.messages[0];
    expect(reply.toLowerCase()).toContain('booking');
  });

  it('menu "5" mengembalikan info kontak', async () => {
    const result = await router.handle('628111', '5');
    const reply = result.messages[0];
    expect(reply.toLowerCase()).toMatch(/admin|kontak|hubungi/);
  });

  it('pesan salam mengembalikan welcome message', async () => {
    const result = await router.handle('628111', 'halo kak');
    const reply = result.messages[0];
    expect(reply).toContain('Kania Happy');
  });

  it('keyword layanan mengembalikan daftar layanan', async () => {
    const result = await router.handle('628111', 'ada kelas apa saja ya?');
    const reply = result.messages[0];
    expect(reply).toContain('Layanan');
  });

  it('keyword jadwal mengembalikan jadwal', async () => {
    // Pakai kata "jadwal" saja tanpa "kelas" agar tidak tertangkap SERVICE_KEYWORDS
    const result = await router.handle('628111', 'jadwal dong');
    const reply = result.messages[0];
    expect(reply).toContain('Jadwal');
  });

  it('pesan yang cocok FAQ mengembalikan jawaban FAQ', async () => {
    // "berapa" ada di FAQ keyword tapi bukan di SERVICE_KEYWORDS — tidak ambigu
    const result = await router.handle('628111', 'berapa ya?');
    const reply = result.messages[0];
    expect(reply).toContain('Rp80.000');
  });

  it('pesan tidak dikenal mengembalikan fallback message dengan menu', async () => {
    const result = await router.handle('628111', 'bla bla bla random pesan');
    const reply = result.messages[0];
    expect(reply).toMatch(/1|2|3|4|5/); // tampilkan menu
  });

  it('harga layanan diformat sebagai Rupiah', async () => {
    const result = await router.handle('628111', '1');
    const reply = result.messages[0];
    expect(reply).toContain('Rp');
  });
});