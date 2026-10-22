import { navigate } from '@/app/router';
import { formatShortcut } from '@/app/shared/shortcut';
import { codec, initStorage, repo, storageReady } from '@/app/storage';
import type { Color, ID } from '@/engine/core/types';
import { format, t } from '@/i18n';
import { copyImage } from '@/services/io/clipboard';
import { downloadBlob, safeFileName } from '@/services/io/download';
import {
  canSaveToFile,
  ensureWritable,
  isPickerAbort,
  pickPaintFile,
  writeFile,
  type SaveFileHandle,
} from '@/services/io/fileSave';
import {
  EXPORT_EXTENSION,
  exportComposite,
  type ImageExportOptions,
} from '@/services/io/exportImage';
import { decodeImage, ImportError, nameFromFile } from '@/services/io/importImage';
import { detectMemoryConfig } from '@/services/platform/deviceTier';
import { platformFeatures } from '@/services/platform/features';
import type { EncodedLayer, ProjectBundle } from '@/services/storage/projectRepo';
import { isQuotaError } from '@/services/storage/db';
import { RECORD_SCHEMA_VERSION } from '@/services/storage/schema';
import { openDialog, toast } from '@/stores/ui';
import { createProject, getCurrentProject, setProjectFileLink, type OpenProject } from './session';

/**
 * Các thao tác cấp ứng dụng nối UI với Engine và services: tạo/mở ảnh, copy, export ảnh,
 * xuất/nhập .paint. Được gọi từ Command Registry, nút và trang chủ.
 */

/** Cạnh lớn nhất của ảnh mẫu để trích bảng màu. */
const PALETTE_SAMPLE_SIDE = 64;

/**
 * Màu chủ đạo của ảnh vừa import (mục 7.6): thu nhỏ bằng createImageBitmap rồi trích trong Worker.
 * Lỗi thì bỏ qua (bảng màu chỉ là tiện ích).
 */
export async function paletteOf(image: ImageBitmap): Promise<Color[]> {
  try {
    const scale = Math.min(1, PALETTE_SAMPLE_SIDE / Math.max(image.width, image.height, 1));
    const sample = await createImageBitmap(image, {
      resizeWidth: Math.max(1, Math.round(image.width * scale)),
      resizeHeight: Math.max(1, Math.round(image.height * scale)),
      resizeQuality: 'medium',
    });
    return await codec().palette(sample);
  } catch {
    return [];
  }
}

/** Tạo ảnh trắng theo kích thước preset rồi mở editor. */
export async function createBlankProject(width: number, height: number): Promise<boolean> {
  const id = await createProject({
    name: format(t.home.blankName, { width, height }),
    document: {
      width,
      height,
      background: { kind: 'color', color: '#FFFFFFFF' },
      layers: [{ kind: 'raster', name: format(t.layers.numbered, { n: 1 }) }],
    },
  });
  if (!id) return false;
  navigate({ name: 'project', projectId: id });
  return true;
}

function timeLabel(): string {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(),
  );
}

/**
 * Mở ảnh (file, kéo thả, clipboard) thành document mới: decode an toàn trong Worker (mục 10.2),
 * thu nhỏ nếu vượt giới hạn thiết bị, ảnh vừa khít khung nhìn.
 */
export async function openImageAsProject(blob: Blob, source: 'file' | 'paste'): Promise<boolean> {
  const memory = detectMemoryConfig();
  let decoded;
  try {
    decoded = await decodeImage(
      blob,
      { maxSide: memory.maxDocumentSide, maxPixels: memory.maxDocumentPixels },
      codec(),
    );
  } catch (error) {
    if (error instanceof ImportError) {
      toast('error', t.importErrors[error.code]);
      return false;
    }
    throw error;
  }

  const name =
    source === 'paste'
      ? format(t.home.pastedName, { time: timeLabel() })
      : (nameFromFile(blob) ?? t.editor.untitled);
  try {
    const id = await createProject({
      name,
      mode: source === 'paste' ? 'screenshot' : 'paint',
      palette: await paletteOf(decoded.bitmap),
      document: {
        width: decoded.width,
        height: decoded.height,
        background: { kind: 'transparent' },
        layers: [{ kind: 'raster', name: t.layers.background, image: decoded.bitmap }],
      },
    });
    if (!id) return false;
    if (decoded.scaled) {
      toast(
        'info',
        format(t.importErrors.scaled, { width: decoded.width, height: decoded.height }),
      );
    }
    navigate({ name: 'project', projectId: id });
    return true;
  } finally {
    // Pixel đã được chép vào surface của layer.
    decoded.bitmap.close();
  }
}

/** Thông báo khi dán mà clipboard không có ảnh. */
export function notifyNoImageInClipboard(): void {
  toast(
    'info',
    format(t.importErrors.noImageInClipboard, {
      shortcut: formatShortcut('Mod+V', platformFeatures.isApple),
    }),
  );
}

