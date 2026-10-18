import { navigate } from '@/app/router';
import { formatShortcut } from '@/app/shared/shortcut';
import { codec, initStorage, repo, storageReady } from '@/app/storage';
import type { ID } from '@/engine/core/types';
import { format, t } from '@/i18n';
import { copyImage } from '@/services/io/clipboard';
import { downloadBlob, safeFileName } from '@/services/io/download';
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
import { toast } from '@/stores/ui';
import { createProject, getCurrentProject, type OpenProject } from './session';

/**
 * Các thao tác cấp ứng dụng nối UI với Engine và services: tạo/mở ảnh, copy, export ảnh,
 * xuất/nhập .paint. Được gọi từ Command Registry, nút và trang chủ.
 */

declare const __APP_VERSION__: string;

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
  options: { bakeRedactions: boolean },
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
