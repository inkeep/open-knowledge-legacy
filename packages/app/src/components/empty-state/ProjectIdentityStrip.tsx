import { useWorkspace } from '@/lib/use-workspace';
import { cn } from '@/lib/utils';

interface ProjectIdentityStripProps {
  readonly className?: string;
}

export function ProjectIdentityStrip({ className }: ProjectIdentityStripProps) {
  const workspace = useWorkspace();
  const desktopName =
    typeof window !== 'undefined' ? window.okDesktop?.config.projectName : undefined;

  let name: string | null = null;
  if (desktopName) {
    name = desktopName;
  } else if (workspace) {
    name = basenameOf(workspace.contentDir, workspace.pathSeparator);
  }

  if (!name) return null;

  return (
    <p
      className={cn(
        'select-none font-mono text-2xs uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      {name}
    </p>
  );
}

function basenameOf(path: string, sep: '/' | '\\'): string {
  const trimmed = path.endsWith(sep) ? path.slice(0, -1) : path;
  const idx = trimmed.lastIndexOf(sep);
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}
