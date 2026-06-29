/**
 * BookingService
 *
 * Orchestrator alur booking dari awal sampai akhir.
 * Setiap method menangani SATU langkah di state machine.
 *
 * Tanggung jawab:
 *  - Validasi input customer di setiap step.
 *  - Membuat Booking + Payment di repository.
 *  - Menghasilkan teks pesan balasan untuk dikirim ke customer.
 *
 * Yang TIDAK dilakukan di sini:
 *  - Kirim pesan (itu tugas WhatsAppHandler / BookingFlowHandler).
 *  - Menyimpan state percakapan (itu tugas ConversationStateStore).
 */

import type { IBookingRepository, IPaymentRepository, ICustomerRepository, IPaymentMethodRepository } from '@domain/repositories';
import type { GetAvailableScheduleService } from '@application/schedule/GetAvailableScheduleService';
import type { InvoiceGenerator } from './InvoiceGenerator';
import type { ScheduleOccurrence } from '@domain/entities/Schedule';
import type { PaymentMethod } from '@domain/entities/PaymentMethod';
import { formatDateDisplay, formatTimeDisplay } from '@shared/utils/dateHelper';
import { formatRupiah } from '@shared/utils/dateHelper';
import { logger } from '@infrastructure/logger/Logger';

export interface StartBookingResult {
  message: string;
  serviceOptions: Array<{ serviceId: string; name: string; price: number }>;
}

export interface ChooseServiceResult {
  message: string;
  scheduleOptions: ScheduleOccurrence[];
}

export interface ChooseScheduleResult {
  message: string;
  needName: boolean; // true = customer belum punya nama → minta input
}

export interface ChoosePaymentResult {
  message: string;
  /** Pesan tambahan untuk dikirim terpisah (gambar QRIS atau rekening). */
  attachmentMessage?: string;
  /** URL gambar QRIS jika metode = qris */
  qrisImageUrl?: string;
}

export interface BookingConfirmResult {
  success: boolean;
  message: string;
}

export class BookingService {
  constructor(
    private readonly bookingRepo: IBookingRepository,
    private readonly paymentRepo: IPaymentRepository,
    private readonly customerRepo: ICustomerRepository,
    private readonly paymentMethodRepo: IPaymentMethodRepository,
    private readonly scheduleService: GetAvailableScheduleService,
    private readonly invoiceGenerator: InvoiceGenerator,
  ) {}

  // ── Step 1: Mulai booking — tampilkan daftar layanan ────────────────────────

  async startBooking(phone: string): Promise<StartBookingResult> {
    const occurrences = await this.scheduleService.getOccurrences();

    // Kumpulkan layanan unik yang punya jadwal tersedia
    const seen = new Set<string>();
    const serviceOptions: StartBookingResult['serviceOptions'] = [];

    for (const occ of occurrences) {
      if (!seen.has(occ.schedule.serviceId)) {
        seen.add(occ.schedule.serviceId);
        serviceOptions.push({
          serviceId:  occ.schedule.serviceId,
          name:       occ.serviceName,
          price:      occ.servicePrice,
        });
      }
    }

    if (serviceOptions.length === 0) {
      return {
        message: '😔 Maaf Kak, saat ini belum ada jadwal kelas yang tersedia.\nSilakan cek lagi nanti atau ketik *5* untuk hubungi admin.',
        serviceOptions: [],
      };
    }

    const lines = serviceOptions.map(
      (s, i) => `${i + 1}. *${s.name}* — ${formatRupiah(s.price)}`,
    );

    return {
      message:
        '📝 *Booking Kelas*\n\n' +
        'Pilih kelas yang ingin Kakak ikuti:\n\n' +
        lines.join('\n') +
        '\n\nKetik nomor pilihannya ya Kak 😊\n_(Ketik *0* untuk batal)_',
      serviceOptions,
    };
  }

  // ── Step 2: Customer pilih layanan — tampilkan jadwal tersedia ──────────────

