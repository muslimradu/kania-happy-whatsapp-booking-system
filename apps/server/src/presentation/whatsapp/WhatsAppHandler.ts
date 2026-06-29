import type { IncomingMessage } from '@infrastructure/whatsapp/BaileysClient';
import type { BaileysClient } from '@infrastructure/whatsapp/BaileysClient';
import type { ITakeoverRepository, ICustomerRepository } from '@domain/repositories';
import type { MessageRouter } from '@application/bot/MessageRouter';
import { jidToPhone } from '@shared/utils/phoneFormatter';
import { logger } from '@infrastructure/logger/Logger';

/**
 * WhatsAppHandler (Presentation Layer)
 *
 * Perubahan dari M2:
 *  - `handle()` sekarang menerima RouterResult (array messages + optional qrisUrl).
 *  - Kirim pesan satu per satu secara berurutan (await each).
 *  - Jika ada qrisUrl, kirim gambar QRIS setelah semua pesan teks.
 */
export class WhatsAppHandler {
  constructor(
    private readonly baileysClient: BaileysClient,
    private readonly takeoverRepo: ITakeoverRepository,
    private readonly customerRepo: ICustomerRepository,
    private readonly messageRouter: MessageRouter,
  ) {}

  register(): void {
    this.baileysClient.onMessage((msg) => this.handleMessage(msg));
    logger.info('WhatsAppHandler: terdaftar dan siap menerima pesan.');
  }

  private async handleMessage(msg: IncomingMessage): Promise<void> {
    if (!msg.body.trim()) return;

    const phone = jidToPhone(msg.from);

    logger.info('WhatsAppHandler: pesan masuk', {
      phone,
      preview: msg.body.slice(0, 60),
    });

    // ── 1. Cek takeover ──────────────────────────────────────────────────────
    const takeover = await this.takeoverRepo.findByPhone(phone).catch(() => null);
    if (takeover?.isTakenOver) {
      const now     = Date.now();
      const expires = new Date(takeover.expiresAt).getTime();
      if (now < expires) {
        logger.debug('WhatsAppHandler: takeover aktif — bot diam', { phone });
        return;
      }
      await this.takeoverRepo.clearTakeover(phone).catch((err) =>
        logger.warn('WhatsAppHandler: gagal clear takeover expired', { error: err }),
      );
    }

    // ── 2. Upsert customer ───────────────────────────────────────────────────
    await this.upsertCustomer(phone, msg.pushName);

    // ── 3. Route & balas ─────────────────────────────────────────────────────
    try {
      const result = await this.messageRouter.handle(phone, msg.body);

      // Kirim setiap pesan teks berurutan
      for (const text of result.messages) {
        await this.baileysClient.sendText(msg.from, text);
      }

      // Kirim gambar QRIS jika ada
      if (result.qrisUrl) {
        await this.baileysClient
          .sendImage(msg.from, result.qrisUrl, 'Scan QRIS ini untuk pembayaran 📱')
          .catch((err) =>
            logger.warn('WhatsAppHandler: gagal kirim gambar QRIS', { error: err }),
          );
      }

      logger.debug('WhatsAppHandler: balasan terkirim', {
        phone,
        messageCount: result.messages.length,
        hasQris: !!result.qrisUrl,
      });
    } catch (err) {
      logger.error('WhatsAppHandler: gagal memproses pesan', { phone, error: err });
      await this.baileysClient
        .sendText(
          msg.from,
          'Mohon maaf Kak, terjadi gangguan sementara 🙏 Silakan coba lagi atau hubungi admin.',
        )
        .catch(() => undefined);
    }
  }

  private async upsertCustomer(phone: string, pushName?: string): Promise<void> {
    try {
      const name = pushName?.trim() || phone;
      await this.customerRepo.upsert({ phone, name });
    } catch (err) {
      logger.warn('WhatsAppHandler: gagal upsert customer', { phone, error: err });
    }
  }
}
