import cron from 'node-cron';
import type { ReminderService } from './ReminderService';
import type { ISettingsRepository } from '@domain/repositories';
import { SETTING_KEYS } from '@domain/entities/index';
import { logger } from '@infrastructure/logger/Logger';

/**
 * ReminderScheduler
 *
 * Menggunakan node-cron untuk menjalankan ReminderService pada jam yang
 * dikonfigurasi di sheet Settings.
 *
 * Jadwal dibaca SEKALI saat `start()` dipanggil.
 * Jika admin mengubah jam reminder di Settings, server perlu di-restart
 * agar perubahan berlaku (trade-off simplicity vs. dynamic reload).
 *
 * Format waktu yang dipakai: "HH:mm" (WIB / Asia/Jakarta).
 * Node-cron expression: "mm HH * * *"
 *
 * Contoh:
 *   reminder_h1_time  = "08:00"  → cron "0 8 * * *"
 *   reminder_hd_time  = "06:00"  → cron "0 6 * * *"
 */
export class ReminderScheduler {
  private readonly jobs: cron.ScheduledTask[] = [];

  constructor(
    private readonly reminderService: ReminderService,
    private readonly settingsRepo: ISettingsRepository,
  ) {}

  async start(): Promise<void> {
    const h1Time  = await this.settingsRepo.getValue(SETTING_KEYS.REMINDER_H1_TIME, '08:00');
    const hdTime  = await this.settingsRepo.getValue(SETTING_KEYS.REMINDER_HD_TIME, '06:00');

    const h1Expression = this.timeToCron(h1Time);
    const hdExpression = this.timeToCron(hdTime);

    logger.info('ReminderScheduler: mendaftarkan cron jobs', {
      h1: `${h1Time} WIB  (${h1Expression})`,
      hd: `${hdTime} WIB  (${hdExpression})`,
    });

    // ── Cron H-1 ──────────────────────────────────────────────────────────────
    const h1Job = cron.schedule(
      h1Expression,
      async () => {
        logger.info('ReminderScheduler: trigger H-1');
        try {
          await this.reminderService.sendH1Reminders();
        } catch (err) {
          logger.error('ReminderScheduler: error saat kirim H-1', { error: err });
        }
      },
      { timezone: 'Asia/Jakarta' },
    );

    // ── Cron Hari H ───────────────────────────────────────────────────────────
    const hdJob = cron.schedule(
      hdExpression,
      async () => {
        logger.info('ReminderScheduler: trigger hari H');
        try {
          await this.reminderService.sendHariHReminders();
        } catch (err) {
          logger.error('ReminderScheduler: error saat kirim hari H', { error: err });
        }
      },
      { timezone: 'Asia/Jakarta' },
    );

    this.jobs.push(h1Job, hdJob);
    logger.info('ReminderScheduler: cron jobs aktif ✓');
  }

  /** Hentikan semua cron jobs — dipakai saat graceful shutdown. */
  stop(): void {
    for (const job of this.jobs) {
      job.stop();
    }
    this.jobs.length = 0;
    logger.info('ReminderScheduler: semua cron jobs dihentikan');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Konversi string "HH:mm" ke ekspresi cron "mm HH * * *".
   * Validasi format; gunakan default jika tidak valid.
   */
  private timeToCron(hhmm: string, fallback = '0 8 * * *'): string {
    const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      logger.warn('ReminderScheduler: format jam tidak valid, pakai default', { hhmm });
      return fallback;
    }
    const [, hh, mm] = match;
    return `${parseInt(mm!, 10)} ${parseInt(hh!, 10)} * * *`;
  }
}
