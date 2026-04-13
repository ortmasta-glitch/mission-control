# Goal-Driven Autonomous Task Generation — Implementation Notes

## What this feature does

Every morning at 8:00 AM (configurable), Mission Control reads a goals file
(`AUTONOMOUS.md`) and generates 4-5 new tasks aligned to those goals.  Tasks
appear on the Kanban board immediately and go through the normal dispatch flow.
Completions are logged to an append-only file (`memory/tasks-log.md`).

---

## Architecture (Tranche 1)

```
AUTONOMOUS.md  (read-only for agents)
      │
      ▼
src/lib/autonomous/
  parser.ts     — read/parse AUTONOMOUS.md + tasks-log.md
  log.ts        — append-only writes to tasks-log.md
  dedup.ts      — Jaccard-similarity duplicate detection
  generator.ts  — LLM prompt builder + response parser
  runner.ts     — idempotent daily run service
  scheduler.ts  — setInterval hook, called from db/index.ts startup
  types.ts      — AutonomousConfig, AutonomousRun, TaskProposal, LogEntry
  index.ts      — public exports

src/app/api/autonomous/
  config/route.ts    — GET/PUT workspace config
  generate/route.ts  — POST manual trigger
  runs/route.ts      — GET run history

DB tables (migration 030):
  autonomous_configs   — one row per workspace, stores cron/paths/flags
  autonomous_runs      — one row per daily batch; UNIQUE(workspace_id, run_date)
```

---

## Key invariants

| Rule | Where enforced |
|------|---------------|
| AUTONOMOUS.md is **never written** by agents or the feature itself | parser.ts is read-only; log.ts only touches tasks-log.md |
| **One run per workspace per calendar day** | UNIQUE index on `(workspace_id, run_date)`; idempotency check in runner.ts |
| **Stale running rows** (> 10 min) are recovered on next call | runner.ts stale-recovery block runs before enabled-check |
| **tasks-log.md is append-only** | log.ts uses `fs.appendFileSync` only; no lines are ever modified |
| Subagents signal completion via **log.ts only** | `logTaskComplete(logFilePath, taskId, title, agentId)` |

---

## File conventions

### AUTONOMOUS.md

Parsed by section (`## Heading` markers).  Recommended structure:

```markdown
# Workspace Goals

## Long-term Goals
- Grow MRR to 50k by end of 2026
- Reduce churn below 3%

## Current Focus
Referral program launch

## Backlog
- Analytics dashboard v2
- Mobile app onboarding redesign
```

The parser is tolerant of any structure.  Unknown sections are preserved.
The file must be kept **token-light** (< 3000 chars is ideal) — the runner
truncates at 3000 chars when building the LLM prompt.

### memory/tasks-log.md

Append-only pipe-delimited log.  Human-readable and `grep`-friendly.

```
# Autonomous Task Log — do not edit manually
2026-04-09T08:00:00.000Z | CREATED  | <uuid>                               | Task title here              | run:<run_id>
2026-04-09T08:00:01.000Z | CREATED  | <uuid>                               | Another task                 | run:<run_id>
2026-04-10T14:32:00.000Z | COMPLETE | <uuid>                               | Task title here              | agent:<agent_id>
2026-04-11T08:00:00.000Z | SKIPPED  | -                                    | Duplicate candidate title    | reason:duplicate run:<run_id>
```

**Log line schema** (5 pipe-separated fields):
1. ISO timestamp
2. Event: `CREATED` | `COMPLETE` | `SKIPPED`
3. Task ID (or `-` for SKIPPED)
4. Title (pipe chars replaced with `‣`)
5. Metadata (`run:<id>`, `agent:<id>`, or `reason:<text>`)

---

## Duplicate detection

Jaccard word-overlap similarity (threshold: 0.55).  Short words (≤ 2 chars)
are excluded from the token set.

A proposed task is dropped as a duplicate if its title overlaps ≥ 55% with:
- Any open task created in the last 30 days
- Any CREATED/COMPLETE log entry in the last 7 days
- Any earlier proposal in the same batch (self-dedup)

No embeddings are required.  Fast, deterministic, and testable.

---

## Scheduler wiring

`db/index.ts` calls `ensureAutonomousScheduled()` on DB init (same pattern as
`ensureCatalogSyncScheduled`).  The scheduler fires every 60 seconds and calls
`checkAndRunDueAutonomousGenerations()`, which evaluates the cron expression
against the current UTC time.  The 55-minute recency guard prevents double-fire.

---

## Cost tracking

Costs are estimated at Anthropic Sonnet pricing ($3/1M input + $15/1M output).
Stored on `autonomous_runs.cost_usd`.  This is informational only — actual
billing flows through the OpenClaw Gateway.

---

## Tranche 2 — What remains

| Item | Notes |
|------|-------|
| **Approval mode UI** | `approval_required = 1` is stored but not yet enforced. Tranche 2 should add a `pending_approval` task status and a review screen. |
| **Kanban filter** | Tag autonomous tasks (`source = 'autonomous'`) so the board can show/hide them. Needs a `source` column on `tasks`. |
| **Completion webhook** | Call `logTaskComplete()` when a task moves to `done` and has been created by an autonomous run. Wire into `task/[id]/route.ts` PATCH handler. |
| **Goals file editor UI** | Simple textarea in settings that writes AUTONOMOUS.md. Must guard against concurrent writes. |
| **Per-goal tagging** | Have the generator tag each task with which goal it advances. Needs `goal_tag` column on `tasks`. |
| **Run quality scoring** | After 7 days, compare tasks_created vs tasks_completed to estimate run quality. |
| **Richer dedup** | Replace Jaccard with embeddings (via autopilot/similarity.ts) for better semantic matching. |
