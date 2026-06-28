# Kania Happy — Server

Backend **WhatsApp Booking System** untuk Sanggar Senam Kania Happy.
Dibangun dengan Clean Architecture, Repository Pattern, dan TypeScript di atas Node.js + Express.

> **Lihat juga:** [README root](../../README.md) untuk panduan setup lengkap dari awal.

---

## Daftar Isi

- [Milestone Progress](#milestone-progress)
- [Struktur Folder](#struktur-folder)
- [Cara Menjalankan](#cara-menjalankan)
- [Unit Test](#unit-test)
- [Menghubungkan WhatsApp (Baileys)](#menghubungkan-whatsapp-baileys)
- [Menghubungkan Google Spreadsheet](#menghubungkan-google-spreadsheet)
- [Variabel Environment](#variabel-environment)
- [Scripts](#scripts)
- [Arsitektur & Keputusan Desain](#arsitektur--keputusan-desain)
- [Catatan & Troubleshooting](#catatan--troubleshooting)

---

## Milestone Progress

### ✅ M0 — Foundation + Baileys

- Struktur folder Clean Architecture (`domain` / `application` / `infrastructure` / `presentation` / `shared`)
- TypeScript strict mode + path alias (`@domain/*`, `@infrastructure/*`, `@shared/*`, dll.)
- ESLint + Prettier
- Env validator type-safe dengan Zod — **fail-fast** jika `.env` tidak lengkap
- Logger terstruktur berbasis Winston
- Global Error Handler + `AppError` class
- DI Container manual sederhana dengan `DI_TOKENS`
- Express app + `/health` endpoint
- **BaileysClient** — koneksi WhatsApp via QR scan, auto-reconnect, kirim teks/gambar/dokumen

### ✅ M1 — Data Layer

- **Domain entities** — `Service`, `Schedule`, `Booking`, `Payment`, `Customer`, `Faq`, `Setting`, `AdminLog`, `Broadcast`, `TakeoverState`
- **Repository interfaces** — kontrak `IXxxRepository` di domain layer (tidak bergantung pada implementasi)
- **GoogleSheetsClient** — thin wrapper Google Sheets API v4
- **SheetCache** — cache in-memory dengan TTL untuk mengurangi API call ke Google Sheets
- **BaseSheetRepository** — abstract class dengan helper `readRows`, `appendRow`, `updateRow`, `updateCell`, `findRowIndex`
- **10 Repository** — `Service`, `Schedule`, `Booking`, `Payment`, `Customer`, `Faq`, `Settings`, `AdminLog`, `Broadcast`, `Takeover`
- **Unit test** — 11 test untuk `ServiceRepository`, `ScheduleRepository`, `FaqRepository` dengan mock client & cache
- **tsconfig.test.json** — konfigurasi TypeScript terpisah untuk folder `tests/` dengan path alias yang benar

### ✅ M2 — Bot Read-only

- **`shared/utils/phoneFormatter.ts`** — `jidToPhone`, `phoneToJid`, `normalizePhone`
- **`shared/utils/dateHelper.ts`** — `todayJakarta`, `formatDateDisplay`, `formatRupiah`, `nextOccurrence`, dll (selalu GMT+7)
- **`FaqLookupService`** — keyword matching case-insensitive, pilih FAQ paling spesifik
- **`GetAvailableScheduleService`** — generate occurrence dari template mingguan, window dari Settings
- **`MessageRouter`** — deteksi intent (menu angka 1–5, keyword, FAQ lookup, fallback)
- **`WhatsAppHandler`** — terima pesan Baileys → cek takeover → upsert customer → route → balas
- Update `container.ts` & `main.ts` — register semua service baru

### 🔜 Milestone Berikutnya

| Milestone | Deskripsi |
|-----------|-----------|
| M3 — Booking Flow | State machine booking, invoice generator |
| M4 — Payment Flow | 3 metode bayar: Cash, Transfer, QRIS |
| M5 — Reminder | Cron H-1 & Hari H untuk semua booking aktif |
| M6 — Human Takeover | Admin override bot per nomor WA, auto-resume |
| M7 — AI Fallback | OpenAI untuk pertanyaan di luar FAQ + guardrail |
| M8–M9 — Dashboard | Dashboard React + Vite untuk admin |

---

## Struktur Folder

```
apps/server/
├── src/
│   ├── domain/
│   │   ├── entities/              # Pure domain objects, tidak bergantung framework apapun
│   │   │   ├── Booking.ts
│   │   │   ├── Payment.ts
│   │   │   ├── Schedule.ts
│   │   │   ├── Service.ts
│   │   │   └── index.ts
│   │   └── repositories/
│   │       └── index.ts           # Interface IXxxRepository (kontrak / port)
│   ├── infrastructure/
│   │   ├── google-sheets/
│   │   │   ├── GoogleSheetsClient.ts    # Thin wrapper Google Sheets API v4
│   │   │   ├── SheetCache.ts            # Cache in-memory dengan TTL
│   │   │   └── BaseSheetRepository.ts  # Abstract class — helper CRUD sheet
│   │   ├── logger/
│   │   │   └── Logger.ts               # Winston logger terstruktur
│   │   ├── repositories/               # Implementasi konkret (adapter)
│   │   │   ├── GoogleSheetsBookingRepository.ts
│   │   │   ├── GoogleSheetsCustomerRepository.ts
│   │   │   ├── GoogleSheetsFaqRepository.ts
│   │   │   ├── GoogleSheetsOtherRepositories.ts
│   │   │   ├── GoogleSheetsPaymentRepository.ts
│   │   │   ├── GoogleSheetsScheduleRepository.ts
│   │   │   └── GoogleSheetsServiceRepository.ts
│   │   └── whatsapp/
│   │       └── BaileysClient.ts        # Koneksi & kirim pesan WhatsApp
│   ├── application/
│   │   ├── bot/
│   │   │   └── MessageRouter.ts        # Deteksi intent & build teks balasan
│   │   ├── faq/
│   │   │   └── FaqLookupService.ts     # Keyword matching ke sheet FAQ
│   │   └── schedule/
│   │       └── GetAvailableScheduleService.ts  # Generate occurrence dari template mingguan
│   ├── presentation/
│   │   ├── http/middlewares/
│   │   │   ├── errorHandler.ts         # Global error handler Express
│   │   │   └── requestLogger.ts        # Log setiap HTTP request
│   │   └── whatsapp/
│   │       └── WhatsAppHandler.ts      # Terima pesan Baileys → cek takeover → route → balas
│   └── shared/
│       ├── config/env.ts               # Zod schema — validasi .env saat startup
│       ├── di/container.ts             # DI Container + DI_TOKENS
│       ├── types/index.ts              # AppError, ApiSuccessResponse, nowJakarta()
│       └── utils/
│           ├── dateHelper.ts             # Format tanggal/waktu GMT+7, formatRupiah
│           └── phoneFormatter.ts         # Konversi JID ↔ nomor bersih
├── tests/
│   └── unit/
│       └── repositories.test.ts        # 11 unit test (mock client & cache)
├── .env.example                        # Template variabel environment
├── .eslintrc.cjs
├── .prettierrc
├── package.json
├── tsconfig.json                       # Konfigurasi TS untuk src/
├── tsconfig.test.json                  # Konfigurasi TS khusus untuk tests/
└── vitest.config.ts
```

---

## Cara Menjalankan

### Development

```bash
cd apps/server
npm install
cp .env.example .env
# Edit .env dengan kredensial asli (lihat bagian Variabel Environment)
npm run dev
```

Server berjalan di `http://localhost:3000` dengan hot-reload. Endpoint health check tersedia di `GET /health`.

### Production

```bash
npm run build
npm start
```

---

## Unit Test

```bash
# Jalankan semua test sekali
npm run test

# Watch mode — re-run otomatis saat file berubah
npm run test:watch
```

Vitest membaca konfigurasi dari `vitest.config.ts` dan menggunakan `tsconfig.test.json` untuk path alias yang benar di folder `tests/`.

**Test yang tersedia saat ini:**
- `ServiceRepository` — 4 test (findAll, findById, findActive, find not found)
- `ScheduleRepository` — 4 test (findByServiceId, findActive, findByDayOfWeek, find empty)
- `FaqRepository` — 3 test (findByKeyword match, no match, multiple keywords)

---

## Menghubungkan WhatsApp (Baileys)

Baileys tidak memerlukan server eksternal — koneksi dikelola langsung via WhatsApp Web protocol.

### Scan QR (pertama kali)

1. Jalankan `npm run dev`
2. QR code muncul di terminal dalam beberapa detik
3. Buka WhatsApp di HP → **Perangkat Tertaut** → **Tautkan Perangkat**
4. Scan QR — log berikut menandakan berhasil:
   ```
   WhatsApp terhubung dan siap menerima pesan ✓
   ```

### Session Persisten

Session disimpan di `./sessions/baileys/` (dikonfigurasi via `BAILEYS_SESSION_DIR`). Setelah scan pertama, **restart aplikasi tidak perlu scan QR ulang**.

### Reset Session / Scan Ulang

```bash
rm -rf sessions/baileys
npm run dev
```

---

## Menghubungkan Google Spreadsheet

> Setup awal spreadsheet (buat sheet & header) dilakukan lewat `setup-script/`. Lihat [setup-script/README.md](../../setup-script/README.md).

### Konfigurasi `.env`

```env
GOOGLE_SPREADSHEET_ID=id_dari_url_spreadsheet
GOOGLE_SERVICE_ACCOUNT_EMAIL=nama@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Sheet yang diperlukan

Nama sheet harus **persis** seperti ini (case-sensitive):

| Sheet | Kolom Header |
|-------|-------------|
| `Services` | service_id, name, price, is_active |
| `Schedule` | schedule_id, service_id, day_of_week, time_start, time_end, is_active |
| `Booking` | booking_id, invoice_number, customer_phone, customer_name, service_id, schedule_id, booking_date, payment_method, booking_status, created_at, reminder_h1_sent, reminder_hariH_sent |
| `Payment` | invoice_number, booking_id, amount, method, status, proof_image_url, verified_by, verified_at, created_at |
| `Customer` | phone, name, first_contact_at, last_booking_at, total_booking |
| `FAQ` | faq_id, keyword, question, answer, is_active |
| `Settings` | key, value |
| `Admin Log` | log_id, admin_username, action, target_id, description, created_at |
| `Broadcast` | broadcast_id, message, target_segment, status, scheduled_at, sent_at, created_by |
| `Takeover State` | phone, is_taken_over, taken_over_by, started_at, expires_at |

---

## Variabel Environment

| Variabel | Wajib | Default | Keterangan |
|----------|:-----:|---------|-----------|
| `NODE_ENV` | ✓ | — | `development` atau `production` |
| `PORT` | ✓ | `3000` | Port HTTP server |
| `TIMEZONE` | ✓ | `Asia/Jakarta` | Timezone untuk cron & reminder |
| `LOG_LEVEL` | | `info` | Level log: `debug`, `info`, `warn`, `error` |
| `ADMIN_USERNAME` | ✓ | — | Username login dashboard admin |
| `ADMIN_PASSWORD` | ✓ | — | Password login dashboard admin |
| `JWT_SECRET` | ✓ | — | Minimal 32 karakter acak, jaga kerahasiaannya |
| `JWT_EXPIRES_IN` | | `1h` | Masa berlaku token JWT |
| `GOOGLE_SPREADSHEET_ID` | ✓ | — | ID dari URL spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ✓ | — | Email service account Google |
| `GOOGLE_PRIVATE_KEY` | ✓ | — | Private key dari file JSON service account |
| `BAILEYS_SESSION_DIR` | | `./sessions/baileys` | Folder session WhatsApp |
| `AI_ENABLED` | | `false` | Aktifkan AI Fallback (`true`/`false`) |
| `OPENAI_API_KEY` | ✓ jika AI aktif | — | API key OpenAI |
| `OPENAI_MODEL` | | `gpt-4o-mini` | Model OpenAI yang digunakan |
| `SCHEDULE_LOOKAHEAD_DAYS` | | `7` | Jadwal ditampilkan N hari ke depan |
| `TAKEOVER_TIMEOUT_MINUTES` | | `30` | Durasi human takeover sebelum auto-resume |
| `SHEET_CACHE_TTL_SECONDS` | | `60` | TTL cache Sheets; set `0` untuk nonaktif |

Jika variabel wajib tidak diisi, server **menolak start** dan menampilkan daftar variabel yang bermasalah.

---

## Scripts

| Script | Keterangan |
|--------|-----------|
| `npm run dev` | Jalankan server dengan hot-reload (tsx watch) |
| `npm run build` | Kompilasi TypeScript ke `dist/` |
| `npm start` | Jalankan build hasil kompilasi |
| `npm run lint` | Cek kode dengan ESLint |
| `npm run lint:fix` | Auto-fix masalah ESLint |
| `npm run format` | Format kode dengan Prettier |
| `npm run test` | Jalankan semua unit test |
| `npm run test:watch` | Jalankan test dalam watch mode |

---

## Arsitektur & Keputusan Desain

### Clean Architecture

Proyek ini menerapkan Clean Architecture dengan aturan dependency yang ketat: layer luar boleh bergantung ke layer dalam, tidak sebaliknya.

- **Domain** tidak tahu apa-apa tentang Express, Google Sheets, atau Baileys
- **Infrastructure** mengimplementasikan interface dari domain (adapter pattern)
- **Presentation** hanya menangani HTTP/routing dan mendelegasikan ke use cases

### Repository Pattern + DI Container

Setiap repository memiliki interface (`IServiceRepository`, `IBookingRepository`, dll.) di domain layer. Implementasi konkret (`GoogleSheetsServiceRepository`, dll.) ada di infrastructure layer. DI Container manual di `shared/di/container.ts` menyatukan semuanya.

Keuntungan: implementasi bisa diganti (misalnya dari Google Sheets ke PostgreSQL) tanpa mengubah use cases.

### Google Sheets sebagai Database

Google Sheets dipilih agar admin non-teknis bisa mengecek dan mengedit data langsung. Untuk mengurangi hit API:
- **SheetCache** menyimpan data in-memory dengan TTL (default 60 detik)
- Data yang sering dibaca (Services, FAQ, Settings) di-cache lebih agresif
- Write operation langsung ke Sheets tanpa cache

### Path Alias

Konfigurasi path alias di `tsconfig.json` memungkinkan import bersih:

```typescript
// Tanpa alias (jelek)
import { IServiceRepository } from '../../../../domain/repositories';

// Dengan alias (bersih)
import { IServiceRepository } from '@domain/repositories';
```

Alias yang tersedia: `@domain/*`, `@application/*`, `@infrastructure/*`, `@presentation/*`, `@shared/*`.

---

## Catatan & Troubleshooting

**Error `stream errored out (kode=515)`** saat pertama connect setelah scan QR adalah **normal**. WhatsApp server mereset stream, aplikasi auto-reconnect dalam 5 detik.

**Cache tidak update** setelah edit spreadsheet langsung? Set `SHEET_CACHE_TTL_SECONDS=0` di `.env` saat development, atau tunggu TTL habis (default 60 detik).

**Kolom FAQ `keyword`** dipisah koma, contoh: `harga,biaya,tarif,berapa`. Matching dilakukan case-insensitive substring terhadap pesan customer.

**Test gagal karena path alias tidak dikenali?** Pastikan menggunakan `tsconfig.test.json` (bukan `tsconfig.json`) — konfigurasi ini sudah diset di `vitest.config.ts` dan menangani path alias untuk folder `tests/`.

**Server tidak mau start?** Jalankan `npm run dev` dan baca output error — Zod validator akan menampilkan daftar variabel `.env` yang bermasalah.