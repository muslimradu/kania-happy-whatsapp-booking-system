import type { NextFunction, Request, Response } from 'express';
import { logger } from '@infrastructure/logger/Logger';

/**
 * Mencatat setiap request masuk: method, path, status code, dan durasi.
 * Berguna untuk observability dasar tanpa perlu APM eksternal di MVP ini.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode}`, {
      category: 'http',
      durationMs,
    });
  });

  next();
}
