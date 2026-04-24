"use client";

import { Suspense } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * AppShell provides the main layout structure:
 * - Collapsible sidebar on the left
 * - Header bar on top of the content area
 * - Scrollable main content area
 *
 * This replaces the previous layout where agents sidebar was on the left
 * and the header was a standalone bar. The new shell mirrors the reference
 * MC project's layout.tsx structure: flex h-screen with sidebar + content.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-mc-bg text-mc-text">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex flex-1 overflow-hidden bg-mc-bg">
          {children}
        </main>
      </div>
    </div>
  );
}