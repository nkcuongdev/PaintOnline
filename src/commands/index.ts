import { editCommands } from './definitions/edit';
import { filterCommands } from './definitions/filters';
import { imageCommands } from './definitions/image';
import { layerCommands } from './definitions/layers';
import { toolsCommands } from './definitions/tools';
import { DISPLAY_SHORTCUTS, viewCommands } from './definitions/view';
import { allCommands, registerCommands, shortcutOf } from './registry';

export * from './registry';
export {
  fillVariant,
  focusVariant,
  rememberShapeTool,
  rememberSelectTool,
  selectVariant,
  shapeVariant,
} from './definitions/tools';

registerCommands([
  ...editCommands,
  ...viewCommands,
  ...toolsCommands,
  ...layerCommands,
  ...imageCommands,
  ...filterCommands,
]);

/** Mọi lệnh đã đăng ký (ShortcutManager, menu). */
export const COMMANDS = allCommands();

/** Phím tắt hiển thị của lệnh (tooltip, menu) — gồm cả lệnh đi qua sự kiện copy/paste. */
export function displayShortcut(id: string): string | undefined {
  return DISPLAY_SHORTCUTS[id] ?? shortcutOf(id);
}
