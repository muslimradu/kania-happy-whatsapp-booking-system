import type { IScheduleRepository, IServiceRepository, ISettingsRepository } from '@domain/repositories';
import type { ScheduleOccurrence } from '@domain/entities/Schedule';
import { SETTING_KEYS } from '@domain/entities';
import { todayJakarta, nextOccurrence, addDays, compareDates } from '@shared/utils/dateHelper';
import { logger } from '@infrastructure/logger/Logger';

/**
 * GetAvailableScheduleService
 *
 * Mengkonversi template jadwal mingguan (Schedule entity) menjadi daftar
 * occurrence (tanggal aktual) untuk ditampilkan ke customer.
 *
 * Sesuai desain §5.2.1:
 *  - Tidak ada batasan kuota.
 *  - Window: hari ini s.d. N hari ke depan (default dari Settings).
 */
export class GetAvailableScheduleService {
  constructor(
    private readonly scheduleRepo: IScheduleRepository,
    private readonly serviceRepo: IServiceRepository,
    private readonly settingsRepo: ISettingsRepository,
  ) {}

  /**
   * Dapatkan semua occurrence jadwal aktif dalam window tertentu.
   * @param fromDate  YYYY-MM-DD, default hari ini
   * @param serviceId Filter per layanan (opsional)
   */
  async getOccurrences(
    fromDate?: string,
    serviceId?: string,
  ): Promise<ScheduleOccurrence[]> {
    const from = fromDate ?? todayJakarta();

    // Ambil jumlah hari lookahead dari Settings
    const lookaheadStr = await this.settingsRepo.getValue(
      SETTING_KEYS.SCHEDULE_LOOKAHEAD_DAYS,
      '7',
    );
    const lookahead = Math.max(1, parseInt(lookaheadStr, 10) || 7);
    const toDate = addDays(from, lookahead - 1);

    // Ambil data dari repository
    const [schedules, services] = await Promise.all([
      serviceId
        ? this.scheduleRepo.findActiveByServiceId(serviceId)
        : this.scheduleRepo.findActive(),
      this.serviceRepo.findActive(),
    ]);

    const serviceMap = new Map(services.map((s) => [s.serviceId, s]));
    const occurrences: ScheduleOccurrence[] = [];

    for (const schedule of schedules) {
      const service = serviceMap.get(schedule.serviceId);
      if (!service) {
        logger.warn('GetAvailableScheduleService: serviceId tidak ditemukan', {
          serviceId: schedule.serviceId,
          scheduleId: schedule.scheduleId,
        });
        continue;
      }

      // Hitung semua occurrence dalam window
      let current = nextOccurrence(from, schedule.dayOfWeek);

      while (compareDates(current, toDate) <= 0) {
        if (compareDates(current, from) >= 0) {
          occurrences.push({
            schedule,
            date: current,
            serviceName: service.name,
            servicePrice: service.price,
          });
        }
        // Maju 7 hari untuk occurrence berikutnya
        current = addDays(current, 7);
      }
    }

    // Urutkan: tanggal terdekat dulu, lalu jam mulai
    occurrences.sort((a, b) => {
      const dateCmp = compareDates(a.date, b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.schedule.timeStart.localeCompare(b.schedule.timeStart);
    });

    return occurrences;
  }
}
