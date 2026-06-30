/**
 * API Router — M5/M6
 *
 * Mendaftarkan seluruh endpoint REST admin:
 *
 *  Auth:
 *    POST   /api/auth/login
 *    GET    /api/auth/me       (butuh token)
 *
 *  Payments:
 *    GET    /api/payments              (butuh token)
 *    GET    /api/payments/pending      (butuh token)
 *    POST   /api/payments/:inv/approve (butuh token)
 *    POST   /api/payments/:inv/reject  (butuh token)
 *
 *  Takeover:
 *    GET    /api/takeover/:phone          (butuh token)
 *    POST   /api/takeover/:phone/start    (butuh token)
 *    POST   /api/takeover/:phone/release  (butuh token)
 */

import { Router } from 'express';
import type { AuthController } from '@presentation/http/controllers/AuthController';
import type { PaymentController } from '@presentation/http/controllers/PaymentController';
import type { TakeoverController } from '@presentation/http/controllers/TakeoverController';
import { requireAuth } from '@presentation/http/middlewares/authMiddleware';

export function createApiRouter(
  authController: AuthController,
  paymentController: PaymentController,
  takeoverController: TakeoverController,
): Router {
  const router = Router();

  // ── Auth ────────────────────────────────────────────────────────────────────
  router.post('/auth/login', (req, res, next) => authController.login(req, res, next));
  router.get('/auth/me',     requireAuth, (req, res) => authController.me(req, res));

  // ── Payments ────────────────────────────────────────────────────────────────
  router.get(
    '/payments',
    requireAuth,
    (req, res, next) => paymentController.listAll(req, res, next),
  );
  router.get(
    '/payments/pending',
    requireAuth,
    (req, res, next) => paymentController.listPending(req, res, next),
  );
  router.post(
    '/payments/:invoiceNumber/approve',
    requireAuth,
    (req, res, next) => paymentController.approve(req, res, next),
  );
  router.post(
    '/payments/:invoiceNumber/reject',
    requireAuth,
    (req, res, next) => paymentController.reject(req, res, next),
  );

  // ── Takeover ────────────────────────────────────────────────────────────────
  router.get(
    '/takeover/:phone',
    requireAuth,
    (req, res, next) => takeoverController.getStatus(req, res, next),
  );
  router.post(
    '/takeover/:phone/start',
    requireAuth,
    (req, res, next) => takeoverController.start(req, res, next),
  );
  router.post(
    '/takeover/:phone/release',
    requireAuth,
    (req, res, next) => takeoverController.release(req, res, next),
  );

  return router;
}
