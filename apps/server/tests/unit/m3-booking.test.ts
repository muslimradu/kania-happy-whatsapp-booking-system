/**
 * Unit test M3 — Booking Flow
 *
 * Test coverage:
 *  1. InvoiceGenerator   — format & uniqueness
 *  2. ConversationStateStore — TTL, set, get, clear
 *  3. BookingService.startBooking — no schedule, with schedules
 *  4. BookingService.confirmBooking — happy path transfer & cash
 *  5. BookingFlowHandler — full happy-path flow
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InvoiceGenerator } from '@application/booking/InvoiceGenerator';
import { ConversationStateStore } from '@infrastructure/state/ConversationStateStore';
import { BookingService } from '@application/booking/BookingService';
import { BookingFlowHandler } from '@application/booking/BookingFlowHandler';
import type { IBookingRepository, IPaymentRepository, ICustomerRepository, IPaymentMethodRepository } from '@domain/repositories';
import type { GetAvailableScheduleService } from '@application/schedule/GetAvailableScheduleService';
import type { ScheduleOccurrence } from '@domain/entities/Schedule';
import type { PaymentMethod } from '@domain/entities/PaymentMethod';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeOccurrence(overrides: Partial<ScheduleOccurrence> = {}): ScheduleOccurrence {
  return {
    date: '2026-07-06',
    serviceName: 'Zumba Basic',
    servicePrice: 50000,
    schedule: {
      scheduleId: 'SCH001',
      serviceId: 'SVC001',
      dayOfWeek: 1,
      timeStart: '09:00',
      timeEnd: '10:00',
      isActive: true,
    },
    ...overrides,
  };
}

function makePaymentMethod(type: PaymentMethod['type'] = 'transfer'): PaymentMethod {
  return type === 'transfer'
    ? { methodId: 'PM001', label: 'BCA', type: 'transfer', accountNumber: '1234567890', accountName: 'Kania Happy', qrisImageUrl: '', isActive: true }
    : { methodId: 'PM002', label: 'QRIS', type: 'qris', accountNumber: '', accountName: '', qrisImageUrl: 'https://example.com/qris.png', isActive: true };
}

// ── 1. InvoiceGenerator ───────────────────────────────────────────────────────

describe('InvoiceGenerator', () => {
  const gen = new InvoiceGenerator();

  it('harus menghasilkan format INV-YYYYMMDD-XXXX', () => {
    const inv = gen.generate();
    expect(inv).toMatch(/^INV-\d{8}-[A-Z0-9]{4}$/);
  });

  it('dua invoice berturut-turut harus berbeda', () => {
    const a = gen.generate();
    const b = gen.generate();
    expect(a).not.toBe(b);
  });
});

// ── 2. ConversationStateStore ─────────────────────────────────────────────────

describe('ConversationStateStore', () => {
  let store: ConversationStateStore;

  beforeEach(() => {
    store = new ConversationStateStore();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('get harus mengembalikan null jika belum ada state', () => {
    expect(store.get('628111')).toBeNull();
  });

  it('set dan get harus bekerja dalam TTL', () => {
    store.set('628111', { step: 'CHOOSE_SERVICE' });
    expect(store.get('628111')?.step).toBe('CHOOSE_SERVICE');
  });

  it('state harus expired setelah 15 menit', () => {
    store.set('628111', { step: 'CHOOSE_SERVICE' });
    vi.advanceTimersByTime(16 * 60 * 1000);
    expect(store.get('628111')).toBeNull();
  });

  it('clear harus menghapus state', () => {
    store.set('628111', { step: 'CONFIRM' });
    store.clear('628111');
    expect(store.get('628111')).toBeNull();
  });

  it('activeCount harus menghitung state yang belum expired', () => {
    store.set('628111', { step: 'CHOOSE_SERVICE' });
    store.set('628222', { step: 'CHOOSE_PAYMENT' });
    expect(store.activeCount()).toBe(2);
  });
});

// ── 3. BookingService.startBooking ────────────────────────────────────────────

describe('BookingService.startBooking', () => {
  let service: BookingService;
  let mockScheduleService: Partial<GetAvailableScheduleService>;

  const makeService = (occurrences: ScheduleOccurrence[]) => {
    mockScheduleService = {
      getOccurrences: vi.fn().mockResolvedValue(occurrences),
    };
    service = new BookingService(
      {} as IBookingRepository,
      {} as IPaymentRepository,
      {} as ICustomerRepository,
      {} as IPaymentMethodRepository,
      mockScheduleService as GetAvailableScheduleService,
      new InvoiceGenerator(),
    );
  };

  it('jika tidak ada jadwal, pesan berisi kata "belum ada"', async () => {
    makeService([]);
    const result = await service.startBooking('628111');
    expect(result.message).toContain('belum ada');
    expect(result.serviceOptions).toHaveLength(0);
  });

  it('jika ada jadwal, daftar layanan unik ditampilkan', async () => {
    makeService([
      makeOccurrence({ schedule: { scheduleId: 'SCH001', serviceId: 'SVC001', dayOfWeek: 1, timeStart: '09:00', timeEnd: '10:00', isActive: true }, serviceName: 'Zumba' }),
      makeOccurrence({ schedule: { scheduleId: 'SCH002', serviceId: 'SVC001', dayOfWeek: 3, timeStart: '14:00', timeEnd: '15:00', isActive: true }, serviceName: 'Zumba' }),
      makeOccurrence({ schedule: { scheduleId: 'SCH003', serviceId: 'SVC002', dayOfWeek: 2, timeStart: '10:00', timeEnd: '11:00', isActive: true }, serviceName: 'Aerobic' }),
    ]);
    const result = await service.startBooking('628111');
    // Harus deduplicate: SVC001 muncul 2x tapi hanya tampil sekali
    expect(result.serviceOptions).toHaveLength(2);
    expect(result.serviceOptions.map((s) => s.name)).toContain('Zumba');
    expect(result.serviceOptions.map((s) => s.name)).toContain('Aerobic');
  });
});

// ── 4. BookingService.confirmBooking ─────────────────────────────────────────

describe('BookingService.confirmBooking', () => {
  let service: BookingService;
  let mockBookingRepo: Partial<IBookingRepository>;
  let mockPaymentRepo: Partial<IPaymentRepository>;
  let mockCustomerRepo: Partial<ICustomerRepository>;

  beforeEach(() => {
    mockBookingRepo = {
      create: vi.fn().mockImplementation((dto) => Promise.resolve({
        ...dto,
        bookingId: 'BKG-TEST',
        createdAt: new Date().toISOString(),
        reminderH1Sent: false,
        reminderHariHSent: false,
      })),
    };
    mockPaymentRepo = { create: vi.fn().mockResolvedValue({}) };
    mockCustomerRepo = {
      incrementBookingCount: vi.fn().mockResolvedValue(undefined),
      findByPhone: vi.fn().mockResolvedValue({ phone: '628111', name: 'Budi', firstContactAt: '', lastBookingAt: '', totalBooking: 0 }),
    };

    service = new BookingService(
      mockBookingRepo as IBookingRepository,
      mockPaymentRepo as IPaymentRepository,
      mockCustomerRepo as ICustomerRepository,
      {} as IPaymentMethodRepository,
      {} as GetAvailableScheduleService,
      new InvoiceGenerator(),
    );
  });

  it('transfer: booking status Pending, payment Waiting Verification', async () => {
    const result = await service.confirmBooking(
      '628111', 'Budi', makeOccurrence(), makePaymentMethod('transfer'),
    );
    expect(result.success).toBe(true);
    expect(mockBookingRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ bookingStatus: 'Pending' }),
    );
    expect(mockPaymentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Waiting Verification' }),
    );
  });

  it('transfer: pesan konfirmasi berisi nomor rekening', async () => {
    const result = await service.confirmBooking(
      '628111', 'Budi', makeOccurrence(), makePaymentMethod('transfer'),
    );
    expect(result.message).toContain('1234567890');
    expect(result.message).toContain('Transfer');
  });

  it('qris: pesan konfirmasi berisi instruksi scan QRIS', async () => {
    const result = await service.confirmBooking(
      '628111', 'Budi', makeOccurrence(), makePaymentMethod('qris'),
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain('QRIS');
  });

  it('jika repo gagal, kembalikan success: false', async () => {
    mockBookingRepo.create = vi.fn().mockRejectedValue(new Error('Sheet error'));
    const result = await service.confirmBooking(
      '628111', 'Budi', makeOccurrence(), makePaymentMethod('transfer'),
    );
    expect(result.success).toBe(false);
  });
});

// ── 5. BookingFlowHandler — happy-path ───────────────────────────────────────

describe('BookingFlowHandler — happy path', () => {
  const PHONE = '628111222333';

  let stateStore: ConversationStateStore;
  let mockBookingService: Partial<BookingService>;
  let mockCustomerRepo: Partial<ICustomerRepository>;
  let handler: BookingFlowHandler;

  const occ = makeOccurrence();
  const pmTransfer = makePaymentMethod('transfer');

  beforeEach(() => {
    stateStore = new ConversationStateStore();

    mockBookingService = {
      startBooking: vi.fn().mockResolvedValue({
        message: 'Pilih kelas',
        serviceOptions: [{ serviceId: 'SVC001', name: 'Zumba', price: 50000 }],
      }),
      chooseService: vi.fn().mockResolvedValue({
        message: 'Pilih jadwal',
        scheduleOptions: [occ],
      }),
      chooseSchedule: vi.fn().mockResolvedValue({ message: '', needName: false }),
      buildPaymentOptions: vi.fn().mockResolvedValue({
        message: 'Pilih bayar',
        paymentOptions: [pmTransfer],
      }),
      choosePaymentMethod: vi.fn().mockResolvedValue({ message: 'Ringkasan booking...' }),
      confirmBooking: vi.fn().mockResolvedValue({ success: true, message: '✅ Booking Berhasil!' }),
    };

    mockCustomerRepo = {
      findByPhone: vi.fn().mockResolvedValue({ phone: PHONE, name: 'Budi', firstContactAt: '', lastBookingAt: '', totalBooking: 1 }),
      upsert: vi.fn().mockResolvedValue({ phone: PHONE, name: 'Budi', firstContactAt: '', lastBookingAt: '', totalBooking: 1 }),
    };

    handler = new BookingFlowHandler(
      stateStore,
      mockBookingService as BookingService,
      mockCustomerRepo as ICustomerRepository,
    );
  });

  it('langkah 1: memulai flow booking', async () => {
    const result = await handler.handle(PHONE, 'booking');
    expect(result.messages[0]).toContain('Pilih kelas');
    expect(stateStore.get(PHONE)?.step).toBe('CHOOSE_SERVICE');
  });

  it('langkah 2: pilih layanan', async () => {
    await handler.handle(PHONE, 'booking');
    const result = await handler.handle(PHONE, '1');
    expect(result.messages[0]).toContain('Pilih jadwal');
    expect(stateStore.get(PHONE)?.step).toBe('CHOOSE_SCHEDULE');
  });

  it('langkah 3: pilih jadwal (customer punya nama) → langsung ke payment', async () => {
    await handler.handle(PHONE, 'booking');
    await handler.handle(PHONE, '1'); // pilih layanan
    const result = await handler.handle(PHONE, '1'); // pilih jadwal
    expect(result.messages[0]).toContain('Pilih bayar');
    expect(stateStore.get(PHONE)?.step).toBe('CHOOSE_PAYMENT');
  });

  it('langkah 4: pilih payment → tampilkan ringkasan konfirmasi', async () => {
    await handler.handle(PHONE, 'booking');
    await handler.handle(PHONE, '1');
    await handler.handle(PHONE, '1');
    const result = await handler.handle(PHONE, '1'); // pilih payment
    expect(result.messages[0]).toContain('Ringkasan');
    expect(stateStore.get(PHONE)?.step).toBe('CONFIRM');
  });

  it('langkah 5: konfirmasi "ya" → booking berhasil, state di-clear', async () => {
    await handler.handle(PHONE, 'booking');
    await handler.handle(PHONE, '1');
    await handler.handle(PHONE, '1');
    await handler.handle(PHONE, '1');
    const result = await handler.handle(PHONE, 'ya');
    expect(result.messages[0]).toContain('Berhasil');
    expect(result.done).toBe(true);
    expect(stateStore.get(PHONE)).toBeNull();
  });

  it('ketik "0" kapan saja → batalkan flow', async () => {
    await handler.handle(PHONE, 'booking');
    await handler.handle(PHONE, '1');
    const result = await handler.handle(PHONE, '0');
    expect(result.messages[0]).toContain('dibatalkan');
    expect(result.done).toBe(true);
    expect(stateStore.get(PHONE)).toBeNull();
  });

  it('input tidak valid di CHOOSE_SERVICE → minta ulang', async () => {
    await handler.handle(PHONE, 'booking');
    const result = await handler.handle(PHONE, 'xyz');
    // chooseService mock return null jika input tidak valid
    mockBookingService.chooseService = vi.fn().mockResolvedValue(null);
    const result2 = await handler.handle(PHONE, 'xyz');
    expect(result2.messages[0]).toContain('tidak valid');
    expect(stateStore.get(PHONE)?.step).toBe('CHOOSE_SERVICE');
  });
});
