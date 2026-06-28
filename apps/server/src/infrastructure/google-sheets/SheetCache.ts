import { env } from '@shared/config/env';

interface CacheEntry<T> {
  data: T;
  expiredAt: number; // Unix ms
}

/**
 * SheetCache — cache in-memory sederhana untuk data yang dibaca dari
 * Google Sheets.
 *
 * Motivasi:
 *  Google Sheets API memiliki quota limit (~100 read req/100s per user).
 *  Data seperti Services, Schedule, FAQ jarang berubah — aman di-cache
 *  selama beberapa menit agar bot yang menerima banyak pesan tidak
 *  langsung throttled.
 *
 * TTL dikonfigurasi via env `SHEET_CACHE_TTL_SECONDS`.
 * Set ke 0 untuk menonaktifkan cache (berguna saat development/testing).
 *
 * Cache di-invalidate otomatis saat data ditulis (write-through invalidation):
 * Repository harus memanggil `invalidate(sheetName)` setelah setiap operasi
 * tulis. Ini dilakukan di base class `BaseSheetRepository`.
 */
export class SheetCache {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly ttlMs: number;

  constructor() {
    this.ttlMs = env.SHEET_CACHE_TTL_SECONDS * 1000;
  }

  get<T>(key: string): T | null {
    if (this.ttlMs === 0) return null; // cache dinonaktifkan

    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiredAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    if (this.ttlMs === 0) return;

    this.cache.set(key, {
      data,
      expiredAt: Date.now() + this.ttlMs,
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
