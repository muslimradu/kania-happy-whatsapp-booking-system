# Kania Happy — Server (M0: Foundation + Baileys)

Ini adalah hasil **Milestone M0** dari roadmap implementasi (lihat `docs/01-DESIGN-DOCUMENT.md` §12-13), dengan penggantian WhatsApp provider dari Evolution API ke **Baileys** (`@whiskeysockets/baileys`).

## Yang sudah ada di milestone ini

- ✅ Struktur folder Clean Architecture (`domain` / `application` / `infrastructure` / `presentation` / `shared`)
- ✅ TypeScript strict mode + path alias (`@domain/*`, `@shared/*`, dst.)
- ✅ ESLint + Prettier
- ✅ Env validator type-safe (`src/shared/config/env.ts`) — fail-fast jika `.env` tidak lengkap
- ✅ Logger terstruktur berbasis Winston (`src/infrastructure/logger/Logger.ts`)
- ✅ Global Error Handler + `AppError` class + `asyncHandler` helper
- ✅ DI Container manual sederhana (`src/shared/di/container.ts`)
- ✅ Express app minimal dengan `/health` endpoint (termasuk status `waConnected`)
- ✅ **BaileysClient** — koneksi WhatsApp via QR scan, auto-reconnect, kirim teks/gambar/dokumen (`src/infrastructure/whatsapp/BaileysClient.ts`)

## Yang BELUM ada (menyusul di milestone berikutnya)

- Repository ke Google Sheets (M1)
- Webhook WhatsApp & FAQ lookup (M2)
- Booking, Payment, Reminder, Takeover, AI (M3-M7)
- Dashboard React (M8-M9)

## Cara menjalankan

```bash
cd apps/server
npm install
cp .env.example .env
# isi .env dengan kredensial asli (lihat komentar di setiap baris)
npm run dev
```

Saat pertama kali dijalankan, QR code akan muncul di terminal — scan dengan aplikasi WhatsApp di HP.

Cek server hidup:

```bash
curl http://localhost:3000/health
# { "success": true, "data": { "status": "ok", "timezone": "Asia/Jakarta", "waConnected": true } }
```

## Menghubungkan WhatsApp (Baileys)

Berbeda dengan Evolution API, Baileys tidak memerlukan server eksternal. Koneksi dikelola langsung oleh aplikasi ini via WhatsApp Web protocol.

**Langkah pertama (scan QR):**

1. Jalankan `npm run dev`
2. QR code muncul di terminal dalam beberapa detik
3. Buka WhatsApp di HP → **Perangkat Tertaut** → **Tautkan Perangkat**
4. Scan QR — log `WhatsApp terhubung dan siap menerima pesan ✓` menandakan berhasil

**Session persisten:**

Session disimpan di folder `./sessions/baileys/` (dikonfigurasi via `BAILEYS_SESSION_DIR`). Setelah scan pertama, restart aplikasi **tidak perlu scan QR ulang** selama folder session masih ada.

**Logout / scan ulang:**

Hapus folder session lalu restart:

```bash
rm -rf sessions/baileys
npm run dev
```

## Variabel environment penting (perubahan dari Evolution API)

| Dihapus (Evolution) | Diganti dengan (Baileys) |
|---|---|
| `EVOLUTION_API_BASE_URL` | — (tidak diperlukan) |
| `EVOLUTION_API_KEY` | — (tidak diperlukan) |
| `EVOLUTION_INSTANCE_NAME` | — (tidak diperlukan) |
| `EVOLUTION_WEBHOOK_SECRET` | — (tidak diperlukan) |
| | `BAILEYS_SESSION_DIR` (default: `./sessions/baileys`) |
| | `BAILEYS_PHONE_NUMBER` (opsional, hanya untuk referensi) |

Salin `.env.example` ke `.env` untuk melihat daftar lengkap variabel yang diperlukan.

## Catatan

- Jika `.env` tidak lengkap, server akan **menolak start** dan menampilkan daftar variabel yang bermasalah — ini sengaja (fail-fast), bukan bug.
- Kredensial Google Sheets dan OpenAI belum dibutuhkan untuk M0, tapi env validator tetap mewajibkan field-nya diisi — boleh isi dummy dulu, akan dipakai betulan di M1 & seterusnya.
- Error `stream errored out (kode=515)` saat pertama connect setelah scan QR adalah **normal** — ini adalah perilaku WhatsApp server saat mereset stream, aplikasi akan auto-reconnect dalam 5 detik.