  async chooseService(
    serviceOptions: StartBookingResult['serviceOptions'],
    input: string,
  ): Promise<ChooseServiceResult | null> {
    const idx = parseInt(input, 10) - 1;
    const selected = serviceOptions[idx];
    if (!selected) return null; // input tidak valid

    const occurrences = await this.scheduleService.getOccurrences(
      undefined,
      selected.serviceId,
    );

    if (occurrences.length === 0) {
      return {
        message: `😔 Maaf Kak, belum ada jadwal *${selected.name}* dalam waktu dekat.\nSilakan ketik *3* untuk lihat kelas lain.`,
        scheduleOptions: [],
      };
    }

    const lines = occurrences.map((occ, i) => {
      const dateLabel = formatDateDisplay(occ.date);
      const timeLabel = `${formatTimeDisplay(occ.schedule.timeStart)}–${formatTimeDisplay(occ.schedule.timeEnd)} WIB`;
      return `${i + 1}. ${dateLabel}\n   ⏰ ${timeLabel}`;
    });

    return {
      message:
        `🗓️ *Jadwal ${selected.name}*\n\n` +
        lines.join('\n\n') +
        '\n\nKetik nomor jadwal yang Kakak pilih 😊\n_(Ketik *0* untuk batal)_',
      scheduleOptions: occurrences,
    };
  }

  // ── Step 3: Customer pilih jadwal — cek apakah perlu nama ──────────────────

  async chooseSchedule(
    scheduleOptions: ScheduleOccurrence[],
    input: string,
    phone: string,
  ): Promise<ChooseScheduleResult | null> {
    const idx = parseInt(input, 10) - 1;
    const selected = scheduleOptions[idx];
    if (!selected) return null;

    const customer = await this.customerRepo.findByPhone(phone);
    const needName = !customer?.name || customer.name === phone;

    if (needName) {
      return {
        message: '📋 Boleh minta nama lengkap Kakak untuk booking ini? 😊',
        needName: true,
      };
    }

    return {
      message: '', // akan diisi oleh flow handler setelah set nama
      needName: false,
    };
  }

  // ── Step 4: Tampilkan pilihan metode pembayaran ─────────────────────────────

  async buildPaymentOptions(): Promise<{
    message: string;
    paymentOptions: PaymentMethod[];
  }> {
    const methods = await this.paymentMethodRepo.findActive();

    if (methods.length === 0) {
      return {
        message: '😔 Maaf Kak, metode pembayaran belum dikonfigurasi. Silakan hubungi admin.',
        paymentOptions: [],
      };
    }

    const lines = methods.map((m, i) => {
      const detail = m.type === 'transfer'
        ? `Transfer ${m.label}`
        : `QRIS ${m.label}`;
      return `${i + 1}. ${detail}`;
    });

    return {
      message:
        '💳 *Pilih Metode Pembayaran*\n\n' +
        lines.join('\n') +
        '\n\nKetik nomor pilihannya ya Kak 😊\n_(Ketik *0* untuk batal)_',
      paymentOptions: methods,
    };
  }

  // ── Step 5: Customer pilih payment — beri instruksi bayar ──────────────────

  async choosePaymentMethod(
    paymentOptions: PaymentMethod[],
    input: string,
    occurrence: ScheduleOccurrence,
  ): Promise<ChoosePaymentResult | null> {
    const idx = parseInt(input, 10) - 1;
    const selected = paymentOptions[idx];
    if (!selected) return null;

    const dateLabel = formatDateDisplay(occurrence.date);
    const timeLabel = `${formatTimeDisplay(occurrence.schedule.timeStart)}–${formatTimeDisplay(occurrence.schedule.timeEnd)} WIB`;
    const priceLabel = formatRupiah(occurrence.servicePrice);

    // Ringkasan sebelum konfirmasi
    const summary =
      `📋 *Ringkasan Booking*\n\n` +
      `🏃 Kelas    : ${occurrence.serviceName}\n` +
      `📅 Tanggal  : ${dateLabel}\n` +
      `⏰ Jam      : ${timeLabel}\n` +
      `💰 Harga    : ${priceLabel}\n` +
      `💳 Bayar via: ${selected.type === 'transfer' ? `Transfer ${selected.label}` : `QRIS ${selected.label}`}\n\n` +
      `Ketik *ya* untuk konfirmasi atau *tidak* untuk batal 😊`;

    return { message: summary };
  }

  // ── Step 6: Konfirmasi — buat Booking + Payment di sheet ───────────────────

