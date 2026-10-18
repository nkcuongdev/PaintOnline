import { describe, expect, it } from 'vitest';
import { BACKUP_REMINDER_MS, needsBackup } from '@/app/projects';
import type { ProjectMeta } from '@/services/storage/schema';
import { daysLeft, relativeTime } from './time';

const NOW = Date.UTC(2026, 9, 17, 7, 0, 0);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('thời gian tương đối (trang chủ)', () => {
  it('vừa xong / phút / giờ / ngày / ngày tháng', () => {
    expect(relativeTime(NOW - 10_000, NOW)).toBe('vừa xong');
    expect(relativeTime(NOW - 5 * MINUTE, NOW)).toBe('5 phút trước');
    expect(relativeTime(NOW - 3 * 60 * MINUTE, NOW)).toBe('3 giờ trước');
    expect(relativeTime(NOW - 2 * DAY, NOW)).toBe('2 ngày trước');
    expect(relativeTime(NOW - 30 * DAY, NOW)).toMatch(/\d+\/\d+\/2026/);
  });

  it('số ngày còn lại trong thùng rác', () => {
    expect(daysLeft(NOW, 7 * DAY, NOW)).toBe(7);
    expect(daysLeft(NOW - 6.5 * DAY, 7 * DAY, NOW)).toBe(1);
    expect(daysLeft(NOW - 8 * DAY, 7 * DAY, NOW)).toBe(0);
  });
});

describe('nhắc sao lưu .paint (mục 6.6)', () => {
  const meta = (patch: Partial<ProjectMeta>): ProjectMeta => ({
    id: 'p',
    name: 'p',
    mode: 'paint',
    width: 1,
    height: 1,
    layerCount: 1,
    sizeBytes: 1,
    rev: 1,
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - DAY,
    openedAt: NOW,
    schemaVersion: 1,
    ...patch,
  });

  it('đã sửa sau lần xuất gần nhất và quá 7 ngày chưa sao lưu', () => {
    expect(needsBackup(meta({}), NOW)).toBe(true);
    expect(needsBackup(meta({ lastExportedAt: NOW - 2 * DAY }), NOW)).toBe(false);
    expect(
      needsBackup(meta({ lastExportedAt: NOW - 10 * DAY, updatedAt: NOW - 11 * DAY }), NOW),
    ).toBe(false);
    expect(needsBackup(meta({ createdAt: NOW - BACKUP_REMINDER_MS + MINUTE }), NOW)).toBe(false);
    expect(needsBackup(meta({ deletedAt: NOW }), NOW)).toBe(false);
  });
});
