/**
 * TakeoverController — M6
 *
 * Endpoint REST untuk admin mengelola human takeover:
 *
 *  POST   /api/takeover/:phone/start    — mulai takeover untuk satu nomor
 *  POST   /api/takeover/:phone/release  — lepas takeover untuk satu nomor
 *  GET    /api/takeover/:phone          — cek status takeover satu nomor
 *
 * Semua butuh JWT (requireAuth).
 */

import type { Request, Response, NextFunction } from 'express';
import type { TakeoverService } from '@application/takeover/TakeoverService';
import type { ApiSuccessResponse } from '@shared/types';

export class TakeoverController {
  constructor(
    private readonly takeoverService: TakeoverService,
  ) {}

  /** POST /api/takeover/:phone/start */
  async start(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone } = req.params as { phone: string };
      const { timeoutMinutes } = req.body as { timeoutMinutes?: number };
      const adminUsername = req.admin!.username;

      const state = await this.takeoverService.startTakeover(phone, adminUsername, timeoutMinutes);

      const response: ApiSuccessResponse<typeof state> = {
        success: true,
        data: state,
        message: `Takeover untuk ${phone} dimulai oleh ${adminUsername}`,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/takeover/:phone/release */
  async release(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone } = req.params as { phone: string };
      const adminUsername = req.admin!.username;

      await this.takeoverService.releaseTakeover(phone, adminUsername);

      const response: ApiSuccessResponse<{ phone: string }> = {
        success: true,
        data: { phone },
        message: `Takeover untuk ${phone} dilepas`,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/takeover/:phone */
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone } = req.params as { phone: string };
      const state = await this.takeoverService.getStatus(phone);

      const response: ApiSuccessResponse<typeof state> = {
        success: true,
        data: state,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}