  async confirmBooking(
    phone: string,
    customerName: string,
    occurrence: ScheduleOccurrence,
    selectedPaymentMethod: PaymentMethod,
  ): Promise<BookingConfirmResult> {
    const invoiceNumber = this.invoiceGenerator.generate();
    const dateLabel     = formatDateDisplay(occurrence.date);
    const timeLabel     = `${formatTimeDisplay(occurrence.schedule.timeStart)}–${formatTimeDisplay(occurrence.schedule.timeEnd)} WIB`;

    // Tentukan status payment awal
    const paymentStatus =
      selectedPaymentMethod.type === 'transfer' || selectedPaymentMethod.type === 'qris'
        ? 'Waiting Verification'
        : 'Cash';

    // Booking status: Cash langsung Confirmed, transfer/QRIS masih Pending
    const bookingStatus = paymentStatus === 'Cash' ? 'Confirmed' : 'Pending';

    try {
      // 1. Buat Booking
      const booking = await this.bookingRepo.create({
        invoiceNumber,
        customerPhone: phone,
        customerName,
        serviceId:       occurrence.schedule.serviceId,
        serviceName:     occurrence.serviceName,
        scheduleId:      occurrence.schedule.scheduleId,
        bookingDate:     occurrence.date,
        scheduleTime:    occurrence.schedule.timeStart,
        paymentMethodId: selectedPaymentMethod.methodId,
        bookingStatus,
      });

      // 2. Buat Payment
      await this.paymentRepo.create({
        invoiceNumber,
        bookingId: booking.bookingId,
        amount:    occurrence.servicePrice,
        methodId:  selectedPaymentMethod.methodId,
        status:    paymentStatus,
      });

      // 3. Increment booking count customer
      await this.customerRepo.incrementBookingCount(phone).catch((err) =>
        logger.warn('BookingService: gagal increment booking count', { error: err }),
      );

      logger.info('BookingService: booking berhasil dibuat', {
        bookingId: booking.bookingId,
        invoiceNumber,
        phone,
      });

      // 4. Bangun pesan konfirmasi + instruksi bayar
      const confirmMsg = this.buildConfirmationMessage(
        customerName,
        occurrence.serviceName,
        dateLabel,
        timeLabel,
        invoiceNumber,
        selectedPaymentMethod,
        occurrence.servicePrice,
        bookingStatus,
      );

      return { success: true, message: confirmMsg };
    } catch (err) {
      logger.error('BookingService: gagal membuat booking', { error: err, phone });
      return {
        success: false,
        message:
          '😔 Maaf Kak, terjadi kendala saat memproses booking.\n' +
          'Silakan coba lagi atau ketik *5* untuk hubungi admin 🙏',
      };
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildConfirmationMessage(
    customerName: string,
    serviceName: string,
    dateLabel: string,
    timeLabel: string,
    invoiceNumber: string,
    method: PaymentMethod,
    amount: number,
    bookingStatus: string,
  ): string {
    const lines: string[] = [
      `✅ *Booking Berhasil!*\n`,
      `Halo *${customerName}* 😊 Booking Kakak sudah tercatat!\n`,
      `🏃 Kelas   : ${serviceName}`,
      `📅 Tanggal : ${dateLabel}`,
      `⏰ Jam     : ${timeLabel}`,
      `🔖 No. Invoice: *${invoiceNumber}*\n`,
    ];

    if (method.type === 'transfer') {
      lines.push(
        `💳 *Instruksi Pembayaran Transfer*`,
        `Bank         : ${method.label}`,
        `No. Rekening : *${method.accountNumber}*`,
        `Atas Nama    : ${method.accountName}`,
        `Nominal      : *${formatRupiah(amount)}*\n`,
        `Setelah transfer, kirimkan *bukti pembayaran* ke chat ini ya Kak 📸`,
        `Admin akan memverifikasi dalam waktu singkat 😊`,
      );
    } else if (method.type === 'qris') {
      lines.push(
        `💳 *Instruksi Pembayaran QRIS*`,
        `Nominal : *${formatRupiah(amount)}*\n`,
        `Scan QRIS di bawah ini ya Kak 📱`,
        `Setelah bayar, kirimkan *bukti pembayaran* ke chat ini 📸`,
      );
    }

    if (bookingStatus === 'Confirmed') {
      lines.push(`\n🎉 Sampai jumpa di kelas Kania Happy! 💕`);
    } else {
      lines.push(`\n⏳ Booking akan dikonfirmasi setelah pembayaran terverifikasi.`);
      lines.push(`Reminder kelas akan dikirim H-1 dan hari H 📅`);
    }

    return lines.join('\n');
  }
}
