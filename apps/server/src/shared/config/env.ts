import 'dotenv/config';
import { z } from 'zod';

/**
 * Skema validasi environment variable.
 * Aplikasi akan GAGAL START (fail-fast) jika ada variabel wajib yang
 * tidak diisi atau salah tipe — daripada gagal diam-diam saat runtime.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  TIMEZONE: z.string().default('Asia/Jakarta'),

  ADMIN_USERNAME: z.string().min(1, 'ADMIN_USERNAME wajib diisi'),
  ADMIN_PASSWORD: z.string().min(6, 'ADMIN_PASSWORD minimal 6 karakter'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET wajib diisi, minimal 16 karakter'),
  JWT_EXPIRES_IN: z.string().default('1h'),

  GOOGLE_SPREADSHEET_ID: z.string().min(1, 'GOOGLE_SPREADSHEET_ID wajib diisi'),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email(),
  GOOGLE_PRIVATE_KEY: z.string().min(1, 'GOOGLE_PRIVATE_KEY wajib diisi'),

  // ── Baileys (WhatsApp Web) ─────────────────────────────────────────────────
  // Session disimpan di folder lokal; tidak perlu API key eksternal.
  BAILEYS_SESSION_DIR: z.string().default('./sessions/baileys'),
  // Nomor WA pengirim (opsional; Baileys menggunakan nomor akun yang login).
  // Dipakai untuk validasi / logging saja.
  BAILEYS_PHONE_NUMBER: z.string().optional(),

  AI_ENABLED: z.coerce.boolean().default(true),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  SCHEDULE_LOOKAHEAD_DAYS: z.coerce.number().int().positive().default(7),
  TAKEOVER_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
  SHEET_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(60),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type AppEnv = z.infer<typeof envSchema>;

function loadEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // Sengaja throw di module load time -> aplikasi tidak boleh menyala
    // dengan konfigurasi yang tidak valid (fail-fast).
    throw new Error(`Environment variable tidak valid:\n${issues}`);
  }

  return parsed.data;
}

export const env: AppEnv = loadEnv();
