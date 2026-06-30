/**
 * TakeoverService — M6
 *
 * Mengelola human takeover: admin mengambil alih percakapan WA dari bot
 * untuk satu nomor customer tertentu, lalu bot otomatis aktif kembali
 * setelah `TAKEOVER_TIMEOUT_MINUTES` (default 30 menit) — atau admin
 * bisa melepas takeover secara manual lebih awal.
 *
 * Pengecekan "apakah bot harus diam" dilakukan di WhatsAppHandler
 * (findByPhone + cek expiresAt) — TakeoverService di sini fokus pada
 * mutasi state (start/release) dan housekeeping (cleanup expired).
 */

import type { ITakeoverRepository, IAdminLogRepository, ISettingsRepository } from '@domain/repositories';
import type { TakeoverState } from '@domain/entities/index';
import { SETTING_KEYS } from '@domain/entities/index';
import { AppError } from '@shared/types';
import { logger } from '@infrastructure/logger/Logger';

export class TakeoverService {
  constructor(
    private readonly takeoverRepo: ITakeoverRepository,
    private readonly settingsRepo: ISettingsRepository,
    private readonly adminLogRepo: IAdminLogRepository,
  ) {}

  // ── Start ────────────────────────────────────────────────────────────────────

  /**
   * Admin mulai takeover untuk satu nomor.
   * `expiresAt` dihitung dari waktu sekarang + TAKEOVER_TIMEOUT_MINUTES
   * (atau override eksplisit dari caller, mis. untuk testing).
   */
  async startTakeover(
    phone: string,
    adminUsername: string,
    overrideTimeoutMinutes?: number,
  ): Promise<TakeoverState> {
    if (!phone?.trim()) {
      throw AppError.validation('Nomor WA wajib diisi');
    }

    const timeoutMinutes = overrideTimeoutMinutes ?? Number(
      await this.settingsRepo.getValue(SETTING_KEYS.TAKEOVER_TIMEOUT_MINUTES, '30'),
    );

    const expiresAt = new Date(Date.now() + timeoutMinutes * 60_000).toISOString();

    await this.takeoverRepo.setTakeover(phone, adminUsername, expiresAt);

    await this.adminLogRepo.log({
      adminUsername,
      action:      'Takeover',
      targetId:    phone,
      description: `Admin mengambil alih percakapan dengan ${phone} (timeout ${timeoutMinutes} menit)`,
    });

    logger.info('TakeoverService: takeover dimulai', { phone, adminUsername, expiresAt });

    return {
      phone,
      isTakenOver: true,
      takenOverBy: adminUsername,
      startedAt:   new Date().toISOString(),
      expiresAt,
    };
  }

  // ── Release ──────────────────────────────────────────────────────────────────

  /** Admin melepas takeover secara manual — bot langsung aktif lagi. */
  async releaseTakeover(phone: string, adminUsername: string): Promise<void> {
    if (!phone?.trim()) {
      throw AppError.validation('Nomor WA wajib diisi');
    }

    const existing = await this.takeoverRepo.findByPhone(phone);
    if (!existing) {
      throw AppError.notFound(`Tidak ada takeover aktif untuk nomor ${phone}`);
    }

    await this.takeoverRepo.clearTakeover(phone);

    await this.adminLogRepo.log({
      adminUsername,
      action:      'ReleaseTakeover',
      targetId:    phone,
      description: `Admin melepas takeover untuk ${phone}`,
    });

    logger.info('TakeoverService: takeover dilepas', { phone, adminUsername });
  }

  // ── Query ────────────────────────────────────────────────────────────────────

  /** Cek status takeover satu nomor (dipakai admin dashboard). */
  async getStatus(phone: string): Promise<TakeoverState | null> {
    return this.takeoverRepo.findByPhone(phone);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  /**
   * Bersihkan takeover yang sudah lewat expiresAt — dipanggil berkala
   * oleh scheduler (lihat TakeoverCleanupScheduler) agar sheet
   * `Takeover State` tidak menumpuk baris "isTakenOver=true" yang
   * sebenarnya sudah kedaluwarsa (selain itu WhatsAppHandler juga
   * lazy-clear saat pesan masuk dari nomor yang sudah expired).
   */
  async cleanupExpired(): Promise<number> {
    const expired = await this.takeoverRepo.findExpired();
    if (expired.length === 0) return 0;

    let cleaned = 0;
    for (const t of expired) {
      try {
        await this.takeoverRepo.clearTakeover(t.phone);
        cleaned++;
      } catch (err) {
        logger.error('TakeoverService: gagal cleanup takeover expired', {
          phone: t.phone,
          error: err,
        });
      }
    }

    logger.info('TakeoverService: cleanup takeover expired selesai', {
      total: expired.length,
      cleaned,
    });

    return cleaned;
  }
}
