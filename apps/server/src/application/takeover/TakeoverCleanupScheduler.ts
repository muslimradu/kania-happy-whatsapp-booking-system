/**
 * TakeoverCleanupScheduler — M6
 *
 * Menjalankan TakeoverService.cleanupExpired() secara berkala (default
 * tiap 5 menit) untuk membersihkan baris takeover yang sudah lewat
 * expiresAt tapi belum di-clear (mis. karena nomor tersebut tidak
 * mengirim pesan lagi setelah timeout, sehingga lazy-clear di
 * WhatsAppHandler tidak pernah terpicu).
 *
 * Interval cron tetap (tidak dikonfigurasi via Settings) — ini murni
 * housekeeping, bukan fitur yang admin perlu atur jamnya.
 */

import cron from 'node-cron';
import type { TakeoverService } from './TakeoverService';
import { logger } from '@infrastructure/logger/Logger';

const DEFAULT_CRON_EXPRESSION = '*/5 * * * *'; // tiap 5 menit

export class TakeoverCleanupScheduler {
  private job: cron.ScheduledTask | null = null;

  constructor(
    private readonly takeoverService: TakeoverService,
    private readonly cronExpression: string = DEFAULT_CRON_EXPRESSION,
  ) {}

  start(): void {
    this.job = cron.schedule(
      this.cronExpression,
      async () => {
        try {
          await this.takeoverService.cleanupExpired();
        } catch (err) {
          logger.error('TakeoverCleanupScheduler: error saat cleanup', { error: err });
        }
      },
      { timezone: 'Asia/Jakarta' },
    );

    logger.info('TakeoverCleanupScheduler: cron job aktif ✓', {
      cron: this.cronExpression,
    });
  }

  stop(): void {
    this.job?.stop();
    this.job = null;
    logger.info('TakeoverCleanupScheduler: cron job dihentikan');
  }
}
