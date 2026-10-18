import { copyProjectImage } from '@/app/editor/actions';
import { saveCurrentProject } from '@/app/editor/session';
import { t } from '@/i18n';
import { openDialog, toast } from '@/stores/ui';
import type { AppCommand } from '../registry';

/** Khung nhìn và xuất ảnh (mục 7.7). Zoom có phím dự phòng `+`/`-` vì Ctrl++ có thể zoom cả trang. */
export const viewCommands: AppCommand[] = [
  {
    id: 'view.zoomIn',
    label: () => t.zoom.zoomIn,
    shortcuts: ['+', 'Mod++', 'Mod+='],
    repeat: true,
    run: ({ editor }) => {
      editor.viewport.zoomStep(1);
    },
  },
  {
    id: 'view.zoomOut',
    label: () => t.zoom.zoomOut,
    shortcuts: ['-', 'Mod+-'],
    repeat: true,
    run: ({ editor }) => {
      editor.viewport.zoomStep(-1);
    },
  },
  {
    id: 'view.fit',
    label: () => t.zoom.fit,
    shortcuts: ['Shift+1'],
    run: ({ editor }) => {
      editor.viewport.fit();
    },
  },
  {
    id: 'view.actualSize',
    label: () => t.zoom.actual,
    shortcuts: ['Shift+0'],
    run: ({ editor }) => {
      editor.viewport.actualSize();
    },
  },
  {
    // Ctrl+C khi không có vùng chọn = copy ảnh đã ghép; đi qua sự kiện `copy` (không phải keydown),
    // phím ở đây chỉ để hiển thị.
    id: 'file.copyImage',
    label: () => t.actions.copy,
    run: ({ project }) => {
      copyProjectImage(project);
    },
  },
  {
    // Ctrl+S lưu ngay (mục 6.6, 7.7): durability 'strict'. Trình duyệt có thể giành phím — dự phòng:
    // menu "Thêm thao tác" và nút trạng thái lưu.
    id: 'file.save',
    label: () => t.actions.save,
    shortcuts: ['Mod+S'],
    run: () => {
      void saveCurrentProject().then((ok) => {
        if (ok) toast('success', t.storage.savedToast);
      });
    },
  },
  {
    // Ctrl+Shift+S có thể bị Firefox giành (chụp màn hình) — dự phòng: nút Xuất trên top bar.
    id: 'file.export',
    label: () => t.actions.export,
    shortcuts: ['Mod+Shift+S'],
    run: () => {
      openDialog({ kind: 'export' });
    },
  },
  {
    id: 'file.exportPaint',
    label: () => t.projects.exportPaint,
    run: ({ project }) => {
      openDialog({ kind: 'paintExport', projectId: project.id });
    },
  },
];

/** Phím hiển thị cho lệnh không đăng ký qua keydown. */
export const DISPLAY_SHORTCUTS: Readonly<Record<string, string>> = {
  'file.copyImage': 'Mod+C',
  'edit.copy': 'Mod+C',
  'edit.cut': 'Mod+X',
  'edit.paste': 'Mod+V',
};
