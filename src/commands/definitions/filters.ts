import { openAdjustment, type AdjustmentKind } from '@/app/editor/adjustments';
import { t } from '@/i18n';
import type { AppCommand, CommandContext } from '../registry';

/**
 * Điều chỉnh và bộ lọc (mục 2, GĐ6): mỗi lệnh mở một bảng điều chỉnh nổi (Đen trắng, Đảo màu áp
 * dụng ngay). Không gán phím mặc định (mục 7.7) — dùng qua menu Điều chỉnh và Command Palette (GĐ8).
 */

const available = ({ editor }: CommandContext) =>
  !editor.readOnly && !editor.image.busy && editor.filters.state?.phase !== 'applying';

function adjustment(kind: AdjustmentKind): AppCommand {
  return {
    id: `filter.${kind}`,
    label: () => t.filters[kind],
    enabled: available,
    run: ({ editor }) => {
      openAdjustment(editor, kind);
    },
  };
}

export const filterCommands: AppCommand[] = [
  adjustment('brightnessContrast'),
  adjustment('hueSaturation'),
  adjustment('grayscale'),
  adjustment('sepia'),
  adjustment('invert'),
  adjustment('blur'),
  adjustment('sharpen'),
  adjustment('pixelate'),
];
