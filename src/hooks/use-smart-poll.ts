"use client";

import { useEffect, useRef, useCallback } from "react";

type UseSmartPollOptions = {
  /** Milliseconds between polls when tab is visible. Default 30000. */
  intervalMs?: number;
  /** When true, polling pauses (SSE/WS is providing data). */
  sseActive?: boolean;
  /** When false, polling is disabled entirely. Default true. */
  enabled?: boolean;
  /** Fire immediately on mount. Default true. */
  immediate?: boolean;
};

const MIN_POLL_INTERVAL_MS = 5000;

/**
 * Smart polling hook that:
 * - Pauses when the tab is hidden
 * - Pauses when an SSE/WS stream is active
 * - Re-polls immediately when tab becomes visible or window gains focus
 * - Deduplicates in-flight requests
 */
export function useSmartPoll(
  fn: () => void | Promise<void>,
  options: UseSmartPollOptions = {}
) {
  const {
    intervalMs: rawIntervalMs = 30000,
    sseActive = false,
    enabled = true,
    immediate = true,
  } = options;
  const intervalMs = Math.max(rawIntervalMs, MIN_POLL_INTERVAL_MS);

  const fnRef = useRef(fn);
  fnRef.current = fn;
  const sseRef = useRef(sseActive);
  sseRef.current = sseActive;
  const inFlight = useRef(false);

  const tick = useCallback(async () => {
    if (inFlight.current) return;
    if (!enabled) return;
    if (sseRef.current) return;
    inFlight.current = true;
    try {
      await fnRef.current();
    } catch {
      /* ignore */
    } finally {
      inFlight.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    if (immediate) {
      tick();
    }

    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [enabled, immediate, intervalMs, tick]);

  // Re-poll on visibility change
  useEffect(() => {
    if (!enabled) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled, tick]);
}