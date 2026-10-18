import type { AnnotationObject } from '@/engine/core/types';
import { format, t } from '@/i18n';

/** Số ký tự chữ hiển thị trong mô tả đối tượng Text. */
const TEXT_PREVIEW = 40;

/** Mô tả đọc được của một đối tượng ("Chữ: Lỗi ở đây", "Số thứ tự 2"). */
export function describeObject(object: AnnotationObject, stepNumber: number): string {
  const kind = t.tools[object.type];
  switch (object.type) {
    case 'text': {
      const text = object.text.replace(/\s+/g, ' ').trim();
      const preview = text.length > TEXT_PREVIEW ? `${text.slice(0, TEXT_PREVIEW)}…` : text;
      return preview ? format(t.objectList.withText, { kind, text: preview }) : kind;
    }
    case 'step':
      return format(t.objectList.step, { kind, n: stepNumber });
    case 'redact':
      return format(t.objectList.withDetail, {
        kind,
        detail:
          object.mode === 'pixelate'
            ? t.toolOptions.redactPixelate
            : object.mode === 'blur'
              ? t.toolOptions.redactBlur
              : t.toolOptions.redactSolid,
      });
    default:
      return kind;
  }
}
