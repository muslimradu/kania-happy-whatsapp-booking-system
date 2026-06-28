import express, { type Express } from 'express';
import { env } from '@shared/config/env';
import { logger } from '@infrastructure/logger/Logger';
import { requestLogger } from '@presentation/http/middlewares/requestLogger';
import { notFoundHandler, globalErrorHandler } from '@presentation/http/middlewares/errorHandler';
import { container, DI_TOKENS } from '@shared/di/container';

// ── Infrastructure ────────────────────────────────────────────────────────────
import { BaileysClient } from '@infrastructure/whatsapp/BaileysClient';
import { GoogleSheetsClient } from '@infrastructure/google-sheets/GoogleSheetsClient';
import { SheetCache } from '@infrastructure/google-sheets/SheetCache';

// ── Repositories ──────────────────────────────────────────────────────────────
import { GoogleSheetsServiceRepository } from '@infrastructure/repositories/GoogleSheetsServiceRepository';
import { GoogleSheetsScheduleRepository } from '@infrastructure/repositories/GoogleSheetsScheduleRepository';
import { GoogleSheetsBookingRepository } from '@infrastructure/repositories/GoogleSheetsBookingRepository';
import { GoogleSheetsPaymentRepository } from '@infrastructure/repositories/GoogleSheetsPaymentRepository';
import { GoogleSheetsCustomerRepository } from '@infrastructure/repositories/GoogleSheetsCustomerRepository';
import { GoogleSheetsFaqRepository } from '@infrastructure/repositories/GoogleSheetsFaqRepository';
import {
  GoogleSheetsSettingsRepository,
  GoogleSheetsAdminLogRepository,
  GoogleSheetsBroadcastRepository,
  GoogleSheetsTakeoverRepository,
} from '@infrastructure/repositories/GoogleSheetsOtherRepositories';
import { GoogleSheetsPaymentMethodRepository } from '@infrastructure/repositories/GoogleSheetsPaymentMethodRepository';

import type { ApiSuccessResponse } from '@shared/types';

// ── Application Services (M2) ──────────────────────────────────────────────
import { FaqLookupService } from '@application/faq/FaqLookupService';
import { GetAvailableScheduleService } from '@application/schedule/GetAvailableScheduleService';
import { MessageRouter } from '@application/bot/MessageRouter';
import { WhatsAppHandler } from '@presentation/whatsapp/WhatsAppHandler';

function registerDependencies(): void {
  // ── Infrastructure ─────────────────────────────────────────────────────────
  container.register(DI_TOKENS.BaileysClient,      () => new BaileysClient());
  container.register(DI_TOKENS.GoogleSheetsClient,  () => new GoogleSheetsClient());
  container.register(DI_TOKENS.SheetCache,          () => new SheetCache());

  // ── Repositories (semua butuh GoogleSheetsClient + SheetCache) ────────────
  const getClient = () => container.resolve<GoogleSheetsClient>(DI_TOKENS.GoogleSheetsClient);
  const getCache  = () => container.resolve<SheetCache>(DI_TOKENS.SheetCache);

  container.register(DI_TOKENS.ServiceRepository,
    () => new GoogleSheetsServiceRepository(getClient(), getCache()));
  container.register(DI_TOKENS.ScheduleRepository,
    () => new GoogleSheetsScheduleRepository(getClient(), getCache()));
  container.register(DI_TOKENS.BookingRepository,
    () => new GoogleSheetsBookingRepository(getClient(), getCache()));
  container.register(DI_TOKENS.PaymentRepository,
    () => new GoogleSheetsPaymentRepository(getClient(), getCache()));
  container.register(DI_TOKENS.CustomerRepository,
    () => new GoogleSheetsCustomerRepository(getClient(), getCache()));
  container.register(DI_TOKENS.FaqRepository,
    () => new GoogleSheetsFaqRepository(getClient(), getCache()));
  container.register(DI_TOKENS.SettingsRepository,
    () => new GoogleSheetsSettingsRepository(getClient(), getCache()));
  container.register(DI_TOKENS.AdminLogRepository,
    () => new GoogleSheetsAdminLogRepository(getClient(), getCache()));
  container.register(DI_TOKENS.BroadcastRepository,
    () => new GoogleSheetsBroadcastRepository(getClient(), getCache()));
  container.register(DI_TOKENS.TakeoverRepository,
    () => new GoogleSheetsTakeoverRepository(getClient(), getCache()));
  container.register(DI_TOKENS.PaymentMethodRepository,
    () => new GoogleSheetsPaymentMethodRepository(getClient(), getCache()));

  // ── Application Services (M2) ──────────────────────────────────────────
  container.register(DI_TOKENS.FaqLookupService, () =>
    new FaqLookupService(
      container.resolve(DI_TOKENS.FaqRepository),
    ));

  container.register(DI_TOKENS.GetAvailableScheduleService, () =>
    new GetAvailableScheduleService(
      container.resolve(DI_TOKENS.ScheduleRepository),
      container.resolve(DI_TOKENS.ServiceRepository),
      container.resolve(DI_TOKENS.SettingsRepository),
    ));

  container.register(DI_TOKENS.MessageRouter, () =>
    new MessageRouter(
      container.resolve(DI_TOKENS.ServiceRepository),
      container.resolve(DI_TOKENS.SettingsRepository),
      container.resolve(DI_TOKENS.FaqLookupService),
      container.resolve(DI_TOKENS.GetAvailableScheduleService),
    ));

  container.register(DI_TOKENS.WhatsAppHandler, () =>
    new WhatsAppHandler(
      container.resolve(DI_TOKENS.BaileysClient),
      container.resolve(DI_TOKENS.TakeoverRepository),
      container.resolve(DI_TOKENS.CustomerRepository),
      container.resolve(DI_TOKENS.MessageRouter),
    ));
}

function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: '5mb' }));
  app.use(requestLogger);

  app.get('/health', (_req, res) => {
    const baileysClient = container.resolve<BaileysClient>(DI_TOKENS.BaileysClient);
    const response: ApiSuccessResponse<{ status: string; timezone: string; waConnected: boolean }> =
      {
        success: true,
        data: {
          status:      'ok',
          timezone:    env.TIMEZONE,
          waConnected: baileysClient.connected,
        },
      };
    res.status(200).json(response);
  });

  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}

async function bootstrap(): Promise<void> {
  registerDependencies();

  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info(`Kania Happy server berjalan di port ${env.PORT} (${env.NODE_ENV})`);
  });

  const baileysClient = container.resolve<BaileysClient>(DI_TOKENS.BaileysClient);

  baileysClient.onQr(() => {
    logger.info('WhatsApp QR tersedia — silakan scan dengan aplikasi WhatsApp.');
  });
  baileysClient.onReady(() => {
    logger.info('WhatsApp terhubung dan siap menerima pesan ✓');
  });

  // Daftarkan WhatsApp message handler (M2)
  const waHandler = container.resolve<WhatsAppHandler>(DI_TOKENS.WhatsAppHandler);
  waHandler.register();

  try {
    await baileysClient.connect();
  } catch (err) {
    logger.error('Gagal memulai koneksi Baileys', { error: err });
  }
}

bootstrap();
