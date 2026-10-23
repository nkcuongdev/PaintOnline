import { MAX_DOCUMENT_LAYERS } from '@/engine/core/limits';

/** One PNG per raster layer plus manifest and optional thumbnail. */
export const MAX_PAINT_ENTRIES = MAX_DOCUMENT_LAYERS + 2;
export const MAX_PAINT_BYTES = 1024 * 1024 * 1024;
