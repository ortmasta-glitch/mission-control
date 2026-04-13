# Goal-Driven Autonomous Tasks — Tranche 2 Groundwork

Status: groundwork ready, Tomek goal corpus received, parser and logging pipeline is now the active tranche-2 lane.

## What is already in place

Tranche 1 exists in `src/lib/autonomous/`:
- goals parser (`parser.ts`)
- append-only task log (`log.ts`)
- LLM proposal generator (`generator.ts`)
- idempotent daily runner (`runner.ts`)
- schedule hook (`scheduler.ts`)
- config/history API routes under `src/app/api/autonomous/`

That means tranche 2 should extend the existing path, not build a parallel system.

## Safe groundwork completed now

### 1. Coordinator and approval scaffolding

Added `src/lib/autonomous/coordinator.ts` with pure functions for:
- approval boundary decisions
- draft task metadata for autonomous provenance
- lane planning (`now`, `next`, `later`)
- deterministic priority-to-lane defaults

This is intentionally DB-light. It lets us settle orchestration behavior before locking schema changes.

### 2. Integration boundary definition

Current boundary contract:
- `approval_required = false` → generated tasks can continue using `inbox`
- `approval_required = true` → generated tasks should be parked for review first
- both paths should still broadcast task creation and log creation events

For now, approval parking is represented as `pending_dispatch` at the integration layer because the current global `TaskStatus` union does not yet include a dedicated approval state.

### 3. Lane orchestration plan

Use three coordinator lanes:
- `now`: work that can immediately enter the active Mission Control flow
- `next`: valid work held near the front of queue
- `later`: overflow or lower-confidence items kept visible but out of the way

Initial recommended caps for generated batches:
- `now`: 1-2 items
- `next`: 2-3 items
- `later`: everything else

This keeps the system from overfilling active workflow stages when a goals dump produces many plausible tasks.

### 4. Tests for tranche 2 planning layer

Added `src/lib/autonomous/coordinator.test.ts` covering:
- approval boundary behavior
- default lane inference from priority
- autonomous draft metadata capture
- overflow handling between `now` / `next` / `later`

## Near-term implementation path

### A. Parser and logging pipeline follow-up

Ready now:
- keep `AUTONOMOUS.md` read-only for agents
- continue append-only evidence in `memory/tasks-log.md`

Next changes once Tomek provides goals structure:
- define expected heading taxonomy for the goals file
- optionally extract stable `goalTag` values from headings
- add completion-hook wiring so autonomous tasks log `COMPLETE` automatically on `done`

### B. Generation engine follow-up

Ready now:
- task proposals already generated through `generator.ts`
- coordinator layer can wrap proposals in tranche 2 metadata before insertion

Next changes:
- enrich proposals with `goalTag`, confidence, and dependency hints
- introduce approval queue persistence when `approval_required = true`
- optionally reuse autopilot similarity primitives for semantic dedup

### C. Mission Control integration follow-up

Recommended order:
1. add provenance fields on tasks or a side table (`source`, `autonomous_run_id`, `goal_tag`, `approval_state`, `lane`)
2. add a dedicated approval status if desired (`pending_approval`) and thread it through board/UI unions
3. wire `runner.ts` to call the coordinator layer before DB insert
4. add board filters and a small review surface for generated tasks
5. wire completion logging on task transition to `done`

### D. Resilience prep

Recommended safeguards:
- keep run idempotency at the `autonomous_runs` level
- keep append-only logging non-fatal
- preserve raw proposal payloads for review/debug
- add retry-safe approval promotion, so approving the same draft twice does not create duplicate tasks

## Tomek input now encoded

Tomek's current source of truth is now captured in `AUTONOMOUS.md`, including:
- internal Mission Control tools as top priority
- explicit business lanes for Financial Planning, Document Repository, Advertising Channels, Sign-ups, and Strategic Expansion
- growth emphasis on Instagram, Facebook, TikTok, and Google Ads analysis
- product planning for iPhone, Android, diagnostics, and group therapy packaging
- operations automation for call transcription, SMS, calendar, and internal records
- clear autonomous-vs-ask-first guardrails
- early-morning generation window and priority bias ordering

## Current active tranche-2 lane

Parser and logging pipeline first:
- stabilize parsing for the new AUTONOMOUS.md structure
- derive reliable lane and guardrail metadata
- improve append-only evidence logging before schema and UI expansion

## Dispatch-ready follow-ups

These are now cleanly prepped for dispatch:
1. completion-hook implementation in task status transitions
2. DB/schema proposal for autonomous provenance and approval state
3. UI pass for approval/review surface
4. semantic dedup upgrade using autopilot similarity utilities
5. goals-file schema extractor once Tomek shares real content
