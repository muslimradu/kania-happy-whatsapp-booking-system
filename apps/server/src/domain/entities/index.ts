/**
 * Entity: Customer
 */
export interface Customer {
  phone: string;          // PK, format E.164: 628xxx
  name: string;
  firstContactAt: string; // ISO datetime
  lastBookingAt: string;  // ISO datetime
  totalBooking: number;
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

export interface Faq {
  faqId: string;
  keyword: string;   // kata kunci untuk matching (lowercase, dipisah koma)
  question: string;  // contoh pertanyaan
  answer: string;    // jawaban tetap
  isActive: boolean;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface Setting {
  key: string;
  value: string;
  description: string;
}

/**
 * Key settings yang dikenal sistem.
 * Gunakan konstanta ini (bukan magic string) saat membaca Settings.
 */
export const SETTING_KEYS = {
  BANK_ACCOUNT_NUMBER: 'bank_account_number',
  BANK_NAME: 'bank_name',
  BANK_HOLDER_NAME: 'bank_holder_name',
  QRIS_IMAGE_URL: 'qris_image_url',
  TAKEOVER_TIMEOUT_MINUTES: 'takeover_timeout_minutes',
  BUSINESS_HOURS: 'business_hours',
  AI_ENABLED: 'ai_enabled',
  SCHEDULE_LOOKAHEAD_DAYS: 'schedule_lookahead_days',
} as const;

// ── Admin Log ─────────────────────────────────────────────────────────────────

export type AdminAction =
  | 'Login'
  | 'VerifyPayment'
  | 'RejectPayment'
  | 'Takeover'
  | 'ReleaseTakeover'
  | 'EditService'
  | 'EditSchedule'
  | 'EditFaq'
  | 'SendBroadcast'
  | 'EditSettings';

export interface AdminLog {
  logId: string;
  adminUsername: string;
  action: AdminAction;
  targetId: string;    // id entitas yang diubah (boleh kosong)
  description: string;
  createdAt: string;   // ISO datetime
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

export type BroadcastStatus = 'Draft' | 'Scheduled' | 'Sent' | 'Failed';
export type BroadcastTargetSegment = 'PaidOrCash' | 'Custom';

export interface Broadcast {
  broadcastId: string;
  message: string;
  targetSegment: BroadcastTargetSegment;
  status: BroadcastStatus;
  scheduledAt: string;  // ISO datetime, nullable → simpan sebagai ''
  sentAt: string;       // ISO datetime, nullable → simpan sebagai ''
  createdBy: string;    // admin username
}

// ── Takeover State ────────────────────────────────────────────────────────────

export interface TakeoverState {
  phone: string;          // nomor customer yang sedang di-takeover
  isTakenOver: boolean;
  takenOverBy: string;    // admin username
  startedAt: string;      // ISO datetime
  expiresAt: string;      // ISO datetime
}
