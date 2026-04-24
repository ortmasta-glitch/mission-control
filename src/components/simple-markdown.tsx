"use client";

import { cn } from "@/lib/utils";

/**
 * Lightweight markdown renderer for chat messages.
 * Handles: paragraphs, headers, bold, italic, inline code, code blocks,
 * links, lists (ul/ol), blockquotes, horizontal rules, tables.
 *
 * This is a placeholder until react-markdown + remark-gfm are installed.
 * When those packages are added, replace usage in ChatView.tsx with:
 *   import ReactMarkdown from "react-markdown";
 *   import remarkGfm from "remark-gfm";
 */

interface SimpleMarkdownProps {
  children: string;
  className?: string;
}

// ── Tiny markdown-to-HTML converter ──────────────

function mdToHtml(md: string): string {
  if (!md?.trim()) return "";

  let html = md;

  // Code blocks (fenced) — protect first
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="my-2 overflow-x-auto rounded-lg bg-mc-bg-tertiary p-3 text-xs leading-relaxed"><code${lang ? ` class="language-${lang}"` : ""}>${escHtml(code.trimEnd())}</code></pre>`
    );
    return `\x00CODEBLOCK${idx}\x00`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-mc-bg-tertiary px-1.5 py-0.5 font-mono text-xs text-mc-text-secondary">$1</code>');

  // Headers (must come before paragraph handling)
  html = html.replace(/^#### (.+)$/gm, '<h4 class="mb-1 mt-2 text-xs font-medium first:mt-0">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="mb-1.5 mt-2 text-xs font-medium first:mt-0">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="mb-2 mt-3 text-xs font-semibold first:mt-0">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="mb-2 mt-3 text-xs font-semibold first:mt-0">$1</h1>');

  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em class="italic opacity-90">$1</em>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="my-2 border-l-2 border-mc-accent-cyan/60 pl-3 text-xs italic opacity-90">$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="my-3 border-mc-border/30" />');

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-mc-accent-cyan underline decoration-mc-accent-cyan/50 hover:text-mc-accent-cyan/80">$1</a>'
  );

  // Unordered lists
  html = html.replace(/^[\-\*] (.+)$/gm, '<li class="text-xs">$1</li>');
  html = html.replace(/((?:<li class="text-xs">.*<\/li>\n?)+)/g, '<ul class="my-2 list-inside list-disc space-y-0.5 text-xs">$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="text-xs">$1</li>');

  // Paragraphs — wrap remaining text blocks
  const lines = html.split("\n");
  const result: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inParagraph) {
        result.push("</p>");
        inParagraph = false;
      }
      continue;
    }
    // Skip lines that are already HTML blocks
    if (
      trimmed.startsWith("<h") ||
      trimmed.startsWith("<pre") ||
      trimmed.startsWith("<ul") ||
      trimmed.startsWith("<ol") ||
      trimmed.startsWith("<li") ||
      trimmed.startsWith("<blockquote") ||
      trimmed.startsWith("<hr") ||
      trimmed.startsWith("\x00")
    ) {
      if (inParagraph) {
        result.push("</p>");
        inParagraph = false;
      }
      result.push(line);
      continue;
    }
    if (trimmed.startsWith("</")) {
      result.push(line);
      continue;
    }
    if (!inParagraph) {
      result.push('<p class="mb-2 last:mb-0 leading-relaxed text-xs">');
      inParagraph = true;
    }
    result.push(line);
  }
  if (inParagraph) result.push("</p>");

  html = result.join("\n");

  // Restore code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    html = html.replace(`\x00CODEBLOCK${i}\x00`, codeBlocks[i]);
  }

  return html;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function SimpleMarkdown({ children, className }: SimpleMarkdownProps) {
  if (!children?.trim()) return null;

  const html = mdToHtml(children);

  return (
    <div
      className={cn("simple-markdown", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}