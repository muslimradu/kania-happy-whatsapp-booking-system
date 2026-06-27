/**
 * Container Dependency Injection yang sengaja dibuat SEDERHANA (manual),
 * tanpa framework DI (InversifyJS/tsyringe, dll) — sesuai prinsip KISS/YAGNI
 * dari desain (lihat docs/01-DESIGN-DOCUMENT.md §3.3).
 *
 * Cara kerja: setiap dependency didaftarkan sebagai factory function yang
 * lazy (baru dibuat saat pertama kali di-resolve), lalu di-cache sebagai
 * singleton untuk pemanggilan berikutnya. Ini cukup untuk skala proyek ini —
 * jika nanti kebutuhan DI berkembang jauh lebih kompleks, container ini bisa
 * diganti tanpa mengubah Service/Repository (karena mereka hanya bergantung
 * pada interface, bukan pada container ini).
 */
type Factory<T> = () => T;

class Container {
  private readonly factories = new Map<string, Factory<unknown>>();
  private readonly instances = new Map<string, unknown>();

  /**
   * Daftarkan cara membuat sebuah dependency. Factory baru dipanggil saat
   * resolve() pertama kali dipanggil untuk token tersebut (lazy).
   */
  register<T>(token: string, factory: Factory<T>): void {
    if (this.factories.has(token)) {
      throw new Error(`DI token "${token}" sudah terdaftar sebelumnya`);
    }
    this.factories.set(token, factory as Factory<unknown>);
  }

  /**
   * Ambil instance dependency. Singleton: hanya dibuat sekali per token.
   */
  resolve<T>(token: string): T {
    if (this.instances.has(token)) {
      return this.instances.get(token) as T;
    }

    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(
        `DI token "${token}" belum didaftarkan. Pastikan sudah di-register di bootstrap.`,
      );
    }

    const instance = factory();
    this.instances.set(token, instance);
    return instance as T;
  }

  /** Khusus untuk unit test: reset seluruh registrasi & instance. */
  reset(): void {
    this.factories.clear();
    this.instances.clear();
  }
}

export const container = new Container();

/**
 * Daftar token DI sebagai konstanta (hindari typo string bebas / magic string
 * yang tersebar di banyak file).
 */
export const DI_TOKENS = {
  Logger: 'Logger',
  GoogleSheetsClient: 'GoogleSheetsClient',
  ServiceRepository: 'ServiceRepository',
  ScheduleRepository: 'ScheduleRepository',
  BookingRepository: 'BookingRepository',
  PaymentRepository: 'PaymentRepository',
  CustomerRepository: 'CustomerRepository',
  FaqRepository: 'FaqRepository',
  BroadcastRepository: 'BroadcastRepository',
  SettingsRepository: 'SettingsRepository',
  AdminLogRepository: 'AdminLogRepository',
  // ── Diubah dari EvolutionApiClient → BaileysClient (M0 → Baileys) ─────────
  BaileysClient: 'BaileysClient',
  OpenAiClient: 'OpenAiClient',
} as const;
