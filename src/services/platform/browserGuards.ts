/**
 * Quy tắc hòa hợp với trình duyệt (mục 7.9). Phần trong vùng canvas (wheel/pinch zoom ảnh,
 * touch-action, menu chuột phải, chuột giữa) do InputManager của Engine xử lý; module này lo phần
 * cấp cửa sổ.
 */

function isFileDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Chặn hành vi mặc định của dragover/drop trên toàn cửa sổ: thả nhầm file không làm trình duyệt
 * mở file và rời khỏi app. Vùng thả thật (DropZone, editor) tự xử lý sự kiện của mình.
 */
export function installBrowserGuards(): () => void {
  const onDragOver = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    if (e.dataTransfer && !e.defaultPrevented) e.dataTransfer.dropEffect = 'none';
  };
  const onDrop = (e: DragEvent) => {
    if (isFileDrag(e)) e.preventDefault();
  };
  // Safari: pinch trackpad ngoài vùng canvas không được zoom cả trang giao diện.
  const onGesture = (e: Event) => {
    e.preventDefault();
  };
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDrop);
  document.addEventListener('gesturestart', onGesture, { passive: false });
  return () => {
    window.removeEventListener('dragover', onDragOver);
    window.removeEventListener('drop', onDrop);
    document.removeEventListener('gesturestart', onGesture);
  };
}

/** Phần tử đang nhận phím là ô nhập liệu — trả phím lại cho trình duyệt (mục 7.7). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  return !['button', 'checkbox', 'radio', 'range', 'color', 'submit', 'reset', 'file'].includes(
    type,
  );
}
