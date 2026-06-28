import type { IServiceRepository, ISettingsRepository } from '@domain/repositories';
import type { FaqLookupService } from '@application/faq/FaqLookupService';
import type { GetAvailableScheduleService } from '@application/schedule/GetAvailableScheduleService';
import { DAY_NAMES } from '@domain/entities/Schedule';
import { formatDateDisplay, formatTimeDisplay, formatRupiah } from '@shared/utils/dateHelper';
import { logger } from '@infrastructure/logger/Logger';

/**
 * Intent yang bisa dideteksi dari pesan customer.
 */
export type Intent =
  | 'GREETING'
  | 'SHOW_SERVICES'
  | 'SHOW_SCHEDULE'
  | 'BOOKING'
  | 'FAQ'
  | 'UNKNOWN';

// ── Keyword maps ──────────────────────────────────────────────────────────────

const GREETING_KEYWORDS = ['halo', 'hai', 'hi', 'hei', 'hello', 'assalamualaikum', 'selamat', 'permisi', 'pagi', 'siang', 'sore', 'malam'];
const SERVICE_KEYWORDS  = ['layanan', 'kelas', 'program', 'senam', 'harga', 'tarif', 'biaya', 'paket', 'info', 'daftar', 'ada apa saja', 'apa saja'];
const SCHEDULE_KEYWORDS = ['jadwal', 'jam', 'hari', 'kapan', 'schedule', 'waktu'];
const BOOKING_KEYWORDS  = ['booking', 'daftar', 'pesan', 'reservasi', 'ikut', 'gabung', 'mau daftar', 'mau ikut', 'mau booking'];

/**
 * MessageRouter
 *
 * Tanggung jawab: mendeteksi intent pesan customer dan menghasilkan teks balasan.
 * Ini adalah SATU-SATUNYA tempat logika routing bot berada.
 *
 * Sesuai desain §10:
 *  1. Menu angka diproses di sini (1=Layanan, 2=Jadwal, 3=Booking, 4=FAQ).
 *  2. Intent keyword dideteksi untuk pesan bebas.
 *  3. FAQ selalu dicoba sebelum UNKNOWN.
 */
export class MessageRouter {
  constructor(
    private readonly serviceRepo: IServiceRepository,
    private readonly settingsRepo: ISettingsRepository,
    private readonly faqService: FaqLookupService,
    private readonly scheduleService: GetAvailableScheduleService,
  ) {}

  /**
   * Proses pesan masuk dan kembalikan teks balasan.
   * Kembalikan null jika tidak ada yang perlu dibalas (seharusnya tidak terjadi di M2).
   */
  async handle(message: string): Promise<string> {
    const trimmed = message.trim();
    const lower   = trimmed.toLowerCase();

    // ── 1. Menu angka ─────────────────────────────────────────────────────────
    if (/^[1-5]$/.test(trimmed)) {
      return this.handleMenuNumber(trimmed);
    }

    // ── 2. Greeting ──────────────────────────────────────────────────────────
    if (GREETING_KEYWORDS.some((kw) => lower.includes(kw))) {
      return this.buildWelcomeMessage();
    }

    // ── 3. Intent Keyword Detection ──────────────────────────────────────────
    if (SERVICE_KEYWORDS.some((kw) => lower.includes(kw))) {
      return this.buildServicesMessage();
    }

    if (SCHEDULE_KEYWORDS.some((kw) => lower.includes(kw))) {
      return this.buildScheduleMessage();
    }

    if (BOOKING_KEYWORDS.some((kw) => lower.includes(kw))) {
      return this.buildBookingTeaser();
    }

    // ── 4. FAQ Lookup ────────────────────────────────────────────────────────
    const faq = await this.faqService.lookup(lower);
    if (faq) {
      logger.debug('MessageRouter: FAQ match', { faqId: faq.faqId });
      return faq.answer;
    }

    // ── 5. Fallback ──────────────────────────────────────────────────────────
    return this.buildFallbackMessage();
  }

  // ── Private builders ───────────────────────────────────────────────────────

  private async handleMenuNumber(num: string): Promise<string> {
    switch (num) {
      case '1': return this.buildServicesMessage();
      case '2': return this.buildScheduleMessage();
      case '3': return this.buildBookingTeaser();
      case '4': return this.buildFaqMenuMessage();
      case '5': return this.buildContactMessage();
      default:  return this.buildWelcomeMessage();
    }
  }

