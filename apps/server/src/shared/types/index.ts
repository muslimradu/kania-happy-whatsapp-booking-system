/**
 * Daftar kode error yang dikenal sistem.
 * Dipakai konsisten di seluruh layer agar response error API selalu predictable
 * (lihat docs/API.md - format error response).
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INTERNAL_ERROR';

export interface ErrorDetail {
  field?: string;
  issue: string;
}

/**
 * Base class untuk seluruh error yang sengaja dilempar oleh business logic
 * (Domain/Application layer). Controller & Global Error Handler akan
 * mengenali instance ini untuk menentukan HTTP status & format response.
 *
 * Error lain yang TIDAK extends AppError (misal error tak terduga dari
 * library pihak ketiga) akan dianggap sebagai 500 INTERNAL_ERROR oleh
 * Global Error Handler.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: ErrorDetail[];
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static validation(message: string, details?: ErrorDetail[]): AppError {
    return new AppError('VALIDATION_ERROR', message, 400, details);
  }

  static notFound(message: string): AppError {
    return new AppError('NOT_FOUND', message, 404);
  }

  static unauthorized(message = 'Tidak terautentikasi'): AppError {
    return new AppError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message = 'Tidak memiliki akses'): AppError {
    return new AppError('FORBIDDEN', message, 403);
  }

  static conflict(message: string): AppError {
    return new AppError('CONFLICT', message, 409);
  }

  static externalService(message: string): AppError {
    return new AppError('EXTERNAL_SERVICE_ERROR', message, 502);
  }
}

/**
 * Bentuk standar response sukses untuk seluruh REST API.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/**
 * Bentuk standar response error untuk seluruh REST API.
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
}
