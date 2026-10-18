/**
 * Kênh liên lạc giữa các tab cùng origin (mục 10.1): đồng bộ danh sách project và trao quyền
 * chỉnh sửa project giữa các tab. BroadcastChannel không gửi lại cho chính tab phát.
 */
export type ChannelMessage =
  | { type: 'projects-changed'; projectId: string | null }
  /** Tab khác xin quyền chỉnh sửa project. */
  | { type: 'takeover-request'; projectId: string; from: string }
  /** Tab giữ khóa đã lưu xong và nhả khóa. */
  | { type: 'takeover-released'; projectId: string; to: string }
  /** Fallback khi không có Web Locks: hỏi/đáp ai đang giữ project. */
  | { type: 'lock-probe'; projectId: string; from: string }
  | { type: 'lock-held'; projectId: string; to: string }
  /** Dung lượng vừa được giải phóng (dọn thùng rác, xóa project) — autosave thử lại. */
  | { type: 'storage-freed' };

const CHANNEL_NAME = 'paint-online';

/** Id của tab hiện tại (trong phiên trang). */
export const TAB_ID = crypto.randomUUID();

type Listener = (message: ChannelMessage) => void;

const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;

function ensureChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') return null;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (typeof message !== 'object' || message === null || !('type' in message)) return;
    for (const listener of listeners) listener(message as ChannelMessage);
  };
  return channel;
}

/** Gửi cho các tab khác; `local` = phát cả cho listener trong tab này. */
export function broadcast(message: ChannelMessage, options: { local?: boolean } = {}): void {
  ensureChannel()?.postMessage(message);
  if (options.local) for (const listener of listeners) listener(message);
}

export function onChannelMessage(listener: Listener): () => void {
  ensureChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
