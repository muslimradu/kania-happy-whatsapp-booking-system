import type { NextFunction, Request, Response } from 'express';
import { AppError } from '@shared/types';
import { logCategory } from '@infrastructure/logger/Logger';
import type { ApiErrorResponse } from '@shared/types';

/**
 * Global Error Handler — satu-satunya tempat yang mengubah Error menjadi
 * HTTP response. Controller TIDAK BOLEH melakukan try/catch manual untuk
 * membungkus response error; cukup `next(error)` atau biarkan async error
 * ditangkap oleh `asyncHandler` (lihat helper di bawah).
 *
 * Harus didaftarkan PALING TERAKHIR setelah semua route (lihat main.ts).
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (!err.isOperational || err.statusCode >= 500) {
      logCategory('error', err.message, { path: req.path, code: err.code });
    }

    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Error tak terduga (bug, library error, dll) -> jangan bocorkan detail
  // internal ke client, tapi catat penuh ke log untuk debugging.
  logCategory('error', err.message, {
    path: req.path,
    stack: err.stack,
  });

  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan pada server. Tim kami sedang menanganinya.',
    },
  };
  res.status(500).json(response);
}

/**
 * Wrapper untuk async controller agar error yang di-throw/rejected di dalam
 * async function otomatis diteruskan ke globalErrorHandler, tanpa perlu
 * try/catch berulang di setiap controller (DRY).
 *
 * Contoh pemakaian:
 *   router.get('/bookings', asyncHandler(bookingController.list));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/**
 * 404 handler untuk route yang tidak terdaftar sama sekali.
 * Didaftarkan setelah semua route, sebelum globalErrorHandler.
 */
export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} tidak ditemukan`,
    },
  };
  res.status(404).json(response);
}
