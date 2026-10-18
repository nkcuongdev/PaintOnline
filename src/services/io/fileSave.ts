/**
 * Lưu nhanh ra file (mục 2, P2; mục 10.3): File System Access API trên Chromium — chọn file .paint
 * một lần, các lần Ctrl+S sau ghi đè thẳng vào file đó. Trình duyệt khác không có API này: app tải
 * file .paint về như "Xuất .paint". Mọi kiểu ở đây khai báo tối thiểu vì API chưa có trong lib.dom.
 */

export interface WritableFileStream {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

export interface SaveFileHandle {
  readonly kind: 'file';
  readonly name: string;
  createWritable(): Promise<WritableFileStream>;
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}

interface SaveFilePickerOptions {
  suggestedName: string;
  id?: string;
  types: { description: string; accept: Record<string, string[]> }[];
}

type SaveFilePicker = (options: SaveFilePickerOptions) => Promise<SaveFileHandle>;

function picker(): SaveFilePicker | null {
  if (typeof window === 'undefined') return null;
  const fn = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  return typeof fn === 'function' ? fn.bind(window) : null;
}

/** Trình duyệt có File System Access API (Chrome, Edge…). */
export function canSaveToFile(): boolean {
  return picker() !== null;
}

/** Người dùng bấm Hủy trong hộp chọn file. */
export function isPickerAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Hộp chọn nơi lưu file .paint. Phải gọi ngay trong thao tác của người dùng (click/phím) — trước
 * mọi `await` khác.
 */
export function pickPaintFile(suggestedName: string, description: string): Promise<SaveFileHandle> {
  const show = picker();
  if (!show) return Promise.reject(new Error('File System Access API không có'));
  return show({
    suggestedName,
    id: 'paint-online-project',
    types: [{ description, accept: { 'application/octet-stream': ['.paint'] } }],
  });
}

/**
 * Còn quyền ghi vào file đã chọn? Sau khi tải lại trang trình duyệt hỏi lại (cần thao tác người
 * dùng — Ctrl+S là đủ).
 */
export async function ensureWritable(handle: SaveFileHandle): Promise<boolean> {
  const descriptor = { mode: 'readwrite' } as const;
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission(descriptor)) === 'granted') return true;
  if (!handle.requestPermission) return false;
  return (await handle.requestPermission(descriptor)) === 'granted';
}

/** Ghi đè toàn bộ file (createWritable ghi vào file tạm, chỉ thay file thật khi close thành công). */
export async function writeFile(handle: SaveFileHandle, blob: Blob): Promise<void> {
  const stream = await handle.createWritable();
  try {
    await stream.write(blob);
    await stream.close();
  } catch (error) {
    await stream.abort().catch(() => undefined);
    throw error;
  }
}
