import makeWASocket, {
  type WASocket,
  type ConnectionState,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import * as path from 'path';
import { env } from '@shared/config/env';
import { logger } from '@infrastructure/logger/Logger';
import { AppError } from '@shared/types';

export type IncomingMessage = {
  from: string;      // nomor WA pengirim, format: '628xxxxxx@s.whatsapp.net'
  body: string;      // teks pesan (kosong jika bukan teks)
  messageId: string;
  timestamp: number;
  isGroup: boolean;
  pushName?: string; // nama kontak di WA
};

export type MessageHandler = (msg: IncomingMessage) => Promise<void>;
export type QrHandler     = (qr: string) => void;
export type ReadyHandler  = () => void;

/**
 * Adapter logger untuk Baileys.
 *
 * Baileys mengharapkan interface Pino (trace/debug/info/warn/error/fatal/child).
 * Kita matikan SEMUA level (no-op) karena:
 *  1. Winston tidak punya trace/fatal → crash jika di-pass langsung.
 *  2. Log internal Baileys sangat verbose dan tidak relevan untuk aplikasi kita.
 *  3. Error bisnis yang penting sudah kita log sendiri di handler masing-masing.
 *
 * `child()` wajib mengembalikan objek dengan interface yang sama karena Baileys
 * memanggil .child() saat membuat sub-logger per modul.
 */
function makeBaileysLogger(): Record<string, unknown> {
  const noop = () => undefined;
  const logger: Record<string, unknown> = {
    level:  'silent',
    trace:  noop,
    debug:  noop,
    info:   noop,
    warn:   noop,
    error:  noop,
    fatal:  noop,
  };
  // child() harus mengembalikan objek yang sama (recursive)
  logger['child'] = () => logger;
  return logger;
}

/**
 * BaileysClient — wrapper tipis atas @whiskeysockets/baileys.
 *
 * Tanggung jawab:
 *  - Mengelola koneksi WebSocket ke WhatsApp Web.
 *  - Menyimpan & memuat session multi-file (persisten antar restart).
 *  - Menerima pesan masuk dan meneruskannya ke handler terdaftar.
 *  - Menyediakan method kirim pesan (teks / gambar / dokumen).
 *  - Auto-reconnect saat koneksi putus.
 *  - Emit QR ke handler (Dashboard, terminal).
 *
 * Yang TIDAK dilakukan di sini:
 *  - Logika bisnis (booking, FAQ, dll.) — itu urusan Service layer.
 *  - Parsing konten bisnis — itu urusan WhatsApp handler di Application layer.
 */
export class BaileysClient {
  private socket: WASocket | null = null;
  private readonly sessionDir: string;
  private messageHandlers: MessageHandler[] = [];
  private qrHandlers:      QrHandler[]      = [];
  private readyHandlers:   ReadyHandler[]   = [];
  private isConnected = false;

  constructor() {
    this.sessionDir = path.resolve(env.BAILEYS_SESSION_DIR);
    this.ensureSessionDir();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
    const baileysLogger = makeBaileysLogger();

    this.socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore(state.keys, baileysLogger as any),
      },
      logger:                        baileysLogger as any,
      generateHighQualityLinkPreview: false,
      syncFullHistory:                false,
      markOnlineOnConnect:            false,
    });

    this.socket.ev.on('creds.update', saveCreds);
    this.socket.ev.on('connection.update', (u) => this.handleConnectionUpdate(u));

    // Baileys mengirim event ini saat pertama kali connect atau history sync.
    // Kita daftarkan handler kosong supaya Baileys tahu event sudah di-consume
    // dan tidak mencoba retry yang bisa memunculkan "error in handling message".
    this.socket.ev.on('messaging-history.set', () => {
      logger.debug('BaileysClient: messaging history sync selesai.');
    });

    this.socket.ev.on('messages.upsert', (e) => this.handleMessagesUpsert(e));

    logger.info('BaileysClient: memulai koneksi ke WhatsApp...');
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      await this.socket.logout();
      this.socket      = null;
      this.isConnected = false;
      logger.info('BaileysClient: koneksi diputus.');
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  // ── Kirim Pesan ───────────────────────────────────────────────────────────

  async sendText(to: string, text: string): Promise<void> {
    this.assertConnected();
    await this.socket!.sendMessage(this.toJid(to), { text });
    logger.debug(`BaileysClient: teks dikirim ke ${to}`);
  }

  async sendImage(to: string, imageBuffer: Buffer, caption?: string): Promise<void> {
    this.assertConnected();
    await this.socket!.sendMessage(this.toJid(to), { image: imageBuffer, caption });
    logger.debug(`BaileysClient: gambar dikirim ke ${to}`);
  }

  async sendDocument(
    to:             string,
    documentBuffer: Buffer,
    filename:       string,
    mimetype:       string,
  ): Promise<void> {
    this.assertConnected();
    await this.socket!.sendMessage(this.toJid(to), {
      document: documentBuffer,
      fileName: filename,
      mimetype,
    });
    logger.debug(`BaileysClient: dokumen "${filename}" dikirim ke ${to}`);
  }

  // ── Handler Registration ──────────────────────────────────────────────────

  onMessage(handler: MessageHandler): void { this.messageHandlers.push(handler); }
  onQr(handler: QrHandler):           void { this.qrHandlers.push(handler); }
  onReady(handler: ReadyHandler):      void { this.readyHandlers.push(handler); }

  // ── Private ───────────────────────────────────────────────────────────────

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('BaileysClient: QR code tersedia — scan dengan WhatsApp.');
      this.printQrToTerminal(qr);
      this.qrHandlers.forEach((h) => h(qr));
    }

    if (connection === 'open') {
      this.isConnected = true;
      logger.info('BaileysClient: terhubung ke WhatsApp ✓');
      this.readyHandlers.forEach((h) => h());
    }

    if (connection === 'close') {
      this.isConnected = false;
      const statusCode      = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(
        `BaileysClient: koneksi ditutup (kode=${statusCode}, reconnect=${shouldReconnect})`,
      );

      if (shouldReconnect) {
        setTimeout(() => {
          logger.info('BaileysClient: mencoba reconnect...');
          this.connect().catch((err) =>
            logger.error('BaileysClient: gagal reconnect', { error: err }),
          );
        }, 5_000);
      } else {
        logger.warn(
          'BaileysClient: sesi di-logout. ' +
          `Hapus folder "${this.sessionDir}" dan restart untuk scan QR ulang.`,
        );
      }
    }
  }

  private async handleMessagesUpsert(event: {
    messages: proto.IWebMessageInfo[];
    type:     string;
  }): Promise<void> {
    // 'append' = history sync, 'notify' = pesan baru masuk real-time
    if (event.type !== 'notify') return;

    for (const msg of event.messages) {
      if (msg.key.fromMe) continue;

      const incoming = this.parseMessage(msg);
      if (!incoming) continue;

      for (const handler of this.messageHandlers) {
        try {
          await handler(incoming);
        } catch (err) {
          logger.error('BaileysClient: message handler error', { error: err });
        }
      }
    }
  }

  private parseMessage(msg: proto.IWebMessageInfo): IncomingMessage | null {
    const jid = msg.key.remoteJid;
    if (!jid) return null;

    // Abaikan grup (belum diperlukan di milestone ini)
    if (jid.endsWith('@g.us')) return null;

    const body =
      msg.message?.conversation ??
      msg.message?.extendedTextMessage?.text ??
      '';

    return {
      from:      jid,
      body,
      messageId: msg.key.id ?? '',
      timestamp: (msg.messageTimestamp as number) ?? Math.floor(Date.now() / 1000),
      isGroup:   false,
      pushName:  msg.pushName ?? undefined,
    };
  }

  private toJid(phoneOrJid: string): string {
    if (phoneOrJid.includes('@')) return phoneOrJid;
    return `${phoneOrJid.replace(/^\+/, '')}@s.whatsapp.net`;
  }

  private assertConnected(): void {
    if (!this.isConnected || !this.socket) {
      throw AppError.externalService('WhatsApp belum terhubung. Scan QR terlebih dahulu.');
    }
  }

  private ensureSessionDir(): void {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
      logger.info(`BaileysClient: direktori session dibuat di ${this.sessionDir}`);
    }
  }

  private printQrToTerminal(qr: string): void {
    import('qrcode')
      .then((QRCode) => {
        QRCode.toString(qr, { type: 'terminal', small: true }, (err, text) => {
          if (!err) process.stdout.write(`\n${text}\n`);
        });
      })
      .catch(() => {
        logger.info(`QR raw (paste ke https://qr.io untuk scan): ${qr}`);
      });
  }
}