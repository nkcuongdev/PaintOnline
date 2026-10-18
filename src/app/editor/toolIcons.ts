import {
  Blend,
  Brush,
  Circle,
  CircleDashed,
  Crop,
  Lasso,
  SquareDashed,
  WandSparkles,
  Eraser,
  EyeOff,
  Focus,
  Hand,
  Highlighter,
  ListOrdered,
  MousePointer2,
  MoveUpRight,
  PaintBucket,
  Pencil,
  Pentagon,
  Pipette,
  ScanSearch,
  Slash,
  Square,
  Type,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react';
import type { ToolId } from '@/engine/core/types';
import { t } from '@/i18n';

/** Icon lucide theo tên icon trong ToolDefinition (mục 5.3: UI sinh từ định nghĩa tool). */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  select: MousePointer2,
  'marquee-rect': SquareDashed,
  'marquee-ellipse': CircleDashed,
  lasso: Lasso,
  wand: WandSparkles,
  crop: Crop,
  pencil: Pencil,
  brush: Brush,
  eraser: Eraser,
  bucket: PaintBucket,
  gradient: Blend,
  eyedropper: Pipette,
  rect: Square,
  ellipse: Circle,
  line: Slash,
  arrow: MoveUpRight,
  polygon: Pentagon,
  text: Type,
  highlight: Highlighter,
  redact: EyeOff,
  step: ListOrdered,
  spotlight: Focus,
  magnifier: ScanSearch,
  hand: Hand,
  zoom: ZoomIn,
};

export function toolIcon(name: string): LucideIcon {
  return ICONS[name] ?? Brush;
}

export function toolLabel(id: ToolId): string {
  return t.tools[id];
}
