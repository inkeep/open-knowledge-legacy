import type { Editor } from '@tiptap/react';
import { CornerDownLeft, ExternalLink, Link, Trash2 } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function LinkEditPopover({ editor }: { editor: Editor }) {
  const [showInput, setShowInput] = useState(false);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isLinkActive = editor.isActive('link');
  const currentUrl = editor.getAttributes('link').href ?? '';

  // Reset link input when selection collapses (bubble menu hides)
  useEffect(() => {
    function onSelectionUpdate() {
      if (editor.state.selection.empty) {
        setShowInput(false);
      }
    }
    editor.on('selectionUpdate', onSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', onSelectionUpdate);
    };
  }, [editor]);

  useEffect(() => {
    if (showInput) {
      setUrl(currentUrl);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [showInput, currentUrl]);

  function applyLink() {
    if (url.trim()) {
      editor.chain().focus().setLink({ href: url.trim() }).run();
    } else if (isLinkActive) {
      editor.chain().focus().unsetLink().run();
    }
    setShowInput(false);
  }

  function removeLink() {
    editor.chain().focus().unsetLink().run();
    setShowInput(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyLink();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowInput(false);
      editor.chain().focus().run();
    }
  }

  if (showInput) {
    return (
      <div className="flex items-center gap-0.5">
        <div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
          <input
            ref={inputRef}
            type="url"
            placeholder="Paste link..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Link URL"
            className="h-5 w-44 bg-transparent text-sm border-none outline-none placeholder:text-muted-foreground"
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Apply link"
            onClick={() => {
              applyLink();
            }}
          >
            <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </div>
        {isLinkActive && (
          <>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Open link in new tab"
              onMouseDown={(e) => {
                e.preventDefault();
                window.open(currentUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <ExternalLink className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Remove link"
              onMouseDown={(e) => {
                e.preventDefault();
                removeLink();
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Insert link"
          className={isLinkActive ? 'bg-accent text-primary' : 'text-accent-foreground'}
          onMouseDown={(e) => {
            e.preventDefault();
            setShowInput(true);
          }}
        >
          <Link className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        Link
        <kbd className="ml-1.5 text-[10px] opacity-60">⌘K</kbd>
      </TooltipContent>
    </Tooltip>
  );
}
