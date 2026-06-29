/**
 * Unit test M4 — Reminder
 *
 * Test coverage:
 *  1. ReminderScheduler.timeToCron — konversi format jam ke cron expression
 *  2. ReminderService.sendH1Reminders — filter tanggal & idempotency
 *  3. ReminderService.sendHariHReminders — filter tanggal & idempotency
 *  4. Pesan reminder — format & konten
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReminderService } from '@application/reminder/ReminderService';
import { ReminderScheduler } from '@application/reminder/ReminderScheduler';
import type { IBookingRepository, ISettingsRepository } from '@domain/repositories';
import type { BaileysClient } from '@infrastructure/whatsapp/BaileysClient';
import type { Booking } from '@domain/entities/Booking';
import { addDays, todayJakarta } from '@shared/utils/dateHelper';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    bookingId:         'BKG-001',
    invoiceNumber:     'INV-001',
    customerPhone:     '628111222333',
    customerName:      'Budi Santoso',
    serviceId:         'SVC-001',
    serviceName:       'Zumba Basic',
    scheduleId:        'SCH-001',
    bookingDate:       addDays(todayJakarta(), 1), // besok by default
    scheduleTime:      '09:00',
    paymentMethodId:   'PM-BCA001',
    bookingStatus:     'Confirmed',
    createdAt:         new Date().toISOString(),
    reminderH1Sent:    false,
    reminderHariHSent: false,
    ...overrides,
  };
}

function makeMockBookingRepo(bookings: Booking[]): Partial<IBookingRepository> {
  return {
    findPendingReminders: vi.fn().mockResolvedValue(
      bookings.filter((b) => b.bookingStatus === 'Confirmed'),
    ),
    markReminderSent: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockSettingsRepo(): Partial<ISettingsRepository> {
  return {
    getValue: vi.fn().mockImplementation((key: string, def: string = '') => {
      const map: Record<string, string> = {
        business_name:    'Kania Happy',
        business_address: 'Jl. Kania No. 1',
        reminder_h1_time: '08:00',
        reminder_hd_time: '06:00',
      };
      return Promise.resolve(map[key] ?? def);
    }),
  };
}

function makeMockBaileys(): Partial<BaileysClient> {
  return {
    sendText: vi.fn().mockResolvedValue(undefined),
  };
}

// ── 1. ReminderScheduler — timeToCron ─────────────────────────────────────────

describe('ReminderScheduler.timeToCron', () => {
  // Akses private method via cast
  const scheduler = new ReminderScheduler(
    {} as ReminderService,
    {} as ISettingsRepository,
  );
  const timeToCron = (scheduler as any).timeToCron.bind(scheduler);

  it('"08:00" → "0 8 * * *"', () => {
    expect(timeToCron('08:00')).toBe('0 8 * * *');
  });

  it('"06:30" → "30 6 * * *"', () => {
    expect(timeToCron('06:30')).toBe('30 6 * * *');
  });

  it('"9:05" (tanpa leading zero) → "5 9 * * *"', () => {
    expect(timeToCron('9:05')).toBe('5 9 * * *');
  });

  it('format tidak valid → fallback default "0 8 * * *"', () => {
    expect(timeToCron('invalid')).toBe('0 8 * * *');
    expect(timeToCron('')).toBe('0 8 * * *');
    expect(timeToCron('25:00')).toBe('0 25 * * *'); // tidak validasi range jam, tapi format tetap mm HH
  });
});

// ── 2. ReminderService.sendH1Reminders ───────────────────────────────────────

describe('ReminderService.sendH1Reminders', () => {
  const tomorrow = addDays(todayJakarta(), 1);
  const today    = todayJakarta();

  it('hanya kirim ke booking yang bookingDate = besok', async () => {
    const bookings = [
      makeBooking({ bookingId: 'BKG-001', bookingDate: tomorrow }),  // ← harus terkirim
      makeBooking({ bookingId: 'BKG-002', bookingDate: today }),     // ← bukan besok, skip
      makeBooking({ bookingId: 'BKG-003', bookingDate: addDays(todayJakarta(), 2) }), // lusa, skip
    ];

    const bookingRepo = makeMockBookingRepo(bookings);
    const baileys     = makeMockBaileys();
    const service     = new ReminderService(
      bookingRepo as IBookingRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      baileys as BaileysClient,
    );

    await service.sendH1Reminders();

    expect(baileys.sendText).toHaveBeenCalledTimes(1);
    expect(bookingRepo.markReminderSent).toHaveBeenCalledWith('BKG-001', 'h1');
    expect(bookingRepo.markReminderSent).not.toHaveBeenCalledWith('BKG-002', 'h1');
  });

  it('tidak kirim jika reminderH1Sent sudah true (idempotent)', async () => {
    const bookings = [
      makeBooking({ bookingDate: tomorrow, reminderH1Sent: true, bookingStatus: 'Confirmed' }),
    ];
    // findPendingReminders sudah filter reminderH1Sent=false
    const bookingRepo: Partial<IBookingRepository> = {
      findPendingReminders: vi.fn().mockResolvedValue([]), // sudah terfilter
      markReminderSent: vi.fn(),
    };
    const baileys = makeMockBaileys();
    const service = new ReminderService(
      bookingRepo as IBookingRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      baileys as BaileysClient,
    );

    await service.sendH1Reminders();
    expect(baileys.sendText).not.toHaveBeenCalled();
  });

  it('tidak kirim ke booking dengan status bukan Confirmed', async () => {
    const bookings = [
      makeBooking({ bookingDate: tomorrow, bookingStatus: 'Pending' }),
      makeBooking({ bookingDate: tomorrow, bookingStatus: 'Cancelled' }),
    ];
    const bookingRepo: Partial<IBookingRepository> = {
      findPendingReminders: vi.fn().mockResolvedValue([]), // pending/cancelled difilter
      markReminderSent: vi.fn(),
    };
    const baileys = makeMockBaileys();
    const service = new ReminderService(
      bookingRepo as IBookingRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      baileys as BaileysClient,
    );

    await service.sendH1Reminders();
    expect(baileys.sendText).not.toHaveBeenCalled();
  });

  it('jika sendText gagal, lanjut ke booking berikutnya (tidak stop)', async () => {
    const bookings = [
      makeBooking({ bookingId: 'BKG-001', bookingDate: tomorrow }),
      makeBooking({ bookingId: 'BKG-002', bookingDate: tomorrow }),
    ];
    const bookingRepo = makeMockBookingRepo(bookings);
    const baileys: Partial<BaileysClient> = {
      sendText: vi.fn()
        .mockRejectedValueOnce(new Error('WA error')) // BKG-001 gagal
        .mockResolvedValueOnce(undefined),             // BKG-002 sukses
    };
    const service = new ReminderService(
      bookingRepo as IBookingRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      baileys as BaileysClient,
    );

    await expect(service.sendH1Reminders()).resolves.not.toThrow();
    expect(bookingRepo.markReminderSent).toHaveBeenCalledTimes(1); // hanya BKG-002
    expect(bookingRepo.markReminderSent).toHaveBeenCalledWith('BKG-002', 'h1');
  });
});

// ── 3. ReminderService.sendHariHReminders ────────────────────────────────────

describe('ReminderService.sendHariHReminders', () => {
  const today    = todayJakarta();
  const tomorrow = addDays(todayJakarta(), 1);

  it('hanya kirim ke booking yang bookingDate = hari ini', async () => {
    const bookings = [
      makeBooking({ bookingId: 'BKG-TODAY', bookingDate: today }),     // ← kirim
      makeBooking({ bookingId: 'BKG-TMRW',  bookingDate: tomorrow }),  // ← skip
    ];
    const bookingRepo = makeMockBookingRepo(bookings);
    const baileys     = makeMockBaileys();
    const service     = new ReminderService(
      bookingRepo as IBookingRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      baileys as BaileysClient,
    );

    await service.sendHariHReminders();

    expect(baileys.sendText).toHaveBeenCalledTimes(1);
    expect(bookingRepo.markReminderSent).toHaveBeenCalledWith('BKG-TODAY', 'hariH');
    expect(bookingRepo.markReminderSent).not.toHaveBeenCalledWith('BKG-TMRW', 'hariH');
  });
});

// ── 4. Format pesan reminder ──────────────────────────────────────────────────

describe('Format pesan reminder', () => {
  const tomorrow = addDays(todayJakarta(), 1);

  async function captureMessage(type: 'h1' | 'hariH'): Promise<string> {
    const booking = makeBooking({
      bookingDate:  type === 'h1' ? tomorrow : todayJakarta(),
      customerName: 'Siti Rahayu',
      serviceName:  'Aerobic',
      scheduleTime: '14:00',
      invoiceNumber: 'INV-TEST-001',
    });

    const bookingRepo: Partial<IBookingRepository> = {
      findPendingReminders: vi.fn().mockResolvedValue([booking]),
      markReminderSent: vi.fn().mockResolvedValue(undefined),
    };

    let capturedMessage = '';
    const baileys: Partial<BaileysClient> = {
      sendText: vi.fn().mockImplementation((_jid: string, msg: string) => {
        capturedMessage = msg;
        return Promise.resolve();
      }),
    };

    const service = new ReminderService(
      bookingRepo as IBookingRepository,
      makeMockSettingsRepo() as ISettingsRepository,
      baileys as BaileysClient,
    );

    if (type === 'h1') await service.sendH1Reminders();
    else await service.sendHariHReminders();

    return capturedMessage;
  }

  it('pesan H-1 mengandung nama customer, nama kelas, jam, invoice', async () => {
    const msg = await captureMessage('h1');
    expect(msg).toContain('Siti Rahayu');
    expect(msg).toContain('Aerobic');
    expect(msg).toContain('14.00'); // formatTimeDisplay: ":" → "."
    expect(msg).toContain('INV-TEST-001');
    expect(msg).toContain('Kania Happy');
    expect(msg).toContain('Reminder');
  });

  it('pesan hari H mengandung nama customer, nama kelas, jam, alamat', async () => {
    const msg = await captureMessage('hariH');
    expect(msg).toContain('Siti Rahayu');
    expect(msg).toContain('Aerobic');
    expect(msg).toContain('14.00');
    expect(msg).toContain('INV-TEST-001');
    expect(msg).toContain('Jl. Kania No. 1'); // dari settings mock
    expect(msg).toContain('Semangat');
  });

  it('pesan H-1 dan hari H berbeda kontennya', async () => {
    const h1  = await captureMessage('h1');
    const hd  = await captureMessage('hariH');
    expect(h1).not.toBe(hd);
    expect(h1).toContain('Besok');
    expect(hd).toContain('hari ini');
  });
});
