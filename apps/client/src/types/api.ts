/**
 * Type definitions untuk API responses dari server.
 * Sinkron manual dengan domain entities server — tidak di-share via monorepo
 * untuk menjaga client tetap ringan (tidak import semua deps server).
 */

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  code: string;
  message: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  username: string;
}

// ── Payment ──────────────────────────────────────────────────────────────────

export type PaymentStatus = 'Waiting Verification' | 'Paid' | 'Rejected' | 'Cash';

export interface Payment {
  invoiceNumber:  string;
  bookingId:      string;
  customerPhone:  string;
  customerName:   string;
  serviceName:    string;
  bookingDate:    string;
  scheduleTime:   string;
  amount:         number;
  methodId:       string;
  status:         PaymentStatus;
  proofImageUrl:  string;
  verifiedBy:     string;
  verifiedAt:     string;
  createdAt:      string;
}

// ── Takeover ──────────────────────────────────────────────────────────────────

export interface TakeoverState {
  phone:       string;
  isTakenOver: boolean;
  takenOverBy: string;
  startedAt:   string;
  expiresAt:   string;
}
