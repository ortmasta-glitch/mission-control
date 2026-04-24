"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// ── Types ──
export interface NavItemData {
  /** Logical section identifier (used for active-state matching) */
  section: string;
  /** Display label */
  label: string;
  /** Icon component */
  icon: LucideIcon;
  /** Navigation href (defaults to /${section}) */
  href?: string;
  /** Tab within a section (for sub-items or tab views) */
  tab?: string;
  /** Is this a sub-item nested under a parent? */
  isSubItem?: boolean;
  /** Show a "coming soon" badge instead of linking */
  comingSoon?: boolean;
  /** Show a "beta" badge */
  beta?: boolean;
  /** Group heading label (renders a section divider when it changes) */
  group?: string;
  /** Badge count (e.g. unread chat messages) */
  badge?: number;
  /** Tour data attribute identifier */
  tourId?: string;
}

// ── Component ──
interface NavItemProps {
  item: NavItemData;
  isActive: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  /** If the parent has expandable sub-items, pass the toggle handler */
  onExpandToggle?: () => void;
  /** Whether sub-items are currently expanded */
  isExpanded?: boolean;
  /** Whether this item is the expandable parent itself */
  isExpandableParent?: boolean;
}

export function NavItem({
  item,
  isActive,
  collapsed,
  onNavigate,
  onExpandToggle,
  isExpanded,
  isExpandableParent,
}: NavItemProps) {
  const Icon = item.icon;
  const isDisabled = item.comingSoon;
  const showBadge = !collapsed && item.badge != null && item.badge > 0;
  const showCollapsedBadge = collapsed && item.badge != null && item.badge > 0;

  const linkClass = cn(
    "group relative flex items-center gap-2.5 rounded-lg py-1.5 text-[13px] font-medium transition-all duration-150",
    collapsed ? "justify-center px-2" : "px-3",
    item.isSubItem && !collapsed && "ml-7 py-1 text-[12px]",
    isDisabled
      ? "cursor-not-allowed opacity-40"
      : isActive
        ? "bg-mc-accent/15 text-mc-accent font-semibold shadow-sm"
        : "text-mc-text-secondary hover:bg-white/[0.04] hover:text-mc-text"
  );

  // Expandable parent (e.g. Skills → has sub-items)
  if (isExpandableParent && !collapsed) {
    return (
      <div className={linkClass} data-tour={item.tourId}>
        <Link
          href={item.href || `/${item.section}`}
          onClick={onNavigate}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">{item.label}</span>
        </Link>
        {onExpandToggle && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onExpandToggle();
            }}
            className="rounded-md p-1 text-mc-text-secondary/60 transition-colors hover:text-mc-text"
            aria-label={isExpanded ? `Collapse ${item.label} submenu` : `Expand ${item.label} submenu`}
          >
            <svg
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                isExpanded && "rotate-90"
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // Coming-soon disabled item
  if (isDisabled) {
    return (
      <span className={linkClass} aria-disabled>
        <Icon className="h-4 w-4 shrink-0 opacity-50" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span className="shrink-0 whitespace-nowrap rounded-full border border-mc-border/50 bg-mc-bg-tertiary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-mc-text-secondary">
              Soon
            </span>
          </>
        )}
      </span>
    );
  }

  // Regular link
  return (
    <Link
      href={item.href || `/${item.section}`}
      onClick={onNavigate}
      className={linkClass}
      data-tour={item.tourId}
      title={collapsed ? item.label : undefined}
    >
      <span className="relative inline-flex shrink-0">
        <Icon className="h-4 w-4" />
        {showCollapsedBadge && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-mc-accent ring-2 ring-mc-bg"
            title={`${item.badge} unread`}
            aria-hidden
          />
        )}
      </span>
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.beta && (
        <span className="shrink-0 rounded-sm bg-mc-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-mc-accent/70">
          beta
        </span>
      )}
      {showBadge && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-mc-accent px-1.5 text-[11px] font-bold text-mc-bg shadow-sm">
          {item.badge! > 9 ? "9+" : item.badge}
        </span>
      )}
    </Link>
  );
}

// ── Group Divider ──
interface NavGroupHeaderProps {
  label: string;
  collapsed: boolean;
  /** For collapsible groups (e.g. "Advanced") */
  isCollapsible?: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export function NavGroupHeader({
  label,
  collapsed,
  isCollapsible,
  isExpanded,
  onToggle,
}: NavGroupHeaderProps) {
  if (collapsed) {
    return <div className="my-2 mx-1 border-t border-mc-border/30" />;
  }

  if (isCollapsible && onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="mb-1.5 mt-4 first:mt-0 flex w-full items-center justify-between rounded-md px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-mc-text-secondary/60 transition-colors hover:bg-white/[0.03] hover:text-mc-text-secondary"
        aria-expanded={isExpanded}
      >
        <span>{label}</span>
        <svg
          className={cn(
            "h-3 w-3 transition-transform",
            isExpanded && "rotate-90"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  return (
    <div className="mb-1.5 mt-4 first:mt-0 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-mc-text-secondary/60">
      {label}
    </div>
  );
}