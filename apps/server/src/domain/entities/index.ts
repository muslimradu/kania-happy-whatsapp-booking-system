/**
 * Entity: Customer
 */
export interface Customer {
  phone:          string; // PK, format E.164: 628xxx
  name:           string;
  firstContactAt: string; // ISO datetime
  lastBookingAt:  string; // ISO datetime
  totalBooking:   number;
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

export interface Faq {
  faqId:    string;
  keyword:  string;   // kata kunci untuk matching (lowercase, dipisah koma)
  question: string;   // contoh pertanyaan
  answer:   string;   // jawaban tetap
  isActive: boolean;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface Setting {
  key:   string;
  value: string;
}

/**
 * Key settings yang dikenal sistem.
 * Gunakan konstanta ini (bukan magic string) saat membaca Settings.
 *
 * Catatan: data rekening bank & QRIS TIDAK lagi disimpan di Settings.
 * Sudah dipindah ke sheet "Payment Method" (lihat PaymentMethod entity).
 */
export const SETTING_KEYS = {
  // ── Identitas Bisnis ──────────────────────────────────────────────────────
  BUSINESS_NAME:    'business_name',
  BUSINESS_ADDRESS: 'business_address',
  BUSINESS_PHONE:   'business_phone',

  // ── Perilaku Bot ─────────────────────────────────────────────────────────
  WELCOME_MESSAGE: 'welcome_message',
  BOT_ACTIVE:      'bot_active',

  // ── Human Takeover ────────────────────────────────────────────────────────
  TAKEOVER_TIMEOUT_MINUTES: 'takeover_timeout_minutes',

  // ── Reminder ─────────────────────────────────────────────────────────────
  REMINDER_H1_TIME: 'reminder_h1_time',
  REMINDER_HD_TIME: 'reminder_hd_time',

  // ── Jadwal ───────────────────────────────────────────────────────────────
  SCHEDULE_LOOKAHEAD_DAYS: 'schedule_lookahead_days',

  // ── AI Fallback ───────────────────────────────────────────────────────────
  AI_ENABLED: 'ai_enabled',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

// ── Admin Log ─────────────────────────────────────────────────────────────────

export type AdminAction =
  | 'Login'
  | 'VerifyPayment'
  | 'RejectPayment'
  | 'Takeover'
  | 'ReleaseTakeover'
  | 'EditService'
  | 'EditSchedule'
  | 'EditPaymentMethod'   // tambah untuk audit trail CRUD Payment Method
  | 'EditFaq'
  | 'SendBroadcast'
  | 'EditSettings';

export interface AdminLog {
  logId:         string;
  adminUsername: string;
  action:        AdminAction;
  targetId:      string;    // id entitas yang diubah (boleh kosong)
  description:   string;
  createdAt:     string;    // ISO datetime
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

export type BroadcastStatus       = 'Draft' | 'Scheduled' | 'Sent' | 'Failed';
export type BroadcastTargetSegment = 'PaidOrCash' | 'Custom';

export interface Broadcast {
  broadcastId:   string;
  message:       string;
  targetSegment: BroadcastTargetSegment;
  status:        BroadcastStatus;
  scheduledAt:   string; // ISO datetime, kosong jika kirim langsung
  sentAt:        string; // ISO datetime, kosong sebelum dikirim
  createdBy:     string; // admin username
}

// ── Takeover State ────────────────────────────────────────────────────────────

export interface TakeoverState {
  phone:       string;  // nomor customer yang sedang di-takeover
  isTakenOver: boolean;
  takenOverBy: string;  // admin username
  startedAt:   string;  // ISO datetime
  expiresAt:   string;  // ISO datetime
}
