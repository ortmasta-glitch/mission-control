# Goal-Driven Autonomous Source of Truth

## Business context
Warmińskie Centrum Psychoterapii (WCP) — psychotherapy clinic, 22 employees, clinics in Olsztyn, Elbląg, and Ostróda. Website: wcp.com.pl. Founders: Tomek Zagała (ops/tech) and Karolina Zagała (therapist). Key staff: Ewelina (Practice Manager).

## 2026 Business goals
- 5× turnover vs 2025
- Top-5 Google presence for core therapy search terms
- Strong Google Ads conversion rates (tracking repair is a hard gate before relaunch)
- Improved online booking via Booknetic — reduce friction on /sign-up/ and /booking/
- Growth of therapy group programs (Women's Support Group as pilot)
- Patient mobile app (mood/sleep/diet tracking, booking, payments, mindfulness)

## Mission and operating bias
- Mission Control internal tools are the top priority.
- Daily autonomous generation window: 06:00–08:00 Europe/Warsaw.
- Approval mode: autonomous by default; high-impact tasks held for approval.
- Daily batches should be previewed inside Mission Control.

## Priority order
1. Internal Mission Control tools and workflows
2. Google Ads recovery sprint and conversion tracking
3. WCP website conversion (Booknetic, /sign-up/, /booking/ paths)
4. Financial planning and business analysis
5. Social and paid campaign execution
6. Patient mobile app planning
7. Competitive and market analysis

## Product lanes
### Mission Control internal tools
Build and improve internal operating surfaces inside Mission Control. Favor features that improve planning, orchestration, approvals, visibility, logging, and operator control.

### Google Ads and conversion
Repair and grow Google Ads performance. Conversion tracking verification is a hard gate before campaign relaunch. Priority order: Brand WCP → Ostróda → Terapia Indywidualna → Elbląg → Olsztyn PMax.

### Website and booking
Improve Booknetic booking friction, /sign-up/ page conversion, trust signals, above-fold CTAs. Separate persuasion (/sign-up/) from booking mechanics (/booking/).

### Women's Support Group
Improve conversion path for the group therapy pilot: phone + Contact Form 7, not Booknetic. Warmer consultation-first funnel.

### Financial planning
Analyze cash flow, planning assumptions, and revenue levers. Prioritize decision support for budgeting.

### Advertising channels
Instagram, Facebook, TikTok, Google Ads. Analysis, reporting, creative planning, diagnostics, optimization.

### Patient mobile app
Plan iPhone and Android product paths. Roadmap, scope, packaging, feasibility first — no risky execution yet.

### Operations automation
Call transcription, SMS support, calendar coordination, internal records.

## Autonomous permissions
### Allowed without approval
- Research, drafting, local analysis
- Mission Control task work
- Coding in approved repositories
- Safe document handling

### Must ask before acting
- External messages or outreach
- Publishing or posting
- Production changes
- Spending money
- Legal, tax, compliance, or strategic commitment actions
- Important business decisions

## Approval guardrails
High-impact work requiring approval: anything externally visible, anything that changes live production behavior, anything with financial/legal/compliance risk.

Preferred pattern: work autonomously inside approved boundaries, queue high-impact actions for human approval, keep proposed batch visible in Mission Control before execution.

## Current active lanes
### Tranche 2 — Autonomous system
- Approval mode UI: `pending_approval` status + review screen
- Goals file editor in Settings (textarea that writes AUTONOMOUS.md)
- `source` column on tasks + Kanban filter for autonomous vs manual tasks
- Per-goal tagging (`goal_tag` column)

### Google Ads recovery
- Conversion tracking verification before any campaign relaunch
- Brand WCP is the only safe live campaign
- /sign-up/ as primary paid-traffic landing page while /booking/ stays universal

### WCP website
- Reduce Booknetic friction
- Improve trust and CTA clarity above the fold
- Separate booking/call/form tracking events

## Immediate generation preferences
- 1–2 high-value internal Mission Control Tranche 2 tasks
- 1 Google Ads or conversion analysis task
- Keep social campaign work behind internal tooling unless a strong opportunity is obvious
