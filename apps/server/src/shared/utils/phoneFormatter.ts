/**
 * Utilitas normalisasi nomor WhatsApp.
 *
 * Baileys mengirim JID dalam beberapa format:
 *  - '6281234567890@s.whatsapp.net'  → nomor Indonesia normal
 *  - '273069792833580@s.whatsapp.net' → format internal WA (lid)
 *
 * Sheet Customer menyimpan nomor dalam format '628xxx' (tanpa @...).
 */

/**
 * Ekstrak nomor bersih dari JID Baileys.
 * Contoh: '6281234567890@s.whatsapp.net' → '6281234567890'
 */
export function jidToPhone(jid: string): string {
  return jid.split('@')[0] ?? jid;
}

/**
 * Ubah nomor bersih ke JID Baileys.
 * Contoh: '6281234567890' → '6281234567890@s.whatsapp.net'
 */
export function phoneToJid(phone: string): string {
  if (phone.includes('@')) return phone;
  return `${phone.replace(/^\+/, '')}@s.whatsapp.net`;
}

/**
 * Normalisasi nomor ke format E.164 tanpa '+'.
 * Menerima: '08xxx', '+628xxx', '628xxx'
 * Output  : '628xxx'
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  return digits;
}
