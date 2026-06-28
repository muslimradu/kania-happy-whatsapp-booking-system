import { v4 as uuidv4 } from 'uuid';
import { BaseSheetRepository } from '../google-sheets/BaseSheetRepository';
import type { GoogleSheetsClient } from '../google-sheets/GoogleSheetsClient';
import type { SheetCache } from '../google-sheets/SheetCache';
import type {
  ISettingsRepository,
  IAdminLogRepository,
  IBroadcastRepository,
  ITakeoverRepository,
} from '@domain/repositories';
import type { Setting, AdminLog, AdminAction, Broadcast, TakeoverState } from '@domain/entities';

// ── Settings ──────────────────────────────────────────────────────────────────
// Kolom: A=0 key | B=1 value | C=2 description

export class GoogleSheetsSettingsRepository
  extends BaseSheetRepository
  implements ISettingsRepository
{
  protected readonly sheetName = 'Settings';

  constructor(client: GoogleSheetsClient, cache: SheetCache) {
    super(client, cache);
  }

  async findAll(): Promise<Setting[]> {
    const rows = await this.readRows();
    return rows.map((r) => ({
      key:         this.safeCell(r, 0),
      value:       this.safeCell(r, 1),
      description: this.safeCell(r, 2),
    }));
  }

  async findByKey(key: string): Promise<Setting | null> {
    const all = await this.findAll();
    return all.find((s) => s.key === key) ?? null;
  }

  async getValue(key: string, defaultValue = ''): Promise<string> {
    const setting = await this.findByKey(key);
    return setting?.value ?? defaultValue;
  }

  async set(key: string, value: string): Promise<void> {
    const rowIndex = await this.findRowIndex(0, key);
    if (rowIndex !== -1) {
      await this.updateCell(rowIndex, 1, value);
    } else {
      await this.appendRow([key, value, '']);
    }
  }
}

// ── Admin Log ─────────────────────────────────────────────────────────────────
// Kolom: A=0 log_id | B=1 admin_username | C=2 action | D=3 target_id | E=4 description | F=5 created_at

export class GoogleSheetsAdminLogRepository
  extends BaseSheetRepository
  implements IAdminLogRepository
{
  protected readonly sheetName = 'Admin Log';

  constructor(client: GoogleSheetsClient, cache: SheetCache) {
    super(client, cache);
  }

  async findAll(limit = 100): Promise<AdminLog[]> {
    const rows = await this.readRows();
    return rows
      .slice(-limit) // ambil N baris terakhir
      .reverse()
      .map((r) => ({
        logId:         this.safeCell(r, 0),
        adminUsername: this.safeCell(r, 1),
        action:        this.safeCell(r, 2) as AdminAction,
        targetId:      this.safeCell(r, 3),
        description:   this.safeCell(r, 4),
        createdAt:     this.safeCell(r, 5),
      }));
  }

  async log(entry: {
    adminUsername: string;
    action: AdminAction;
    targetId?: string;
    description: string;
  }): Promise<void> {
    await this.appendRow([
      `LOG-${uuidv4().slice(0, 8).toUpperCase()}`,
      entry.adminUsername,
      entry.action,
      entry.targetId ?? '',
      entry.description,
      new Date().toISOString(),
    ]);
  }
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
// Kolom: A=0 broadcast_id | B=1 message | C=2 target_segment | D=3 status
//         E=4 scheduled_at | F=5 sent_at | G=6 created_by

import type { BroadcastStatus, BroadcastTargetSegment } from '@domain/entities';

export class GoogleSheetsBroadcastRepository
  extends BaseSheetRepository
  implements IBroadcastRepository
{
  protected readonly sheetName = 'Broadcast';

  constructor(client: GoogleSheetsClient, cache: SheetCache) {
    super(client, cache);
  }

  async findAll(): Promise<Broadcast[]> {
    const rows = await this.readRows();
    return rows.map((r) => this.toEntity(r));
  }

  async findById(broadcastId: string): Promise<Broadcast | null> {
    const rows = await this.readRows();
    const row = rows.find((r) => r[0] === broadcastId);
    return row ? this.toEntity(row) : null;
  }

  async create(data: Omit<Broadcast, 'broadcastId'>): Promise<Broadcast> {
    const broadcast: Broadcast = {
      broadcastId: `BCT-${uuidv4().slice(0, 8).toUpperCase()}`,
      ...data,
    };
    await this.appendRow([
      broadcast.broadcastId,
      broadcast.message,
      broadcast.targetSegment,
      broadcast.status,
      broadcast.scheduledAt,
      broadcast.sentAt,
      broadcast.createdBy,
    ]);
    return broadcast;
  }

  async updateStatus(
    broadcastId: string,
    status: Broadcast['status'],
    sentAt?: string,
  ): Promise<void> {
    const rowIndex = await this.findRowIndex(0, broadcastId);
    if (rowIndex === -1) return;
    await this.updateCell(rowIndex, 3, status);
    if (sentAt) await this.updateCell(rowIndex, 5, sentAt);
  }

  private toEntity(row: string[]): Broadcast {
    return {
      broadcastId:    this.safeCell(row, 0),
      message:        this.safeCell(row, 1),
      targetSegment:  this.safeCell(row, 2) as BroadcastTargetSegment,
      status:         this.safeCell(row, 3) as BroadcastStatus,
      scheduledAt:    this.safeCell(row, 4),
      sentAt:         this.safeCell(row, 5),
      createdBy:      this.safeCell(row, 6),
    };
  }
}

// ── Takeover State ────────────────────────────────────────────────────────────
// Disimpan di sheet "Takeover State" (bukan Admin Log) agar state live terpisah dari audit trail.
// Kolom: A=0 phone | B=1 is_taken_over | C=2 taken_over_by | D=3 started_at | E=4 expires_at

export class GoogleSheetsTakeoverRepository
  extends BaseSheetRepository
  implements ITakeoverRepository
{
  protected readonly sheetName = 'Takeover State';

  constructor(client: GoogleSheetsClient, cache: SheetCache) {
    super(client, cache);
  }

  async findByPhone(phone: string): Promise<TakeoverState | null> {
    const rows = await this.readRows();
    const row = rows.find((r) => r[0] === phone && this.safeBool(r, 1));
    return row ? this.toEntity(row) : null;
  }

  async setTakeover(phone: string, adminUsername: string, expiresAt: string): Promise<void> {
    const existing = await this.findRowIndex(0, phone);
    const row: string[] = [phone, 'true', adminUsername, new Date().toISOString(), expiresAt];

    if (existing !== -1) {
      await this.updateRow(existing, row);
    } else {
      await this.appendRow(row);
    }
  }

  async clearTakeover(phone: string): Promise<void> {
    const rowIndex = await this.findRowIndex(0, phone);
    if (rowIndex === -1) return;
    await this.updateCell(rowIndex, 1, 'false');
  }

  async findExpired(): Promise<TakeoverState[]> {
    const rows = await this.readRows();
    const now = Date.now();
    return rows
      .filter((r) => this.safeBool(r, 1) && new Date(this.safeCell(r, 4)).getTime() < now)
      .map((r) => this.toEntity(r));
  }

  private toEntity(row: string[]): TakeoverState {
    return {
      phone:        this.safeCell(row, 0),
      isTakenOver:  this.safeBool(row, 1),
      takenOverBy:  this.safeCell(row, 2),
      startedAt:    this.safeCell(row, 3),
      expiresAt:    this.safeCell(row, 4),
    };
  }
}
