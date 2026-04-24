"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  Rocket,
  TrendingUp,
  FolderOpen,
  Megaphone,
  BarChart2,
  Settings,
  Activity,
  ClipboardList,
  Reply,
  Star,
  ChevronRight,
  ChevronLeft,
  Menu,
  X,
} from "lucide-react";

type NavItem = {
  section: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  isSubItem?: boolean;
  badge?: string;
};

const navItems: NavItem[] = [
  // ── Main ──
  { section: "dashboard", label: "Dashboard", icon: LayoutGrid, href: "/" },
  { section: "autopilot", label: "Autopilot", icon: Rocket, href: "/autopilot" },
  // ── Workspace ──
  { section: "activity", label: "Activity", icon: Activity, href: "/activity" },
  { section: "projects", label: "Projects", icon: ClipboardList, href: "/projects" },
  { section: "replies", label: "Replies", icon: Reply, href: "/replies" },
  // ── Business ──
  { section: "financial", label: "Financial", icon: TrendingUp, href: "/financial" },
  { section: "advertising", label: "Advertising", icon: Megaphone, href: "/advertising" },
  { section: "funnel", label: "Funnel", icon: BarChart2, href: "/funnel" },
  { section: "documents", label: "Documents", icon: FolderOpen, href: "/documents" },
  // ── System ──
  { section: "usage", label: "Usage & Costs", icon: BarChart2, href: "/usage" },
  { section: "reviews", label: "Reviews", icon: Star, href: "/reviews" },
  { section: "settings", label: "Settings", icon: Settings, href: "/settings" },
];

const SIDEBAR_COLLAPSED_KEY = "mc_sidebar_collapsed";
const SIDEBAR_WIDTH_KEY = "mc_sidebar_width";
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 320;

function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

function SidebarNav({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();

  function deriveSection(pathname: string): string {
    if (!pathname || pathname === "/") return "dashboard";
    const first = pathname.split("/").filter(Boolean)[0] || "";
    if (first === "workspace") return "dashboard";
    if (first === "autopilot") return "autopilot";
    return first;
  }

  const section = deriveSection(pathname);

  return (
    <nav className={cn("flex flex-1 flex-col gap-0.5 overflow-y-auto pt-2", collapsed ? "px-2" : "px-3")}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = section === item.section;

        if (collapsed && item.isSubItem) return null;

        const linkClass = cn(
          "group relative flex items-center gap-2 rounded-md py-1.5 text-xs font-medium transition-colors duration-150",
          collapsed ? "justify-center px-2" : "px-2.5",
          item.isSubItem && !collapsed && "ml-6 py-1",
          isActive
            ? "bg-mc-bg-tertiary text-mc-text font-semibold"
            : "text-mc-text-secondary hover:bg-mc-bg-tertiary hover:text-mc-text"
        );

        return (
          <div key={`${item.section}:${item.label}`}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={linkClass}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="shrink-0 rounded-full bg-mc-accent/20 px-1.5 py-0.5 text-xs font-bold text-mc-accent">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
    const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(raw) && raw > 0 ? clampSidebarWidth(raw) : SIDEBAR_DEFAULT_WIDTH;
  });
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  useEffect(() => {
    if (collapsed) return;
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth, collapsed]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const active = resizeStateRef.current;
      if (!active) return;
      const nextWidth = clampSidebarWidth(active.startWidth + (event.clientX - active.startX));
      setSidebarWidth(nextWidth);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    };

    const handlePointerUp = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const startResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (collapsed) return;
    resizeStateRef.current = { startX: event.clientX, startWidth: sidebarWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [collapsed, sidebarWidth]);

  const expandedWidthStyle = collapsed
    ? undefined
    : {
        width: `${sidebarWidth}px`,
        minWidth: `${sidebarWidth}px`,
      };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-lg border border-mc-border bg-mc-bg-secondary text-mc-text shadow-md md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        style={expandedWidthStyle}
        className={cn(
          "relative flex h-full shrink-0 flex-col transition-[width,transform] duration-200 ease-in-out",
          "border-r border-mc-border bg-mc-bg-secondary",
          collapsed ? "w-14 md:w-14" : "w-60 md:w-60",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:shadow-2xl",
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"
        )}
      >
        {/* Mobile close */}
        <div className={cn("flex items-center pt-3 md:hidden", collapsed ? "justify-center px-2" : "justify-end px-3")}>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-1.5 text-mc-text-secondary hover:text-mc-text"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Logo / branding */}
        <div className={cn("shrink-0", collapsed ? "px-2 pb-2 pt-3" : "px-3 pb-3 pt-3")}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-mc-bg-tertiary text-base shadow-sm ring-1 ring-mc-border">
                🦞
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-mc-bg-tertiary text-base shadow-sm ring-1 ring-mc-border">
                  🦞
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold tracking-tight text-mc-text">
                    Mission Control
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <Suspense fallback={<div className="flex-1" />}>
          <SidebarNav onNavigate={closeMobile} collapsed={collapsed} />
        </Suspense>

        {/* Collapse / expand toggle — desktop only */}
        <div className={cn("hidden border-t border-mc-border md:block", collapsed ? "px-2 py-2" : "px-3 py-2")}>
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              "flex w-full items-center rounded-md py-1.5 text-mc-text-secondary transition-colors duration-150 hover:bg-mc-bg-tertiary hover:text-mc-text",
              collapsed ? "justify-center px-0" : "justify-start px-2.5"
            )}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronLeft className="h-4 w-4 shrink-0" />
            )}
          </button>
        </div>

        {/* Resize handle — desktop only, only when expanded */}
        {!collapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onPointerDown={startResize}
            className="absolute inset-y-0 right-0 hidden w-2 -translate-x-1/2 cursor-col-resize md:block"
          >
            <div className="mx-auto h-full w-px bg-transparent transition-colors hover:bg-mc-border" />
          </div>
        )}
      </aside>
    </>
  );
}

export { Sidebar as AppSidebar };