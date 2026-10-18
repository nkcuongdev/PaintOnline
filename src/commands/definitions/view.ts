import {
  copyProjectImage,
  downloadProjectImage,
  saveLinkedFile,
  saveProjectToFile,
} from '@/app/editor/actions';
import { saveCurrentProject } from '@/app/editor/session';
import { format, t } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import { openDialog, toast, useUiStore } from '@/stores/ui';
import type { AppCommand } from '../registry';

/** Bật/tắt lưới, thước đo, bám lưới (mục 2, P2) — lưu trong Cài đặt, không gán phím mặc định. */
function toggleView(id: string, key: 'grid' | 'rulers' | 'snap', name: () => string): AppCommand {
  return {
    id,
    label: () =>
      format(useSettingsStore.getState().view[key] ? t.view.off : t.view.on, {
        name: name().toLowerCase(),
      }),
    run: () => {
      const settings = useSettingsStore.getState();
      const next = !settings.view[key];
      settings.setView({ [key]: next });
      useUiStore
        .getState()
        .announce(format(next ? t.view.on : t.view.off, { name: name().toLowerCase() }));
    },
  };
}

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
  toggleView('view.grid', 'grid', () => t.view.grid),
  toggleView('view.rulers', 'rulers', () => t.view.rulers),
  toggleView('view.snap', 'snap', () => t.view.snap),
  {
    // Zen mode (mục 7.6): `\`, không dùng Tab (phím điều hướng focus của trình duyệt).
    id: 'view.zen',
    label: () => (useUiStore.getState().zen ? t.view.zenExit : t.view.zen),
    shortcuts: ['\\'],
    run: () => {
      const ui = useUiStore.getState();
      ui.setZen(!ui.zen);
      ui.announce(ui.zen ? t.view.zenOff : t.view.zenOn);
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
    // "Xuất PNG" trong menu chuột phải vùng trống: tải PNG 1× đúng như đang thấy, không qua hộp thoại
    // Export (như nút "Tải xuống" của chế độ Screenshot).
    id: 'file.exportPng',
    label: () => t.actions.exportPng,
    run: ({ project }) => {
      void downloadProjectImage(project);
    },
  },
  {
    // Ctrl+S lưu ngay (mục 6.6, 7.7): durability 'strict'. Trình duyệt có thể giành phím — dự phòng:
    // menu "Thêm thao tác" và nút trạng thái lưu.
    id: 'file.save',
    label: () => t.actions.save,
    shortcuts: ['Mod+S'],
    run: ({ project }) => {
      void saveCurrentProject().then((ok) => {
        // Project đã gắn file .paint ("Lưu ra file" — Chromium): ghi đè file đó, toast của nó.
        if (ok && project.fileLink) void saveLinkedFile(project);
        else if (ok) toast('success', t.storage.savedToast);
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
    // Lưu nhanh ra file (mục 2, P2): Chromium chọn file một lần, Ctrl+S ghi đè; khác: tải .paint.
    id: 'file.saveToFile',
    label: () => t.fileSave.saveAs,
    run: ({ project }) => {
      saveProjectToFile(project);
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
