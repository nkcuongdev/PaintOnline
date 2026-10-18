import type { AnnotationObject, AnnotationObjectType, Rect } from '../../core/types';
import { inflateRect } from '../../utils/rect';
import { highlightRenderer, redactPixelRect, redactRenderer } from './annotate';
import { magnifierRenderer } from './magnifier';
import { arrowRenderer, lineRenderer, polygonRenderer } from './path';
import { ellipseRenderer, rectRenderer } from './rect';
import { spotlightRenderer } from './spotlight';
import { stepRenderer } from './step';
import { redactHalo } from './redactEffect';
import { textRenderer } from './text';
import type { ObjectEnv, ObjectRenderer } from './types';

type RendererMap = {
  [T in AnnotationObjectType]?: ObjectRenderer<Extract<AnnotationObject, { type: T }>>;
};

/**
 * objectRegistry (mục 6.2): mỗi loại đối tượng một renderer (vẽ, hit-test, hình bao, handle).
 */
export const objectRegistry: RendererMap = {
  rect: rectRenderer,
  ellipse: ellipseRenderer,
  line: lineRenderer,
  arrow: arrowRenderer,
  polygon: polygonRenderer,
  text: textRenderer,
  highlight: highlightRenderer,
  redact: redactRenderer,
  step: stepRenderer,
  spotlight: spotlightRenderer,
  magnifier: magnifierRenderer,
};

/**
 * Đối tượng cần pixel của nền bên dưới ở vùng khác vùng vẽ (Redact khảm/làm mờ, Magnifier): khi nền
 * trong `influence` đổi thì cả vùng vẽ `bounds` phải vẽ lại (mục 5.4).
 */
export function backdropInfluence(obj: AnnotationObject): Rect | null {
  if (obj.type === 'redact') {
    if (obj.mode === 'solid') return null;
    return inflateRect(redactPixelRect(obj), redactHalo(obj));
  }
  if (obj.type === 'magnifier') return { ...obj.source };
  return null;
}

export function rendererFor<T extends AnnotationObject>(obj: T): ObjectRenderer<T> | undefined {
  return objectRegistry[obj.type] as ObjectRenderer<T> | undefined;
}

export function objectBounds(obj: AnnotationObject, env: ObjectEnv): Rect {
  return rendererFor(obj)?.bounds(obj, env) ?? { x: 0, y: 0, width: 0, height: 0 };
}
