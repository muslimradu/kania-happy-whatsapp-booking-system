/**
 * BookingFlowHandler
 *
 * Jembatan antara MessageRouter dan BookingService.
 * Mengelola state machine percakapan dan mendelegasikan setiap
 * langkah ke BookingService yang stateless.
 *
 * Kembalikan `FlowResult`:
 *  - `messages`  : array teks untuk dikirim berurutan ke customer.
 *  - `qrisUrl`   : URL gambar QRIS jika metode bayar = qris (kirim sebagai gambar).
 *  - `done`      : true jika flow selesai (state harus di-clear).
 */

import type { ConversationStateStore, BookingDraft } from '@infrastructure/state/ConversationStateStore';
import type { BookingService } from './BookingService';
import type { ICustomerRepository } from '@domain/repositories';
import { logger } from '@infrastructure/logger/Logger';

export interface FlowResult {
  messages: string[];
  qrisUrl?: string;
  done: boolean;
}

const CANCEL_KEYWORDS = ['0', 'batal', 'cancel', 'keluar', 'exit'];

export class BookingFlowHandler {
  constructor(
    private readonly stateStore: ConversationStateStore,
    private readonly bookingService: BookingService,
    private readonly customerRepo: ICustomerRepository,
  ) {}

  /**
   * Entry point — dipanggil oleh MessageRouter setiap kali ada pesan
   * masuk dari customer yang sedang dalam flow booking.
   *
   * @param phone   nomor WA customer (format 628xxx)
   * @param message teks pesan customer
   */
  async handle(phone: string, message: string): Promise<FlowResult> {
    const lower = message.trim().toLowerCase();

    // Cek cancel di langkah mana pun
    if (CANCEL_KEYWORDS.includes(lower)) {
      this.stateStore.clear(phone);
      return {
        messages: ['Booking dibatalkan. Ketik *3* jika ingin booking lagi ya Kak 😊'],
        done: true,
      };
    }

    const draft = this.stateStore.get(phone);

    // Tidak ada state aktif → mulai flow baru
    if (!draft || draft.step === 'IDLE') {
      return this.stepStart(phone);
    }

    switch (draft.step) {
      case 'CHOOSE_SERVICE':  return this.stepChooseService(phone, draft, message);
      case 'CHOOSE_SCHEDULE': return this.stepChooseSchedule(phone, draft, message);
      case 'INPUT_NAME':      return this.stepInputName(phone, draft, message);
      case 'CHOOSE_PAYMENT':  return this.stepChoosePayment(phone, draft, message);
      case 'CONFIRM':         return this.stepConfirm(phone, draft, lower);
      default:
        this.stateStore.clear(phone);
        return this.stepStart(phone);
    }
  }

  // ── Steps ───────────────────────────────────────────────────────────────────

  private async stepStart(phone: string): Promise<FlowResult> {
    const result = await this.bookingService.startBooking(phone);

    if (result.serviceOptions.length === 0) {
      return { messages: [result.message], done: true };
    }

    this.stateStore.set(phone, {
      step: 'CHOOSE_SERVICE',
      serviceOptions: result.serviceOptions,
    });

    return { messages: [result.message], done: false };
  }

  private async stepChooseService(
    phone: string,
    draft: BookingDraft,
    input: string,
  ): Promise<FlowResult> {
    const result = await this.bookingService.chooseService(
      draft.serviceOptions ?? [],
      input,
    );

    if (!result) {
      return {
        messages: [`Pilihan tidak valid. Ketik angka 1–${draft.serviceOptions?.length ?? '?'} ya Kak 😊`],
        done: false,
      };
    }

    if (result.scheduleOptions.length === 0) {
      this.stateStore.clear(phone);
      return { messages: [result.message], done: true };
    }

    const idx = parseInt(input, 10) - 1;
    const selected = draft.serviceOptions![idx]!;

    this.stateStore.set(phone, {
      ...draft,
      step: 'CHOOSE_SCHEDULE',
      selectedServiceId:    selected.serviceId,
      selectedServiceName:  selected.name,
      selectedServicePrice: selected.price,
      scheduleOptions:      result.scheduleOptions,
    });

    return { messages: [result.message], done: false };
  }

