import { describe, expect, it } from 'vitest';
import { Document } from '../core/Document';
import { BeautifyCommand } from '../history/commands/BeautifyCommand';
import { History } from '../history/History';
import { MemoryBudget, TIER_BUDGETS } from '../memory/MemoryBudget';
import { BEAUTIFY_DEFAULTS, beautifyFrame, normalizeBeautify } from './beautify';

describe('Làm đẹp ảnh (GĐ7)', () => {
  it('kẹp, làm tròn cài đặt; giá trị sai giữ giá trị cũ', () => {
    expect(normalizeBeautify({ padding: 1000, radius: -5, shadow: false })).toEqual({
      ...BEAUTIFY_DEFAULTS,
      padding: 400,
      radius: 0,
      shadow: false,
    });
    expect(
      normalizeBeautify({ padding: Number.NaN, background: 'evil' as 'ocean' }, BEAUTIFY_DEFAULTS),
    ).toEqual(BEAUTIFY_DEFAULTS);
    expect(normalizeBeautify({ padding: 12.6 }).padding).toBe(13);
  });

  it('khung = ảnh nới padding mỗi phía', () => {
    expect(beautifyFrame({ x: 0, y: 0, width: 100, height: 50 }, BEAUTIFY_DEFAULTS)).toEqual({
      x: -64,
      y: -64,
      width: 228,
      height: 178,
    });
  });

  it('kéo slider liên tục gộp một bước; bật/tắt là bước riêng; undo trả về tắt', () => {
    const memory = new MemoryBudget(TIER_BUDGETS.desktop);
    const doc = Document.create(
      {
        width: 10,
        height: 10,
        background: { kind: 'transparent' },
        layers: [{ kind: 'vector', name: 'A' }],
      },
      memory,
    );
    const history = new History(memory);
    history.execute(new BeautifyCommand({ ...BEAUTIFY_DEFAULTS }), doc);
    history.execute(new BeautifyCommand({ ...BEAUTIFY_DEFAULTS, padding: 80 }), doc);
    history.execute(new BeautifyCommand({ ...BEAUTIFY_DEFAULTS, padding: 96 }), doc);
    expect(history.summary().steps).toBe(1);
    expect(doc.beautify?.padding).toBe(96);
    history.execute(new BeautifyCommand(null), doc);
    expect(history.summary().steps).toBe(2);
    expect(doc.beautify).toBeNull();
    history.undo(doc);
    expect(doc.beautify?.padding).toBe(96);
    history.undo(doc);
    expect(doc.beautify).toBeNull();
    expect(doc.serialize().beautify).toBeNull();
  });
});
