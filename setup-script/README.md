# Setup Spreadsheet — Kania Happy

Script ini membuat **seluruh sheet + header** di Google Spreadsheet secara otomatis.
Cukup dijalankan **sekali** saat pertama kali setup.

---

## Apa yang dibuat script ini?

| Sheet            | Keterangan                                    |
|------------------|-----------------------------------------------|
| `Services`       | Daftar layanan/kelas yang tersedia            |
| `Schedule`       | Jadwal kelas (tanggal, jam, kuota)            |
| `Booking`        | Data booking customer                         |
| `Payment`        | Data pembayaran & verifikasi                  |
| `Customer`       | Data customer (nama, nomor WA)                |
| `FAQ`            | Pertanyaan & jawaban otomatis bot             |
| `Settings`       | Konfigurasi bot & bisnis (terisi default)     |
| `Admin Log`      | Audit trail aktivitas admin                   |
| `Broadcast`      | Pesan massal ke customer                      |
| `Takeover State` | Status human takeover per nomor WA            |

Setiap sheet sudah dilengkapi:
- ✅ Header row (bold, background gelap, frozen)
- ✅ Satu baris contoh data
- ✅ Auto-resize kolom
- ✅ Warna tab berbeda tiap sheet
- ✅ Sheet `Settings` langsung terisi 12 konfigurasi default

---

## Prasyarat

### 1. Buat Service Account Google

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru (atau pakai yang sudah ada)
3. Aktifkan **Google Sheets API**: APIs & Services → Enable APIs → cari "Google Sheets API"
4. Buat Service Account: IAM & Admin → Service Accounts → Create Service Account
5. Download credentials JSON: klik service account → Keys → Add Key → JSON

### 2. Share Spreadsheet ke Service Account

1. Buka spreadsheet Anda
2. Klik tombol **Share** (pojok kanan atas)
3. Masukkan email service account (dari credentials JSON, field `client_email`)
4. Set role: **Editor**
5. Klik Send

---

## Cara Menjalankan

```bash
# 1. Masuk ke folder ini
cd setup

# 2. Install dependencies
npm install

# 3. Salin .env.example dan isi nilainya
cp .env.example .env
# Edit .env dengan text editor Anda

# 4. Jalankan!
npm run setup
```

### Contoh output sukses:

```
🚀 Kania Happy — Setup Google Spreadsheet

📋 Spreadsheet ID : 107LZdGvM6XxBZaA33E6IWwh4JtmTlcz_1onpagQ5zgw
📧 Service Account: kania-happy@my-project.iam.gserviceaccount.com

🔍 Membaca sheet yang sudah ada...
   Sheet existing: (kosong)

📝 Membuat 10 sheet baru...
   ✓ Sheet "Services" dibuat (id: 12345)
   ✓ Sheet "Schedule" dibuat (id: 12346)
   ...

📊 Mengisi header dan contoh data...
   ✓ "Services" — 1 baris data (+ 1 header)
   ...

🎨 Memformat header...
   ✓ Format diterapkan ke 10 sheet

🗑️  Sheet default "Sheet1" dihapus

✅ Setup selesai!

📌 Langkah selanjutnya:
   1. Buka spreadsheet dan cek semua sheet sudah terbuat
   2. Update sheet Settings — isi nilai yang masih kosong:
      - qris_image_url  (URL gambar QRIS Anda)
      - bank_account_number, bank_account_name, bank_name
      - business_address, business_phone
   3. Tambah data Services dan Schedule melalui dashboard admin
   4. Jalankan server: npm run dev
```

---

## Script ini aman dijalankan berulang kali

- Sheet yang **sudah ada** → **skip** (tidak ditimpa)
- Setting yang **sudah ada** → **tidak diubah**
- Setting yang **belum ada** → ditambahkan

---

## Setelah Setup — Yang Perlu Dilakukan Manual

### Di sheet `Settings`, update nilai-nilai ini:

| Key | Isi dengan |
|-----|-----------|
| `qris_image_url` | Upload gambar QRIS ke Google Drive / ImgBB, lalu paste URL publiknya |
| `bank_account_number` | Nomor rekening bank Anda |
| `bank_account_name` | Nama pemilik rekening |
| `bank_name` | Nama bank (BCA / Mandiri / dll) |
| `business_address` | Alamat lengkap sanggar |
| `business_phone` | Nomor WA bisnis format `628xxx` |
| `welcome_message` | Sesuaikan pesan sambutan |

### Di sheet `Services`, tambah data kelas:

Contoh isi manual atau lewat dashboard admin:

| service_id | name | description | price | duration_minutes | category | is_active |
|---|---|---|---|---|---|---|
| SVC-001 | Zumba Basic | Kelas zumba pemula | 50000 | 60 | Zumba | TRUE |
| SVC-002 | Aerobic | Senam aerobic | 60000 | 60 | Aerobic | TRUE |

### Di sheet `FAQ`, tambah pertanyaan umum:

| faq_id | question | answer | keywords | is_active | order |
|---|---|---|---|---|---|
| FAQ-001 | Berapa harga? | Harga mulai Rp50.000... | harga,biaya,tarif | TRUE | 1 |
| FAQ-002 | Lokasi dimana? | Jl. Kania No. 1... | lokasi,alamat,tempat | TRUE | 2 |
