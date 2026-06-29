import type { IBookingRepository } from '@domain/repositories';
import type { ISettingsRepository } from '@domain/repositories';
import type { BaileysClient } from '@infrastructure/whatsapp/BaileysClient';
import type { Booking } from '@domain/entities/Booking';
import { SETTING_KEYS } from '@domain/entities/index';
import { addDays, formatDateDisplay, formatTimeDisplay, todayJakarta } from '@shared/utils/dateHelper';
import { phoneToJid } from '@shared/utils/phoneFormatter';
import { logger } from '@infrastructure/logger/Logger';

/**
 * ReminderService
 *
 * Kirim reminder WhatsApp ke peserta booking yang Confirmed dan
 * belum menerima reminder jenis tertentu.
 *
 * Idempotent: booking yang sudah di-mark tidak akan dikirim ulang,
 * aman jika cron terpanggil lebih dari sekali (misal server restart).
 *
 * Dua jenis reminder:
 *  H-1    → dikirim sehari sebelum kelas
 *  Hari H → dikirim pada hari kelas berlangsung
 */
export class ReminderService {
  constructor(
    private readonly bookingRepo: IBookingRepository,
    private readonly settingsRepo: ISettingsRepository,
    private readonly baileysClient: BaileysClient,
  ) {}

  // ── H-1 ─────────────────────────────────────────────────────────────────────

  async sendH1Reminders(): Promise<void> {
    const tomorrow = addDays(todayJakarta(), 1);
    logger.info('ReminderService: mulai kirim reminder H-1', { targetDate: tomorrow });

    const pending = await this.bookingRepo.findPendingReminders('h1');
    const targets = pending.filter((b) => b.bookingDate === tomorrow);

    if (targets.length === 0) {
      logger.info('ReminderService: tidak ada reminder H-1 yang perlu dikirim');
      return;
    }

    const businessName = await this.settingsRepo.getValue(
      SETTING_KEYS.BUSINESS_NAME, 'Kania Happy',
    );

    let sent = 0, failed = 0;

    for (const booking of targets) {
      try {
        const message = this.buildH1Message(booking, businessName);
        await this.baileysClient.sendText(phoneToJid(booking.customerPhone), message);
        await this.bookingRepo.markReminderSent(booking.bookingId, 'h1');
        sent++;
        logger.info('ReminderService: reminder H-1 terkirim', {
          bookingId: booking.bookingId,
          phone:     booking.customerPhone,
        });
      } catch (err) {
        failed++;
        logger.error('ReminderService: gagal kirim reminder H-1', {
          bookingId: booking.bookingId,
          phone:     booking.customerPhone,
          error:     err,
        });
      }
    }

    logger.info('ReminderService: selesai kirim reminder H-1', {
      total: targets.length, sent, failed,
    });
  }

  // ── Hari H ───────────────────────────────────────────────────────────────────

  async sendHariHReminders(): Promise<void> {
    const today = todayJakarta();
    logger.info('ReminderService: mulai kirim reminder hari H', { targetDate: today });

    const pending = await this.bookingRepo.findPendingReminders('hariH');
    const targets = pending.filter((b) => b.bookingDate === today);

    if (targets.length === 0) {
      logger.info('ReminderService: tidak ada reminder hari H yang perlu dikirim');
      return;
    }

    const businessName = await this.settingsRepo.getValue(
      SETTING_KEYS.BUSINESS_NAME, 'Kania Happy',
    );
    const businessAddress = await this.settingsRepo.getValue(
      SETTING_KEYS.BUSINESS_ADDRESS, '',
    );

    let sent = 0, failed = 0;

    for (const booking of targets) {
      try {
        const message = this.buildHariHMessage(booking, businessName, businessAddress);
        await this.baileysClient.sendText(phoneToJid(booking.customerPhone), message);
        await this.bookingRepo.markReminderSent(booking.bookingId, 'hariH');
        sent++;
        logger.info('ReminderService: reminder hari H terkirim', {
          bookingId: booking.bookingId,
          phone:     booking.customerPhone,
        });
      } catch (err) {
        failed++;
        logger.error('ReminderService: gagal kirim reminder hari H', {
          bookingId: booking.bookingId,
          phone:     booking.customerPhone,
          error:     err,
        });
      }
    }

    logger.info('ReminderService: selesai kirim reminder hari H', {
      total: targets.length, sent, failed,
    });
  }

  // ── Message builders ─────────────────────────────────────────────────────────

  private buildH1Message(booking: Booking, businessName: string): string {
    const dateLabel = formatDateDisplay(booking.bookingDate);
    const timeLabel = booking.scheduleTime
      ? `${formatTimeDisplay(booking.scheduleTime)} WIB`
      : 'sesuai jadwal';

    return (
      `🔔 *Reminder Kelas Besok!*\n\n` +
      `Halo *${booking.customerName}* 😊\n\n` +
      `Mengingatkan bahwa Kakak memiliki kelas besok:\n\n` +
      `🏃 Kelas   : ${booking.serviceName || 'Kelas senam'}\n` +
      `📅 Tanggal : ${dateLabel}\n` +
      `⏰ Jam     : ${timeLabel}\n` +
      `🔖 Invoice : ${booking.invoiceNumber}\n\n` +
      `Sampai jumpa di *${businessName}* ya Kak! 💕\n\n` +
      `_Ketik pesan jika ada pertanyaan 😊_`
    );
  }

  private buildHariHMessage(
    booking: Booking,
    businessName: string,
    businessAddress: string,
  ): string {
    const timeLabel = booking.scheduleTime
      ? `${formatTimeDisplay(booking.scheduleTime)} WIB`
      : 'sesuai jadwal';
    const addressLine = businessAddress
      ? `📍 Lokasi  : ${businessAddress}\n`
      : '';

    return (
      `🎉 *Hari ini kelas Kakak!*\n\n` +
      `Halo *${booking.customerName}* 😊\n\n` +
      `Kelas Kakak berlangsung hari ini:\n\n` +
      `🏃 Kelas   : ${booking.serviceName || 'Kelas senam'}\n` +
      `⏰ Jam     : ${timeLabel}\n` +
      `${addressLine}` +
      `🔖 Invoice : ${booking.invoiceNumber}\n\n` +
      `Jangan lupa:\n` +
      `✅ Hadir 5–10 menit sebelum kelas\n` +
      `✅ Bawa pakaian olahraga yang nyaman\n` +
      `✅ Bawa minum yang cukup\n\n` +
      `Semangat Kak! 💪 Sampai jumpa di *${businessName}* 💕`
    );
  }
}
