import {
  Box,
  ChevronRight,
  Image,
  type LucideIcon,
  MessageSquareWarning,
  Sigma,
  SquarePlay,
  Volume2,
} from 'lucide-react';

const ICON_COMPONENTS: Record<string, LucideIcon> = {
  ChevronRight,
  Image,
  MessageSquareWarning,
  Sigma,
  SquarePlay,
  Volume2,
};

export function resolveIcon(iconName: string | undefined): LucideIcon {
  if (!iconName) return Box;
  return Object.hasOwn(ICON_COMPONENTS, iconName) ? ICON_COMPONENTS[iconName] : Box;
}
