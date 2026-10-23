import type { ImageCodec } from '@/services/workers/codec';
import { MAX_LAYER_DECODES } from './decodeBudget';

let active = 0;
const queue: (() => void)[] = [];

/** Shared admission gate across open/import/sharing/checkpoint operations. Active
 * native decoders which cannot abort retain their slot until they actually settle. */
export async function decodeLayerBounded(
  codec: Pick<ImageCodec, 'decodeLayer'>,
  png: ArrayBuffer,
  signal?: AbortSignal,
): Promise<ImageData> {
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      const index = queue.indexOf(start);
      if (index >= 0) queue.splice(index, 1);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const start = () => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) {
        abort();
        return;
      }
      active++;
      resolve();
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    if (active < MAX_LAYER_DECODES) start();
    else {
      queue.push(start);
      signal?.addEventListener('abort', abort, { once: true });
    }
  });
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return await codec.decodeLayer(png, signal);
  } finally {
    active--;
    queue.shift()?.();
  }
}
