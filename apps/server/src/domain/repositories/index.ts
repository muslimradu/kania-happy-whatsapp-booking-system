import type { Service } from '../entities/Service';
import type { Schedule } from '../entities/Schedule';
import type { Booking, CreateBookingDto, BookingStatus } from '../entities/Booking';
import type { Payment, CreatePaymentDto, PaymentStatus } from '../entities/Payment';
import type { PaymentMethod } from '../entities/PaymentMethod';
import type {
  Customer,
  Faq,
  Setting,
  AdminLog,
  AdminAction,
  Broadcast,
  TakeoverState,
} from '../entities/index';

// ── Service Repository ────────────────────────────────────────────────────────

export interface IServiceRepository {
  findAll(): Promise<Service[]>;
  findById(serviceId: string): Promise<Service | null>;
  findActive(): Promise<Service[]>;
  save(service: Service): Promise<void>;
  update(serviceId: string, data: Partial<Service>): Promise<void>;
}

// ── Schedule Repository ───────────────────────────────────────────────────────

export interface IScheduleRepository {
  findAll(): Promise<Schedule[]>;
  findById(scheduleId: string): Promise<Schedule | null>;
  findActiveByServiceId(serviceId: string): Promise<Schedule[]>;
  findActive(): Promise<Schedule[]>;
  save(schedule: Schedule): Promise<void>;
  update(scheduleId: string, data: Partial<Schedule>): Promise<void>;
}

// ── Booking Repository ────────────────────────────────────────────────────────

export interface IBookingRepository {
  findAll(): Promise<Booking[]>;
  findById(bookingId: string): Promise<Booking | null>;
  findByPhone(phone: string): Promise<Booking[]>;
  findByDate(date: string): Promise<Booking[]>;
  findPendingReminders(type: 'h1' | 'hariH'): Promise<Booking[]>;
  create(dto: CreateBookingDto): Promise<Booking>;
  updateStatus(bookingId: string, status: BookingStatus): Promise<void>;
  markReminderSent(bookingId: string, type: 'h1' | 'hariH'): Promise<void>;
}

// ── Payment Repository ────────────────────────────────────────────────────────

export interface IPaymentRepository {
  findByInvoiceNumber(invoiceNumber: string): Promise<Payment | null>;
  findByBookingId(bookingId: string): Promise<Payment | null>;
  findByStatus(status: PaymentStatus): Promise<Payment[]>;
  create(dto: CreatePaymentDto): Promise<Payment>;
  updateStatus(
    invoiceNumber: string,
    status: PaymentStatus,
    meta?: { verifiedBy?: string; proofImageUrl?: string },
  ): Promise<void>;
}

// ── Payment Method Repository ─────────────────────────────────────────────────

export interface IPaymentMethodRepository {
  findAll(): Promise<PaymentMethod[]>;
  findActive(): Promise<PaymentMethod[]>;
  findById(methodId: string): Promise<PaymentMethod | null>;
  save(method: PaymentMethod): Promise<void>;
  update(methodId: string, data: Partial<PaymentMethod>): Promise<void>;
  deactivate(methodId: string): Promise<void>;
}

// ── Customer Repository ───────────────────────────────────────────────────────

export interface ICustomerRepository {
  findAll(): Promise<Customer[]>;
  findByPhone(phone: string): Promise<Customer | null>;
  upsert(customer: Pick<Customer, 'phone' | 'name'>): Promise<Customer>;
  incrementBookingCount(phone: string): Promise<void>;
}

// ── FAQ Repository ────────────────────────────────────────────────────────────

export interface IFaqRepository {
  findAll(): Promise<Faq[]>;
  findActive(): Promise<Faq[]>;
  search(query: string): Promise<Faq | null>;
  save(faq: Faq): Promise<void>;
  update(faqId: string, data: Partial<Faq>): Promise<void>;
}

// ── Settings Repository ───────────────────────────────────────────────────────

export interface ISettingsRepository {
  findAll(): Promise<Setting[]>;
  findByKey(key: string): Promise<Setting | null>;
  getValue(key: string, defaultValue?: string): Promise<string>;
  set(key: string, value: string): Promise<void>;
}

// ── Admin Log Repository ──────────────────────────────────────────────────────

export interface IAdminLogRepository {
  findAll(limit?: number): Promise<AdminLog[]>;
  log(entry: {
    adminUsername: string;
    action: AdminAction;
    targetId?: string;
    description: string;
  }): Promise<void>;
}

// ── Broadcast Repository ──────────────────────────────────────────────────────

export interface IBroadcastRepository {
  findAll(): Promise<Broadcast[]>;
  findById(broadcastId: string): Promise<Broadcast | null>;
  create(broadcast: Omit<Broadcast, 'broadcastId'>): Promise<Broadcast>;
  updateStatus(broadcastId: string, status: Broadcast['status'], sentAt?: string): Promise<void>;
}

// ── Takeover Repository ───────────────────────────────────────────────────────

export interface ITakeoverRepository {
  findByPhone(phone: string): Promise<TakeoverState | null>;
  setTakeover(phone: string, adminUsername: string, expiresAt: string): Promise<void>;
  clearTakeover(phone: string): Promise<void>;
  findExpired(): Promise<TakeoverState[]>;
}
