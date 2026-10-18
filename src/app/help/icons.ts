import {
  AlignHorizontalJustifyCenter,
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  BookOpen,
  Brush,
  Camera,
  ChevronDown,
  CircleHelp,
  ClipboardPaste,
  Command,
  Copy,
  CopyPlus,
  Crop,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  FileArchive,
  FlipHorizontal2,
  FolderOpen,
  Gauge,
  Grid3x3,
  HardDriveDownload,
  History,
  Image,
  Keyboard,
  Layers,
  Lightbulb,
  Lock,
  LockOpen,
  Magnet,
  Maximize,
  Monitor,
  Moon,
  MousePointer2,
  MousePointerClick,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  RotateCw,
  Rocket,
  Route,
  Ruler,
  Save,
  Scaling,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  Stamp,
  Sun,
  Trash2,
  TriangleAlert,
  Undo2,
  Wand2,
  WifiOff,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { toolIcon } from '@/app/editor/toolIcons';
import type { ToolId } from '@/engine/core/types';
import { TOOL_DEFINITIONS } from '@/engine/tools/registry';

/**
 * Icon dùng trong bài hướng dẫn (`{icon:ten}`, icon của bài và chủ đề) — cùng bộ lucide với giao
 * diện app để người đọc nhận ra đúng nút. Tên công cụ dùng `{tool:…}` thay vì icon.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  align: AlignHorizontalJustifyCenter,
  archive: Archive,
  back: ArrowLeft,
  book: BookOpen,
  brush: Brush,
  camera: Camera,
  chevron: ChevronDown,
  clipboard: ClipboardPaste,
  close: PanelRightClose,
  command: Command,
  copy: Copy,
  crop: Crop,
  download: Download,
  duplicate: CopyPlus,
  eye: Eye,
  'eye-off': EyeOff,
  'file-paint': FileArchive,
  flip: FlipHorizontal2,
  folder: FolderOpen,
  gauge: Gauge,
  grid: Grid3x3,
  'hard-drive': HardDriveDownload,
  help: CircleHelp,
  history: History,
  image: Image,
  keyboard: Keyboard,
  layers: Layers,
  lightbulb: Lightbulb,
  lock: Lock,
  unlock: LockOpen,
  magnet: Magnet,
  'merge-down': ArrowDownToLine,
  maximize: Maximize,
  monitor: Monitor,
  moon: Moon,
  more: Ellipsis,
  pointer: MousePointer2,
  click: MousePointerClick,
  palette: Palette,
  panel: PanelRightOpen,
  plus: Plus,
  redo: Redo2,
  rocket: Rocket,
  rotate: RotateCw,
  route: Route,
  ruler: Ruler,
  save: Save,
  scale: Scaling,
  search: Search,
  selection: SquareDashed,
  settings: Settings,
  shield: ShieldCheck,
  sliders: SlidersHorizontal,
  sparkles: Sparkles,
  stamp: Stamp,
  sun: Sun,
  trash: Trash2,
  undo: Undo2,
  wand: Wand2,
  warning: TriangleAlert,
  offline: WifiOff,
  wrench: Wrench,
};

/** Icon của công cụ (cùng icon với tool island). */
export function toolIconOf(id: ToolId): LucideIcon {
  return toolIcon(TOOL_DEFINITIONS.find((d) => d.id === id)?.icon ?? id);
}

function toolOf(name: string): ToolId | null {
  if (!name.startsWith('tool-')) return null;
  const id = name.slice(5);
  return TOOL_DEFINITIONS.find((d) => d.id === id)?.id ?? null;
}

export function hasHelpIcon(name: string): boolean {
  return name in ICONS || toolOf(name) !== null;
}

/** Icon theo tên; `tool-<id>` dùng icon của công cụ. */
export function helpIcon(name: string): LucideIcon {
  const tool = toolOf(name);
  if (tool) return toolIconOf(tool);
  return ICONS[name] ?? BookOpen;
}
