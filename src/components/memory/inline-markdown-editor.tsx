"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

/* ── types ────────────────────────────────────────── */

type Props = {
  /** The markdown source string */
  content: string;
  /** Called with the new markdown string when content changes (debounced) */
  onContentChange: (markdown: string) => void;
  /** Called once on blur */
  onBlur?: () => void;
  /** Called on Cmd+S — receives current markdown */
  onSave?: (markdown: string) => void;
  /** Extra classes for the container */
  className?: string;
  /** Placeholder when content is empty */
  placeholder?: string;
  /** Initial panel mode */
  defaultMode?: "preview" | "edit";
  /** Line number to scroll to (finds nearest heading at/before this line) */
  scrollToLine?: number | null;
};

/* ── Simple markdown renderer ──────────────────────── */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/** Minimal markdown → HTML for preview mode. Avoids heavy react-markdown dependency. */
function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let inList = false;
  let inCodeBlock = false;
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code fences
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        html.push(`<pre class="my-3 overflow-x-auto rounded-lg bg-mc-bg-tertiary p-3 text-xs text-mc-text-secondary"><code>${codeLines.map(esc).join("\n")}</code></pre>`);
        codeLines = [];
        inCodeBlock = false;
      } else {
        if (inList) { html.push("</ul>"); inList = false; }
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Headings
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    if (h1) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h1 id="${slugify(h1[1])}" class="mb-3 mt-6 text-base font-semibold text-mc-text first:mt-0">${inlineFormat(h1[1])}</h1>`);
      continue;
    }
    if (h2) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h2 id="${slugify(h2[1])}" class="mb-2 mt-5 text-sm font-semibold text-mc-accent-purple first:mt-0">${inlineFormat(h2[1])}</h2>`);
      continue;
    }
    if (h3) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<h3 id="${slugify(h3[1])}" class="mb-2 mt-4 text-sm font-semibold text-mc-text first:mt-0">${inlineFormat(h3[1])}</h3>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push(`<hr class="my-4 border-mc-border" />`);
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(line)) {
      if (!inList) { html.push(`<ul class="my-2 list-inside list-disc space-y-1 pl-4 text-mc-text-secondary">`); inList = true; }
      html.push(`<li class="text-sm text-mc-text-secondary">${inlineFormat(line.replace(/^[-*] /, ""))}</li>`);
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      if (inList) { html.push("</ul>"); inList = false; }
      continue;
    }

    // Paragraph
    if (inList) { html.push("</ul>"); inList = false; }
    html.push(`<p class="mb-2 text-sm leading-relaxed text-mc-text-secondary">${inlineFormat(line)}</p>`);
  }

  if (inList) html.push("</ul>");
  if (inCodeBlock) {
    html.push(`<pre class="my-3 overflow-x-auto rounded-lg bg-mc-bg-tertiary p-3 text-xs text-mc-text-secondary"><code>${codeLines.map(esc).join("\n")}</code></pre>`);
  }

  return html.join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineFormat(text: string): string {
  let r = esc(text);
  // Bold
  r = r.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-mc-text">$1</strong>');
  // Italic
  r = r.replace(/\*(.+?)\*/g, '<em class="italic text-mc-text-secondary">$1</em>');
  // Inline code
  r = r.replace(/`([^`]+)`/g, '<code class="rounded bg-mc-bg-tertiary px-1.5 py-0.5 font-mono text-xs text-mc-text">$1</code>');
  // Links
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="text-mc-accent hover:underline" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return r;
}

/* ── component ───────────────────────────────────── */

export function InlineMarkdownEditor({
  content,
  onContentChange,
  onBlur,
  onSave,
  className,
  placeholder = "Write your markdown here…",
  defaultMode = "preview",
  scrollToLine,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [localValue, setLocalValue] = useState(content);
  const [isEditing, setIsEditing] = useState(defaultMode === "edit");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedRef = useRef(content);

  // Sync local value when content prop changes
  useEffect(() => {
    if (content !== lastEmittedRef.current) {
      lastEmittedRef.current = content;
      queueMicrotask(() => setLocalValue(content));
    }
  }, [content]);

  useEffect(() => {
    setIsEditing(defaultMode === "edit");
  }, [defaultMode]);

  // Scroll to nearest heading at/before scrollToLine
  useEffect(() => {
    if (!scrollToLine || isEditing) return;
    const timer = setTimeout(() => {
      const container = previewRef.current;
      if (!container) return;

      const lines = localValue.split("\n");
      let bestSlug = "";
      for (let i = 0; i < Math.min(scrollToLine, lines.length); i++) {
        const match = lines[i].match(/^#{1,4}\s+(.+)/);
        if (match) bestSlug = slugify(match[1].trim());
      }

      if (bestSlug) {
        const el = container.querySelector(`#${CSS.escape(bestSlug)}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("bg-mc-accent-purple/20", "rounded", "transition-colors");
          setTimeout(() => el.classList.remove("bg-mc-accent-purple/20", "rounded", "transition-colors"), 2000);
          return;
        }
      }

      const ratio = scrollToLine / Math.max(lines.length, 1);
      container.scrollTop = ratio * container.scrollHeight;
    }, 150);
    return () => clearTimeout(timer);
  }, [scrollToLine, isEditing, localValue]);

  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  const emitChange = useCallback(
    (md: string) => {
      if (md === lastEmittedRef.current) return;
      lastEmittedRef.current = md;
      onContentChange(md);
    },
    [onContentChange]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setLocalValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => emitChange(value), 400);
    },
    [emitChange]
  );

  const handleBlur = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (lastEmittedRef.current !== localValue) {
      lastEmittedRef.current = localValue;
      onContentChange(localValue);
    }
    onBlur?.();
  }, [localValue, onContentChange, onBlur]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        textareaRef.current?.blur();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (lastEmittedRef.current !== localValue) {
          lastEmittedRef.current = localValue;
          onContentChange(localValue);
        }
        onSave?.(localValue);
      }
    },
    [localValue, onContentChange, onSave]
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col rounded-lg border border-mc-border/50 bg-mc-bg-tertiary/30 overflow-hidden",
        className
      )}
    >
      <div className="border-b border-mc-border/50 bg-mc-bg-secondary/30 px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-mc-text-secondary/70">
            {isEditing ? "Editor" : "Preview"}
          </p>
          <button
            type="button"
            onClick={() => {
              if (isEditing) textareaRef.current?.blur();
              setIsEditing((prev) => !prev);
            }}
            className="rounded-md border border-mc-border px-2 py-0.5 text-xs text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary hover:text-mc-text"
            aria-pressed={isEditing}
            aria-label={isEditing ? "Switch to preview mode" : "Switch to edit mode"}
          >
            {isEditing ? "Preview" : "Edit"}
          </button>
        </div>
      </div>

      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={true}
          className={cn(
            "h-full min-h-0 w-full flex-1 resize-none rounded-none border-0 bg-transparent px-4 py-3 text-sm text-mc-text placeholder:text-mc-text-secondary/50",
            "focus:outline-none focus:ring-0",
            "font-mono leading-relaxed caret-mc-accent-purple"
          )}
          aria-label="Markdown editor"
        />
      ) : (
        <div ref={previewRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="h-full text-left">
            {localValue.trim() ? (
              <div
                className="prose-mc"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(localValue) }}
              />
            ) : (
              <p className="text-sm italic text-mc-text-secondary/50">Nothing to preview yet.</p>
            )}
          </div>
        </div>
      )}

      {isEditing && (
        <div className="border-t border-mc-border/50 bg-mc-bg-secondary/20 px-4 py-2 text-[11px] text-mc-text-secondary/70">
          Press <kbd className="rounded border border-mc-border bg-mc-bg-secondary px-1 py-0.5 text-[10px] font-mono text-mc-text">⌘S</kbd> to save.
        </div>
      )}
    </div>
  );
}