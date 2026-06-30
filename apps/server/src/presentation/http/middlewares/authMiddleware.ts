/**
 * Auth Middleware — M5
 *
 * Melindungi endpoint admin dengan JWT Bearer token.
 *
 * Flow:
 *  1. Client login → POST /api/auth/login → dapat JWT.
 *  2. Setiap request ke endpoint admin → header: Authorization: Bearer <jwt>.
 *  3. requireAuth middleware verifikasi token → inject req.admin jika valid.
 */

import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@shared/config/env';
import { AppError } from '@shared/types';

export interface AdminJwtPayload {
  username: string;
  iat?: number;
  exp?: number;
}

// Extend Express Request untuk menyimpan data admin terautentikasi
declare module 'express-serve-static-core' {
  interface Request {
    admin?: AdminJwtPayload;
  }
}

/**
 * Middleware: wajib sudah login (bearer JWT valid).
 * Inject `req.admin` dengan payload JWT jika valid.
 * Lempar 401 jika token tidak ada atau tidak valid.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Token autentikasi diperlukan'));
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AdminJwtPayload;
    req.admin = payload;
    next();
  } catch {
    next(AppError.unauthorized('Token tidak valid atau sudah kedaluwarsa'));
  }
}

/**
 * Buat JWT untuk admin yang berhasil login.
 */
export function signAdminToken(username: string): string {
  return jwt.sign({ username }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}
