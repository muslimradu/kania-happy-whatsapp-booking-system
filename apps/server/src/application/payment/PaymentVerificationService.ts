/**
 * PaymentVerificationService — M5
 *
 * Mengelola proses verifikasi pembayaran oleh admin.
 *
 * Alur:
 *  1. Customer melakukan booking → Payment dibuat dengan status "Waiting Verification"
 *     (Transfer/QRIS) atau "Cash" (bayar di tempat).
 *  2. Admin membuka dashboard → melihat daftar payment "Waiting Verification".
 *  3. Admin menekan Approve → status → "Paid", Booking → "Confirmed".
 *     Admin menekan Reject  → status → "Rejected", Booking → "Cancelled".
 *  4. Customer mendapat notifikasi WhatsApp otomatis.
 *
 * Idempotent: jika payment sudah "Paid" dan di-approve lagi, lempar AppError.
 */

import type { IBookingRepository, IPaymentRepository, IAdminLogRepository } from '@domain/repositories';
import type { BaileysClient } from '@infrastructure/whatsapp/BaileysClient';
import type { Payment } from '@domain/entities/Payment';
import { AppError } from '@shared/types';
import { phoneToJid } from '@shared/utils/phoneFormatter';
import { logger } from '@infrastructure/logger/Logger';

export interface PaymentSummary {
  invoiceNumber:  string;
  bookingId:      string;
  customerPhone:  string;
  customerName:   string;
  serviceName:    string;
  bookingDate:    string;
  scheduleTime:   string;
  amount:         number;
  methodId:       string;
  status:         string;
  proofImageUrl:  string;
  verifiedBy:     string;
  verifiedAt:     string;
  createdAt:      string;
}

export class PaymentVerificationService {
  constructor(
    private readonly paymentRepo:  IPaymentRepository,
    private readonly bookingRepo:  IBookingRepository,
    private readonly adminLogRepo: IAdminLogRepository,
    private readonly baileysClient: BaileysClient,
  ) {}

  // ── List ─────────────────────────────────────────────────────────────────────

  /** Semua pembayaran yang menunggu verifikasi admin. */
  async listPending(): Promise<Payment[]> {
    return this.paymentRepo.findByStatus('Waiting Verification');
  }

  /** Semua pembayaran (untuk halaman riwayat). */
  async listAll(): Promise<Payment[]> {
    const all = await this.paymentRepo.findByStatus('Waiting Verification');
    // Gabungkan dengan status lain ─ gunakan findAll lewat trick status loop
    // Karena IPaymentRepository hanya punya findByStatus, kita buat helper:
    const [paid, rejected, cash] = await Promise.all([
      this.paymentRepo.findByStatus('Paid'),
      this.paymentRepo.findByStatus('Rejected'),
      this.paymentRepo.findByStatus('Cash'),
    ]);
    return [...all, ...paid, ...rejected, ...cash];
  }

  // ── Approve ──────────────────────────────────────────────────────────────────

  async approve(
    invoiceNumber: string,
    adminUsername: string,
  ): Promise<void> {
    const payment = await this.paymentRepo.findByInvoiceNumber(invoiceNumber);
    if (!payment) {
      throw AppError.notFound(`Payment dengan invoice ${invoiceNumber} tidak ditemukan`);
    }
    if (payment.status === 'Paid') {
      throw AppError.conflict(`Invoice ${invoiceNumber} sudah berstatus Paid`);
    }
    if (payment.status === 'Rejected') {
      throw AppError.conflict(`Invoice ${invoiceNumber} sudah berstatus Rejected, tidak bisa disetujui`);
    }

    // Update payment
    await this.paymentRepo.updateStatus(invoiceNumber, 'Paid', { verifiedBy: adminUsername });

    // Update booking status → Confirmed
    await this.bookingRepo.updateStatus(payment.bookingId, 'Confirmed');

    // Catat audit log
    await this.adminLogRepo.log({
      adminUsername,
      action:      'VerifyPayment',
      targetId:    invoiceNumber,
      description: `Pembayaran disetujui: ${invoiceNumber} (Booking ${payment.bookingId})`,
    });

    // Notifikasi WhatsApp ke customer
    const booking = await this.bookingRepo.findById(payment.bookingId);
    if (booking) {
      const msg = this.buildApprovalMessage(booking.customerName, invoiceNumber, booking.serviceName, booking.bookingDate, booking.scheduleTime);
      await this.baileysClient
        .sendText(phoneToJid(booking.customerPhone), msg)
        .catch((err) =>
          logger.warn('PaymentVerificationService: gagal kirim notifikasi approve', { error: err }),
        );
    }

    logger.info('PaymentVerificationService: pembayaran disetujui', {
      invoiceNumber,
      adminUsername,
      bookingId: payment.bookingId,
    });
  }

