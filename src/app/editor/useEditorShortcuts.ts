import { useEffect } from 'react';
import { COMMANDS, rememberSelectTool, rememberShapeTool } from '@/commands';
import { belongsToOverlay, ShortcutManager } from '@/commands/shortcuts';
import { isEditableTarget } from '@/services/platform/browserGuards';
import { platformFeatures } from '@/services/platform/features';
import { copyProjectImage } from './actions';
import { copySelection, pasteFromEvent, trackClipboardFreshness } from './clipboard';
import type { OpenProject } from './session';

/**
 * Phím tắt Editor qua ShortcutManager + Command Registry (mục 5.9, 7.7), cộng sự kiện trình duyệt
 * không đi qua keydown: `copy`, `cut`, `paste` (Ctrl+C/X/V — vùng chọn và clipboard, mục 5.7).
 * `beforeunload` nằm ở installSessionLifecycle (theo trạng thái lưu).
 */
export function useEditorShortcuts(project: OpenProject): void {
  useEffect(() => {
    const editor = project.editor;
    const context = { project, editor };
    const manager = new ShortcutManager(
      () => context,
      platformFeatures.isApple,
      (e) => editor.keyDown(e),
    );
    manager.setCommands(COMMANDS);
    const detach = manager.attach(window);

    const offTool = editor.on('toolChanged', ({ tool, temporary }) => {
      if (temporary) return;
      rememberShapeTool(tool);
      rememberSelectTool(tool);
    });

    /** Sự kiện clipboard dành cho vùng làm việc (không phải ô nhập liệu, overlay, chữ bôi đen). */
    const forCanvas = (e: ClipboardEvent): boolean => {
      if (isEditableTarget(e.target) || belongsToOverlay(e.target)) return false;
      const selection = window.getSelection();
      return !(selection && !selection.isCollapsed && selection.toString().trim() !== '');
    };

    // Ctrl+C: có vùng chọn thì copy pixel trong vùng chọn (kèm vị trí), không thì copy toàn bộ ảnh
    // đã ghép (mục 5.7, 7.4, 7.7).
    const onCopy = (e: ClipboardEvent) => {
      if (!forCanvas(e)) return;
      e.preventDefault();
      if (!editor.selection.hasSelection || !copySelection(project, 'copy')) {
        copyProjectImage(project);
      }
    };
    const onCut = (e: ClipboardEvent) => {
      if (!forCanvas(e) || !editor.selection.hasSelection) return;
      e.preventDefault();
      copySelection(project, 'cut');
    };
    // Ctrl+V: ảnh thành layer mới đang nổi (mục 2, 7.4); bản copy nội bộ giữ đúng vị trí.
    const onPaste = (e: ClipboardEvent) => {
      if (!forCanvas(e)) return;
      e.preventDefault();
      void pasteFromEvent(project, e.clipboardData);
    };
    const offFreshness = trackClipboardFreshness();

    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      detach();
      offTool();
      offFreshness();
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, [project]);
}
