type Factory<T> = () => T;

class Container {
  private readonly factories = new Map<string, Factory<unknown>>();
  private readonly instances = new Map<string, unknown>();

  register<T>(token: string, factory: Factory<T>): void {
    if (this.factories.has(token)) {
      throw new Error(`DI token "${token}" sudah terdaftar sebelumnya`);
    }
    this.factories.set(token, factory as Factory<unknown>);
  }

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

  reset(): void {
    this.factories.clear();
    this.instances.clear();
  }
}

export const container = new Container();

export const DI_TOKENS = {
  // ── Infrastructure ────────────────────────────────────────────────────────
  Logger:             'Logger',
  GoogleSheetsClient: 'GoogleSheetsClient',
  SheetCache:         'SheetCache',
  BaileysClient:      'BaileysClient',
  OpenAiClient:       'OpenAiClient',

  // ── Application Services ────────────────────────────────────────────────────
  FaqLookupService:            'FaqLookupService',
  GetAvailableScheduleService: 'GetAvailableScheduleService',
  MessageRouter:               'MessageRouter',

  // ── Presentation ─────────────────────────────────────────────────────────────
  WhatsAppHandler: 'WhatsAppHandler',

  // ── Repositories ──────────────────────────────────────────────────────────
  ServiceRepository:   'ServiceRepository',
  ScheduleRepository:  'ScheduleRepository',
  BookingRepository:   'BookingRepository',
  PaymentRepository:   'PaymentRepository',
  CustomerRepository:  'CustomerRepository',
  FaqRepository:       'FaqRepository',
  SettingsRepository:  'SettingsRepository',
  AdminLogRepository:  'AdminLogRepository',
  BroadcastRepository: 'BroadcastRepository',
  PaymentMethodRepository: 'PaymentMethodRepository',
  TakeoverRepository:  'TakeoverRepository',
} as const;
