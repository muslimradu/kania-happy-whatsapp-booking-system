# Kania Happy — Server (M1: Data Layer)

Aplikasi backend **WhatsApp Booking System** untuk Sanggar Senam Kania Happy.
Dibangun dengan Clean Architecture, Repository Pattern, dan Service Layer di atas Node.js + TypeScript.

## Milestone yang sudah selesai

### M0 — Foundation + Baileys
- ✅ Struktur folder Clean Architecture (`domain` / `application` / `infrastructure` / `presentation` / `shared`)
- ✅ TypeScript strict mode + path alias (`@domain/*`, `@infrastructure/*`, dst.)
- ✅ ESLint + Prettier
- ✅ Env validator type-safe — fail-fast jika `.env` tidak lengkap
- ✅ Logger terstruktur berbasis Winston
- ✅ Global Error Handler + `AppError` class
- ✅ DI Container manual sederhana
- ✅ Express app + `/health` endpoint
- ✅ **BaileysClient** — koneksi WhatsApp via QR scan, auto-reconnect, kirim teks/gambar/dokumen

### M1 — Data Layer
- ✅ **Domain entities** — `Service`, `Schedule`, `Booking`, `Payment`, `Customer`, `Faq`, `Setting`, `AdminLog`, `Broadcast`, `TakeoverState`
- ✅ **Repository interfaces** — kontrak `IXxxRepository` di domain layer (tidak bergantung pada implementasi)
- ✅ **GoogleSheetsClient** — thin wrapper Google Sheets API v4
- ✅ **SheetCache** — cache in-memory dengan TTL untuk mengurangi API call
- ✅ **BaseSheetRepository** — abstract class dengan helper `readRows`, `appendRow`, `updateRow`, `updateCell`, `findRowIndex`
- ✅ **7 Repository** — `Service`, `Schedule`, `Booking`, `Payment`, `Customer`, `Faq`, `Settings`, `AdminLog`, `Broadcast`, `Takeover`
- ✅ **Unit test** — 11 test untuk `ServiceRepository`, `ScheduleRepository`, `FaqRepository` dengan mock client & cache
- ✅ **tsconfig.test.json** — konfigurasi TypeScript terpisah untuk folder `tests/` dengan path alias yang benar

## Yang BELUM ada (menyusul di milestone berikutnya)

- M2 — Bot Read-only: webhook handler, FAQ lookup, tampilkan layanan & jadwal
- M3 — Booking Flow: state machine, invoice generator
- M4 — Payment Flow: 3 metode bayar (Cash, Transfer, QRIS)
- M5 — Reminder: cron H-1 & Hari H
- M6 — Human Takeover: admin override bot
- M7 — AI Fallback: OpenAI untuk pertanyaan di luar FAQ
- M8-M9 — Dashboard React

## Struktur folder

```
apps/server/
├── src/
│   ├── domain/
│   │   ├── entities/          # Pure domain objects (Service, Booking, dll.)
│   │   └── repositories/      # Interface IXxxRepository
│   ├── infrastructure/
│   │   ├── google-sheets/     # GoogleSheetsClient, SheetCache, BaseSheetRepository
│   │   ├── logger/            # Winston logger
│   │   ├── repositories/      # Implementasi konkret (GoogleSheetsXxxRepository)
│   │   └── whatsapp/          # BaileysClient
│   ├── presentation/
│   │   └── http/middlewares/  # errorHandler, requestLogger
│   └── shared/
│       ├── config/env.ts      # Env validator (Zod)
│       ├── di/container.ts    # DI Container + DI_TOKENS
│       └── types/index.ts     # AppError, ApiSuccessResponse, dll.
├── tests/
│   └── unit/
│       └── repositories.test.ts
├── tsconfig.json
├── tsconfig.test.json         # Khusus untuk tests/ (path alias berbeda)
├── vitest.config.ts
├── .env.example
└── package.json
```

## Cara menjalankan

```bash
cd apps/server
npm install
cp .env.example .env
# isi .env dengan kredensial asli
npm run dev
```

## Menjalankan unit test

```bash
npm run test
```

Vitest akan menemukan test di `tests/**/*.test.ts` menggunakan `tsconfig.test.json`.

## Menghubungkan WhatsApp (Baileys)

Baileys tidak memerlukan server eksternal — koneksi dikelola langsung via WhatsApp Web protocol.

**Langkah pertama (scan QR):**

1. Jalankan `npm run dev`
2. QR code muncul di terminal dalam beberapa detik
3. Buka WhatsApp di HP → **Perangkat Tertaut** → **Tautkan Perangkat**
4. Scan QR — log `WhatsApp terhubung dan siap menerima pesan ✓` menandakan berhasil

**Session persisten:**

Session disimpan di `./sessions/baileys/` (konfigurasi via `BAILEYS_SESSION_DIR`). Setelah scan pertama, restart aplikasi tidak perlu scan QR ulang.

**Logout / scan ulang:**

```bash
rm -rf sessions/baileys
npm run dev
```

## Menghubungkan Google Spreadsheet

1. Buat Google Spreadsheet baru
2. Buat Service Account di Google Cloud Console dan aktifkan Google Sheets API
3. Download file JSON service account
4. Share Spreadsheet ke email service account (Editor)
5. Isi `.env`:
   ```
   GOOGLE_SPREADSHEET_ID=id_dari_url_spreadsheet
   GOOGLE_SERVICE_ACCOUNT_EMAIL=nama@project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

**Sheet yang diperlukan** (nama harus persis, case-sensitive):

| Sheet | Kolom (baris 1 = header) |
|-------|--------------------------|
| `Services` | service_id, name, price, is_active |
| `Schedule` | schedule_id, service_id, day_of_week, time_start, time_end, is_active |
| `Booking` | booking_id, invoice_number, customer_phone, customer_name, service_id, schedule_id, booking_date, payment_method, booking_status, created_at, reminder_h1_sent, reminder_hariH_sent |
| `Payment` | invoice_number, booking_id, amount, method, status, proof_image_url, verified_by, verified_at, created_at |
| `Customer` | phone, name, first_contact_at, last_booking_at, total_booking |
| `FAQ` | faq_id, keyword, question, answer, is_active |
| `Settings` | key, value, description |
| `Admin Log` | log_id, admin_username, action, target_id, description, created_at |
| `Broadcast` | broadcast_id, message, target_segment, status, scheduled_at, sent_at, created_by |
| `Takeover State` | phone, is_taken_over, taken_over_by, started_at, expires_at |

## Variabel environment

Lihat `.env.example` untuk daftar lengkap. Variabel wajib:

| Variabel | Keterangan |
|----------|------------|
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Login dashboard admin |
| `JWT_SECRET` | Minimal 16 karakter, random |
| `GOOGLE_SPREADSHEET_ID` | ID dari URL spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email service account |
| `GOOGLE_PRIVATE_KEY` | Private key dari file JSON service account |
| `BAILEYS_SESSION_DIR` | Folder session WA (default: `./sessions/baileys`) |

Jika `.env` tidak lengkap, server **menolak start** dan menampilkan daftar variabel yang bermasalah.

## Catatan

- Error `stream errored out (kode=515)` saat pertama connect setelah scan QR adalah **normal** — WhatsApp server mereset stream, aplikasi auto-reconnect dalam 5 detik.
- Cache Google Sheets dikonfigurasi via `SHEET_CACHE_TTL_SECONDS` (default 60 detik). Set ke `0` untuk nonaktifkan cache saat development.
- Kolom `keyword` di sheet FAQ dipisah koma, contoh: `harga,biaya,tarif,berapa` — matching dilakukan case-insensitive substring terhadap pesan customer.