/**
 * ConversationStateStore
 *
 * Menyimpan state percakapan booking per nomor WA di memory.
 * Tidak perlu disimpan ke sheet — jika server restart, customer cukup
 * mulai ulang flow booking (UX yang wajar).
 *
 * State machine booking:
 *
 *   IDLE
 *    │ ketik "3" / keyword booking
 *    ▼
 *   CHOOSE_SERVICE     → customer pilih nomor layanan
 *    │
 *    ▼
 *   CHOOSE_SCHEDULE    → customer pilih nomor jadwal
 *    │
 *    ▼
 *   INPUT_NAME         → hanya untuk customer baru (ada nama → skip)
 *    │
 *    ▼
 *   CHOOSE_PAYMENT     → customer pilih metode bayar
 *    │
 *    ▼
 *   CONFIRM            → tampil ringkasan, customer ketik "ya" / "tidak"
 *    │
 *    ▼
 *   DONE / IDLE        → booking tersimpan, kirim konfirmasi
 *
 * TTL: 15 menit. State expired → customer harus mulai ulang.
 */

import type { ScheduleOccurrence } from '@domain/entities/Schedule';
import type { PaymentMethod } from '@domain/entities/PaymentMethod';

export type BookingStep =
  | 'IDLE'
  | 'CHOOSE_SERVICE'
  | 'CHOOSE_SCHEDULE'
  | 'INPUT_NAME'
  | 'CHOOSE_PAYMENT'
  | 'CONFIRM';

export interface BookingDraft {
  step: BookingStep;
  /** Daftar layanan yang ditampilkan (urutan = nomor pilihan) */
  serviceOptions?: Array<{ serviceId: string; name: string; price: number }>;
  selectedServiceId?: string;
  selectedServiceName?: string;
  selectedServicePrice?: number;
  /** Daftar jadwal yang ditampilkan */
  scheduleOptions?: ScheduleOccurrence[];
  selectedOccurrence?: ScheduleOccurrence;
  /** Nama customer (diambil dari Customer sheet atau diinput saat flow) */
  customerName?: string;
  /** Daftar payment method yang ditampilkan */
  paymentOptions?: PaymentMethod[];
  selectedPaymentMethod?: PaymentMethod;
  /** Timestamp terakhir interaksi (ms epoch) — untuk TTL */
  lastActivityAt: number;
}

const TTL_MS = 15 * 60 * 1000; // 15 menit

export class ConversationStateStore {
  private readonly store = new Map<string, BookingDraft>();

  /** Ambil state aktif. Kembalikan null jika tidak ada atau expired. */
  get(phone: string): BookingDraft | null {
    const draft = this.store.get(phone);
    if (!draft) return null;
    if (Date.now() - draft.lastActivityAt > TTL_MS) {
      this.store.delete(phone);
      return null;
    }
    return draft;
  }

  /** Simpan / update state dan perbarui timestamp. */
  set(phone: string, draft: Omit<BookingDraft, 'lastActivityAt'>): void {
    this.store.set(phone, { ...draft, lastActivityAt: Date.now() });
  }

  /** Hapus state (booking selesai atau dibatalkan). */
  clear(phone: string): void {
    this.store.delete(phone);
  }

  /** Berapa customer yang sedang dalam proses booking (untuk monitoring). */
  activeCount(): number {
    const now = Date.now();
    let count = 0;
    for (const [phone, draft] of this.store) {
      if (now - draft.lastActivityAt <= TTL_MS) {
        count++;
      } else {
        this.store.delete(phone); // lazy cleanup
      }
    }
    return count;
  }
}
