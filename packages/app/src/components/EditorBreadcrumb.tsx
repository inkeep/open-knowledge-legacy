import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { tabParts } from '@/editor/editor-tabs';
import { cn } from '@/lib/utils';

interface EditorBreadcrumbProps {
  docName: string | null;
  className?: string;
}

export function EditorBreadcrumb({ docName, className }: EditorBreadcrumbProps) {
  if (!docName) return null;
  const { prefix } = tabParts(docName, '');
  if (!prefix) return null;
  const segments = prefix.replace(/\/$/, '').split('/').filter(Boolean);
  if (segments.length === 0) return null;

  return (
    <Breadcrumb className={cn('flex min-w-0 items-center', className)}>
      <BreadcrumbList className="flex-nowrap gap-1 text-muted-foreground/70 text-xs">
        {segments.map((segment, index) => {
          const segmentKey = segments.slice(0, index + 1).join('/');
          return (
            <Fragment key={segmentKey}>
              {index > 0 && (
                <BreadcrumbSeparator className="text-muted-foreground/70 [&>svg]:size-3" />
              )}
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage
                  current={false}
                  className="min-w-0 truncate font-normal text-muted-foreground/70"
                  title={segment}
                >
                  {segment}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
