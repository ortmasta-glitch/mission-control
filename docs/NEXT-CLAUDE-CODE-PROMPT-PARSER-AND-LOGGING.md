You are working in `/Users/tomaszzagala/.openclaw/workspace/projects/mission-control-implementation/app`.

Goal: advance the Goal-Driven Autonomous Tasks tranche by implementing the Parser and Logging Pipeline slice first.

Source of truth:
- Read `AUTONOMOUS.md` in the app root.
- Read `docs/AUTONOMOUS-TRANCHE-2-GROUNDWORK.md`.
- Read `docs/PARSER-AND-LOGGING-PIPELINE-STATUS.md`.
- Inspect `src/lib/autonomous/parser.ts`, `types.ts`, `log.ts`, `generator.ts`, `coordinator.ts`, and related tests.

What to build:
1. Upgrade parsing so the current AUTONOMOUS.md structure can be deterministically converted into structured autonomous inputs, including:
   - business/product lanes
   - priority ordering
   - allowed-vs-ask-first guardrails
   - marketing channel emphasis
   - operations automation areas
   - current active lane
2. Extend types as needed so this structured output is representable without breaking existing callers.
3. Add or extend append-only logging helpers so richer lifecycle metadata can be recorded safely. Keep the log append-only and backward-compatible with existing parsing.
4. Add focused tests for Tomek's current AUTONOMOUS.md shape and the new logging behavior.
5. If helpful, make the generator/coordinator consume the new structured parser output in a minimal, safe way, but do not start schema migrations or UI work in this pass.

Constraints:
- Do not add DB migrations in this pass.
- Do not build the approval UI in this pass.
- Do not break the current `formatGoalsForPrompt()` fallback behavior.
- Keep changes tranche-2 scoped and easy to review.
- Prefer additive changes with tests.

Deliverables:
- code changes
- tests
- a short summary of what changed, what remains, and any follow-up recommendation
