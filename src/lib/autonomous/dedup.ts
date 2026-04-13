/**
 * dedup.ts — Lightweight duplicate-detection for autonomous task proposals.
 *
 * Strategy: word-overlap ratio (Jaccard similarity on word sets).
 * No embeddings needed for tranche 1 — fast, predictable, testable.
 *
 * A proposal is considered a duplicate if its word-overlap with ANY existing
 * title exceeds DUPLICATE_THRESHOLD.
 */

const DUPLICATE_THRESHOLD = 0.55; // 55% word overlap → duplicate

/** Tokenise a title into a lowercase word set, stripping punctuation. */
export function tokenise(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2) // drop very short words (a, in, to…)
  );
}

/** Jaccard similarity between two word sets: |intersection| / |union| */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  a.forEach(w => { if (b.has(w)) intersection++; });
  const union = a.size + b.size - intersection;
  return intersection / union;
}

/**
 * Return true if `candidate` is likely a duplicate of any title in `existingTitles`.
 */
export function isDuplicate(candidate: string, existingTitles: string[]): boolean {
  const cTokens = tokenise(candidate);
  for (const existing of existingTitles) {
    const score = jaccardSimilarity(cTokens, tokenise(existing));
    if (score >= DUPLICATE_THRESHOLD) return true;
  }
  return false;
}

/**
 * Filter a list of proposals, returning only those that are NOT duplicates of
 * `existingTitles`.  Earlier proposals take priority — a later proposal that
 * duplicates an earlier one in the same batch is also dropped.
 */
export function deduplicateProposals<T extends { title: string }>(
  proposals: T[],
  existingTitles: string[]
): { kept: T[]; skipped: Array<{ title: string; reason: string }> } {
  const kept: T[] = [];
  const skipped: Array<{ title: string; reason: string }> = [];
  const acceptedTitles = [...existingTitles];

  for (const p of proposals) {
    if (isDuplicate(p.title, acceptedTitles)) {
      skipped.push({ title: p.title, reason: 'duplicate' });
    } else {
      kept.push(p);
      acceptedTitles.push(p.title); // prevent two proposals in the same batch duping each other
    }
  }

  return { kept, skipped };
}
