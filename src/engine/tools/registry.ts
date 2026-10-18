import type { ToolId } from '../core/types';
import { brushTool, eraserTool } from './brush/brush';
import { bucketTool } from './bucket';
import { cropTool } from './crop';
import { eyedropperTool } from './eyedropper';
import { gradientTool } from './gradient';
import { selectTool, textTool } from './objects/selectText';
import {
  arrowTool,
  ellipseTool,
  highlightTool,
  lineTool,
  magnifierTool,
  polygonTool,
  rectTool,
  redactTool,
  spotlightTool,
  stepTool,
} from './objects/shapes';
import { pencilTool } from './pencil';
import { lassoTool, marqueeEllipseTool, marqueeRectTool, wandTool } from './selection';
import type { ToolDefinition } from './types';
import { panTool, zoomTool } from './view';

/**
 * Registry tool (mục 5.3): thêm tool mới = thêm 1 file + 1 dòng ở đây. UI (tool island, Options
 * bar, tooltip, phím tắt) sinh từ định nghĩa này.
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  selectTool,
  marqueeRectTool,
  marqueeEllipseTool,
  lassoTool,
  wandTool,
  cropTool,
  pencilTool,
  brushTool,
  eraserTool,
  bucketTool,
  gradientTool,
  eyedropperTool,
  rectTool,
  ellipseTool,
  lineTool,
  arrowTool,
  polygonTool,
  textTool,
  highlightTool,
  redactTool,
  stepTool,
  spotlightTool,
  magnifierTool,
  panTool,
  zoomTool,
];

/** Các tool hình khối dùng chung phím U (nhớ tool hình dùng gần nhất — mục 7.7). */
export const SHAPE_TOOLS: readonly ToolId[] = ['rect', 'ellipse', 'line', 'polygon'];

/** Biến thể của tool Chọn (nút tách trên tool island — mục 7.2); phím M chọn Marquee dùng gần nhất. */
export const SELECT_TOOLS: readonly ToolId[] = [
  'select',
  'marquee-rect',
  'marquee-ellipse',
  'lasso',
  'wand',
];

export const MARQUEE_TOOLS: readonly ToolId[] = ['marquee-rect', 'marquee-ellipse'];

/** Làm nổi bật (nút tách trên tool island chế độ Paint): Spotlight, Phóng to vùng. */
export const FOCUS_TOOLS: readonly ToolId[] = ['spotlight', 'magnifier'];

/** Nhóm tô (nút tách trên tool island): phím G chọn kiểu dùng gần nhất, nhấn lại để đổi. */
export const FILL_TOOLS: readonly ToolId[] = ['bucket', 'gradient'];

/**
 * Tool island rút gọn của chế độ Screenshot (mục 7.3): Arrow, Rectangle, Highlight, Text, Redact,
 * Step, Spotlight, Crop — thêm Chọn (sửa/xóa đối tượng) và Magnifier (P2).
 */
export const SCREENSHOT_TOOLS: readonly ToolId[] = [
  'select',
  'arrow',
  'rect',
  'highlight',
  'text',
  'redact',
  'step',
  'spotlight',
  'magnifier',
  'crop',
];

export function getToolDefinition(id: ToolId): ToolDefinition {
  const def = TOOL_DEFINITIONS.find((d) => d.id === id);
  if (!def) throw new Error(`Không có tool "${id}"`);
  return def;
}
