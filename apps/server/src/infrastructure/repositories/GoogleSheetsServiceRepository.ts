import { BaseSheetRepository } from '../google-sheets/BaseSheetRepository';
import type { GoogleSheetsClient } from '../google-sheets/GoogleSheetsClient';
import type { SheetCache } from '../google-sheets/SheetCache';
import type { IServiceRepository } from '@domain/repositories';
import type { Service } from '@domain/entities/Service';

/**
 * Kolom sheet `Services` (0-based index):
 * A=0 service_id | B=1 name | C=2 price | D=3 is_active
 */
const COL = { SERVICE_ID: 0, NAME: 1, PRICE: 2, IS_ACTIVE: 3 } as const;
const SHEET = 'Services';

export class GoogleSheetsServiceRepository
  extends BaseSheetRepository
  implements IServiceRepository
{
  protected readonly sheetName = SHEET;

  constructor(client: GoogleSheetsClient, cache: SheetCache) {
    super(client, cache);
  }

  async findAll(): Promise<Service[]> {
    const rows = await this.readRows();
    return rows.map((r) => this.toEntity(r));
  }

  async findById(serviceId: string): Promise<Service | null> {
    const rows = await this.readRows();
    const row = rows.find((r) => r[COL.SERVICE_ID] === serviceId);
    return row ? this.toEntity(row) : null;
  }

  async findActive(): Promise<Service[]> {
    const all = await this.findAll();
    return all.filter((s) => s.isActive);
  }

  async save(service: Service): Promise<void> {
    await this.appendRow(this.toRow(service));
  }

  async update(serviceId: string, data: Partial<Service>): Promise<void> {
    const rowIndex = await this.findRowIndex(COL.SERVICE_ID, serviceId);
    if (rowIndex === -1) return;

    const existing = await this.findById(serviceId);
    if (!existing) return;

    const updated: Service = { ...existing, ...data };
    await this.updateRow(rowIndex, this.toRow(updated));
  }

  // ── Mapper ────────────────────────────────────────────────────────────────

  private toEntity(row: string[]): Service {
    return {
      serviceId: this.safeCell(row, COL.SERVICE_ID),
      name:      this.safeCell(row, COL.NAME),
      price:     this.safeNumber(row, COL.PRICE),
      isActive:  this.safeBool(row, COL.IS_ACTIVE),
    };
  }

  private toRow(service: Service): string[] {
    return [
      service.serviceId,
      service.name,
      String(service.price),
      String(service.isActive),
    ];
  }
}
