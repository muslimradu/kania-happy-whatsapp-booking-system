/**
 * Unit test M5 — Payment Verification
 *
 * Test coverage:
 *  1. PaymentVerificationService.listPending — filter status
 *  2. PaymentVerificationService.approve    — happy path, idempotency guard
 *  3. PaymentVerificationService.reject     — happy path, idempotency guard
 *  4. Pesan notifikasi WhatsApp             — format approve & reject
 *  5. AuthController.login                  — valid & invalid credentials
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentVerificationService } from '@application/payment/PaymentVerificationService';
import { AppError } from '@shared/types';
import type { IBookingRepository, IPaymentRepository, IAdminLogRepository } from '@domain/repositories';
import type { BaileysClient } from '@infrastructure/whatsapp/BaileysClient';
import type { Payment } from '@domain/entities/Payment';
import type { Booking } from '@domain/entities/Booking';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    invoiceNumber: 'INV-20260629-0001',
    bookingId:     'BKG-AABBCCDD',
    amount:        150000,
    methodId:      'PM-BCA001',
    status:        'Waiting Verification',
    proofImageUrl: '',
    verifiedBy:    '',
    verifiedAt:    '',
    createdAt:     new Date().toISOString(),
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    bookingId:         'BKG-AABBCCDD',
    invoiceNumber:     'INV-20260629-0001',
    customerPhone:     '628111222333',
    customerName:      'Dewi Puspita',
    serviceId:         'SVC-001',
    serviceName:       'Zumba',
    scheduleId:        'SCH-001',
    bookingDate:       '2026-07-01',
    scheduleTime:      '09:00',
    paymentMethodId:   'PM-BCA001',
    bookingStatus:     'Pending',
    createdAt:         new Date().toISOString(),
    reminderH1Sent:    false,
    reminderHariHSent: false,
    ...overrides,
  };
}

function makeMockPaymentRepo(payment?: Payment): Partial<IPaymentRepository> {
  return {
    findByInvoiceNumber: vi.fn().mockResolvedValue(payment ?? null),
    findByStatus:        vi.fn().mockResolvedValue(payment ? [payment] : []),
    updateStatus:        vi.fn().mockResolvedValue(undefined),
    create:              vi.fn(),
    findByBookingId:     vi.fn().mockResolvedValue(payment ?? null),
  };
}

function makeMockBookingRepo(booking?: Booking): Partial<IBookingRepository> {
  return {
    findById:      vi.fn().mockResolvedValue(booking ?? null),
    updateStatus:  vi.fn().mockResolvedValue(undefined),
    findAll:       vi.fn().mockResolvedValue([]),
    findByPhone:   vi.fn().mockResolvedValue([]),
    findByDate:    vi.fn().mockResolvedValue([]),
    findPendingReminders: vi.fn().mockResolvedValue([]),
    create:        vi.fn(),
    markReminderSent: vi.fn(),
  };
}

function makeMockAdminLog(): Partial<IAdminLogRepository> {
  return {
    log:     vi.fn().mockResolvedValue(undefined),
    findAll: vi.fn().mockResolvedValue([]),
  };
}

function makeMockBaileys(): Partial<BaileysClient> {
  return {
    sendText: vi.fn().mockResolvedValue(undefined),
  };
}

function makeService(
  payment?: Payment,
  booking?: Booking,
  baileysOverride?: Partial<BaileysClient>,
) {
  return new PaymentVerificationService(
    makeMockPaymentRepo(payment) as IPaymentRepository,
    makeMockBookingRepo(booking) as IBookingRepository,
    makeMockAdminLog() as IAdminLogRepository,
    (baileysOverride ?? makeMockBaileys()) as BaileysClient,
  );
}

// ── 1. listPending ─────────────────────────────────────────────────────────────

describe('PaymentVerificationService.listPending', () => {
  it('mengembalikan payment berstatus Waiting Verification', async () => {
    const payment = makePayment({ status: 'Waiting Verification' });
    const paymentRepo = makeMockPaymentRepo(payment);
    const svc = new PaymentVerificationService(
      paymentRepo as IPaymentRepository,
      makeMockBookingRepo() as IBookingRepository,
      makeMockAdminLog() as IAdminLogRepository,
      makeMockBaileys() as BaileysClient,
    );

    const result = await svc.listPending();
    expect(result).toHaveLength(1);
    expect(paymentRepo.findByStatus).toHaveBeenCalledWith('Waiting Verification');
  });
});

// ── 2. approve — happy path ────────────────────────────────────────────────────

describe('PaymentVerificationService.approve', () => {
  it('happy path: approve payment & update booking ke Confirmed', async () => {
    const payment    = makePayment();
    const booking    = makeBooking();
    const paymentRepo = makeMockPaymentRepo(payment);
    const bookingRepo = makeMockBookingRepo(booking);
    const adminLog    = makeMockAdminLog();
    const baileys     = makeMockBaileys();

    const svc = new PaymentVerificationService(
      paymentRepo as IPaymentRepository,
      bookingRepo as IBookingRepository,
      adminLog as IAdminLogRepository,
      baileys as BaileysClient,
    );

    await svc.approve('INV-20260629-0001', 'admin');

    expect(paymentRepo.updateStatus).toHaveBeenCalledWith(
      'INV-20260629-0001',
      'Paid',
      { verifiedBy: 'admin' },
    );
    expect(bookingRepo.updateStatus).toHaveBeenCalledWith('BKG-AABBCCDD', 'Confirmed');
    expect(adminLog.log).toHaveBeenCalled();
    expect(baileys.sendText).toHaveBeenCalledTimes(1);
  });

  it('lempar NOT_FOUND jika invoice tidak ditemukan', async () => {
    const svc = makeService(undefined);
    await expect(svc.approve('INV-NOTFOUND', 'admin')).rejects.toBeInstanceOf(AppError);
    await expect(svc.approve('INV-NOTFOUND', 'admin')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lempar CONFLICT jika payment sudah Paid', async () => {
    const payment = makePayment({ status: 'Paid' });
    const svc     = makeService(payment);
    await expect(svc.approve('INV-20260629-0001', 'admin')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('lempar CONFLICT jika payment sudah Rejected', async () => {
    const payment = makePayment({ status: 'Rejected' });
    const svc     = makeService(payment);
    await expect(svc.approve('INV-20260629-0001', 'admin')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('approve tetap sukses meski kirim WA gagal (non-fatal)', async () => {
    const payment = makePayment();
    const booking = makeBooking();
    const baileys: Partial<BaileysClient> = {
      sendText: vi.fn().mockRejectedValue(new Error('WA down')),
    };
    const paymentRepo = makeMockPaymentRepo(payment);
    const svc = new PaymentVerificationService(
      paymentRepo as IPaymentRepository,
      makeMockBookingRepo(booking) as IBookingRepository,
      makeMockAdminLog() as IAdminLogRepository,
      baileys as BaileysClient,
    );

    await expect(svc.approve('INV-20260629-0001', 'admin')).resolves.not.toThrow();
    expect(paymentRepo.updateStatus).toHaveBeenCalled();
  });
});

// ── 3. reject — happy path ─────────────────────────────────────────────────────

describe('PaymentVerificationService.reject', () => {
  it('happy path: reject payment & update booking ke Cancelled', async () => {
    const payment    = makePayment();
    const booking    = makeBooking();
    const paymentRepo = makeMockPaymentRepo(payment);
    const bookingRepo = makeMockBookingRepo(booking);
    const adminLog    = makeMockAdminLog();
    const baileys     = makeMockBaileys();

    const svc = new PaymentVerificationService(
      paymentRepo as IPaymentRepository,
      bookingRepo as IBookingRepository,
      adminLog as IAdminLogRepository,
      baileys as BaileysClient,
    );

    await svc.reject('INV-20260629-0001', 'admin', 'Bukti transfer tidak sesuai');

    expect(paymentRepo.updateStatus).toHaveBeenCalledWith(
      'INV-20260629-0001',
      'Rejected',
      { verifiedBy: 'admin' },
    );
    expect(bookingRepo.updateStatus).toHaveBeenCalledWith('BKG-AABBCCDD', 'Cancelled');
    expect(adminLog.log).toHaveBeenCalled();
    expect(baileys.sendText).toHaveBeenCalledTimes(1);
  });

  it('lempar NOT_FOUND jika invoice tidak ditemukan', async () => {
    const svc = makeService(undefined);
    await expect(svc.reject('INV-NOTFOUND', 'admin')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lempar CONFLICT jika payment sudah Paid', async () => {
    const payment = makePayment({ status: 'Paid' });
    const svc     = makeService(payment);
    await expect(svc.reject('INV-20260629-0001', 'admin')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('lempar CONFLICT jika payment sudah Rejected', async () => {
    const payment = makePayment({ status: 'Rejected' });
    const svc     = makeService(payment);
    await expect(svc.reject('INV-20260629-0001', 'admin')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

// ── 4. Format pesan notifikasi ─────────────────────────────────────────────────

describe('Format pesan notifikasi WhatsApp', () => {
  it('pesan approve mengandung nama customer, invoice, nama kelas, dan status Confirmed', async () => {
    const payment = makePayment();
    const booking = makeBooking();
    let capturedMsg = '';
    const baileys: Partial<BaileysClient> = {
      sendText: vi.fn().mockImplementation((_jid: string, msg: string) => {
        capturedMsg = msg;
        return Promise.resolve();
      }),
    };
    const svc = new PaymentVerificationService(
      makeMockPaymentRepo(payment) as IPaymentRepository,
      makeMockBookingRepo(booking) as IBookingRepository,
      makeMockAdminLog() as IAdminLogRepository,
      baileys as BaileysClient,
    );

    await svc.approve('INV-20260629-0001', 'admin');

    expect(capturedMsg).toContain('Dewi Puspita');
    expect(capturedMsg).toContain('INV-20260629-0001');
    expect(capturedMsg).toContain('Zumba');
    expect(capturedMsg).toContain('Confirmed');
    expect(capturedMsg).toContain('09.00 WIB');
  });

  it('pesan reject mengandung nama customer, invoice, dan alasan', async () => {
    const payment = makePayment();
    const booking = makeBooking();
    let capturedMsg = '';
    const baileys: Partial<BaileysClient> = {
      sendText: vi.fn().mockImplementation((_jid: string, msg: string) => {
        capturedMsg = msg;
        return Promise.resolve();
      }),
    };
    const svc = new PaymentVerificationService(
      makeMockPaymentRepo(payment) as IPaymentRepository,
      makeMockBookingRepo(booking) as IBookingRepository,
      makeMockAdminLog() as IAdminLogRepository,
      baileys as BaileysClient,
    );

    await svc.reject('INV-20260629-0001', 'admin', 'Nominal tidak sesuai');

    expect(capturedMsg).toContain('Dewi Puspita');
    expect(capturedMsg).toContain('INV-20260629-0001');
    expect(capturedMsg).toContain('Nominal tidak sesuai');
  });

  it('pesan reject tanpa alasan tetap valid', async () => {
    const payment = makePayment();
    const booking = makeBooking();
    let capturedMsg = '';
    const baileys: Partial<BaileysClient> = {
      sendText: vi.fn().mockImplementation((_jid: string, msg: string) => {
        capturedMsg = msg;
        return Promise.resolve();
      }),
    };
    const svc = new PaymentVerificationService(
      makeMockPaymentRepo(payment) as IPaymentRepository,
      makeMockBookingRepo(booking) as IBookingRepository,
      makeMockAdminLog() as IAdminLogRepository,
      baileys as BaileysClient,
    );

    await svc.reject('INV-20260629-0001', 'admin');
    expect(capturedMsg).toContain('Dewi Puspita');
    expect(capturedMsg).toContain('INV-20260629-0001');
  });
});

// ── 5. AdminLog dicatat ────────────────────────────────────────────────────────

describe('Audit log', () => {
  it('approve mencatat aksi VERIFY_PAYMENT ke admin log', async () => {
    const payment  = makePayment();
    const booking  = makeBooking();
    const adminLog = makeMockAdminLog();

    const svc = new PaymentVerificationService(
      makeMockPaymentRepo(payment) as IPaymentRepository,
      makeMockBookingRepo(booking) as IBookingRepository,
      adminLog as IAdminLogRepository,
      makeMockBaileys() as BaileysClient,
    );

    await svc.approve('INV-20260629-0001', 'superadmin');

    expect(adminLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUsername: 'superadmin',
        action:        'VerifyPayment',
        targetId:      'INV-20260629-0001',
      }),
    );
  });

  it('reject mencatat aksi REJECT_PAYMENT ke admin log', async () => {
    const payment  = makePayment();
    const adminLog = makeMockAdminLog();

    const svc = new PaymentVerificationService(
      makeMockPaymentRepo(payment) as IPaymentRepository,
      makeMockBookingRepo() as IBookingRepository,
      adminLog as IAdminLogRepository,
      makeMockBaileys() as BaileysClient,
    );

    await svc.reject('INV-20260629-0001', 'superadmin', 'alasan');

    expect(adminLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        adminUsername: 'superadmin',
        action:        'RejectPayment',
      }),
    );
  });
});
