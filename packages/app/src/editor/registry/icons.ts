/**
 * Descriptor icon resolution — string name → lucide-react component.
 *
 * Named imports (not namespace import) so Vite's tree-shaking only ships the
 * icons actually referenced — a namespace import would bundle all ~1800
 * lucide icons and blow the bundle-size gate. New icons require adding both
 * the import below and the map entry; the registry stays React-free
 * (`packages/core/`) by carrying icons as strings.
 *
 * Shared by the slash menu and the empty-state placeholder so a single map
 * decides which icon renders for a given descriptor — adding an icon for one
 * call site automatically lights up the other.
 */
import {
  Box,
  ChevronRight,
  Image,
  type LucideIcon,
  MessageSquareWarning,
  SquarePlay,
  Volume2,
} from 'lucide-react';

const ICON_COMPONENTS: Record<string, LucideIcon> = {
  ChevronRight,
  Image,
  MessageSquareWarning,
  SquarePlay,
  Volume2,
};

/**
 * Resolve a descriptor icon name (e.g., `'MessageSquareWarning'`) to its
 * lucide-react component. Falls back to `Box` for unknown names or
 * descriptors without an icon (wildcard).
 */
export function resolveIcon(iconName: string | undefined): LucideIcon {
  if (!iconName) return Box;
  return ICON_COMPONENTS[iconName] ?? Box;
}
