import { clsx, type ClassValue } from "clsx";

/**
 * Merge class names — uses clsx for conditional classes.
 * Add tailwind-merge later if needed to resolve Tailwind conflicts.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}