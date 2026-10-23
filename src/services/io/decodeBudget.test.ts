import { describe, expect, it } from 'vitest';
import { memoryConfigFor } from '@/services/platform/deviceTier';
import { DecodeBudgetError, preflightDocument } from './decodeBudget';

describe('tier decode admission estimates', () => {
  it.each(['desktop', 'low-memory', 'ios'] as const)(
    '%s admits S/M-sized documents only within the existing budget',
    (tier) => {
      const config = memoryConfigFor(tier);
      expect(preflightDocument({ width: 64, height: 64, layers: [] }, config).decodedPixels).toBe(
        0,
      );
      expect(() =>
        preflightDocument({ width: config.maxDocumentSide + 1, height: 1, layers: [] }, config),
      ).toThrow(DecodeBudgetError);
    },
  );
  it('reports retained pixel and temporary estimates for a five-layer M without allocating pixels', () => {
    const layers = Array.from({ length: 5 }, (_, n) => ({
      kind: 'raster' as const,
      id: `r${n}`,
      name: 'M',
      bounds: { x: 0, y: 0, width: 3840, height: 2160 },
      contentRev: 1,
      visible: true,
      locked: false,
      alphaLocked: false,
      opacity: 1,
      blendMode: 'normal' as const,
    }));
    expect(preflightDocument({ width: 3840, height: 2160, layers })).toEqual({
      decodedPixels: 41_472_000,
      estimatedPeakBytes: 431_308_800,
    });
    expect(() =>
      preflightDocument({ width: 3840, height: 2160, layers }, memoryConfigFor('ios')),
    ).toThrow(DecodeBudgetError);
  });
});
