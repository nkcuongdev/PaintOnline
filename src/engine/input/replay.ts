import type { Editor } from '../core/Editor';
import type { Recording } from './recorder';

export interface ReplayOptions {
  /**
   * `immediate`: phát đồng bộ, không chờ (test pixel — kết quả xác định).
   * `realtime`: giữ nhịp thời gian gốc, mỗi sự kiện chờ tới đúng mốc (benchmark frame time).
   */
  timing?: 'immediate' | 'realtime';
  /** Hệ số tốc độ cho `realtime` (2 = nhanh gấp đôi). */
  speed?: number;
  signal?: AbortSignal;
}

/** Phát lại một bản ghi input trên editor (mục 11.1). */
export async function replay(
  editor: Editor,
  recording: Recording,
  options: ReplayOptions = {},
): Promise<void> {
  const timing = options.timing ?? 'immediate';
  const speed = options.speed ?? 1;
  if (timing === 'immediate') {
    for (const event of recording.events) editor.applyRecorded(event);
    editor.flush();
    return;
  }
  const start = performance.now();
  for (const event of recording.events) {
    if (options.signal?.aborted) return;
    const due = start + event.t / speed;
    const wait = due - performance.now();
    if (wait > 1) await new Promise((resolve) => setTimeout(resolve, wait));
    editor.applyRecorded(event);
  }
}
