import { describe, expect, it } from 'vitest';
import { sampleRecord } from '@/services/storage/testing';
import { mainThreadCodec } from '@/services/workers/codec';
import { encodePng } from '@/services/workers/ops/png';
import { buildProjectFile, ProjectFileError, readProjectFile } from './projectFile';

/**
 * Fuzz file .paint (mục 10.2, 11.1): file hỏng ngẫu nhiên — đổi byte, cắt cụt, chèn rác — chỉ được
 * dẫn tới ProjectFileError (thông báo rõ ràng cho người dùng), không bao giờ lỗi khác hay treo.
 */

/** Sinh số giả ngẫu nhiên xác định (lặp lại được khi test hỏng). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

async function validFile(): Promise<Uint8Array> {
  const record = sampleRecord({
    width: 16,
    height: 16,
    layers: [
      {
        id: 'r1',
        name: 'Nền',
        kind: 'raster',
        visible: true,
        locked: false,
        alphaLocked: false,
        opacity: 1,
        blendMode: 'normal',
        contentRev: 1,
        bounds: { x: 0, y: 0, width: 8, height: 8 },
      },
    ],
    activeLayerId: 'r1',
  });
  const pixels = new Uint8Array(8 * 8 * 4).map((_, i) => (i * 37) & 255);
  const png = encodePng(pixels, 8, 8);
  const blob = await buildProjectFile(
    {
      meta: { name: 'Fuzz', mode: 'paint' },
      document: record,
      layers: [
        {
          layerId: 'r1',
          contentRev: 1,
          bounds: { x: 0, y: 0, width: 8, height: 8 },
          png: png.slice().buffer,
        },
      ],
      thumbnail: null,
    },
    mainThreadCodec,
    { appVersion: 'test', bakeRedactions: false, now: 0 },
  );
  return new Uint8Array(await blob.arrayBuffer());
}

async function expectOnlyProjectFileError(bytes: Uint8Array): Promise<'ok' | 'rejected'> {
  try {
    await readProjectFile(new Blob([bytes.slice()]), mainThreadCodec);
    return 'ok';
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectFileError);
    return 'rejected';
  }
}

describe('fuzz file .paint (mục 10.2, 11.1)', () => {
  it('file gốc đọc được', async () => {
    const imported = await readProjectFile(
      new Blob([(await validFile()).slice()]),
      mainThreadCodec,
    );
    expect(imported.layers).toHaveLength(1);
  });

  it('đổi byte ngẫu nhiên: chỉ ProjectFileError', async () => {
    const original = await validFile();
    const random = rng(2026);
    let rejected = 0;
    for (let round = 0; round < 120; round++) {
      const bytes = original.slice();
      const flips = 1 + Math.floor(random() * 8);
      for (let i = 0; i < flips; i++) {
        bytes[Math.floor(random() * bytes.length)] = Math.floor(random() * 256);
      }
      if ((await expectOnlyProjectFileError(bytes)) === 'rejected') rejected++;
    }
    // Phần lớn thay đổi phải bị phát hiện (CRC của ZIP, PNG, schema).
    expect(rejected).toBeGreaterThan(60);
  }, 60_000);

  it('cắt cụt ở mọi độ dài và chèn rác: chỉ ProjectFileError', async () => {
    const original = await validFile();
    const random = rng(7);
    for (let round = 0; round < 60; round++) {
      const cut = Math.floor(random() * original.length);
      await expectOnlyProjectFileError(original.slice(0, cut));
    }
    for (let round = 0; round < 30; round++) {
      const at = Math.floor(random() * original.length);
      const junk = new Uint8Array(1 + Math.floor(random() * 64)).map(() =>
        Math.floor(random() * 256),
      );
      const bytes = new Uint8Array(original.length + junk.length);
      bytes.set(original.subarray(0, at));
      bytes.set(junk, at);
      bytes.set(original.subarray(at), at + junk.length);
      await expectOnlyProjectFileError(bytes);
    }
  }, 60_000);
});
