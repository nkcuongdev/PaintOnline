import type { WorkerClient } from '@/engine/core/types';
import { mainThreadCodec, type ImageCodec } from './codec';
import { compressBitmap } from './ops/encode';
import { applyFilter } from './ops/filters/pipeline';
import { floodFill } from './ops/floodFill';
import { bitmapAlphaBounds, buildMask } from './ops/selection';

/**
 * WorkerClient + ImageCodec chạy ngay trên main thread — cho test và môi trường không có Worker.
 * Cùng hàm thuần với Worker nên kết quả giống hệt.
 */
export const inlineWorkerClient: WorkerClient & ImageCodec = {
  ...mainThreadCodec,
  floodFill: (request) => Promise.resolve(floodFill(request)),
  compressPixels: (bitmap) => compressBitmap(bitmap),
  buildMask: (request) => buildMask(request),
  alphaBounds: (bitmap) => Promise.resolve(bitmapAlphaBounds(bitmap)),
  applyFilter: (request, signal) =>
    signal?.aborted
      ? Promise.reject(new DOMException('Đã hủy', 'AbortError'))
      : Promise.resolve(applyFilter(request)),
};
