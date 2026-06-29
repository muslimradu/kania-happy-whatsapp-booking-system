# Kania Happy — WhatsApp Booking System

Sistem booking berbasis WhatsApp untuk **Sanggar Senam Kania Happy**. Bot WhatsApp melayani customer 24/7: menjawab FAQ, menampilkan layanan & jadwal, memproses booking, dan mengirim reminder otomatis. Admin mengelola semua data melalui dashboard web, dengan Google Spreadsheet sebagai database.

---

## Daftar Isi

- [Gambaran Umum](#gambaran-umum)
- [Arsitektur Sistem](#arsitektur-sistem)
- [Struktur Repository](#struktur-repository)
- [Tech Stack](#tech-stack)
- [Persyaratan Sistem](#persyaratan-sistem)
- [Quick Start](#quick-start)
- [Setup Google Spreadsheet](#setup-google-spreadsheet)
- [Menghubungkan WhatsApp](#menghubungkan-whatsapp)
- [Roadmap Milestone](#roadmap-milestone)
- [Dokumentasi Lanjutan](#dokumentasi-lanjutan)

---

## Gambaran Umum

### Aktor Sistem

| Aktor | Peran |
|-------|-------|
| **Customer** (via WhatsApp) | Tanya FAQ, lihat layanan & jadwal, booking, bayar, terima reminder |
| **Admin** (via Dashboard Web) | Kelola data master, verifikasi pembayaran, takeover chat, broadcast |
| **Bot Engine** | Rule-based flow, FAQ lookup, fallback ke AI jika pertanyaan tidak ditemukan |
| **AI (OpenAI, opsional)** | Menjawab pertanyaan umum seputar Kania Happy di luar FAQ |

### Fitur Utama

- 🤖 **Bot WhatsApp otomatis** — FAQ, layanan, jadwal, booking end-to-end ✅
- 📅 **Booking Flow** — pilih layanan → jadwal → nama (jika baru) → metode bayar → konfirmasi → invoice ✅
- 💳 **3 Metode Pembayaran** — Cash, Transfer Bank, QRIS, dikelola dari sheet `Payment Method` (bukan JSON di Settings) ✅
- ⏰ **Reminder Otomatis** — H-1 dan Hari H untuk semua booking aktif (🔜 M5)
- 👤 **Human Takeover** — admin override bot per nomor WA (auto-resume 30 menit) (🔜 M6)
- 🧠 **AI Fallback** — OpenAI menjawab pertanyaan di luar FAQ (dengan guardrail topik) (🔜 M7)
- 📊 **Dashboard Admin** — CRUD semua entitas, broadcast, settings, audit log (🔜 M8-M9)
- 📋 **Google Sheets sebagai DB** — mudah dicek & diedit langsung oleh admin non-teknis ✅

---

## Arsitektur Sistem

Proyek ini menggunakan **Clean Architecture** dengan 4 layer:

```
Presentation  (Controllers / WA Webhook / Cron Triggers)
      ↓
Application   (Services / Use Cases)
      ↓
Domain        (Entities, Interfaces / Ports)
      ↑ diimplementasikan oleh
Infrastructure (Google Sheets, BaileysClient, OpenAI, Logger)
```

Aturan utama: **layer luar boleh bergantung ke layer dalam, tidak sebaliknya.** Domain tidak tahu apa-apa tentang Express, Google Sheets, atau Baileys — hanya mendefinisikan interface. Infrastructure mengimplementasikan interface tersebut.

```
Customer (WA) ──────────────────────────────────────────────────────────┐
                                                                        ↓
                                            ┌─────────────────────────────────┐
                                            │     Backend (Express + TS)      │
                                            │                                 │
                                            │  Webhook ──→ Use Cases ──→ Bot  │
                                            │                   ↓             │
                                            │            Repository           │
                                            │           Interfaces            │
                                            │           ↙         ↘           │
                                            │   Google Sheets   Baileys       │
                                            └─────────────────────────────────┘
                                                          ↑
Admin (Browser) ──────────────────────────────── Dashboard React
```

---

## Struktur Repository

```
kania-happy/
├── apps/
│   └── server/                  # Backend utama (Bot + REST API)
│       ├── src/
│       │   ├── domain/
│       │   │   ├── entities/    # Pure domain objects (Service, Schedule, Booking, Payment, PaymentMethod, dll.)
│       │   │   └── repositories/# Interface IXxxRepository (kontrak, bukan implementasi)
│       │   ├── application/     # Use cases / service layer
│       │   │   ├── faq/             # FaqLookupService
│       │   │   ├── schedule/        # GetAvailableScheduleService (generate occurrence mingguan)
│       │   │   ├── booking/         # BookingService, BookingFlowHandler, InvoiceGenerator
│       │   │   └── bot/             # MessageRouter (deteksi intent & routing)
│       │   ├── infrastructure/
│       │   │   ├── google-sheets/ # GoogleSheetsClient, SheetCache, BaseSheetRepository
│       │   │   ├── logger/        # Winston logger
│       │   │   ├── repositories/  # Implementasi konkret GoogleSheetsXxxRepository (termasuk PaymentMethod)
│       │   │   ├── state/         # ConversationStateStore (state booking per nomor WA, TTL 15 menit)
│       │   │   └── whatsapp/      # BaileysClient (koneksi & kirim pesan WA)
│       │   ├── presentation/
│       │   │   ├── http/middlewares/ # errorHandler, requestLogger
│       │   │   └── whatsapp/         # WhatsAppHandler (terima pesan masuk dari Baileys)
│       │   └── shared/
│       │       ├── config/env.ts    # Env validator (Zod) — fail-fast jika tidak lengkap
│       │       ├── di/container.ts  # DI Container manual + DI_TOKENS
│       │       └── types/index.ts   # AppError, ApiSuccessResponse, dll.
│       ├── setup-script/        # Script setup awal Google Spreadsheet (lihat di bawah)
│       │   ├── setup-spreadsheet.ts # Buat semua sheet + header + seed data otomatis
│       │   ├── check-sheets.ts      # Verifikasi sheet yang sudah dibuat
│       │   └── .env.example
│       ├── tests/
│       │   └── unit/
│       │       ├── repositories.test.ts # Test M1: Service/Schedule/Faq repository
│       │       ├── m2-services.test.ts  # Test M2: FaqLookup, GetAvailableSchedule, MessageRouter
│       │       └── m3-booking.test.ts   # Test M3: InvoiceGenerator, ConversationStateStore, BookingService, BookingFlowHandler
│       ├── .env.example
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsconfig.test.json   # Konfigurasi TypeScript khusus untuk folder tests/
│       └── vitest.config.ts
└── docs/
    └── 01-DESIGN-DOCUMENT.md    # Analisis kebutuhan, arsitektur, desain detail
```

---

## Tech Stack

| Kategori | Teknologi |
|----------|-----------|
| Runtime | Node.js 20+ |
| Language | TypeScript 5 (strict mode) |
| Framework | Express 4 |
| WhatsApp | [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) |
| Database | Google Sheets (via googleapis v4) |
| AI | OpenAI API (gpt-4o-mini, opsional) |
| Logger | Winston |
| Validation | Zod |
| Auth | JWT |
| Scheduler | node-cron |
| Testing | Vitest |
| Linting | ESLint + Prettier |

---

## Persyaratan Sistem

- **Node.js** >= 20.x
- **npm** >= 10.x
- Akun **Google Cloud** dengan Google Sheets API aktif
- Nomor **WhatsApp** yang akan dipakai sebagai bot (bukan nomor pribadi yang aktif dipakai)
- (Opsional) API key **OpenAI** jika fitur AI Fallback diaktifkan

---

## Quick Start

### 1. Clone & install dependensi

```bash
git clone <url-repo>
cd kania-happy
```

### 2. Setup Google Spreadsheet (sekali saja)

```bash
cd apps/server
npm install
cp .env.example .env
# Edit .env: isi GOOGLE_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
npx tsx setup-script/setup-spreadsheet.ts
```

Script ini akan membuat 11 sheet beserta header, data contoh, dan format otomatis. Lihat [Setup Google Spreadsheet](#setup-google-spreadsheet) untuk detail lengkap.

Verifikasi sheet sudah benar:

```bash
npx tsx setup-script/check-sheets.ts
```

### 3. Jalankan server

```bash
# masih di folder apps/server, .env sudah terisi dari langkah 2
npm run dev
```

### 4. Hubungkan WhatsApp

Setelah server berjalan, QR code akan muncul di terminal. Scan dengan WhatsApp di HP:
**WhatsApp → Perangkat Tertaut → Tautkan Perangkat → Scan QR**

---

## Setup Google Spreadsheet

### Langkah 1 — Buat Service Account

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru (atau pakai yang sudah ada)
3. Aktifkan **Google Sheets API**: *APIs & Services → Enable APIs → cari "Google Sheets API"*
4. Buat Service Account: *IAM & Admin → Service Accounts → Create Service Account*
5. Download file JSON credentials: *klik service account → Keys → Add Key → JSON*

### Langkah 2 — Share Spreadsheet ke Service Account

1. Buka Google Spreadsheet Anda
2. Klik **Share** (pojok kanan atas)
3. Masukkan `client_email` dari file JSON service account
4. Set role: **Editor** → klik Send

### Langkah 3 — Jalankan Setup Script

```bash
cd apps/server
npx tsx setup-script/setup-spreadsheet.ts
```

Script ini membuat **11 sheet** secara otomatis dan aman dijalankan berulang kali (sheet yang sudah ada akan di-skip):

| Sheet | Keterangan |
|-------|-----------|
| `Services` | Daftar layanan/kelas yang tersedia |
| `Schedule` | Jadwal kelas — template mingguan (kolom `day_of_week` diisi NAMA hari, contoh "Senin", bukan angka) |
| `Booking` | Data booking customer |
| `Payment` | Data pembayaran & verifikasi |
| `Payment Method` | Daftar metode pembayaran (Cash/Transfer/QRIS) — admin tambah/edit/hapus rekening & QRIS di sini, langsung sebagai baris, **bukan** JSON di Settings |
| `Customer` | Data customer (nama, nomor WA) |
| `FAQ` | Pertanyaan & jawaban otomatis bot |
| `Settings` | Konfigurasi operasional tunggal (jam buka, timeout takeover, pesan sambutan, dll — bukan daftar/list) |
| `Admin Log` | Audit trail aktivitas admin |
| `Broadcast` | Pesan massal ke customer |
| `Takeover State` | Status human takeover per nomor WA |

### Langkah 4 — Isi Data Awal (Manual)

Setelah script selesai, sheet `Payment Method` sudah terisi 1 baris contoh per tipe (Cash, Transfer, QRIS) — **edit langsung** nomor rekening/nama bank/URL gambar QRIS sesuai data asli Kania Happy, atau tambah baris baru untuk rekening lain.

Update juga nilai di sheet `Settings` sesuai kebutuhan:

| Key | Isi dengan |
|-----|-----------|
| `business_address` | Alamat lengkap sanggar |
| `business_phone` | Nomor WA bisnis format `628xxx` |
| `welcome_message` | Sesuaikan pesan sambutan bot |
| `schedule_lookahead_days` | Berapa hari ke depan jadwal ditampilkan ke customer (default `7`) |
| `takeover_timeout_minutes` | Durasi bot non-aktif setelah admin takeover (default `30`) |

Tambahkan data layanan di sheet `Services` dan jadwal mingguan di sheet `Schedule` (kolom hari diisi nama hari seperti "Senin", "Selasa", dst — supaya admin mudah mengedit tanpa menghafal mapping angka).

---

## Menghubungkan WhatsApp

Baileys tidak memerlukan server eksternal — koneksi dikelola langsung via WhatsApp Web protocol.

### Scan QR (pertama kali)

1. Jalankan `npm run dev` di folder `apps/server`
2. QR code muncul di terminal dalam beberapa detik
3. Buka WhatsApp di HP → **Perangkat Tertaut** → **Tautkan Perangkat**
4. Scan QR — log `WhatsApp terhubung dan siap menerima pesan ✓` menandakan berhasil

### Session Persisten

Session disimpan di `./sessions/baileys/` (dikonfigurasi via `BAILEYS_SESSION_DIR`). Setelah scan pertama, restart aplikasi **tidak perlu scan QR ulang**.

### Reset Session / Scan Ulang

```bash
rm -rf sessions/baileys
npm run dev
```

### Catatan

- Error `stream errored out (kode=515)` saat pertama connect setelah scan QR adalah **normal** — WhatsApp server mereset stream, aplikasi auto-reconnect dalam 5 detik.

---

## Variabel Environment

Salin `.env.example` ke `.env` di folder `apps/server/` lalu isi nilainya:

| Variabel | Wajib | Keterangan |
|----------|:-----:|-----------|
| `NODE_ENV` | ✓ | `development` atau `production` |
| `PORT` | ✓ | Port HTTP server (default: `3000`) |
| `TIMEZONE` | ✓ | Timezone (default: `Asia/Jakarta`) |
| `LOG_LEVEL` | | Level log Winston: `debug`, `info`, `warn`, `error` |
| `ADMIN_USERNAME` | ✓ | Username login dashboard admin |
| `ADMIN_PASSWORD` | ✓ | Password login dashboard admin |
| `JWT_SECRET` | ✓ | Minimal 32 karakter acak, jaga kerahasiaannya |
| `JWT_EXPIRES_IN` | | Masa berlaku JWT (default: `1h`) |
| `GOOGLE_SPREADSHEET_ID` | ✓ | ID dari URL spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ✓ | Email service account Google |
| `GOOGLE_PRIVATE_KEY` | ✓ | Private key dari file JSON service account |
| `BAILEYS_SESSION_DIR` | | Folder session WA (default: `./sessions/baileys`) |
| `AI_ENABLED` | | `true` / `false` — aktifkan AI Fallback |
| `OPENAI_API_KEY` | ✓ jika AI aktif | API key OpenAI |
| `OPENAI_MODEL` | | Model OpenAI (default: `gpt-4o-mini`) |
| `SCHEDULE_LOOKAHEAD_DAYS` | | Jadwal ditampilkan N hari ke depan (default: `7`) |
| `TAKEOVER_TIMEOUT_MINUTES` | | Durasi human takeover (default: `30`) |
| `SHEET_CACHE_TTL_SECONDS` | | TTL cache Sheets (default: `60`, set `0` untuk nonaktif) |

Jika variabel wajib tidak diisi, server **menolak start** dan menampilkan daftar variabel yang bermasalah.

---

## Menjalankan Test

```bash
cd apps/server
npm run test          # jalankan sekali
npm run test:watch    # watch mode (re-run saat file berubah)
```

Vitest akan menemukan test di `tests/**/*.test.ts`. Saat ini tersedia **54 unit test** tersebar di 3 file:

| File | Cakupan |
|------|---------|
| `repositories.test.ts` | M1 — `ServiceRepository`, `ScheduleRepository`, `FaqRepository` (mock client & cache) |
| `m2-services.test.ts` | M2 — `FaqLookupService`, `GetAvailableScheduleService`, `MessageRouter` (routing intent, fallback, menu) |
| `m3-booking.test.ts` | M3 — `InvoiceGenerator`, `ConversationStateStore`, `BookingService`, `BookingFlowHandler` (happy path booking sampai konfirmasi) |

---

## Scripts yang Tersedia

Di folder `apps/server/`:

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

## Roadmap Milestone

| Milestone | Status | Deskripsi |
|-----------|--------|-----------|
| **M0** — Foundation + Baileys | ✅ Selesai | Clean Architecture, TypeScript, Logger, Error Handler, DI Container, Express, BaileysClient |
| **M1** — Data Layer | ✅ Selesai | Domain entities, Repository interfaces, GoogleSheetsClient, SheetCache, 11 repository implementasi, unit test |
| **M2** — Bot Read-only | ✅ Selesai | Webhook handler, MessageRouter, FAQ lookup, tampilkan layanan & jadwal |
| **M3** — Booking Flow | ✅ Selesai | `ConversationStateStore`, `BookingService`, `BookingFlowHandler`, `InvoiceGenerator` — booking end-to-end sampai konfirmasi |
| **M4** — Payment Flow | 🔜 Berikutnya | Verifikasi pembayaran oleh admin (Transfer/QRIS → Paid), endpoint REST untuk dashboard |
| **M5** — Reminder | 📋 Planned | Cron H-1 & Hari H untuk semua booking aktif |
| **M6** — Human Takeover | 📋 Planned | Admin override bot per nomor WA, auto-resume setelah timeout |
| **M7** — AI Fallback | 📋 Planned | OpenAI untuk pertanyaan di luar FAQ, dengan guardrail topik |
| **M8–M9** — Dashboard | 📋 Planned | Dashboard React + Vite untuk admin |
| **M10** — Testing & Docs Final | 📋 Planned | Pemantapan test, dokumentasi API lengkap |

---

## Dokumentasi Lanjutan

- [`docs/01-DESIGN-DOCUMENT.md`](docs/01-DESIGN-DOCUMENT.md) — Analisis kebutuhan lengkap, arsitektur detail, risk assessment, desain database, dan flow diagram
- [`apps/server/README.md`](apps/server/README.md) — Dokumentasi teknis server (struktur folder, konfigurasi, troubleshooting, status milestone detail)

---

## Catatan Pengembangan

- Cache Google Sheets dikonfigurasi via `SHEET_CACHE_TTL_SECONDS` (default 60 detik). Set ke `0` untuk menonaktifkan cache saat development agar perubahan di spreadsheet langsung terlihat.
- Kolom `keyword` di sheet FAQ dipisah koma, contoh: `harga,biaya,tarif,berapa` — matching dilakukan case-insensitive substring terhadap pesan customer.
- Proyek ini dirancang sebagai **single-tenant** (1 sanggar = 1 instance server).
- AI Fallback hanya dipanggil jika FAQ tidak menemukan jawaban, dan dibatasi guardrail topik Kania Happy saja untuk menghindari penggunaan token yang tidak perlu.
