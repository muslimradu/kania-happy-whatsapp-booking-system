import express, { type Express } from 'express';
import cors from 'cors';
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

// ── Booking Flow (M3) ───────────────────────────────────────────────────────
import { ConversationStateStore } from '@infrastructure/state/ConversationStateStore';
import { InvoiceGenerator } from '@application/booking/InvoiceGenerator';
import { BookingService } from '@application/booking/BookingService';
import { BookingFlowHandler } from '@application/booking/BookingFlowHandler';

// ── Reminder Scheduler (M4) ─────────────────────────────────────────────────
import { ReminderService } from '@application/reminder/ReminderService';
import { ReminderScheduler } from '@application/reminder/ReminderScheduler';

// ── Payment Verification (M5) ────────────────────────────────────────────────
import { PaymentVerificationService } from '@application/payment/PaymentVerificationService';
import { AuthController } from '@presentation/http/controllers/AuthController';
import { PaymentController } from '@presentation/http/controllers/PaymentController';
import { createApiRouter } from '@presentation/http/routes/apiRouter';

// ── Human Takeover (M6) ──────────────────────────────────────────────────────
import { TakeoverService } from '@application/takeover/TakeoverService';
import { TakeoverCleanupScheduler } from '@application/takeover/TakeoverCleanupScheduler';
import { TakeoverController } from '@presentation/http/controllers/TakeoverController';

// ── AI Fallback (M7) ──────────────────────────────────────────────────────────
import { OpenAiClient } from '@infrastructure/openai/OpenAiClient';
import { AiFallbackService } from '@application/ai/AiFallbackService';

function registerDependencies(): void {
  // ── Infrastructure ─────────────────────────────────────────────────────────
  container.register(DI_TOKENS.BaileysClient,      () => new BaileysClient());
  container.register(DI_TOKENS.GoogleSheetsClient,  () => new GoogleSheetsClient());
  container.register(DI_TOKENS.SheetCache,          () => new SheetCache());
  container.register(DI_TOKENS.OpenAiClient,        () => new OpenAiClient());

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

  // ── M7: AI Fallback ──────────────────────────────────────────────────────────
  container.register(DI_TOKENS.AiFallbackService, () =>
    new AiFallbackService(
      container.resolve(DI_TOKENS.FaqRepository),
      container.resolve(DI_TOKENS.SettingsRepository),
      container.resolve(DI_TOKENS.OpenAiClient),
    ));

  // ── M3: Booking Flow ──────────────────────────────────────────────────────
  container.register(DI_TOKENS.ConversationStateStore,
    () => new ConversationStateStore());

  container.register(DI_TOKENS.InvoiceGenerator,
    () => new InvoiceGenerator());

  container.register(DI_TOKENS.BookingService, () =>
    new BookingService(
      container.resolve(DI_TOKENS.BookingRepository),
      container.resolve(DI_TOKENS.PaymentRepository),
      container.resolve(DI_TOKENS.CustomerRepository),
      container.resolve(DI_TOKENS.PaymentMethodRepository),
      container.resolve(DI_TOKENS.GetAvailableScheduleService),
      container.resolve(DI_TOKENS.InvoiceGenerator),
    ));

  container.register(DI_TOKENS.BookingFlowHandler, () =>
    new BookingFlowHandler(
      container.resolve(DI_TOKENS.ConversationStateStore),
      container.resolve(DI_TOKENS.BookingService),
      container.resolve(DI_TOKENS.CustomerRepository),
    ));

  container.register(DI_TOKENS.MessageRouter, () =>
    new MessageRouter(
      container.resolve(DI_TOKENS.ServiceRepository),
      container.resolve(DI_TOKENS.SettingsRepository),
      container.resolve(DI_TOKENS.FaqLookupService),
      container.resolve(DI_TOKENS.GetAvailableScheduleService),
      container.resolve(DI_TOKENS.BookingFlowHandler),
      container.resolve(DI_TOKENS.ConversationStateStore),
      container.resolve(DI_TOKENS.AiFallbackService),
    ));

  // ── M4: Reminder ──────────────────────────────────────────────────────────
  container.register(DI_TOKENS.ReminderService, () =>
    new ReminderService(
      container.resolve(DI_TOKENS.BookingRepository),
      container.resolve(DI_TOKENS.SettingsRepository),
      container.resolve(DI_TOKENS.BaileysClient),
    ));

  container.register(DI_TOKENS.ReminderScheduler, () =>
    new ReminderScheduler(
      container.resolve(DI_TOKENS.ReminderService),
      container.resolve(DI_TOKENS.SettingsRepository),
    ));

  // ── M5: Payment Verification ──────────────────────────────────────────────
  container.register(DI_TOKENS.PaymentVerificationService, () =>
    new PaymentVerificationService(
      container.resolve(DI_TOKENS.PaymentRepository),
      container.resolve(DI_TOKENS.BookingRepository),
      container.resolve(DI_TOKENS.AdminLogRepository),
      container.resolve(DI_TOKENS.BaileysClient),
    ));

  // ── M6: Human Takeover ───────────────────────────────────────────────────────
  container.register(DI_TOKENS.TakeoverService, () =>
    new TakeoverService(
      container.resolve(DI_TOKENS.TakeoverRepository),
      container.resolve(DI_TOKENS.SettingsRepository),
      container.resolve(DI_TOKENS.AdminLogRepository),
    ));

  container.register(DI_TOKENS.TakeoverCleanupScheduler, () =>
    new TakeoverCleanupScheduler(
      container.resolve(DI_TOKENS.TakeoverService),
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

  app.use(cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  }));
  app.use(express.json({ limit: '5mb' }));
  app.use(requestLogger);

  // ── REST API (M5/M6) ──────────────────────────────────────────────────────────
  const authController    = new AuthController();
  const paymentController = new PaymentController(
    container.resolve<PaymentVerificationService>(DI_TOKENS.PaymentVerificationService),
  );
  const takeoverController = new TakeoverController(
    container.resolve<TakeoverService>(DI_TOKENS.TakeoverService),
  );
  app.use('/api', createApiRouter(authController, paymentController, takeoverController));

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

  // Mulai reminder scheduler (M4)
  const reminderScheduler = container.resolve<ReminderScheduler>(DI_TOKENS.ReminderScheduler);
  await reminderScheduler.start();

  // Mulai takeover cleanup scheduler (M6)
  const takeoverCleanupScheduler = container.resolve<TakeoverCleanupScheduler>(
    DI_TOKENS.TakeoverCleanupScheduler,
  );
  takeoverCleanupScheduler.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM diterima — menghentikan server...');
    reminderScheduler.stop();
    takeoverCleanupScheduler.stop();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT diterima — menghentikan server...');
    reminderScheduler.stop();
    takeoverCleanupScheduler.stop();
    process.exit(0);
  });

  try {
    await baileysClient.connect();
  } catch (err) {
    logger.error('Gagal memulai koneksi Baileys', { error: err });
  }
}

bootstrap();