  // ── Reject ───────────────────────────────────────────────────────────────────

  async reject(
    invoiceNumber: string,
    adminUsername: string,
    reason?: string,
  ): Promise<void> {
    const payment = await this.paymentRepo.findByInvoiceNumber(invoiceNumber);
    if (!payment) {
      throw AppError.notFound(`Payment dengan invoice ${invoiceNumber} tidak ditemukan`);
    }
    if (payment.status === 'Paid') {
      throw AppError.conflict(`Invoice ${invoiceNumber} sudah berstatus Paid, tidak bisa ditolak`);
    }
    if (payment.status === 'Rejected') {
      throw AppError.conflict(`Invoice ${invoiceNumber} sudah berstatus Rejected`);
    }

    // Update payment
    await this.paymentRepo.updateStatus(invoiceNumber, 'Rejected', { verifiedBy: adminUsername });

    // Update booking → Cancelled
    await this.bookingRepo.updateStatus(payment.bookingId, 'Cancelled');

    // Catat audit log
    await this.adminLogRepo.log({
      adminUsername,
      action:      'RejectPayment',
      targetId:    invoiceNumber,
      description: `Pembayaran ditolak: ${invoiceNumber}${reason ? ` — ${reason}` : ''}`,
    });

    // Notifikasi WhatsApp ke customer
    const booking = await this.bookingRepo.findById(payment.bookingId);
    if (booking) {
      const msg = this.buildRejectionMessage(booking.customerName, invoiceNumber, reason);
      await this.baileysClient
        .sendText(phoneToJid(booking.customerPhone), msg)
        .catch((err) =>
          logger.warn('PaymentVerificationService: gagal kirim notifikasi reject', { error: err }),
        );
    }

    logger.info('PaymentVerificationService: pembayaran ditolak', {
      invoiceNumber,
      adminUsername,
      reason,
      bookingId: payment.bookingId,
    });
  }

  // ── Pesan WhatsApp ────────────────────────────────────────────────────────────

  private buildApprovalMessage(
    customerName: string,
    invoiceNumber: string,
    serviceName: string,
    bookingDate: string,
    scheduleTime: string,
  ): string {
    const timeLabel = scheduleTime ? `${scheduleTime.replace(':', '.')} WIB` : 'sesuai jadwal';
    return (
      `✅ *Pembayaran Dikonfirmasi!*\n\n` +
      `Halo *${customerName}* 😊\n\n` +
      `Pembayaran Kakak untuk booking berikut telah kami verifikasi:\n\n` +
      `🏃 Kelas   : ${serviceName || 'Kelas senam'}\n` +
      `📅 Tanggal : ${bookingDate}\n` +
      `⏰ Jam     : ${timeLabel}\n` +
      `🔖 Invoice : ${invoiceNumber}\n\n` +
      `Booking Kakak sudah *Confirmed* ✅\n\n` +
      `Sampai jumpa di kelas ya Kak! 💕`
    );
  }

  private buildRejectionMessage(
    customerName: string,
    invoiceNumber: string,
    reason?: string,
  ): string {
    const reasonLine = reason ? `\n📝 Alasan   : ${reason}\n` : '';
    return (
      `❌ *Pembayaran Tidak Terverifikasi*\n\n` +
      `Halo *${customerName}* 😊\n\n` +
      `Mohon maaf, pembayaran untuk invoice *${invoiceNumber}* tidak dapat kami verifikasi.${reasonLine}\n\n` +
      `Silakan hubungi admin atau coba lakukan booking ulang 🙏\n\n` +
      `_Ketik *halo* untuk kembali ke menu utama_`
    );
  }
}