/**
 * "Từ clipboard" ở trang chủ: đọc ảnh bằng Clipboard API (chỉ khi người dùng bấm — mục 10.2).
 * Trình duyệt không cho đọc thì nhắc dùng Ctrl+V.
 */
export async function pasteFromClipboardButton(): Promise<void> {
  try {
    if (typeof navigator.clipboard.read !== 'function') throw new Error('unsupported');
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((mime) => mime.startsWith('image/'));
      if (type) {
        await openImageAsProject(await item.getType(type), 'paste');
        return;
      }
    }
    notifyNoImageInClipboard();
  } catch {
    notifyNoImageInClipboard();
  }
}

/**
 * Copy ảnh đã ghép vào clipboard. Gọi ĐỒNG BỘ trong handler của thao tác người dùng (Safari yêu
 * cầu ClipboardItem tạo ngay trong gesture).
 */
export function copyProjectImage(project: OpenProject): void {
  // Ảnh đúng như đang thấy: gồm khung Làm đẹp nếu đang bật (mục 7.4: copy ảnh đã nướng hiệu ứng).
  const png = project.editor.exportImage({ type: 'image/png', beautify: true });
  copyImage(png, safeFileName(project.name, 'png')).then(
    (result) => {
      toast(
        result === 'copied' ? 'success' : 'info',
        result === 'copied' ? t.actions.copied : t.actions.copyDownloaded,
      );
    },
    () => {
      toast('error', t.actions.exportFailed);
    },
  );
}

/** "Tải xuống" của chế độ Screenshot (mục 7.3): PNG đúng như đang thấy, không qua hộp thoại. */
export async function downloadProjectImage(project: OpenProject): Promise<void> {
  try {
    const blob = await project.editor.exportImage({ type: 'image/png', beautify: true });
    const file = safeFileName(project.name, 'png');
    downloadBlob(blob, file);
    toast('success', format(t.actions.exported, { file }));
  } catch {
    toast('error', t.actions.exportFailed);
  }
}

/** Mã hóa ảnh theo tùy chọn của hộp thoại Export (dùng cả cho xem trước và ước lượng dung lượng). */
export function renderExport(project: OpenProject, options: ImageExportOptions): Promise<Blob> {
  return exportComposite(project.editor, options, codec());
}

/** Tải ảnh đã mã hóa về máy. */
export function downloadExport(
  project: OpenProject,
  blob: Blob,
  options: ImageExportOptions,
): void {
  const file = safeFileName(project.name, EXPORT_EXTENSION[options.format]);
  downloadBlob(blob, file);
  toast('success', format(t.actions.exported, { file }));
}

// ---------------------------------------------------------------------------
// File .paint (mục 6.5)
// ---------------------------------------------------------------------------

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** Dữ liệu project lấy thẳng từ Editor (bản mới nhất trong tab, kể cả khi không có IndexedDB). */
async function bundleFromEditor(project: OpenProject): Promise<ProjectBundle> {
  const { editor } = project;
  if (!editor.prepareForOutput()) throw new Error('Unapplied draft');
  const data = editor.serialize();
  if (!data) throw new Error('Chưa có document');
  const captures = editor.captureLayers(new Map());
  const thumbnailBitmap = editor.renderThumbnail(320);
  const layers: EncodedLayer[] = await Promise.all(
    captures.map(async (capture) => ({
      layerId: capture.layerId,
      contentRev: capture.contentRev,
      bounds: capture.bounds,
      png: await codec().encodeLayer(await capture.bitmap),
    })),
  );
  const thumbnailBlob = await codec()
    .encode(await thumbnailBitmap, { type: 'image/png' })
    .catch(() => null);
  const thumbnail = thumbnailBlob
    ? { data: await thumbnailBlob.arrayBuffer(), type: thumbnailBlob.type }
    : null;
  return {
    meta: { name: project.name, mode: project.mode },
    document: {
      ...data,
      schemaVersion: RECORD_SCHEMA_VERSION,
      projectId: project.id,
      viewport: editor.view,
    },
    layers,
    thumbnail,
  };
}

/** Module file .paint (valibot, fflate) chỉ tải khi xuất/nhập — giữ JS khởi động nhỏ (mục 11.3). */
function projectFileModule() {
  return import('@/services/io/projectFile');
}

/**
 * Xuất .paint. Project đang mở: lấy từ Editor; project ở trang chủ: đọc bản đã lưu.
 * `bakeRedactions`: pixel dưới vùng Redact bị thay hẳn trong file (mục 10.2).
 */
