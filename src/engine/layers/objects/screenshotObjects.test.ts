import { describe, expect, it } from 'vitest';
import type {
  AnnotationObject,
  ColorsState,
  MagnifierObject,
  RedactObject,
  SpotlightObject,
  StepObject,
} from '../../core/types';
import type { Ctx2D } from '../../memory/surfaces';
import { drawObjects } from '../../render/Compositor';
import { connectorLines, magnifierRenderer, magnifierTarget } from './magnifier';
import { backdropInfluence } from './registry';
import { spotlightRenderer } from './spotlight';
import { stepRenderer, STEP_MAX_RADIUS } from './step';
import { styleGroupOf, styleOf, withColor, withStyle } from './style';
import { transformObject } from './transform';
import type { BackdropSource, ObjectEnv } from './types';

/** Đối tượng của chế độ Screenshot (GĐ7): Step, Spotlight, Magnifier, Redact khảm/làm mờ. */

const env: ObjectEnv = {
  measure: (_font, text) => text.length * 8,
  ensureFont: () => undefined,
  documentBounds: () => ({ x: 0, y: 0, width: 400, height: 300 }),
};

const base = { rotation: 0, opacity: 1 };

const step = (id: string, x: number): StepObject => ({
  ...base,
  id,
  type: 'step',
  center: { x, y: 20 },
  radius: 14,
  color: '#E03131FF',
});

const spot = (id: string, x: number): SpotlightObject => ({
  ...base,
  id,
  type: 'spotlight',
  rect: { x, y: 10, width: 40, height: 30 },
  shape: 'rect',
  dim: 0.6,
});

const magnifier: MagnifierObject = {
  ...base,
  id: 'm',
  type: 'magnifier',
  source: { x: 10, y: 10, width: 40, height: 20 },
  target: { x: 200, y: 50 },
  zoom: 2,
  shape: 'ellipse',
  stroke: { color: '#E03131FF', width: 3 },
};

const redact = (mode: RedactObject['mode'], strength: number): RedactObject => ({
  ...base,
  id: `r-${mode}`,
  type: 'redact',
  rect: { x: 10.4, y: 20.6, width: 50, height: 30 },
  mode,
  strength,
  color: '#000000FF',
});

/** Context giả ghi lại các lệnh vẽ (Node không có canvas). */
function recorder() {
  const calls: { name: string; args: unknown[] }[] = [];
  const ctx = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return (...args: unknown[]) => {
          calls.push({ name: prop, args });
        };
      },
      set() {
        return true;
      },
    },
  ) as unknown as Ctx2D;
  return { ctx, calls };
}

