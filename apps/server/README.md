# Kania Happy — Server (M2: Bot Read-only)

Aplikasi backend **WhatsApp Booking System** untuk Sanggar Senam Kania Happy.
Dibangun dengan Clean Architecture, Repository Pattern, dan Service Layer di atas Node.js + TypeScript.

## Milestone yang sudah selesai

### M0 — Foundation + Baileys
- ✅ Struktur folder Clean Architecture
- ✅ TypeScript strict mode + path alias
- ✅ ESLint + Prettier
- ✅ Env validator type-safe (fail-fast)
- ✅ Logger terstruktur berbasis Winston
- ✅ Global Error Handler + `AppError` class
- ✅ DI Container manual
- ✅ Express app + `/health` endpoint
- ✅ **BaileysClient** — koneksi WhatsApp via QR scan, auto-reconnect

### M1 — Data Layer
- ✅ Domain entities (Service, Schedule, Booking, Payment, Customer, Faq, dll.)
- ✅ Repository interfaces (`IXxxRepository`)
- ✅ `GoogleSheetsClient` — thin wrapper Google Sheets API v4
- ✅ `SheetCache` — cache in-memory dengan TTL
- ✅ `BaseSheetRepository` — abstract class dengan helper read/write
- ✅ 10 Repository implementasi (Service, Schedule, Booking, Payment, Customer, Faq, Settings, AdminLog, Broadcast, Takeover)
- ✅ Unit test repository dengan mock client & cache

### M2 — Bot Read-only
- ✅ **`WhatsAppHandler`** — terima pesan, cek takeover, upsert customer, delegasi ke router
- ✅ **`MessageRouter`** — deteksi intent (menu angka, keyword, FAQ, fallback)
- ✅ **`FaqLookupService`** — keyword matching case-insensitive, pilih FAQ paling spesifik
- ✅ **`GetAvailableScheduleService`** — generate occurrence jadwal mingguan dalam window N hari
- ✅ **Setup script** — buat semua sheet + header + seed data otomatis
- ✅ Unit test M2 (FaqLookupService, GetAvailableScheduleService, MessageRouter)

**Intent yang didukung:**

| Input Customer | Respons Bot |
|---|---|
| `halo`, `hai`, `selamat pagi`, dll. | Welcome message + menu |
| `1` atau kata kunci layanan/harga | Daftar layanan aktif + harga |
| `2` atau kata kunci jadwal/jam | Jadwal kelas N hari ke depan |
| `3` atau kata kunci booking/daftar | Teaser booking (M3) |
| `4` | Panduan tanya FAQ |
| `5` | Info kontak admin |
| Pertanyaan umum | Cari di FAQ sheet |
| Tidak dikenal | Fallback + tampilkan menu |

## Yang BELUM ada (menyusul di milestone berikutnya)

- M3 — Booking Flow: state machine, invoice generator
- M4 — Payment Flow: 3 metode bayar (Cash, Transfer, QRIS)
- M5 — Reminder: cron H-1 & Hari H
- M6 — Human Takeover: admin override bot
- M7 — AI Fallback: OpenAI untuk pertanyaan di luar FAQ
- M8-M9 — Dashboard React

## Setup awal (wajib sebelum menjalankan server)

### 1. Clone & install

```bash
cd apps/server
npm install
cp .env.example .env
# isi .env dengan kredensial Google Sheets & Baileys
```

### 2. Setup Google Spreadsheet

```bash
cd setup-script
cp .env.example .env   # isi dengan kredensial yang sama
npx tsx setup-spreadsheet.ts
```

Script ini akan:
- Membuat 10 sheet dengan header yang benar
- Mengisi seed data (contoh Services, Schedule, FAQ)
- Mengisi default Settings
- Memformat header (bold, freeze row 1)
- Menghapus "Sheet1" default

### 3. Update Settings di Spreadsheet

Setelah script selesai, buka spreadsheet dan isi nilai kosong di sheet **Settings**:

| Key | Keterangan |
|-----|------------|
| `bank_account_number` | Nomor rekening untuk Transfer |
| `bank_name` | Nama bank, contoh: BCA |
| `bank_holder_name` | Nama pemilik rekening |
| `qris_image_url` | URL gambar QRIS (upload ke Google Drive/CDN) |
| `business_address` | Alamat sanggar |
| `business_phone` | Nomor WA admin |

### 4. Jalankan server

```bash
cd apps/server
npm run dev
```

Scan QR yang muncul di terminal dengan WhatsApp di HP.

## Menjalankan unit test

```bash
npm run test
```

## Struktur folder

```
apps/server/
├── setup-script/
│   ├── setup-spreadsheet.ts   # Jalankan sekali untuk setup Spreadsheet
│   └── .env.example
├── src/
│   ├── application/
│   │   ├── bot/MessageRouter.ts
│   │   ├── faq/FaqLookupService.ts
│   │   └── schedule/GetAvailableScheduleService.ts
│   ├── domain/
│   │   ├── entities/
│   │   └── repositories/
│   ├── infrastructure/
│   │   ├── google-sheets/
│   │   ├── logger/
│   │   ├── repositories/
│   │   └── whatsapp/BaileysClient.ts
│   ├── presentation/
│   │   ├── http/middlewares/
│   │   └── whatsapp/WhatsAppHandler.ts
│   └── shared/
│       ├── config/env.ts
│       ├── di/container.ts
│       ├── types/index.ts
│       └── utils/
├── tests/unit/
│   ├── repositories.test.ts   # M1: repository tests
│   └── m2-services.test.ts    # M2: service & router tests
├── tsconfig.json
├── tsconfig.test.json
└── vitest.config.ts
```

## Variabel environment

Lihat `.env.example` untuk daftar lengkap. Variabel wajib:

| Variabel | Keterangan |
|----------|------------|
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Login dashboard admin |
| `JWT_SECRET` | Minimal 16 karakter, random |
| `GOOGLE_SPREADSHEET_ID` | ID dari URL spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email service account Google |
| `GOOGLE_PRIVATE_KEY` | Private key dari file JSON service account |
| `BAILEYS_SESSION_DIR` | Folder session WA (default: `./sessions/baileys`) |

## Catatan teknis

- Error `stream errored out (kode=515)` saat scan QR adalah **normal** — auto-reconnect dalam 5 detik.
- Cache Google Sheets dikonfigurasi via `SHEET_CACHE_TTL_SECONDS` (default 60 detik). Set ke `0` untuk nonaktifkan saat development.
- Sheet `Takeover State` menyimpan state live admin takeover — bukan audit trail. Audit trail ada di `Admin Log`.
- Kolom `keyword` di sheet FAQ dipisah koma: `harga,biaya,tarif,berapa`. Matching case-insensitive substring.
- `GetAvailableScheduleService` menggunakan `schedule_lookahead_days` dari sheet Settings (default 7 hari).
