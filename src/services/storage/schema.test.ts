import { describe, expect, it } from 'vitest';
import { migrationsBetween, MIGRATIONS } from './migrations';
import { sampleRecord } from './testing';
import {
  DB_VERSION,
  NewerSchemaError,
  parseDocumentRecord,
  RECORD_SCHEMA_VERSION,
  RecordValidationError,
  type DocumentRecord,
} from './schema';

describe('parseDocumentRecord (mục 6.4, 6.6)', () => {
  it('bản ghi hợp lệ đi qua nguyên vẹn', () => {
    const record = sampleRecord();
    expect(parseDocumentRecord(structuredClone(record))).toEqual(record);
  });

  it('loại bỏ trường lạ ở mọi cấp', () => {
    const raw = structuredClone(sampleRecord()) as unknown as Record<string, unknown>;
    raw.evil = '<script>';
    (raw.layers as Record<string, unknown>[])[0].extra = 1;
    const parsed = parseDocumentRecord(raw);
    expect(parsed).not.toHaveProperty('evil');
    expect(parsed.layers[0]).not.toHaveProperty('extra');
  });

  it.each([
    ['màu sai định dạng', (r: DocumentRecord) => ((r.palette as string[])[0] = 'red')],
    ['kích thước quá lớn', (r: DocumentRecord) => (r.width = 100_000)],
    ['số không hữu hạn', (r: DocumentRecord) => (r.viewport.zoom = Number.NaN)],
    [
      'blend mode lạ',
      (r: DocumentRecord) => ((r.layers[0] as { blendMode: string }).blendMode = 'x'),
    ],
    ['không có layer', (r: DocumentRecord) => (r.layers = [])],
    ['trùng id layer', (r: DocumentRecord) => (r.layers[1].id = 'r1')],
    [
      'vị trí layer ngoài ảnh',
      (r: DocumentRecord) => {
        const l = r.layers[0];
        if (l.kind === 'raster') l.bounds = { x: 512, y: 0, width: 512, height: 512 };
      },
    ],
    [
      'loại đối tượng lạ',
      (r: DocumentRecord) => {
        const l = r.layers[1];
        if (l.kind === 'vector') (l.objects[0] as { type: string }).type = 'html';
      },
    ],
  ])('từ chối: %s', (_name, mutate) => {
    const record = structuredClone(sampleRecord());
    mutate(record);
    expect(() => parseDocumentRecord(record)).toThrow(RecordValidationError);
  });

  it('GĐ7: Magnifier, Step, Spotlight, Redact khảm và khung Làm đẹp đi qua nguyên vẹn', () => {
    const record = sampleRecord();
    const layer = record.layers[1];
    if (layer.kind !== 'vector') throw new Error('cần layer chú thích');
    const base = { rotation: 0, opacity: 1 };
    layer.objects.push(
      {
        ...base,
        id: 'm1',
        type: 'magnifier',
        source: { x: 10, y: 10, width: 40, height: 20 },
        target: { x: 200, y: 60 },
        zoom: 2.5,
        shape: 'ellipse',
        stroke: { color: '#E03131FF', width: 3 },
      },
      { ...base, id: 's1', type: 'step', center: { x: 5, y: 5 }, radius: 18, color: '#E03131FF' },
      {
        ...base,
        id: 'p1',
        type: 'spotlight',
        rect: { x: 0, y: 0, width: 50, height: 50 },
        shape: 'ellipse',
        dim: 0.6,
      },
      {
        ...base,
        id: 'r2',
        type: 'redact',
        rect: { x: 0, y: 0, width: 50, height: 50 },
        mode: 'pixelate',
        strength: 16,
        color: '#000000FF',
      },
    );
    record.beautify = { padding: 64, background: 'sunset', radius: 12, shadow: true };
    expect(parseDocumentRecord(structuredClone(record))).toEqual(record);
    // Bản ghi trước GĐ7 không có trường này vẫn hợp lệ.
    const old = structuredClone(sampleRecord());
    delete old.beautify;
    expect(parseDocumentRecord(old).beautify).toBeUndefined();
  });

  it.each([
    [
      'nền Làm đẹp lạ',
      (r: DocumentRecord) => {
        r.beautify = { padding: 10, background: 'url(x)' as 'ocean', radius: 0, shadow: false };
      },
    ],
    [
      'padding âm',
      (r: DocumentRecord) => {
        r.beautify = { padding: -1, background: 'ocean', radius: 0, shadow: false };
      },
    ],
  ])('từ chối: %s', (_name, mutate) => {
    const record = structuredClone(sampleRecord());
    mutate(record);
    expect(() => parseDocumentRecord(record)).toThrow(RecordValidationError);
  });

  it('bản ghi của phiên bản mới hơn: NewerSchemaError', () => {
    const record = sampleRecord({ schemaVersion: RECORD_SCHEMA_VERSION + 1 });
    expect(() => parseDocumentRecord(record)).toThrow(NewerSchemaError);
  });

  it('dữ liệu rác không làm sập', () => {
    for (const junk of [null, 42, 'x', [], { layers: 'x' }]) {
      expect(() => parseDocumentRecord(junk)).toThrow(RecordValidationError);
    }
  });
});

describe('migrations (mục 6.4)', () => {
  it('có đủ bước từ 0 tới phiên bản hiện tại', () => {
    expect(migrationsBetween(0, DB_VERSION).map((m) => m.version)).toEqual(
      Array.from({ length: DB_VERSION }, (_, i) => i + 1),
    );
    expect(MIGRATIONS.at(-1)?.version).toBe(DB_VERSION);
  });

  it('chỉ chạy các bước còn thiếu, theo thứ tự', () => {
    const steps = [3, 1, 2].map((version) => ({ version, migrate: () => undefined }));
    expect(migrationsBetween(1, 3, steps).map((m) => m.version)).toEqual([2, 3]);
    expect(migrationsBetween(3, 3, steps)).toEqual([]);
  });

  it('thiếu bước hoặc hạ phiên bản là lỗi', () => {
    const steps = [1, 3].map((version) => ({ version, migrate: () => undefined }));
    expect(() => migrationsBetween(0, 3, steps)).toThrow(/Thiếu migration/);
    expect(() => migrationsBetween(2, 1, steps)).toThrow();
  });
});
