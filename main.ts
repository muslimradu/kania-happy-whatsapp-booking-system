import express, { type Express } from 'express';
import { env } from '@shared/config/env';
import { logger } from '@infrastructure/logger/Logger';
import { requestLogger } from '@presentation/http/middlewares/requestLogger';
import { notFoundHandler, globalErrorHandler } from '@presentation/http/middlewares/errorHandler';
import type { ApiSuccessResponse } from '@shared/types';

function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: '5mb' }));
  app.use(requestLogger);

  // Health check sederhana - dipakai untuk memverifikasi server hidup
  // (juga berguna untuk monitoring uptime / load balancer di masa depan).
  app.get('/health', (_req, res) => {
    const response: ApiSuccessResponse<{ status: string; timezone: string }> = {
      success: true,
      data: { status: 'ok', timezone: env.TIMEZONE },
    };
    res.status(200).json(response);
  });

  // TODO (milestone berikutnya): mount router domain di sini, contoh:
  //   app.use('/api/v1/auth', authRouter);
  //   app.use('/api/v1/services', serviceRouter);
  //   app.use('/api/v1/webhook', webhookRouter);
  // Lihat docs/01-DESIGN-DOCUMENT.md §7 untuk daftar lengkap endpoint.

  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}

function bootstrap(): void {
  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info(`Kania Happy server berjalan di port ${env.PORT} (${env.NODE_ENV})`);
  });
}

bootstrap();
