# Kania Happy — Server (M3: Booking Flow)

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
- ✅ 11 Repository implementasi (Service, Schedule, Booking, Payment, **Payment Method**, Customer, Faq, Settings, AdminLog, Broadcast, Takeover)
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
| `3` atau kata kunci booking (`mau booking`, `reservasi`, dll.) | Mulai booking flow (M3) |
| `4` | Panduan tanya FAQ |
| `5` | Info kontak admin |
| Pertanyaan umum | Cari di FAQ sheet |
| Tidak dikenal | Fallback + tampilkan menu |

> ⚠️ **Catatan keyword booking**: kata `'pesan'`, `'ikut'`, `'gabung'` SENGAJA tidak dipakai sebagai trigger tunggal — kata-kata itu terlalu ambigu dalam Bahasa Indonesia (bisa berarti "message"/"ikutan ngobrol" dll, bukan "order") dan menyebabkan false-positive masuk ke booking flow. Gunakan frasa yang lebih spesifik seperti `'mau booking'`, `'mau ikut'`, `'pesan kelas'`.

### M3 — Booking Flow
- ✅ **`ConversationStateStore`** — state per nomor WA (in-memory, TTL 15 menit), step: `CHOOSE_SERVICE` → `CHOOSE_SCHEDULE` → `INPUT_NAME` (jika customer baru) → `CHOOSE_PAYMENT` → `CONFIRM`
- ✅ **`BookingService`** — business logic: mulai booking (`startBooking`), proses pemilihan tiap step, generate ringkasan konfirmasi, `confirmBooking` (insert ke sheet `Booking` + `Payment`)
- ✅ **`BookingFlowHandler`** — orkestrasi step-by-step, validasi input tiap langkah, handle pembatalan (`ketik "0"` kapan saja)
- ✅ **`InvoiceGenerator`** — format `INV-YYYYMMDD-XXXX`, sequence harian unik
- ✅ Metode pembayaran (Cash/Transfer/QRIS) dibaca dari sheet **`Payment Method`** (bukan hardcode) — pesan konfirmasi otomatis menyesuaikan instruksi sesuai tipe metode yang dipilih
- ✅ Unit test M3 (`InvoiceGenerator`, `ConversationStateStore`, `BookingService`, `BookingFlowHandler` happy path + edge case input tidak valid)

**Flow booking (ringkas):**

| Step | Customer Input | Bot Response |
|------|----------------|---------------|
| 1 | `"mau booking"` / `"3"` | Daftar layanan aktif, minta pilih nomor |
| 2 (`CHOOSE_SERVICE`) | Nomor layanan | Daftar jadwal occurrence tersedia |
| 3 (`CHOOSE_SCHEDULE`) | Nomor jadwal | Jika customer baru → minta nama; jika sudah ada → lanjut ke payment |
| 3b (`INPUT_NAME`) | Nama | Lanjut ke pilihan metode pembayaran |
| 4 (`CHOOSE_PAYMENT`) | Nomor metode bayar | Ringkasan booking + minta konfirmasi "ya" |
| 5 (`CONFIRM`) | `"ya"` | Booking + Payment tersimpan, invoice dikirim, state di-clear |
| kapan saja | `"0"` | Batalkan flow, state di-clear |

## Yang BELUM ada (menyusul di milestone berikutnya)

- M4 — Payment Flow: endpoint verifikasi pembayaran oleh admin (Transfer/QRIS → Paid)
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
# masih di folder apps/server (.env sudah terisi dari langkah 1)
npx tsx setup-script/setup-spreadsheet.ts
```

Script ini akan:
- Membuat 11 sheet dengan header yang benar (termasuk `Payment Method`)
- Mengisi seed data (contoh Services, Schedule, FAQ, Payment Method)
- Mengisi default Settings
- Memformat header (bold, freeze row 1)
- Menghapus "Sheet1" default

Verifikasi:
```bash
npx tsx setup-script/check-sheets.ts
```

### 3. Isi data asli di Spreadsheet

Setelah script selesai, buka spreadsheet dan **edit baris contoh** di sheet berikut:

| Sheet | Yang perlu diisi/diedit |
|-------|------|
| `Payment Method` | Ganti nomor rekening, nama bank, nama pemilik, URL gambar QRIS sesuai data asli. Tambah baris baru jika ada rekening lain. Set `is_active=FALSE` untuk menyembunyikan metode yang tidak dipakai. |
| `Settings` | `business_address`, `business_phone`, `welcome_message`, dll (lihat tabel di `docs/01-DESIGN-DOCUMENT.md` §5.8) |
| `Services` | Layanan/kelas asli Kania Happy |
| `Schedule` | Jadwal mingguan asli — kolom `day_of_week` diisi nama hari ("Senin", dst), bukan angka |

> Catatan: sebelumnya rekening/QRIS disimpan sebagai JSON di key `payment_methods` pada sheet `Settings`. Ini sudah **dipindah** ke sheet `Payment Method` tersendiri (1 baris = 1 metode) agar admin non-teknis bisa CRUD langsung tanpa mengedit JSON.

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
│   ├── setup-spreadsheet.ts   # Jalankan sekali untuk setup Spreadsheet (npx tsx setup-script/setup-spreadsheet.ts)
│   ├── check-sheets.ts        # Verifikasi sheet yang sudah dibuat
│   └── .env.example
├── src/
│   ├── application/
│   │   ├── bot/MessageRouter.ts
│   │   ├── faq/FaqLookupService.ts
│   │   ├── schedule/GetAvailableScheduleService.ts
│   │   └── booking/
│   │       ├── BookingService.ts
│   │       ├── BookingFlowHandler.ts
│   │       └── InvoiceGenerator.ts
│   ├── domain/
│   │   ├── entities/          # termasuk PaymentMethod.ts
│   │   └── repositories/
│   ├── infrastructure/
│   │   ├── google-sheets/
│   │   ├── logger/
│   │   ├── repositories/      # termasuk GoogleSheetsPaymentMethodRepository.ts
│   │   ├── state/ConversationStateStore.ts
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
│   ├── m2-services.test.ts    # M2: service & router tests
│   └── m3-booking.test.ts     # M3: booking flow tests
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
- Sheet `Schedule`, kolom `day_of_week` diisi **nama hari** ("Senin", "Selasa", dst), bukan angka — supaya admin bisa langsung baca & edit jadwal tanpa menghafal mapping. Konversi ke angka (untuk hitung tanggal occurrence) dilakukan otomatis di `GoogleSheetsScheduleRepository`.
- Rekening/QRIS disimpan di sheet **`Payment Method`** (1 baris = 1 metode), bukan JSON di Settings — admin tambah/edit/nonaktifkan metode pembayaran langsung sebagai baris Spreadsheet.
- State booking customer (`ConversationStateStore`) disimpan **in-memory**, TTL 15 menit — jika server restart, semua customer yang sedang di tengah proses booking harus mulai ulang dari awal. Ini sengaja untuk MVP; jika perlu persisten lintas restart, pindahkan ke sheet/storage terpisah di milestone mendatang.
- Keyword trigger booking di `MessageRouter` SENGAJA menghindari kata tunggal yang ambigu (`'pesan'`, `'ikut'`, `'gabung'`) — pakai frasa lebih spesifik (`'mau booking'`, `'pesan kelas'`, dst) agar tidak salah trigger di kalimat yang tidak bermaksud booking.
