import type { IServiceRepository, ISettingsRepository } from '@domain/repositories';
import type { FaqLookupService } from '@application/faq/FaqLookupService';
import type { GetAvailableScheduleService } from '@application/schedule/GetAvailableScheduleService';
import type { BookingFlowHandler } from '@application/booking/BookingFlowHandler';
import type { ConversationStateStore } from '@infrastructure/state/ConversationStateStore';
import { DAY_NAMES } from '@domain/entities/Schedule';
import { formatDateDisplay, formatTimeDisplay, formatRupiah } from '@shared/utils/dateHelper';
import { logger } from '@infrastructure/logger/Logger';

export type Intent =
  | 'GREETING'
  | 'SHOW_SERVICES'
  | 'SHOW_SCHEDULE'
  | 'BOOKING'
  | 'FAQ'
  | 'UNKNOWN';

const GREETING_KEYWORDS = ['halo', 'hai', 'hi', 'hei', 'hello', 'assalamualaikum', 'selamat', 'permisi', 'pagi', 'siang', 'sore', 'malam'];
const SERVICE_KEYWORDS  = ['layanan', 'kelas', 'program', 'senam', 'harga', 'tarif', 'biaya', 'paket', 'info', 'daftar', 'ada apa saja', 'apa saja'];
const SCHEDULE_KEYWORDS = ['jadwal', 'jam', 'hari', 'kapan', 'schedule', 'waktu'];
const BOOKING_KEYWORDS  = ['booking', 'pesan', 'reservasi', 'ikut', 'gabung', 'mau daftar', 'mau ikut', 'mau booking', 'daftar kelas'];

/**
 * MessageRouter
 *
 * Sekarang mendukung 2 mode:
 *  A) Customer sedang dalam booking flow → delegasikan ke BookingFlowHandler.
 *  B) Tidak ada flow aktif → routing normal (menu angka / keyword / FAQ).
 *
 * Kembalikan `RouterResult` agar WhatsAppHandler bisa mengirim beberapa
 * pesan sekaligus (teks + gambar QRIS).
 */
export interface RouterResult {
  messages: string[];
  /** URL gambar QRIS — dikirim sebagai gambar setelah pesan teks */
  qrisUrl?: string;
}

export class MessageRouter {
  constructor(
    private readonly serviceRepo: IServiceRepository,
    private readonly settingsRepo: ISettingsRepository,
    private readonly faqService: FaqLookupService,
    private readonly scheduleService: GetAvailableScheduleService,
    private readonly bookingFlowHandler: BookingFlowHandler,
    private readonly stateStore: ConversationStateStore,
  ) {}

  async handle(phone: string, message: string): Promise<RouterResult> {
    const trimmed = message.trim();
    const lower   = trimmed.toLowerCase();

    // ── A. Ada booking flow aktif → serahkan ke BookingFlowHandler ────────────
    const draft = this.stateStore.get(phone);
    if (draft && draft.step !== 'IDLE') {
      const result = await this.bookingFlowHandler.handle(phone, trimmed);
      return { messages: result.messages, qrisUrl: result.qrisUrl };
    }

    // ── B. Routing normal ─────────────────────────────────────────────────────

    // Menu angka
    if (/^[1-5]$/.test(trimmed)) {
      return this.handleMenuNumber(phone, trimmed);
    }

    // Greeting
    if (GREETING_KEYWORDS.some((kw) => lower.includes(kw))) {
      return { messages: [await this.buildWelcomeMessage()] };
    }

    // Intent keyword
    if (SERVICE_KEYWORDS.some((kw) => lower.includes(kw))) {
      return { messages: [await this.buildServicesMessage()] };
    }

    if (SCHEDULE_KEYWORDS.some((kw) => lower.includes(kw))) {
      return { messages: [await this.buildScheduleMessage()] };
    }

    if (BOOKING_KEYWORDS.some((kw) => lower.includes(kw))) {
      // Mulai booking flow
      const result = await this.bookingFlowHandler.handle(phone, trimmed);
      return { messages: result.messages, qrisUrl: result.qrisUrl };
    }

    // FAQ lookup
    const faq = await this.faqService.lookup(lower);
    if (faq) {
      logger.debug('MessageRouter: FAQ match', { faqId: faq.faqId });
      return { messages: [faq.answer] };
    }

    // Fallback
    return { messages: [this.buildFallbackMessage()] };
  }

  // ── Private builders ────────────────────────────────────────────────────────

  private async handleMenuNumber(phone: string, num: string): Promise<RouterResult> {
    switch (num) {
      case '1': return { messages: [await this.buildServicesMessage()] };
      case '2': return { messages: [await this.buildScheduleMessage()] };
      case '3': {
        const result = await this.bookingFlowHandler.handle(phone, num);
        return { messages: result.messages, qrisUrl: result.qrisUrl };
      }
      case '4': return { messages: [this.buildFaqMenuMessage()] };
      case '5': return { messages: [await this.buildContactMessage()] };
      default:  return { messages: [await this.buildWelcomeMessage()] };
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
      return 'Mohon maaf Kak, saat ini belum ada layanan yang tersedia. Silakan hubungi admin 🙏';
    }
    const lines = services.map(
      (s, i) => `${i + 1}. *${s.name}*\n   💰 ${formatRupiah(s.price)}`,
    );
    return (
      '🏃‍♀️ *Layanan Kania Happy*\n\n' +
      lines.join('\n\n') +
      '\n\n_Ketik *2* untuk jadwal, atau *3* untuk booking_ 😊'
    );
  }

  private async buildScheduleMessage(): Promise<string> {
    const occurrences = await this.scheduleService.getOccurrences();
    if (occurrences.length === 0) {
      return 'Mohon maaf Kak, tidak ada jadwal dalam waktu dekat. Silakan cek lagi nanti 🙏';
    }

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
          `     ⏰ ${formatTimeDisplay(o.schedule.timeStart)}–${formatTimeDisplay(o.schedule.timeEnd)} WIB\n` +
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
      'Coba pilih menu:\n' +
      '1️⃣ Lihat layanan & harga\n' +
      '2️⃣ Cek jadwal kelas\n' +
      '3️⃣ Booking kelas\n' +
      '4️⃣ FAQ & info lainnya\n' +
      '5️⃣ Hubungi admin\n\n' +
      'Atau ketik pertanyaan Kakak langsung 😊'
    );
  }
}