describe('Step badge — số tự tăng, tự đánh lại khi xóa', () => {
  it('số theo thứ tự các Step trong layer, bỏ qua đối tượng khác', () => {
    const { ctx, calls } = recorder();
    const objects: AnnotationObject[] = [
      step('a', 20),
      spot('s', 100),
      step('b', 60),
      step('c', 90),
    ];
    drawObjects(ctx, objects, { x: 0, y: 0, width: 400, height: 300 }, env, null, null);
    expect(calls.filter((c) => c.name === 'fillText').map((c) => c.args[0])).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('xóa Step giữa (hoặc ẩn khi đang kéo): các số sau đánh lại', () => {
    const { ctx, calls } = recorder();
    const objects = [step('a', 20), step('b', 60), step('c', 90)];
    const overrides = new Map<string, AnnotationObject | null>([['b', null]]);
    drawObjects(ctx, objects, { x: 0, y: 0, width: 400, height: 300 }, env, overrides, null);
    expect(calls.filter((c) => c.name === 'fillText').map((c) => c.args[0])).toEqual(['1', '2']);
  });

  it('hit-test hình tròn; kéo góc đổi bán kính trong giới hạn', () => {
    const s = step('a', 50);
    expect(stepRenderer.hitTest(s, { x: 60, y: 28 }, 0, env)).toBe(true);
    expect(stepRenderer.hitTest(s, { x: 64, y: 34 }, 0, env)).toBe(false);
    const big = stepRenderer.dragHandle(s, 'se', { x: 500, y: 500 }, { shift: false }, env);
    expect(big.radius).toBe(STEP_MAX_RADIUS);
  });
});

describe('Spotlight', () => {
  it('nhiều Spotlight trong layer gộp một lớp làm tối (một lần fillRect)', () => {
    const { ctx, calls } = recorder();
    drawObjects(
      ctx,
      [spot('a', 10), spot('b', 200)],
      { x: 0, y: 0, width: 400, height: 300 },
      env,
      null,
      null,
    );
    expect(calls.filter((c) => c.name === 'fillRect')).toHaveLength(1);
    // Mỗi vùng sáng một lần clip evenodd.
    expect(calls.filter((c) => c.name === 'clip')).toHaveLength(2);
  });

  it('vùng vẽ lại là cả document; chọn bằng click trong vùng sáng', () => {
    const s = spot('a', 10);
    expect(spotlightRenderer.bounds(s, env)).toEqual({ x: -1, y: -1, width: 402, height: 302 });
    expect(spotlightRenderer.hitTest(s, { x: 30, y: 20 }, 0, env)).toBe(true);
    expect(spotlightRenderer.hitTest(s, { x: 300, y: 200 }, 0, env)).toBe(false);
  });
});

describe('Magnifier', () => {
  it('bản phóng to đặt tâm tại target, kích thước = nguồn × zoom', () => {
    expect(magnifierTarget(magnifier)).toEqual({ x: 160, y: 30, width: 80, height: 40 });
  });

  it('hai đường nối là tiếp tuyến ngoài (nối hình nguồn với bản phóng to)', () => {
    const lines = connectorLines({ ...magnifier, shape: 'rect' });
    expect(lines).toHaveLength(2);
    for (const [a, b] of lines) {
      const fromSource = a.x <= 50 && b.x >= 160;
      const fromTarget = b.x <= 50 && a.x >= 160;
      expect(fromSource || fromTarget).toBe(true);
    }
  });

  it('handle: góc nguồn, tâm bản phóng to, mép phải đổi zoom (kẹp 1,5–6)', () => {
    const moved = magnifierRenderer.dragHandle(
      magnifier,
      'p2',
      { x: 300, y: 200 },
      { shift: false },
      env,
    );
    expect(moved.target).toEqual({ x: 300, y: 200 });
    const zoomed = magnifierRenderer.dragHandle(
      magnifier,
      'p3',
      { x: 400, y: 50 },
      { shift: false },
      env,
    );
    expect(zoomed.zoom).toBe(6);
    const resized = magnifierRenderer.dragHandle(
      magnifier,
      'p1',
      { x: 90, y: 70 },
      { shift: false },
      env,
    );
    expect(resized.source).toEqual({ x: 10, y: 10, width: 80, height: 60 });
  });

  it('cắt xén ảnh dời cả vùng nguồn lẫn bản phóng to; nét co giãn theo tỉ lệ', () => {
    const m = { a: 0.5, b: 0, c: 0, d: 0.5, e: -5, f: -5 };
    const next = transformObject(magnifier, m, env);
    expect(next.type === 'magnifier' && next.source).toEqual({ x: 0, y: 0, width: 20, height: 10 });
    expect(next.type === 'magnifier' && next.target).toEqual({ x: 95, y: 20 });
    expect(next.type === 'magnifier' && next.stroke.width).toBe(1.5);
  });
});

describe('Redact khảm/làm mờ — ảnh nền và vùng phụ thuộc', () => {
  it('tô kín không đọc nền; khảm đọc đúng vùng; làm mờ đọc thêm phần đệm', () => {
    expect(backdropInfluence(redact('solid', 0))).toBeNull();
    expect(backdropInfluence(redact('pixelate', 16))).toEqual({
      x: 10,
      y: 20,
      width: 51,
      height: 31,
    });
    const blur = backdropInfluence(redact('blur', 12));
    expect(blur && blur.x < 10 && blur.width > 51).toBe(true);
    expect(backdropInfluence(magnifier)).toEqual(magnifier.source);
  });

  it('vẽ ảnh nền đã xử lý từ BackdropSource; không có thì tô kín (không lộ nền)', () => {
    const source: BackdropSource = {
      redact: () => ({
        image: 'IMG' as unknown as CanvasImageSource,
        rect: { x: 10, y: 20, width: 51, height: 31 },
      }),
      magnify: () => null,
    };
    const withBackdrop = recorder();
    drawObjects(
      withBackdrop.ctx,
      [redact('pixelate', 16)],
      { x: 0, y: 0, width: 400, height: 300 },
      { ...env, backdrop: source },
      null,
      { kind: 'layer', id: 'L' },
    );
    expect(withBackdrop.calls.some((c) => c.name === 'drawImage' && c.args[0] === 'IMG')).toBe(
      true,
    );
    expect(withBackdrop.calls.some((c) => c.name === 'fillRect')).toBe(false);

    const without = recorder();
    drawObjects(
      without.ctx,
      [redact('blur', 12)],
      { x: 0, y: 0, width: 400, height: 300 },
      env,
      null,
      { kind: 'layer', id: 'L' },
    );
    expect(without.calls.filter((c) => c.name === 'fillRect')).toEqual([
      { name: 'fillRect', args: [10, 20, 51, 31] },
    ]);
  });

  it('Options bar: đổi chế độ khảm → làm mờ lấy cường độ của chế độ mới', () => {
    const r = redact('pixelate', 20);
    expect(styleGroupOf(r)).toBe('redact');
    expect(styleOf(r)).toMatchObject({ mode: 'pixelate', blockSize: 20 });
    const colors: ColorsState = { primary: '#000000FF', secondary: '#FFFFFFFF', recent: [] };
    const blurred = withStyle(r, { mode: 'blur', blockSize: 16, blurRadius: 9 }, colors);
    expect(blurred).toMatchObject({ mode: 'blur', strength: 9 });
    const bigger = withStyle(r, { blockSize: 32 }, colors);
    expect(bigger).toMatchObject({ mode: 'pixelate', strength: 32 });
  });

  it('màu chính đổi màu Step, viền Magnifier', () => {
    expect(withColor(step('a', 1), 'primary', '#1C7ED6FF')).toMatchObject({ color: '#1C7ED6FF' });
    expect(withColor(magnifier, 'primary', '#1C7ED6FF')).toMatchObject({
      stroke: { color: '#1C7ED6FF' },
    });
  });
});
