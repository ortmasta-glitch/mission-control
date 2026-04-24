/**
 * Time format preference — 12h/24h display.
 * Adapted for Mission Control design system.
 */

export type TimeFormatPreference = "12h" | "24h";

const STORAGE_KEY = "mc-time-format";

type Listener = () => void;
const listeners = new Set<Listener>();

function isTimeFormatPreference(
  value: unknown
): value is TimeFormatPreference {
  return value === "12h" || value === "24h";
}

function detectDefaultTimeFormat(): TimeFormatPreference {
  if (typeof window === "undefined") return "24h";
  try {
    const resolved = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
    }).resolvedOptions();
    return resolved.hour12 ? "12h" : "24h";
  } catch {
    return "24h";
  }
}

function read(): TimeFormatPreference {
  if (typeof window === "undefined") return "24h";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isTimeFormatPreference(raw)) return raw;
  } catch {
    // ignore
  }
  return detectDefaultTimeFormat();
}

let _value: TimeFormatPreference = read();

function notify(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* */
    }
  });
}

export function getTimeFormatPreference(): TimeFormatPreference {
  return _value;
}

export function setTimeFormatPreference(v: TimeFormatPreference): void {
  _value = v;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }
  notify();
}

export function subscribeTimeFormatPreference(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// SSR-safe snapshot
export function getTimeFormatSnapshot(): TimeFormatPreference {
  return _value;
}

export function getTimeFormatServerSnapshot(): TimeFormatPreference {
  return "24h";
}

/**
 * Apply time format preference to Intl.DateTimeFormatOptions.
 */
export function withTimeFormat(
  base: Intl.DateTimeFormatOptions,
  pref: TimeFormatPreference
): Intl.DateTimeFormatOptions {
  return {
    ...base,
    hour12: pref === "12h",
  };
}