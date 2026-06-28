import type { IncomingMessage } from '@infrastructure/whatsapp/BaileysClient';
import type { BaileysClient } from '@infrastructure/whatsapp/BaileysClient';
import type { ITakeoverRepository, ICustomerRepository } from '@domain/repositories';
import type { MessageRouter } from '@application/bot/MessageRouter';
import { jidToPhone } from '@shared/utils/phoneFormatter';
import { logger } from '@infrastructure/logger/Logger';

/**
 * WhatsAppHandler (Presentation Layer)
 *
 * Tanggung jawab:
 *  - Menerima IncomingMessage dari BaileysClient.
 *  - Cek takeover state — kalau admin sedang chat, bot diam.
 *  - Delegasikan ke MessageRouter untuk mendapatkan teks balasan.
 *  - Kirim balasan via BaileysClient.
 *  - Upsert customer (nama dari pushName jika customer baru).
 *
 * Yang TIDAK dilakukan di sini:
 *  - Logika bisnis (ada di MessageRouter / Service layer).
 *  - Koneksi ke Baileys (itu urusan BaileysClient).
 */
export class WhatsAppHandler {
  constructor(
    private readonly baileysClient: BaileysClient,
    private readonly takeoverRepo: ITakeoverRepository,
    private readonly customerRepo: ICustomerRepository,
    private readonly messageRouter: MessageRouter,
  ) {}

  /**
   * Daftarkan handler ini ke BaileysClient.
   * Dipanggil sekali saat bootstrap.
   */
  register(): void {
    this.baileysClient.onMessage((msg) => this.handleMessage(msg));
    logger.info('WhatsAppHandler: terdaftar dan siap menerima pesan.');
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async handleMessage(msg: IncomingMessage): Promise<void> {
    // Abaikan pesan kosong
    if (!msg.body.trim()) return;

    const phone = jidToPhone(msg.from);

    logger.info('WhatsAppHandler: pesan masuk', {
      phone,
      preview: msg.body.slice(0, 60),
    });

    // ── 1. Cek takeover ────────────────────────────────────────────────────
    const takeover = await this.takeoverRepo.findByPhone(phone).catch(() => null);
    if (takeover?.isTakenOver) {
      const now     = Date.now();
      const expires = new Date(takeover.expiresAt).getTime();
      if (now < expires) {
        logger.debug('WhatsAppHandler: takeover aktif — bot diam', { phone });
        return;
      }
      // Takeover expired → clear otomatis
      await this.takeoverRepo.clearTakeover(phone).catch((err) =>
        logger.warn('WhatsAppHandler: gagal clear takeover expired', { error: err }),
      );
    }

    // ── 2. Upsert customer ─────────────────────────────────────────────────
    await this.upsertCustomer(phone, msg.pushName);

    // ── 3. Routing & balas ────────────────────────────────────────────────
    try {
      const reply = await this.messageRouter.handle(msg.body);
      await this.baileysClient.sendText(msg.from, reply);

      logger.debug('WhatsAppHandler: balasan terkirim', {
        phone,
        replyPreview: reply.slice(0, 60),
      });
    } catch (err) {
      logger.error('WhatsAppHandler: gagal memproses pesan', {
        phone,
        error: err,
      });

      // Kirim pesan error generic supaya customer tidak menunggu tanpa jawaban
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
      // Non-fatal — jangan sampai gagal upsert menghentikan alur balasan
      logger.warn('WhatsAppHandler: gagal upsert customer', { phone, error: err });
    }
  }
}