export async function exportProjectFile(
  projectId: ID,
  options: { bakeRedactions: boolean; handle?: SaveFileHandle },
): Promise<boolean> {
  try {
    const open = getCurrentProject();
    const bundle =
      open?.id === projectId ? await bundleFromEditor(open) : await repo.readBundle(projectId);
    const { buildProjectFile, PAINT_EXTENSION } = await projectFileModule();
    const blob = await buildProjectFile(bundle, codec(), {
      appVersion: APP_VERSION,
      bakeRedactions: options.bakeRedactions,
    });
    if (options.handle) {
      // "Lưu ra file" (Chromium): ghi vào file đã chọn và gắn file với project cho Ctrl+S sau này.
      await writeFile(options.handle, blob);
      if (open?.id === projectId) {
        await setProjectFileLink({
          handle: options.handle,
          name: options.handle.name,
          bakeRedactions: options.bakeRedactions,
        });
      }
      if (storageReady()) await repo.markExported(projectId).catch(() => undefined);
      toast('success', format(t.fileSave.saved, { file: options.handle.name }));
      return true;
    }
    const file = safeFileName(bundle.meta.name, PAINT_EXTENSION);
    downloadBlob(blob, file);
    if (storageReady()) await repo.markExported(projectId).catch(() => undefined);
    toast('success', format(t.actions.exported, { file }));
    return true;
  } catch {
    toast('error', t.projectFile.exportFailed);
    return false;
  }
}

/**
 * "Lưu ra file .paint…" (mục 2, P2): Chromium mở hộp chọn nơi lưu ngay trong thao tác của người dùng
 * rồi hỏi về vùng che (nếu có); trình duyệt khác tải file .paint về.
 */
export function saveProjectToFile(project: OpenProject): void {
  if (!canSaveToFile()) {
    openDialog({ kind: 'paintExport', projectId: project.id });
    return;
  }
  pickPaintFile(safeFileName(project.name, 'paint'), t.fileSave.fileType).then(
    (handle) => {
      openDialog({ kind: 'paintExport', projectId: project.id, handle });
    },
    (error: unknown) => {
      if (!isPickerAbort(error)) toast('error', t.fileSave.pickFailed);
    },
  );
}

/**
 * Ctrl+S với project đã gắn file: ghi đè file .paint (sau lượt lưu vào IndexedDB). Hỏi lại quyền ghi
 * nếu trình duyệt yêu cầu (sau khi tải lại trang). Trả false nếu không ghi được.
 */
export async function saveLinkedFile(project: OpenProject): Promise<boolean> {
  const link = project.fileLink;
  if (!link) return false;
  const handle = link.handle as SaveFileHandle;
  try {
    if (!(await ensureWritable(handle))) {
      toast('error', format(t.fileSave.permissionDenied, { file: link.name }));
      return false;
    }
    const { buildProjectFile } = await projectFileModule();
    const blob = await buildProjectFile(await bundleFromEditor(project), codec(), {
      appVersion: APP_VERSION,
      bakeRedactions: link.bakeRedactions,
    });
    await writeFile(handle, blob);
    if (storageReady()) await repo.markExported(project.id).catch(() => undefined);
    toast('success', format(t.fileSave.saved, { file: link.name }));
    return true;
  } catch {
    toast('error', format(t.fileSave.writeFailed, { file: link.name }));
    return false;
  }
}

/** Đếm vùng Redact trong project (hiện cảnh báo trước khi xuất .paint). */
export async function redactionCount(projectId: ID): Promise<number> {
  const open = getCurrentProject();
  const layers =
    open?.id === projectId
      ? (open.editor.serialize()?.layers ?? [])
      : (await repo.loadProject(projectId)).document.layers;
  let count = 0;
  for (const layer of layers) {
    if (layer.kind === 'vector') count += layer.objects.filter((o) => o.type === 'redact').length;
  }
  return count;
}

/** Nhập file .paint thành project mới (luôn có id mới để không ghi đè project đang có). */
export async function importProjectFile(file: Blob): Promise<boolean> {
  await initStorage();
  if (!storageReady()) {
    toast('error', t.storage.unavailableImport);
    return false;
  }
  const { readProjectFile, ProjectFileError } = await projectFileModule();
  try {
    const imported = await readProjectFile(file, codec());
    const id = crypto.randomUUID();
    await repo.createProject(id, {
      ...imported,
      document: { ...imported.document, projectId: id },
    });
    toast('success', format(t.projectFile.imported, { name: imported.meta.name }));
    navigate({ name: 'project', projectId: id });
    return true;
  } catch (error) {
    if (error instanceof ProjectFileError) {
      toast('error', t.projectFile.errors[error.code]);
    } else if (isQuotaError(error)) {
      toast('error', t.storage.quotaImport);
    } else {
      toast('error', t.projectFile.errors.corrupt);
    }
    return false;
  }
}
