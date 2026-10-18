/**
 * Tải file về máy qua <a download> — không mở cửa sổ mới (mục 7.9). Blob URL được thu hồi ngay
 * sau khi dùng (mục 10.2).
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  // Một số trình duyệt bắt đầu tải bất đồng bộ — thu hồi ở lượt kế tiếp.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

/** Tên file an toàn cho mọi hệ điều hành, giữ dấu tiếng Việt. */
export function safeFileName(name: string, extension: string): string {
  const base = name
    .normalize('NFC')
    // Ký tự cấm trong tên file của Windows/macOS và ký tự điều khiển.
    // eslint-disable-next-line no-control-regex -- cố ý loại ký tự điều khiển
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 100);
  return `${base || 'paint-online'}.${extension}`;
}