  async buildWelcomeMessage(): Promise<string> {
    const greeting = await this.settingsRepo.getValue('welcome_message', '');
    if (greeting) return greeting;

    return (
      'Halo Kak! 😊 Selamat datang di *Kania Happy Sanggar Senam* 💕\n\n' +
      'Saya siap membantu Kakak untuk:\n' +
      '1️⃣ Lihat layanan & harga\n' +
      '2️⃣ Cek jadwal kelas\n' +
      '3️⃣ Booking kelas\n' +
      '4️⃣ FAQ & info lainnya\n' +
      '5️⃣ Hubungi admin\n\n' +
      'Ketik angka pilihannya ya Kak 😊'
    );
  }

  private async buildServicesMessage(): Promise<string> {
    const services = await this.serviceRepo.findActive();

    if (services.length === 0) {
      return 'Mohon maaf Kak, saat ini belum ada layanan yang tersedia. Silakan hubungi admin untuk info lebih lanjut 🙏';
    }

    const lines = services.map(
      (s, i) => `${i + 1}. *${s.name}*\n   💰 ${formatRupiah(s.price)}`,
    );

    return (
      '🏃‍♀️ *Layanan Kania Happy*\n\n' +
      lines.join('\n\n') +
      '\n\n_Ketik *2* untuk melihat jadwal, atau *3* untuk booking_ 😊'
    );
  }

  private async buildScheduleMessage(): Promise<string> {
    const occurrences = await this.scheduleService.getOccurrences();

    if (occurrences.length === 0) {
      return 'Mohon maaf Kak, tidak ada jadwal kelas dalam waktu dekat. Silakan cek lagi nanti atau hubungi admin 🙏';
    }

    // Kelompokkan per tanggal
    const byDate = new Map<string, typeof occurrences>();
    for (const occ of occurrences) {
      const list = byDate.get(occ.date) ?? [];
      list.push(occ);
      byDate.set(occ.date, list);
    }

    const blocks: string[] = [];
    for (const [date, occs] of byDate) {
      const dateLabel = formatDateDisplay(date);
      const items = occs.map(
        (o) =>
          `   • *${o.serviceName}*\n` +
          `     ⏰ ${formatTimeDisplay(o.schedule.timeStart)} - ${formatTimeDisplay(o.schedule.timeEnd)} WIB\n` +
          `     💰 ${formatRupiah(o.servicePrice)}`,
      );
      blocks.push(`📅 *${dateLabel}*\n${items.join('\n')}`);
    }

    return (
      '🗓️ *Jadwal Kelas Kania Happy*\n\n' +
      blocks.join('\n\n') +
      '\n\n_Ketik *3* untuk booking kelas_ 😊'
    );
  }

  private buildBookingTeaser(): string {
    return (
      '📝 *Booking Kelas*\n\n' +
      'Fitur booking sedang disiapkan ya Kak! 🙏\n\n' +
      'Untuk saat ini, silakan hubungi admin kami langsung:\n' +
      'Ketik *5* untuk info kontak admin 😊'
    );
  }

  private buildFaqMenuMessage(): string {
    return (
      '❓ *FAQ & Info*\n\n' +
      'Silakan ketikkan pertanyaan Kakak, saya akan coba jawab!\n\n' +
      'Contoh:\n' +
      '• _"Berapa harga senam aerobik?"_\n' +
      '• _"Apakah ada kelas untuk pemula?"_\n' +
      '• _"Cara bayarnya bagaimana?"_\n\n' +
      '_Atau ketik *1* untuk lihat layanan, *2* untuk jadwal_ 😊'
    );
  }

  private async buildContactMessage(): Promise<string> {
    const phone   = await this.settingsRepo.getValue('business_phone', '');
    const address = await this.settingsRepo.getValue('business_address', '');

    let msg = '📞 *Hubungi Admin Kania Happy*\n\n';
    if (phone)   msg += `📱 WhatsApp: ${phone}\n`;
    if (address) msg += `📍 Alamat: ${address}\n`;
    msg += '\nAdmin kami siap membantu Kakak 😊';
    return msg;
  }

  private buildFallbackMessage(): string {
    return (
      'Maaf Kak, saya belum bisa memahami pertanyaan tersebut 🙏\n\n' +
      'Coba pilih menu berikut:\n' +
      '1️⃣ Lihat layanan & harga\n' +
      '2️⃣ Cek jadwal kelas\n' +
      '3️⃣ Booking kelas\n' +
      '4️⃣ FAQ & info lainnya\n' +
      '5️⃣ Hubungi admin\n\n' +
      'Atau ketik pertanyaan Kakak secara langsung 😊'
    );
  }
}
