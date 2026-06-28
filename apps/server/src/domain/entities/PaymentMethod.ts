/**
 * Entity: PaymentMethod
 *
 * Metode pembayaran yang tersedia — Transfer Bank dan QRIS.
 * Disimpan di sheet "Payment Method" (bukan di Settings) agar admin
 * bisa menambah, mengedit, dan menghapus rekening cukup dengan
 * menambah/edit/hapus baris di spreadsheet — tanpa perlu edit JSON.
 *
 * Kolom sheet "Payment Method":
 * A  method_id       ID unik, contoh: PM001
 * B  label           Nama tampil ke customer, contoh: BCA, Mandiri, QRIS
 * C  type            "transfer" atau "qris"
 * D  account_number  Nomor rekening (kosong jika type=qris)
 * E  account_name    Nama pemilik rekening (kosong jika type=qris)
 * F  qris_image_url  URL gambar QRIS publik (kosong jika type=transfer)
 * G  is_active       Tampilkan ke customer atau tidak
 */
export type PaymentMethodType = 'transfer' | 'qris';

export interface PaymentMethod {
  methodId:       string;            // contoh: PM001
  label:          string;            // contoh: BCA, Mandiri, QRIS
  type:           PaymentMethodType;
  accountNumber:  string;            // kosong jika type = qris
  accountName:    string;            // kosong jika type = qris
  qrisImageUrl:   string;            // kosong jika type = transfer
  isActive:       boolean;
}