  private async stepChooseSchedule(
    phone: string,
    draft: BookingDraft,
    input: string,
  ): Promise<FlowResult> {
    const result = await this.bookingService.chooseSchedule(
      draft.scheduleOptions ?? [],
      input,
      phone,
    );

    if (!result) {
      return {
        messages: [`Pilihan tidak valid. Ketik angka 1–${draft.scheduleOptions?.length ?? '?'} ya Kak 😊`],
        done: false,
      };
    }

    const idx = parseInt(input, 10) - 1;
    const selectedOccurrence = draft.scheduleOptions![idx]!;

    if (result.needName) {
      this.stateStore.set(phone, {
        ...draft,
        step: 'INPUT_NAME',
        selectedOccurrence,
      });
      return { messages: [result.message], done: false };
    }

    // Customer sudah punya nama → lanjut ke pilih payment
    const customer = await this.customerRepo.findByPhone(phone);
    return this.goToPayment(phone, { ...draft, selectedOccurrence, customerName: customer?.name });
  }

  private async stepInputName(
    phone: string,
    draft: BookingDraft,
    input: string,
  ): Promise<FlowResult> {
    const name = input.trim();
    if (name.length < 2) {
      return {
        messages: ['Nama terlalu pendek. Mohon masukkan nama lengkap Kakak 😊'],
        done: false,
      };
    }

    // Simpan nama ke Customer sheet
    await this.customerRepo.upsert({ phone, name }).catch((err) =>
      logger.warn('BookingFlowHandler: gagal upsert customer name', { error: err }),
    );

    return this.goToPayment(phone, { ...draft, customerName: name });
  }

  private async stepChoosePayment(
    phone: string,
    draft: BookingDraft,
    input: string,
  ): Promise<FlowResult> {
    const result = await this.bookingService.choosePaymentMethod(
      draft.paymentOptions ?? [],
      input,
      draft.selectedOccurrence!,
    );

    if (!result) {
      return {
        messages: [`Pilihan tidak valid. Ketik angka 1–${draft.paymentOptions?.length ?? '?'} ya Kak 😊`],
        done: false,
      };
    }

    const idx = parseInt(input, 10) - 1;
    const selectedPaymentMethod = draft.paymentOptions![idx]!;

    this.stateStore.set(phone, {
      ...draft,
      step: 'CONFIRM',
      selectedPaymentMethod,
    });

    return { messages: [result.message], done: false };
  }

  private async stepConfirm(
    phone: string,
    draft: BookingDraft,
    lower: string,
  ): Promise<FlowResult> {
    if (!['ya', 'yes', 'iya', 'ok', 'oke'].includes(lower)) {
      // Bukan konfirmasi → tanya ulang
      return {
        messages: ['Ketik *ya* untuk konfirmasi booking atau *0* untuk batal 😊'],
        done: false,
      };
    }

    const result = await this.bookingService.confirmBooking(
      phone,
      draft.customerName!,
      draft.selectedOccurrence!,
      draft.selectedPaymentMethod!,
    );

    this.stateStore.clear(phone);

    const messages = [result.message];

    // Kirim gambar QRIS terpisah setelah pesan konfirmasi
    const qrisUrl = draft.selectedPaymentMethod?.type === 'qris'
      ? draft.selectedPaymentMethod.qrisImageUrl
      : undefined;

    return {
      messages,
      qrisUrl: qrisUrl || undefined,
      done: true,
    };
  }

  // ── Private helper ──────────────────────────────────────────────────────────

  private async goToPayment(
    phone: string,
    draft: Partial<BookingDraft> & { step?: BookingDraft['step'] },
  ): Promise<FlowResult> {
    const { message, paymentOptions } = await this.bookingService.buildPaymentOptions();

    if (paymentOptions.length === 0) {
      this.stateStore.clear(phone);
      return { messages: [message], done: true };
    }

    this.stateStore.set(phone, {
      ...(draft as BookingDraft),
      step: 'CHOOSE_PAYMENT',
      paymentOptions,
    });

    return { messages: [message], done: false };
  }
}
