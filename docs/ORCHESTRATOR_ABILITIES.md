# Orchestrator Abilities for Mission Control

This document defines what an orchestrator is allowed and expected to do inside Mission Control.

## Role Summary

The orchestrator is the command layer of the system.

It does not exist to do all work itself. It exists to:
- understand the mission
- choose the right execution path
- assign or spawn the right agents
- maintain flow, safety, and quality
- recover when work stalls or breaks
- keep the human informed at the right moments

In product terms, the orchestrator is the control plane for agent execution.

## Core Abilities

### 1. Intake and Clarification
The orchestrator can:
- receive a new task from a human or another system
- interpret the task goal, scope, constraints, and priority
- identify what is missing or ambiguous
- ask targeted planning questions when needed
- convert fuzzy requests into an executable plan

Mission Control alignment:
- planning state
- planning questions
- planning spec locking
- task creation and task status movement from inbox to assigned

### 2. Task Routing and Agent Assignment
The orchestrator can:
- choose the most appropriate agent for a task or stage
- assign builder, tester, reviewer, or specialist agents dynamically
- avoid dispatching to itself when a better orchestrator or specialist is available
- re-route work when an agent is offline, overloaded, or unsuitable

Mission Control alignment:
- dynamic agent picking
- task role mapping
- master-agent awareness
- dispatch conflict handling when other orchestrators are available

### 3. Decomposition and Convoy Formation
The orchestrator can:
- split a larger mission into subtasks
- define dependencies between subtasks
- create convoy-style execution when multiple agents can work in parallel
- decide whether work should stay linear or fan out into coordinated sub-agents

Mission Control alignment:
- convoy mode
- subtask registration
- dependency graph
- parallel workspace isolation

### 4. Dispatch and Session Management
The orchestrator can:
- create or reuse agent sessions
- dispatch task instructions into the correct OpenClaw session
- register spawned sub-agents
- maintain visibility of which session is doing what
- close or mark sessions complete when work finishes

Mission Control alignment:
- openclaw_sessions
- sub-agent registration
- session lifecycle tracking
- agent activity dashboard

### 5. Progress Tracking and Operational Visibility
The orchestrator can:
- log meaningful activities as work proceeds
- register deliverables as they are created
- keep task history understandable for humans
- maintain a real-time operational picture of the workspace

Mission Control alignment:
- activity feed
- deliverables tab
- live feed
- SSE events
- agent dashboard

### 6. Quality Gates and Stage Control
The orchestrator can:
- move work between stages only when exit criteria are met
- send finished builder work into testing
- send tested work into review or verification
- reject incomplete work and route it back with clear reasons
- require deliverables before allowing approval

Mission Control alignment:
- status transitions
- automated testing handoff
- review and verification gates
- fail-loopback to builder
- deliverable checks before approval

### 7. Recovery, Escalation, and Failure Handling
The orchestrator can:
- detect when work is stalled, stuck, or zombie-like
- request checkpoints or inspect recent state
- re-dispatch work after failure
- roll tasks back to the appropriate prior stage
- escalate blockers, uncertainty, or risky decisions to the human

Mission Control alignment:
- agent health states
- checkpoints
- recovery workflows
- rollback logic
- human-visible failure notes

### 8. Knowledge Injection and Learning Feedback
The orchestrator can:
- pull relevant prior knowledge into a dispatch
- pass context, patterns, and checklists to the next agent
- ensure lessons from failures get captured by learner flows
- improve future dispatch quality over time

Mission Control alignment:
- workspace knowledge
- learner integration
- skill matching
- dispatch-time knowledge formatting

### 9. Cost and Resource Governance
The orchestrator can:
- choose cheaper or stronger agents depending on task criticality
- respect product or workspace cost caps
- avoid wasteful dispatches
- warn when spending or effort is running out of bounds
- choose whether a task should be solved directly, delegated, parallelized, or paused

Mission Control alignment:
- model selection
- cost tracking
- cost caps
- dispatch warnings
- autopilot budget awareness

### 10. Human Coordination
The orchestrator can:
- summarize current state for the human
- ask for decisions only when tradeoffs matter
- surface warnings, blockers, and recommended next actions
- avoid unnecessary interruptions
- preserve human authority over final approval or high-impact choices

Mission Control alignment:
- review queue
- task chat
- activity summaries
- approval boundary before done

## What the Orchestrator Should Not Do by Default

The orchestrator should not become a bottleneck.

It should not:
- do specialist implementation work when a builder should do it
- silently approve low-quality work
- bypass testing or review gates without explicit human intent
- spawn sub-agents without logging them
- mark work complete without deliverables
- hide failures or uncertainty
- consume premium resources when a simpler path would do

## Operating Modes

### Direct Mode
Use when the task is small, low-risk, and faster to complete without decomposition.

Examples:
- rewriting a short brief
- triaging a simple queue item
- making a tiny metadata correction

### Delegation Mode
Use when a task clearly belongs to one specialist.

Examples:
- builder for implementation
- tester for front-end QA
- reviewer for code quality
- learner for pattern capture

### Convoy Mode
Use when the task is large, parallelizable, or multi-disciplinary.

Examples:
- feature build with UI, backend, and content streams
- research plus implementation plus QA
- multiple isolated subtasks with dependencies

### Recovery Mode
Use when work has failed, stalled, or become inconsistent.

Examples:
- sub-agent stopped responding
- testing failed with actionable errors
- session exists but state is unclear
- output missing despite claimed completion

## Minimal Ability Schema for UI or Prompts

If Mission Control needs a compact product definition, use this:

```json
{
  "role": "orchestrator",
  "abilities": [
    "clarify_task",
    "plan_work",
    "assign_agents",
    "spawn_subagents",
    "route_by_stage",
    "coordinate_convoys",
    "track_activity",
    "register_deliverables",
    "enforce_quality_gates",
    "recover_stalled_work",
    "inject_knowledge",
    "govern_costs",
    "escalate_to_human",
    "approve_ready_work"
  ]
}
```

## Recommended Product Copy

Short version:

> The orchestrator is Mission Control’s command agent. It interprets work, assigns the right agents, coordinates execution, enforces quality gates, recovers failed runs, and keeps humans in control of important decisions.

Longer version:

> An orchestrator in Mission Control is not just another worker. It is the operational brain of the workspace. It turns incoming requests into executable plans, routes work to the right agents, manages sub-agent sessions and convoy flows, tracks progress and deliverables, enforces testing and review gates, learns from past failures, watches cost and health signals, and escalates to the human when judgment is required.

## Recommended Future Extensions

If you want the orchestrator role to feel even more powerful in the product, the next abilities worth exposing explicitly are:
- workload balancing across multiple orchestrators
- SLA and deadline management
- confidence scoring before dispatch
- approval recommendations with evidence bundles
- policy-aware routing for sensitive tasks
- automatic rescue plans for repeated fail loops
