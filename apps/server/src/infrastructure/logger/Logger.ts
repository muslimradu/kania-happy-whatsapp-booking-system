import winston from 'winston';
import { env } from '@shared/config/env';

/**
 * Logger terstruktur (JSON di production, pretty-print di development).
 *
 * Kategori log yang WAJIB dipakai sesuai desain (lihat docs/01-DESIGN-DOCUMENT.md §11):
 *   - error      -> logger.error(message, { category: 'error', ...meta })
 *   - booking    -> logger.info(message, { category: 'booking', ...meta })
 *   - payment    -> logger.info(message, { category: 'payment', ...meta })
 *   - reminder   -> logger.info(message, { category: 'reminder', ...meta })
 *   - broadcast  -> logger.info(message, { category: 'broadcast', ...meta })
 *   - admin_login -> logger.info(message, { category: 'admin_login', ...meta })
 *
 * Menambahkan `category` pada meta memudahkan filtering log nantinya
 * (misal saat dikirim ke log aggregator) tanpa perlu logger terpisah per modul.
 */
const isProduction = env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: 'kania-happy-server' },
  format: isProduction
    ? winston.format.combine(winston.format.timestamp(), winston.format.json())
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, category, ...meta }) => {
          const cat = category ? `[${category}]` : '';
          const rest = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `${timestamp} ${level} ${cat} ${message} ${rest}`;
        }),
      ),
  transports: [new winston.transports.Console()],
});

/**
 * Helper kecil untuk memastikan setiap log domain-specific selalu
 * menyertakan `category` yang konsisten, tanpa harus mengetik manual
 * setiap kali (DRY).
 */
export function logCategory(
  category: 'error' | 'booking' | 'payment' | 'reminder' | 'broadcast' | 'admin_login',
  message: string,
  meta?: Record<string, unknown>,
): void {
  const level = category === 'error' ? 'error' : 'info';
  logger.log(level, message, { category, ...meta });
}
