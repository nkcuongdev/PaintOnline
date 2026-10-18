import { getCurrentProject } from '@/app/editor/session';
import { isRecording, type Recording } from '@/engine/input/recorder';
import { replay } from '@/engine/input/replay';
import { downloadBlob } from '@/services/io/download';

/**
 * Công cụ dev (chỉ có trong bản dev — mục 11.1, 11.3), gọi từ DevTools console:
 *
 *   __paint.record()            bắt đầu ghi input của project đang mở
 *   __paint.stop()              dừng, tải file JSON bản ghi
 *   __paint.replay(json)        phát lại bản ghi (tốc độ thật) trên project đang mở
 *   __paint.memory()            số canvas đang sống và bộ nhớ ước lượng
 *   __paint.editor()            Editor của project đang mở (gỡ lỗi)
 *
 * Bản ghi dùng để tái hiện bug và làm test hồi quy / input chuẩn cho benchmark (tests/bench).
 */
interface PaintDevtools {
  record(): void;
  stop(): Recording | null;
  replay(recording: unknown, options?: { speed?: number }): Promise<void>;
  memory(): unknown;
  editor(): unknown;
}

function editor() {
  const project = getCurrentProject();
  if (!project) throw new Error('Chưa mở project nào');
  return project.editor;
}

export function installDevtools(): void {
  const api: PaintDevtools = {
    record() {
      editor().startRecording();
      console.info('[Paint Online] Đang ghi input… gọi __paint.stop() để dừng.');
    },
    stop() {
      const recording = editor().stopRecording();
      if (recording) {
        const json = JSON.stringify(recording);
        downloadBlob(
          new Blob([json], { type: 'application/json' }),
          `input-${String(Date.now())}.json`,
        );
        console.info(`[Paint Online] Đã ghi ${String(recording.events.length)} sự kiện.`);
      }
      return recording;
    },
    async replay(recording, options = {}) {
      const data: unknown = typeof recording === 'string' ? JSON.parse(recording) : recording;
      if (!isRecording(data)) throw new Error('Không phải bản ghi input của Paint Online');
      await replay(editor(), data, { timing: 'realtime', speed: options.speed });
    },
    memory() {
      const usage = editor().memory.usage();
      const mb = (n: number) => `${(n / 1024 ** 2).toFixed(1)} MB`;
      const table = Object.fromEntries(
        Object.entries(usage.byCategory).map(([k, v]) => [k, mb(v)]),
      );
      console.table({ ...table, total: mb(usage.usedBytes), canvases: usage.liveSurfaces });
      return usage;
    },
    editor,
  };
  (window as unknown as { __paint: PaintDevtools }).__paint = api;
}
