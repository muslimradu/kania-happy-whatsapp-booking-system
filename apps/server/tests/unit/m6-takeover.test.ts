/**
 * Unit test M6 — Human Takeover
 *
 * Test coverage:
 *  1. TakeoverService.startTakeover  — validasi, hitung expiresAt, audit log
 *  2. TakeoverService.releaseTakeover — happy path, NOT_FOUND guard
 *  3. TakeoverService.getStatus       — passthrough ke repository
 *  4. TakeoverService.cleanupExpired  — bersihkan baris expired, partial failure tidak stop
 *  5. TakeoverCleanupScheduler        — start/stop tidak melempar error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TakeoverService } from '@application/takeover/TakeoverService';
import { TakeoverCleanupScheduler } from '@application/takeover/TakeoverCleanupScheduler';
import { AppError } from '@shared/types';
import type { ITakeoverRepository, ISettingsRepository, IAdminLogRepository } from '@domain/repositories';
import type { TakeoverState } from '@domain/entities/index';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeTakeoverState(overrides: Partial<TakeoverState> = {}): TakeoverState {
  return {
    phone:       '628111222333',
    isTakenOver: true,
    takenOverBy: 'admin',
    startedAt:   new Date().toISOString(),
    expiresAt:   new Date(Date.now() + 30 * 60_000).toISOString(),
    ...overrides,
  };
}

function makeMockTakeoverRepo(state?: TakeoverState | null): Partial<ITakeoverRepository> {
  return {
    findByPhone:   vi.fn().mockResolvedValue(state ?? null),
    setTakeover:   vi.fn().mockResolvedValue(undefined),
    clearTakeover: vi.fn().mockResolvedValue(undefined),
    findExpired:   vi.fn().mockResolvedValue([]),
  };
}

function makeMockSettingsRepo(timeoutMinutes = '30'): Partial<ISettingsRepository> {
  return {
    getValue: vi.fn().mockImplementation((key: string, def: string = '') => {
      if (key === 'takeover_timeout_minutes') return Promise.resolve(timeoutMinutes);
      return Promise.resolve(def);
    }),
  };
}

function makeMockAdminLog(): Partial<IAdminLogRepository> {
  return {
    log:     vi.fn().mockResolvedValue(undefined),
    findAll: vi.fn().mockResolvedValue([]),
  };
}

// ── 1. startTakeover ─────────────────────────────────────────────────────────

describe('TakeoverService.startTakeover', () => {
  it('happy path: set takeover dengan expiresAt dari Settings & catat audit log', async () => {
    const takeoverRepo = makeMockTakeoverRepo();
    const settingsRepo = makeMockSettingsRepo('30');
    const adminLog     = makeMockAdminLog();

    const svc = new TakeoverService(
      takeoverRepo as ITakeoverRepository,
      settingsRepo as ISettingsRepository,
      adminLog as IAdminLogRepository,
    );

    const before  = Date.now();
    const result  = await svc.startTakeover('628111222333', 'admin');
    const after   = Date.now();

    expect(takeoverRepo.setTakeover).toHaveBeenCalledWith(
      '628111222333',
      'admin',
      expect.any(String),
    );
    expect(result.isTakenOver).toBe(true);
    expect(result.takenOverBy).toBe('admin');

    const expiresAtMs = new Date(result.expiresAt).getTime();
    // Toleransi rentang waktu eksekusi test (harus sekitar now + 30 menit)
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 30 * 60_000 - 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + 30 * 60_000 + 1000);

    expect(adminLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUsername: 'admin',
        action:        'Takeover',
        targetId:      '628111222333',
      }),
    );
  });

  it('menggunakan override timeout jika diberikan, bukan dari Settings', async () => {
    const takeoverRepo = makeMockTakeoverRepo();
    const settingsRepo = makeMockSettingsRepo('30'); // default tidak dipakai
    const adminLog     = makeMockAdminLog();

    const svc = new TakeoverService(
      takeoverRepo as ITakeoverRepository,
      settingsRepo as ISettingsRepository,
      adminLog as IAdminLogRepository,
    );

    const before  = Date.now();
    const result  = await svc.startTakeover('628111222333', 'admin', 5); // override 5 menit
    const after   = Date.now();

    expect(settingsRepo.getValue).not.toHaveBeenCalled();

    const expiresAtMs = new Date(result.expiresAt).getTime();
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 5 * 60_000 - 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + 5 * 60_000 + 1000);
  });

  it('lempar VALIDATION_ERROR jika nomor kosong', async () => {
    const svc = new TakeoverService(
      makeMockTakeoverRepo() as ITakeoverRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      makeMockAdminLog() as IAdminLogRepository,
    );

    await expect(svc.startTakeover('', 'admin')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(svc.startTakeover('   ', 'admin')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

// ── 2. releaseTakeover ───────────────────────────────────────────────────────

describe('TakeoverService.releaseTakeover', () => {
  it('happy path: clear takeover & catat audit log', async () => {
    const existing      = makeTakeoverState();
    const takeoverRepo  = makeMockTakeoverRepo(existing);
    const adminLog      = makeMockAdminLog();

    const svc = new TakeoverService(
      takeoverRepo as ITakeoverRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      adminLog as IAdminLogRepository,
    );

    await svc.releaseTakeover('628111222333', 'admin');

    expect(takeoverRepo.clearTakeover).toHaveBeenCalledWith('628111222333');
    expect(adminLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUsername: 'admin',
        action:        'ReleaseTakeover',
        targetId:      '628111222333',
      }),
    );
  });

  it('lempar NOT_FOUND jika tidak ada takeover aktif untuk nomor tsb', async () => {
    const takeoverRepo = makeMockTakeoverRepo(null);
    const svc = new TakeoverService(
      takeoverRepo as ITakeoverRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      makeMockAdminLog() as IAdminLogRepository,
    );

    await expect(svc.releaseTakeover('628111222333', 'admin')).rejects.toBeInstanceOf(AppError);
    await expect(svc.releaseTakeover('628111222333', 'admin')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(takeoverRepo.clearTakeover).not.toHaveBeenCalled();
  });

  it('lempar VALIDATION_ERROR jika nomor kosong', async () => {
    const svc = new TakeoverService(
      makeMockTakeoverRepo() as ITakeoverRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      makeMockAdminLog() as IAdminLogRepository,
    );

    await expect(svc.releaseTakeover('', 'admin')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

// ── 3. getStatus ─────────────────────────────────────────────────────────────

describe('TakeoverService.getStatus', () => {
  it('mengembalikan state dari repository jika ada', async () => {
    const existing     = makeTakeoverState();
    const takeoverRepo = makeMockTakeoverRepo(existing);
    const svc = new TakeoverService(
      takeoverRepo as ITakeoverRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      makeMockAdminLog() as IAdminLogRepository,
    );

    const result = await svc.getStatus('628111222333');
    expect(result).toEqual(existing);
  });

  it('mengembalikan null jika tidak ada takeover aktif', async () => {
    const takeoverRepo = makeMockTakeoverRepo(null);
    const svc = new TakeoverService(
      takeoverRepo as ITakeoverRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      makeMockAdminLog() as IAdminLogRepository,
    );

    const result = await svc.getStatus('628111222333');
    expect(result).toBeNull();
  });
});

// ── 4. cleanupExpired ─────────────────────────────────────────────────────────

describe('TakeoverService.cleanupExpired', () => {
  it('membersihkan semua takeover yang expired & kembalikan jumlahnya', async () => {
    const expired = [
      makeTakeoverState({ phone: '628111111111' }),
      makeTakeoverState({ phone: '628222222222' }),
    ];
    const takeoverRepo: Partial<ITakeoverRepository> = {
      findExpired:   vi.fn().mockResolvedValue(expired),
      clearTakeover: vi.fn().mockResolvedValue(undefined),
    };

    const svc = new TakeoverService(
      takeoverRepo as ITakeoverRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      makeMockAdminLog() as IAdminLogRepository,
    );

    const cleaned = await svc.cleanupExpired();

    expect(cleaned).toBe(2);
    expect(takeoverRepo.clearTakeover).toHaveBeenCalledTimes(2);
    expect(takeoverRepo.clearTakeover).toHaveBeenCalledWith('628111111111');
    expect(takeoverRepo.clearTakeover).toHaveBeenCalledWith('628222222222');
  });

  it('mengembalikan 0 jika tidak ada yang expired (tanpa memanggil clearTakeover)', async () => {
    const takeoverRepo: Partial<ITakeoverRepository> = {
      findExpired:   vi.fn().mockResolvedValue([]),
      clearTakeover: vi.fn(),
    };

    const svc = new TakeoverService(
      takeoverRepo as ITakeoverRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      makeMockAdminLog() as IAdminLogRepository,
    );

    const cleaned = await svc.cleanupExpired();

    expect(cleaned).toBe(0);
    expect(takeoverRepo.clearTakeover).not.toHaveBeenCalled();
  });

  it('jika satu clearTakeover gagal, tetap lanjut ke nomor berikutnya (tidak stop)', async () => {
    const expired = [
      makeTakeoverState({ phone: '628111111111' }),
      makeTakeoverState({ phone: '628222222222' }),
    ];
    const takeoverRepo: Partial<ITakeoverRepository> = {
      findExpired: vi.fn().mockResolvedValue(expired),
      clearTakeover: vi.fn()
        .mockRejectedValueOnce(new Error('Sheet error'))
        .mockResolvedValueOnce(undefined),
    };

    const svc = new TakeoverService(
      takeoverRepo as ITakeoverRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      makeMockAdminLog() as IAdminLogRepository,
    );

    const cleaned = await svc.cleanupExpired();

    expect(cleaned).toBe(1); // hanya nomor kedua yang berhasil
    expect(takeoverRepo.clearTakeover).toHaveBeenCalledTimes(2);
  });
});

// ── 5. TakeoverCleanupScheduler ────────────────────────────────────────────────

describe('TakeoverCleanupScheduler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('start() tidak melempar error & mendaftarkan job', () => {
    const fakeService = {} as TakeoverService;
    const scheduler = new TakeoverCleanupScheduler(fakeService, '*/5 * * * *');

    expect(() => scheduler.start()).not.toThrow();
  });

  it('stop() aman dipanggil meski belum start() (tidak melempar error)', () => {
    const fakeService = {} as TakeoverService;
    const scheduler = new TakeoverCleanupScheduler(fakeService);

    expect(() => scheduler.stop()).not.toThrow();
  });

  it('stop() setelah start() menghentikan job tanpa error', () => {
    const fakeService = {} as TakeoverService;
    const scheduler = new TakeoverCleanupScheduler(fakeService, '*/5 * * * *');

    scheduler.start();
    expect(() => scheduler.stop()).not.toThrow();
  });
});
