"use client";

import { useSyncExternalStore } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { notificationStore, type AppNotification } from "@/lib/notification-store";

/**
 * Severity → styling map using Mission Control design tokens.
 * Each severity gets a distinct icon, background, border, and text color.
 */
const SEVERITY_STYLES: Record<
  string,
  { icon: typeof Info; bg: string; border: string; text: string }
> = {
  error: {
    icon: AlertCircle,
    bg: "bg-mc-accent-red/10",
    border: "border-mc-accent-red/30",
    text: "text-mc-accent-red",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-mc-accent-yellow/10",
    border: "border-mc-accent-yellow/30",
    text: "text-mc-accent-yellow",
  },
  success: {
    icon: CheckCircle,
    bg: "bg-mc-accent-green/10",
    border: "border-mc-accent-green/30",
    text: "text-mc-accent-green",
  },
  info: {
    icon: Info,
    bg: "bg-mc-accent/10",
    border: "border-mc-accent/30",
    text: "text-mc-accent",
  },
};

function Toast({ notification }: { notification: AppNotification }) {
  const style = SEVERITY_STYLES[notification.severity] || SEVERITY_STYLES.info;
  const Icon = style.icon;

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-80 items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm",
        "animate-in slide-in-from-right-full fade-in duration-200",
        style.bg,
        style.border,
      )}
      role="alert"
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.text)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-mc-text">
          {notification.title}
        </p>
        {notification.detail && (
          <p className="mt-0.5 text-xs text-mc-text-secondary line-clamp-2">
            {notification.detail}
          </p>
        )}
        {notification.actions && notification.actions.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            {notification.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  action.callback();
                  notificationStore.dismiss(notification.id);
                }}
                className="rounded px-2 py-1 text-xs font-medium text-mc-text transition-colors hover:bg-mc-bg-tertiary"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => notificationStore.dismiss(notification.id)}
        className="shrink-0 rounded p-0.5 text-mc-text-secondary transition-colors hover:text-mc-text"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function getToasts() {
  return notificationStore.getToasts();
}

const emptyToasts: AppNotification[] = [];

/**
 * ToastRenderer — renders notification-store toasts in the top-right corner.
 * Mount once in the root layout alongside the existing ToastProvider.
 *
 * Uses useSyncExternalStore for zero-prop-drilling updates.
 */
export function ToastRenderer() {
  const toasts = useSyncExternalStore(
    notificationStore.subscribe,
    getToasts,
    () => emptyToasts,
  );

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex flex-col gap-2">
      {toasts.slice(0, 5).map((toast) => (
        <Toast key={toast.id} notification={toast} />
      ))}
    </div>
  );
}