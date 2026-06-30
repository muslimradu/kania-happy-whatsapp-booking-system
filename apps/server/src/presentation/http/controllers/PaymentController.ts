/**
 * PaymentController — M5
 *
 * Endpoint REST untuk manajemen pembayaran oleh admin:
 *
 *  GET    /api/payments          — daftar semua pembayaran
 *  GET    /api/payments/pending  — daftar pembayaran menunggu verifikasi
 *  POST   /api/payments/:invoiceNumber/approve — setujui pembayaran
 *  POST   /api/payments/:invoiceNumber/reject  — tolak pembayaran
 *
 * Semua endpoint butuh JWT (requireAuth).
 */

import type { Request, Response, NextFunction } from 'express';
import type { PaymentVerificationService } from '@application/payment/PaymentVerificationService';
import type { ApiSuccessResponse } from '@shared/types';

export class PaymentController {
  constructor(
    private readonly paymentVerificationService: PaymentVerificationService,
  ) {}

  /** GET /api/payments */
  async listAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payments = await this.paymentVerificationService.listAll();
      const response: ApiSuccessResponse<typeof payments> = {
        success: true,
        data: payments,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/payments/pending */
  async listPending(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payments = await this.paymentVerificationService.listPending();
      const response: ApiSuccessResponse<typeof payments> = {
        success: true,
        data: payments,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/payments/:invoiceNumber/approve */
  async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { invoiceNumber } = req.params as { invoiceNumber: string };
      const adminUsername = req.admin!.username;

      await this.paymentVerificationService.approve(invoiceNumber, adminUsername);

      const response: ApiSuccessResponse<{ invoiceNumber: string }> = {
        success: true,
        data: { invoiceNumber },
        message: `Pembayaran ${invoiceNumber} berhasil disetujui`,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/payments/:invoiceNumber/reject */
  async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { invoiceNumber } = req.params as { invoiceNumber: string };
      const { reason } = req.body as { reason?: string };
      const adminUsername = req.admin!.username;

      await this.paymentVerificationService.reject(invoiceNumber, adminUsername, reason);

      const response: ApiSuccessResponse<{ invoiceNumber: string }> = {
        success: true,
        data: { invoiceNumber },
        message: `Pembayaran ${invoiceNumber} berhasil ditolak`,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
}
