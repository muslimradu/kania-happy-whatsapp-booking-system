import express, { type Express } from 'express';
import { env } from '@shared/config/env';
import { logger } from '@infrastructure/logger/Logger';
import { requestLogger } from '@presentation/http/middlewares/requestLogger';
import { notFoundHandler, globalErrorHandler } from '@presentation/http/middlewares/errorHandler';
import { container, DI_TOKENS } from '@shared/di/container';
import { BaileysClient } from '@infrastructure/whatsapp/BaileysClient';
import type { ApiSuccessResponse } from '@shared/types';

function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: '5mb' }));
  app.use(requestLogger);

  // Health check sederhana - dipakai untuk memverifikasi server hidup
  // (juga berguna untuk monitoring uptime / load balancer di masa depan).
  app.get('/health', (_req, res) => {
    const baileysClient = container.resolve<BaileysClient>(DI_TOKENS.BaileysClient);
    const response: ApiSuccessResponse<{ status: string; timezone: string; waConnected: boolean }> =
      {
        success: true,
        data: {
          status: 'ok',
          timezone: env.TIMEZONE,
          waConnected: baileysClient.connected,
        },
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

function registerDependencies(): void {
  // Register BaileysClient sebagai singleton di DI container
  container.register(DI_TOKENS.BaileysClient, () => new BaileysClient());
}

async function bootstrap(): Promise<void> {
  registerDependencies();

  const app = createApp();

  // Mulai HTTP server terlebih dahulu agar health check bisa direspons
  // saat WhatsApp masih dalam proses koneksi / menunggu scan QR.
  app.listen(env.PORT, () => {
    logger.info(`Kania Happy server berjalan di port ${env.PORT} (${env.NODE_ENV})`);
  });

  // Inisialisasi koneksi WhatsApp via Baileys setelah server ready
  const baileysClient = container.resolve<BaileysClient>(DI_TOKENS.BaileysClient);

  baileysClient.onQr((qr) => {
    // QR sudah dicetak di terminal oleh Baileys (printQRInTerminal: true).
    // Di milestone berikutnya, QR akan di-push ke Dashboard via SSE/WebSocket.
    logger.info('WhatsApp QR tersedia — silakan scan dengan aplikasi WhatsApp.');
    void qr; // placeholder agar tidak ada unused variable
  });

  baileysClient.onReady(() => {
    logger.info('WhatsApp terhubung dan siap menerima pesan ✓');
  });

  try {
    await baileysClient.connect();
  } catch (err) {
    logger.error('Gagal memulai koneksi Baileys', { error: err });
    // Tidak exit process — server HTTP tetap jalan agar bisa di-debug via API
  }
}

bootstrap();
