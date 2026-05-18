import { ListPlus, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button.tsx';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { EditorModeValue } from '@/editor/use-editor-mode.ts';
import { EditorBreadcrumb } from './EditorBreadcrumb';
import { Markdown } from './icons/markdown';
import { Textbox } from './icons/textbox';

interface EditorToolbarProps {
  activeDocName: string | null;
  isSourceMode: boolean;
  sourceDisabled: boolean;
  onModeChange: (mode: EditorModeValue) => void;
  showAddPropertyButton: boolean;
  onAddProperty: () => void;
  isPanelCollapsed: boolean;
  onTogglePanel: () => void;
}

export function EditorToolbar({
  activeDocName,
  isSourceMode,
  sourceDisabled,
  onModeChange,
  showAddPropertyButton,
  onAddProperty,
  isPanelCollapsed,
  onTogglePanel,
}: EditorToolbarProps) {
  return (
    <div data-testid="editor-toolbar" className="pointer-events-none absolute inset-x-0 top-0 z-10">
      {/*
        Outer wrapper mirrors the editor's content-column grid so the inner
        3-col layout aligns with the WYSIWYG content area. Without this, the
        previous `px-2` on the inner grid pushed the breadcrumb cell ~8px
        right of the editor's first text block. Cells inside `.editor-content-aligned`
        land on the `content` column automatically via the `> *` rule.
      */}
      <div className="editor-content-aligned bg-background py-2">
        <div className="grid grid-cols-3 items-center">
          {/*
          Breadcrumb cell. The parent grid is `pointer-events-none` so the
          editor canvas underneath remains clickable through the toolbar's
          empty regions; this cell must scope its own `pointer-events-auto`
          so the breadcrumb's per-segment `title` tooltips actually surface.
          Future siblings dropped into this cell must follow the same rule.
        */}
          <div className="pointer-events-auto flex min-w-0 items-end self-end">
            <EditorBreadcrumb docName={activeDocName} />
          </div>
          <div className="pointer-events-auto flex justify-center">
            <ToggleGroup
              type="single"
              value={isSourceMode ? 'source' : 'wysiwyg'}
              onValueChange={(v: EditorModeValue | '') => {
                if (v) onModeChange(v);
              }}
              aria-label="Editor mode"
              variant="segmented"
              size="sm"
              spacing={1}
              className="shrink-0 data-[size=sm]:rounded-[10px] bg-muted p-0.5"
            >
              <Tooltip>
                <ToggleGroupItem
                  value="wysiwyg"
                  aria-label="Visual editor"
                  className="size-7 px-0 dark:data-[state=on]:bg-foreground/15"
                  asChild
                >
                  <TooltipTrigger>
                    <Textbox className="size-4" />
                  </TooltipTrigger>
                </ToggleGroupItem>
                <TooltipContent side="bottom">Visual</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Disabled <button> doesn't fire pointer events; wrap so the tooltip still triggers. */}
                  <div>
                    <ToggleGroupItem
                      value="source"
                      aria-label="Markdown source"
                      disabled={sourceDisabled}
                      className="size-7 px-0 dark:data-[state=on]:bg-foreground/15"
                    >
                      <Markdown className="size-4" />
                    </ToggleGroupItem>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {sourceDisabled
                    ? 'Source mode requires a live connection — your edits are saved and will appear when you reconnect.'
                    : 'Markdown'}
                </TooltipContent>
              </Tooltip>
            </ToggleGroup>
          </div>
          <div className="pointer-events-auto flex items-center justify-end gap-1">
            {showAddPropertyButton && (
              <Tooltip>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Add properties"
                  onClick={onAddProperty}
                  data-testid="add-properties-button"
                  asChild
                >
                  <TooltipTrigger>
                    <ListPlus />
                  </TooltipTrigger>
                </Button>
                <TooltipContent side="bottom">Add properties</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <Button
                variant="ghost"
                size="icon"
                onClick={onTogglePanel}
                aria-expanded={!isPanelCollapsed}
                aria-label={isPanelCollapsed ? 'Show panel' : 'Hide panel'}
                asChild
              >
                <TooltipTrigger>
                  {isPanelCollapsed ? <PanelRightOpen /> : <PanelRightClose />}
                </TooltipTrigger>
              </Button>
              <TooltipContent side="bottom">
                {isPanelCollapsed ? 'Show panel' : 'Hide panel'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none h-2 bg-linear-to-b from-background to-transparent"
      />
    </div>
  );
}
