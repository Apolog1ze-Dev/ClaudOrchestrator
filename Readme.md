# ClaudOrchestrator

> **Free** AI-powered development orchestrator that plugs directly into your existing **Claude Code subscription** — no extra API keys, no extra costs.

ClaudOrchestrator is a desktop application that turns high-level project ideas into fully implemented, verified code. It manages a team of specialized Claude AI agents that plan, execute, and validate software development tasks autonomously — all billed through your existing Claude subscription.

---

## How It Works

ClaudOrchestrator sits on top of the Claude CLI (Claude Code) you already have installed. It authenticates using your existing Claude session and directs multiple specialized AI agents through a structured pipeline — from understanding your requirements to shipping working code.

```
Your Idea  →  Planning Pipeline  →  Execution Pipeline  →  Verified Code
```

No separate API keys. No additional billing. Just your Claude subscription doing more.

---

## Prerequisites

- **Claude Code** installed and authenticated (`claude` CLI available in your PATH)
- An active **Claude Pro, Max, Team, or Enterprise** subscription
- A project directory to work within

---

## Getting Started

1. Ensure `claude` is installed and you are logged in (`claude --version` should work)
2. Open ClaudOrchestrator
3. Create a new **Epic** and point it at your project directory
4. Describe what you want to build
5. Step through the planning pipeline, review the generated spec and tickets
6. Launch execution and watch your code get written

---

## Key Capabilities

### Planning Pipeline

ClaudOrchestrator breaks your project into a structured series of planning steps before writing a single line of code.

| Step | What Happens |
| --- | --- |
| **Scout** | Analyzes your existing codebase — structure, patterns, conventions |
| **Clarify** | Asks targeted questions to fully understand your requirements |
| **Spec** | Generates PRDs, technical specs, and architecture documents |
| **Decompose** | Breaks the spec into tracked tickets with dependencies |
| **Phase Plan** | Produces granular, step-by-step implementation instructions per ticket |
| **Validate** | Reviews the full plan for coherency before any code is touched |

### Execution Pipeline

Once planning is complete, ClaudOrchestrator drives execution with built-in safeguards.

- **Supervised or Autonomous modes** — choose whether to approve critical operations (especially shell commands) or let the orchestrator run freely
- **Auto-remediation** — when a phase fails, the remediator agent diagnoses and fixes the issue automatically (configurable retry limit)
- **Verification** — after each phase, a dedicated verifier agent runs your test suite, lint, and type checks, and reviews spec compliance
- **Review gates** — manual checkpoints where you can inspect work and decide whether to continue

### Real-Time Streaming

Watch the AI think and execute in real time. Every token, plan decision, and code change streams live to the interface as it happens, with per-step cost tracking.

### AI Chat Interface

Three dedicated chat modes available throughout the workflow:

- **Ask** — question the AI about any part of your project or plan
- **Refine** — provide feedback to reshape the current plan or spec
- **Review** — evaluate work at review gates and decide whether to approve or request changes

Impact analysis shows exactly which documents and specs will be affected before any change is applied.

### Cost & Quota Tracking

Every model call is tracked. ClaudOrchestrator displays token usage and estimated USD cost across the entire workflow so you always know where your subscription quota is going.

### Multi-Model Role Assignment

Four specialized agent roles, each configurable independently:

| Role | Responsibility |
| --- | --- |
| **Orchestrator** | Supervises the overall workflow and coordinates agents |
| **Scout** | Analyzes codebases and gathers context |
| **Executor** | Implements code changes per phase instructions |
| **Verifier** | Tests, lints, and validates completed work |

Assign Opus, Sonnet, or Haiku to each role based on your subscription plan and the effort level required.

### Subscription-Aware Configuration

ClaudOrchestrator detects your Claude plan (Pro, Max 5x, Max 20x, Team, Enterprise) and suggests optimized model assignments to make the most of your quota.

---

## Interface Overview

The workspace is organized as a familiar developer IDE layout:

```
┌──────────────┬──────────────────┬──────────┬────────────────┐
│ Activity Bar │ Explorer Panel   │  Editor  │  Agent Panel   │
│ (navigation) │ (epics, phases,  │ (specs,  │ (Ask / Refine  │
│              │  tickets, files) │  code)   │  / Review)     │
├──────────────┴──────────────────┴──────────┴────────────────┤
│     Status Bar — progress, phase count, execution status     │
└─────────────────────────────────────────────────────────────┘
```

**Keyboard shortcuts:**

| Shortcut | Action |
| --- | --- |
| `Ctrl+B` | Toggle Explorer Panel |
| `Ctrl+J` | Toggle Agent Panel |
| `Ctrl+W` | Close current tab |

---

## Configuration

All configuration lives within the app. Key settings include:

- **Model assignments** per agent role
- **Effort level** per role: `low`, `medium`, `high`, `max`
- **Execution mode**: `supervised` (approval gates) or `autonomous`
- **Verification commands**: your test, lint, and typecheck commands
- **Minimum verification score** (0–100) required before a phase is marked complete
- **Max remediation attempts** before escalating a failure
- **Quota budget limits** with stop-on-failure protection

---

## Data & Privacy

All project data (epics, tickets, phases, specs) is stored locally on your machine as JSON files. Nothing is sent to any external service beyond what the Claude CLI already sends to Anthropic as part of normal Claude Code usage.

## Free to Use

ClaudOrchestrator is **free**. There is no subscription, no license fee, and no usage metering beyond what Claude Code itself already tracks. If you have a Claude subscription, you have everything you need to run the full orchestration pipeline.

---

## Notes & Known Limitations

- Autonomous mode executes shell commands without prompting — use supervised mode on unfamiliar projects
- Large epics with many tickets will consume quota proportionally; configure effort levels accordingly
