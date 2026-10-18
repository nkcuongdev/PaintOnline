import type { Color, OptionGroupId, ToolId, ToolOptionsMap } from '../core/types';

/**
 * Input recorder (mục 11.1): ghi chuỗi thao tác thành JSON và phát lại trên engine — dùng để tái
 * hiện bug, biến bug render thành test hồi quy và làm input chuẩn cho benchmark (mục 11.2).
 *
 * Ghi ở mức tool (tọa độ document) nên phát lại cho cùng kết quả pixel bất kể kích thước khung
 * nhìn hay zoom.
 */

export interface RecordedPointer {
  t: number;
  type: 'down' | 'move' | 'up';
  x: number;
  y: number;
  pressure: number;
  /** Các điểm coalesced [x, y, pressure] (không gồm điểm chính khi chỉ có một). */
  points?: [number, number, number][];
  button: number;
  pointerType: 'mouse' | 'pen' | 'touch';
  shiftKey?: boolean;
  altKey?: boolean;
}

export type RecordedEvent =
  | RecordedPointer
  | { t: number; type: 'cancel' }
  | { t: number; type: 'tool'; tool: ToolId }
  | {
      t: number;
      type: 'options';
      group: OptionGroupId;
      options: Partial<ToolOptionsMap[OptionGroupId]>;
    }
  | { t: number; type: 'colors'; primary: Color; secondary: Color }
  | { t: number; type: 'undo' }
  | { t: number; type: 'redo' };

export interface Recording {
  format: 'paint-online-input';
  version: 1;
  document: { width: number; height: number };
  events: RecordedEvent[];
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export class InputRecorder {
  private events: RecordedEvent[] = [];
  private start = 0;

  constructor(private readonly document: { width: number; height: number }) {
    this.start = performance.now();
  }

  record(event: DistributiveOmit<RecordedEvent, 't'>): void {
    this.events.push({ ...event, t: Math.round((performance.now() - this.start) * 10) / 10 });
  }

  get length(): number {
    return this.events.length;
  }

  finish(): Recording {
    return {
      format: 'paint-online-input',
      version: 1,
      document: { ...this.document },
      events: this.events,
    };
  }
}

export function isRecording(value: unknown): value is Recording {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Partial<Recording>;
  return r.format === 'paint-online-input' && r.version === 1 && Array.isArray(r.events);
}
