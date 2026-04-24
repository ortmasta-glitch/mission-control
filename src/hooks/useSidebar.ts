"use client";

import { useState, useCallback, useEffect, useSyncExternalStore } from "react";

// ── Storage Keys ──
const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed";
const SIDEBAR_WIDTH_KEY = "sidebar_width";
const SIDEBAR_MOBILE_OPEN_KEY = "sidebar_mobile_open";

// ── Dimensions ──
export const SIDEBAR_DEFAULT_WIDTH = 280;
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_COLLAPSED_WIDTH = 56;
export const SIDEBAR_MAX_WIDTH = 400;

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

// ── Simple external store for cross-component state ──
type Listener = () => void;

const sidebarListeners = new Set<Listener>();
let sidebarState = {
  collapsed: false,
  width: SIDEBAR_DEFAULT_WIDTH,
  mobileOpen: false,
  activeSection: "dashboard" as string | null,
  activeTab: null as string | null,
};

function emitChange() {
  sidebarListeners.forEach((l) => l());
}

function subscribe(listener: Listener) {
  sidebarListeners.add(listener);
  return () => sidebarListeners.delete(listener);
}

function getSnapshot() {
  return sidebarState;
}

function getServerSnapshot() {
  return sidebarState;
}

// ── Section Routing ──
const SECTION_ALIASES: Record<string, string> = {
  system: "dashboard",
  documents: "docs",
  memories: "memory",
  permissions: "security",
  heartbeat: "cron",
  models: "agents",
};

const KNOWN_SECTIONS = new Set([
  "dashboard",
  "chat",
  "agents",
  "tasks",
  "calendar",
  "integrations",
  "sessions",
  "cron",
  "heartbeat",
  "memory",
  "docs",
  "vectors",
  "skills",
  "accounts",
  "channels",
  "audio",
  "browser",
  "search",
  "tailscale",
  "security",
  "permissions",
  "hooks",
  "doctor",
  "usage",
  "terminal",
  "logs",
  "config",
  "settings",
  "activity",
  "help",
  "advertising",
  "funnel",
  "financial",
  "reviews",
  "replies",
  "projects",
  "autopilot",
  "workspace",
]);

export function deriveSectionFromPath(pathname: string): string | null {
  if (!pathname || pathname === "/") return null;
  // Skill detail route
  if (pathname.startsWith("/skills/")) return "skills";
  const first = pathname.split("/").filter(Boolean)[0] || "";
  if (SECTION_ALIASES[first]) return SECTION_ALIASES[first];
  return KNOWN_SECTIONS.has(first) ? first : null;
}

export function deriveTabFromPath(pathname: string): string | null {
  if (!pathname || pathname === "/") return null;
  const first = pathname.split("/").filter(Boolean)[0] || "";
  if (first === "heartbeat") return "heartbeat";
  if (first === "models") return "models";
  return null;
}

// ── Hook ──
export interface UseSidebarReturn {
  /** Whether the sidebar is collapsed (icon-only mode) */
  collapsed: boolean;
  /** Current sidebar pixel width (when expanded) */
  width: number;
  /** Whether mobile drawer is open */
  mobileOpen: boolean;
  /** Active navigation section derived from URL */
  activeSection: string | null;
  /** Active tab within a section */
  activeTab: string | null;
  /** Toggle collapsed state */
  toggleCollapsed: () => void;
  /** Set collapsed state directly */
  setCollapsed: (collapsed: boolean) => void;
  /** Set sidebar width (will be clamped) */
  setWidth: (width: number) => void;
  /** Open mobile drawer */
  openMobile: () => void;
  /** Close mobile drawer */
  closeMobile: () => void;
  /** Toggle mobile drawer */
  toggleMobile: () => void;
  /** Set active section (for navigation) */
  setActiveSection: (section: string | null) => void;
  /** Set active tab */
  setActiveTab: (tab: string | null) => void;
  /** Handle navigation event (closes mobile drawer) */
  onNavigate: () => void;
}

export function useSidebar(initialSection?: string): UseSidebarReturn {
  // Hydrate from localStorage on mount
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const savedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
      const savedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
      const clampedWidth =
        Number.isFinite(savedWidth) && savedWidth > 0
          ? clampSidebarWidth(savedWidth)
          : SIDEBAR_DEFAULT_WIDTH;

      sidebarState = {
        ...sidebarState,
        collapsed: savedCollapsed,
        width: clampedWidth,
        activeSection: initialSection ?? sidebarState.activeSection,
      };
    } catch {
      /* SSR or storage unavailable */
    }
    setHydrated(true);
    emitChange();
  }, [initialSection]);

  // Persist collapsed state
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarState.collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [hydrated, sidebarState.collapsed]);

  // Persist width
  useEffect(() => {
    if (!hydrated || sidebarState.collapsed) return;
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarState.width));
    } catch {
      /* ignore */
    }
  }, [hydrated, sidebarState.width, sidebarState.collapsed]);

  // Read from external store
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleCollapsed = useCallback(() => {
    sidebarState = { ...sidebarState, collapsed: !sidebarState.collapsed };
    emitChange();
  }, []);

  const setCollapsed = useCallback((collapsed: boolean) => {
    sidebarState = { ...sidebarState, collapsed };
    emitChange();
  }, []);

  const setWidth = useCallback((width: number) => {
    sidebarState = { ...sidebarState, width: clampSidebarWidth(width) };
    emitChange();
  }, []);

  const openMobile = useCallback(() => {
    sidebarState = { ...sidebarState, mobileOpen: true };
    emitChange();
  }, []);

  const closeMobile = useCallback(() => {
    sidebarState = { ...sidebarState, mobileOpen: false };
    emitChange();
  }, []);

  const toggleMobile = useCallback(() => {
    sidebarState = { ...sidebarState, mobileOpen: !sidebarState.mobileOpen };
    emitChange();
  }, []);

  const setActiveSection = useCallback((section: string | null) => {
    sidebarState = { ...sidebarState, activeSection: section };
    emitChange();
  }, []);

  const setActiveTab = useCallback((tab: string | null) => {
    sidebarState = { ...sidebarState, activeTab: tab };
    emitChange();
  }, []);

  const onNavigate = useCallback(() => {
    // Close mobile drawer on navigation
    if (sidebarState.mobileOpen) {
      sidebarState = { ...sidebarState, mobileOpen: false };
      emitChange();
    }
  }, []);

  return {
    collapsed: state.collapsed,
    width: state.width,
    mobileOpen: state.mobileOpen,
    activeSection: state.activeSection,
    activeTab: state.activeTab,
    toggleCollapsed,
    setCollapsed,
    setWidth,
    openMobile,
    closeMobile,
    toggleMobile,
    setActiveSection,
    setActiveTab,
    onNavigate,
  };
}