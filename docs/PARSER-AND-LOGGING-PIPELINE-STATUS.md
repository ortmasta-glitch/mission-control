# Parser and Logging Pipeline — Status

Status: **complete through completion-hook wiring**
Last updated: 2026-04-10

---

## Tranche 2 — Completion Phases Shipped

### Phase 1: Parser & Logging Pipeline
- `types.ts` — `ProductLane`, `GenerationPreferences`, `StructuredGoals`, extended `LogEventType`
- `parser.ts` — `parseStructuredGoals`, `slugifyGoalTag`, `formatStructuredGoalsForPrompt`
- `log.ts` — all lifecycle helpers with optional `extras` objects
- `coordinator.ts` — `resolveGoalTagFromStructuredGoals`, `activeGoalTag`
- `generator.ts` — structured-goals type guard + richer prompt branch
- `metadata.ts` — `appendAutonomousMetadata` / `extractAutonomousMetadata` / `stripAutonomousMetadata`
- 38 tests in `parser-pipeline.test.ts`

### Phase 2: Runner Integration
- `runner.ts` — structured goals, per-proposal goalTag, `toAutonomousTaskDraft`, `planCoordinatorLanes`, AUTONOMOUS_META stamping
- 30 tests in `runner-integration.test.ts`

### Phase 3: Completion-Hook Wiring (this pass)

**New:** `src/lib/autonomous/completion.ts`
- `handleAutonomousCompletion(input)` — pure helper called by the PATCH route when status transitions to `'done'`
- Reads `AUTONOMOUS_META` block from task description via `extractAutonomousMetadata`
- Appends `COMPLETE` entry to the workspace's append-only log with `runId`, `goalTag`, `lane`
- Non-autonomous tasks → `{ logged: false, reason: 'not_autonomous' }` (no-op)
- All log I/O wrapped in try/catch — route update never fails because the log write failed
- 11 tests in `completion.test.ts`

**Updated:** `src/app/api/tasks/[id]/route.ts`
- Added `existing.status !== 'done'` guard to the autonomous completion block — prevents duplicate `COMPLETE` entries when the same task receives a second `PATCH status:done`
- Replaced inline block with `handleAutonomousCompletion(...)` call

**Fixed:** `package.json` test script
- Added `--test-concurrency=1` to serialize test file execution
- Root cause of pre-existing failure: `tsx --test` runs each file in a parallel worker; all files shared one SQLite file → write contention (`SQLITE_ERROR`/`SQLITE_BUSY`)
- Fix is safe: serialized execution has no correctness trade-offs for this test suite

---

## Test Status

**Before this pass:** 86/87 (1 failure: `getOrCreateConfig: creates default config on first call` — SQLite concurrency race)

**After this pass:** All passing (87/87 in the autonomous suite + 11 new = 98 autonomous-scoped tests)

---

## What remains

| Item | Notes |
|------|-------|
| DB provenance columns | `autonomous_run_id`, `goal_tag`, `approval_state` on tasks table — needs schema migration; `extractAutonomousMetadata` can backfill from existing task descriptions |
| Approval UI | Review queue for `pending_approval` tasks — Tranche 3; `logTaskApproved`/`logTaskRejected` helpers are ready |
| Semantic dedup | Replace Jaccard with embedding similarity |
| `logTaskComplete` in webhook | `POST /api/webhooks/agent-completion` also transitions tasks toward done but does not call `handleAutonomousCompletion` |

## Recommended next step

**Webhook wiring** — `src/app/api/webhooks/agent-completion/route.ts` moves tasks to `testing` or `done` status. Add `handleAutonomousCompletion` there too (same pattern: check `nextStatus === 'done' && prevStatus !== 'done'`). This closes the last log gap for agent-triggered completions.
