"use client";

import { useEffect } from "react";

/**
 * Global keyboard shortcut handler.
 * Prevents browser defaults for Cmd+S (save) and Cmd+P (print).
 */
export function KeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      // Cmd+S: prevent browser Save dialog
      if (isMod && e.key === "s") {
        e.preventDefault();
        return;
      }
      // Cmd+P: prevent print dialog
      if (isMod && e.key === "p") {
        e.preventDefault();
        return;
      }
      // Cmd+Shift+S: prevent Save-As dialog
      if (isMod && e.shiftKey && e.key === "S") {
        e.preventDefault();
        return;
      }
    };
    document.addEventListener("keydown", handler, { capture: true });
    return () => {
      document.removeEventListener("keydown", handler, { capture: true });
    };
  }, []);

  return null;
}