import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleSheetsServiceRepository } from '@infrastructure/repositories/GoogleSheetsServiceRepository';
import { GoogleSheetsScheduleRepository } from '@infrastructure/repositories/GoogleSheetsScheduleRepository';
import { GoogleSheetsFaqRepository } from '@infrastructure/repositories/GoogleSheetsFaqRepository';
import type { SheetCache } from '@infrastructure/google-sheets/SheetCache';
import type { GoogleSheetsClient } from '@infrastructure/google-sheets/GoogleSheetsClient';

// ── Mock Factory ─────────────────────────────────────────────────────────────

function makeMockClient(rows: string[][]): GoogleSheetsClient {
  return {
    readSheet:    vi.fn().mockResolvedValue([['header'], ...rows]),
    appendRow:    vi.fn().mockResolvedValue(rows.length + 2),
    updateRow:    vi.fn().mockResolvedValue(undefined),
    updateCell:   vi.fn().mockResolvedValue(undefined),
    clearAndWrite: vi.fn().mockResolvedValue(undefined),
  } as unknown as GoogleSheetsClient;
}

function makeMockCache(): SheetCache {
  return {
    get:         vi.fn().mockReturnValue(null), // selalu cache miss agar baca dari client
    set:         vi.fn(),
    invalidate:  vi.fn(),
    invalidateAll: vi.fn(),
  } as unknown as SheetCache;
}

// ── ServiceRepository ─────────────────────────────────────────────────────────

describe('GoogleSheetsServiceRepository', () => {
  const serviceRows = [
    ['SVC001', 'Senam Aerobik', '100000', 'true'],
    ['SVC002', 'Yoga', '120000', 'false'],
    ['SVC003', 'Zumba', '90000', 'true'],
  ];

  let repo: GoogleSheetsServiceRepository;

  beforeEach(() => {
    repo = new GoogleSheetsServiceRepository(
      makeMockClient(serviceRows),
      makeMockCache(),
    );
  });

  it('findAll() mengembalikan semua service', async () => {
    const result = await repo.findAll();
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ serviceId: 'SVC001', name: 'Senam Aerobik', price: 100000, isActive: true });
  });

  it('findActive() hanya mengembalikan service yang is_active=true', async () => {
    const result = await repo.findActive();
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.isActive)).toBe(true);
  });

  it('findById() mengembalikan service yang sesuai', async () => {
    const result = await repo.findById('SVC002');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Yoga');
    expect(result?.isActive).toBe(false);
  });

  it('findById() mengembalikan null jika tidak ditemukan', async () => {
    const result = await repo.findById('SVC999');
    expect(result).toBeNull();
  });

  it('price di-parse sebagai number', async () => {
    const result = await repo.findById('SVC001');
    expect(typeof result?.price).toBe('number');
    expect(result?.price).toBe(100000);
  });
});

// ── ScheduleRepository ────────────────────────────────────────────────────────

describe('GoogleSheetsScheduleRepository', () => {
  const scheduleRows = [
    ['SCH001', 'SVC001', '1', '07:00', '08:00', 'true'],  // Senin
    ['SCH002', 'SVC001', '3', '07:00', '08:00', 'true'],  // Rabu
    ['SCH003', 'SVC002', '5', '09:00', '10:00', 'false'], // Jumat, inactive
  ];

  let repo: GoogleSheetsScheduleRepository;

  beforeEach(() => {
    repo = new GoogleSheetsScheduleRepository(
      makeMockClient(scheduleRows),
      makeMockCache(),
    );
  });

  it('findActive() hanya mengembalikan jadwal aktif', async () => {
    const result = await repo.findActive();
    expect(result).toHaveLength(2);
  });

  it('findActiveByServiceId() filter berdasarkan serviceId', async () => {
    const result = await repo.findActiveByServiceId('SVC001');
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.serviceId === 'SVC001')).toBe(true);
  });

  it('dayOfWeek di-parse sebagai number', async () => {
    const result = await repo.findById('SCH001');
    expect(result?.dayOfWeek).toBe(1);
  });
});

// ── FaqRepository ─────────────────────────────────────────────────────────────

describe('GoogleSheetsFaqRepository', () => {
  const faqRows = [
    ['FAQ001', 'harga,biaya,tarif,berapa', 'Berapa harganya?', 'Harga mulai Rp90.000', 'true'],
    ['FAQ002', 'lokasi,alamat,dimana',     'Di mana lokasinya?', 'Jl. Contoh No. 1', 'true'],
    ['FAQ003', 'parkir',                   'Ada parkir?', 'Tersedia parkir gratis', 'false'],
  ];

  let repo: GoogleSheetsFaqRepository;

  beforeEach(() => {
    repo = new GoogleSheetsFaqRepository(
      makeMockClient(faqRows),
      makeMockCache(),
    );
  });

  it('search() menemukan FAQ berdasarkan keyword yang ada di query', async () => {
    const result = await repo.search('berapa harga senamnya?');
    expect(result).not.toBeNull();
    expect(result?.faqId).toBe('FAQ001');
  });

  it('search() case-insensitive', async () => {
    const result = await repo.search('LOKASI nya dimana ya kak');
    expect(result?.faqId).toBe('FAQ002');
  });

  it('search() mengembalikan null jika tidak ada yang cocok', async () => {
    const result = await repo.search('apakah ada promo bulan ini');
    expect(result).toBeNull();
  });

  it('search() tidak mengembalikan FAQ yang is_active=false', async () => {
    const result = await repo.search('parkir');
    expect(result).toBeNull();
  });

  it('findActive() hanya mengembalikan FAQ aktif', async () => {
    const result = await repo.findActive();
    expect(result).toHaveLength(2);
  });
});
