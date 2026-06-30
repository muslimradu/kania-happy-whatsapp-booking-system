/**
 * AuthController — M5
 *
 * POST /api/auth/login
 * Validasi username + password admin, kembalikan JWT jika valid.
 */

import type { Request, Response, NextFunction } from 'express';
import { env } from '@shared/config/env';
import { AppError, type ApiSuccessResponse } from '@shared/types';
import { signAdminToken } from '@presentation/http/middlewares/authMiddleware';

export class AuthController {
  /**
   * POST /api/auth/login
   * Body: { username: string, password: string }
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password } = req.body as { username?: string; password?: string };

      if (!username || !password) {
        throw AppError.validation('username dan password wajib diisi');
      }

      if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
        throw AppError.unauthorized('Username atau password salah');
      }

      const token = signAdminToken(username);

      const response: ApiSuccessResponse<{ token: string; username: string }> = {
        success: true,
        data: { token, username },
        message: 'Login berhasil',
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/auth/me
   * Kembalikan info admin dari token (butuh requireAuth).
   */
  async me(req: Request, res: Response): Promise<void> {
    const response: ApiSuccessResponse<{ username: string }> = {
      success: true,
      data: { username: req.admin!.username },
    };
    res.status(200).json(response);
  }
}
