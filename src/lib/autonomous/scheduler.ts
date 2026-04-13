/**
 * scheduler.ts — Wire the autonomous generation checker into the process lifecycle.
 *
 * Pattern mirrors ensureCatalogSyncScheduled() in agent-catalog-sync.ts.
 * Called once from db/index.ts on DB initialisation.
 */

import { checkAndRunDueAutonomousGenerations } from './runner';

const CHECK_INTERVAL_MS = 60_000; // check every minute

export function ensureAutonomousScheduled(): void {
  if (process.env.NODE_ENV === 'test') return;
  const g = globalThis as unknown as { __mcAutonomousTimer?: NodeJS.Timeout };
  if (g.__mcAutonomousTimer) return;

  g.__mcAutonomousTimer = setInterval(() => {
    checkAndRunDueAutonomousGenerations().catch(err =>
      console.error('[Autonomous] Scheduled check failed:', err)
    );
  }, CHECK_INTERVAL_MS);
}
