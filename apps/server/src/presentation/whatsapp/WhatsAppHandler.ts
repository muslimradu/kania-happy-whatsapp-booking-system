import type { IncomingMessage } from '@infrastructure/whatsapp/BaileysClient';
import type { BaileysClient } from '@infrastructure/whatsapp/BaileysClient';
import type { ITakeoverRepository, ICustomerRepository } from '@domain/repositories';
import type { MessageRouter } from '@application/bot/MessageRouter';
import { jidToPhone, normalizePhone } from '@shared/utils/phoneFormatter';
import { logger } from '@infrastructure/logger/Logger';

/**
 * WhatsAppHandler (Presentation Layer)
 *
 * Perubahan M3-fix:
 *  1. Nomor WA disimpan dalam format E.164 bersih (628xxx) via normalizePhone().
 *     Baileys kadang mengirim JID dalam format internal WA (mis. 273xxx)
 *     bukan format internasional — normalizePhone() memastikan konsistensi.
 *  2. Nama customer TIDAK lagi diambil dari pushName (nama kontak WA).
 *     Customer baru akan diminta menginput nama sendiri di step booking (INPUT_NAME).
 *     upsertCustomer() hanya membuat record baru dengan name='' jika belum ada,
 *     sehingga flow booking tahu customer ini belum punya nama.
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

    // Normalisasi nomor ke format 628xxx yang konsisten
    const phone = normalizePhone(jidToPhone(msg.from));

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

    // ── 2. Pastikan customer ada di sheet (tanpa isi nama dari pushName) ──────
    await this.ensureCustomerExists(phone);

    // ── 3. Route & balas ─────────────────────────────────────────────────────
    try {
      const result = await this.messageRouter.handle(phone, msg.body);

      for (const text of result.messages) {
        await this.baileysClient.sendText(msg.from, text);
      }

      if (result.qrisUrl) {
        await this.baileysClient
          .sendImageFromUrl(msg.from, result.qrisUrl, 'Scan QRIS ini untuk pembayaran 📱')
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

  /**
   * Pastikan customer sudah ada di sheet Customer.
   * Jika belum ada, buat record baru dengan name = '' (kosong).
   * Nama akan diisi saat customer pertama kali booking (step INPUT_NAME).
   *
   * TIDAK menggunakan pushName — nama kontak WA rawan berbeda dengan
   * nama asli customer dan tidak bisa diandalkan.
   */
  private async ensureCustomerExists(phone: string): Promise<void> {
    try {
      const existing = await this.customerRepo.findByPhone(phone);
      if (!existing) {
        // Buat record baru, nama kosong — akan diisi saat booking
        await this.customerRepo.upsert({ phone, name: '' });
        logger.debug('WhatsAppHandler: customer baru terdaftar', { phone });
      }
    } catch (err) {
      // Non-fatal
      logger.warn('WhatsAppHandler: gagal ensure customer', { phone, error: err });
    }
  }
}
