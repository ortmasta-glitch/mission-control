import type { AutonomousApprovalState, AutonomousLane, AutonomousTaskSource } from './coordinator';

const METADATA_PREFIX = '<!-- AUTONOMOUS_META ';
const METADATA_SUFFIX = ' -->';

export interface AutonomousTaskMetadata {
  source: AutonomousTaskSource;
  autonomousRunId: string;
  goalTag?: string;
  lane?: AutonomousLane;
  approvalState?: AutonomousApprovalState;
  generatedAt?: string;
}

export function appendAutonomousMetadata(description: string, metadata: AutonomousTaskMetadata): string {
  const base = stripAutonomousMetadata(description).trimEnd();
  const stamped = `${METADATA_PREFIX}${JSON.stringify(metadata)}${METADATA_SUFFIX}`;
  return base ? `${base}\n\n${stamped}` : stamped;
}

export function extractAutonomousMetadata(description?: string | null): AutonomousTaskMetadata | null {
  if (!description) return null;
  const start = description.lastIndexOf(METADATA_PREFIX);
  if (start < 0) return null;

  const end = description.indexOf(METADATA_SUFFIX, start);
  if (end < 0) return null;

  const raw = description.slice(start + METADATA_PREFIX.length, end).trim();
  try {
    const parsed = JSON.parse(raw) as AutonomousTaskMetadata;
    if (!parsed || parsed.source !== 'goal_daily_generation' || !parsed.autonomousRunId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function stripAutonomousMetadata(description?: string | null): string {
  if (!description) return '';
  return description.replace(/\n?<!-- AUTONOMOUS_META[\s\S]*?-->\s*$/m, '').trimEnd();
}
