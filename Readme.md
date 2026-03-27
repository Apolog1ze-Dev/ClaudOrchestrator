# ClaudOrchestrator

> **Free** AI-powered development orchestrator that plugs directly into your existing **Claude Code subscription** — no extra API keys, no extra costs.

ClaudOrchestrator is a desktop application that turns high-level project ideas into fully implemented, verified code. It manages a team of specialized Claude AI agents that plan, execute, and validate software development tasks autonomously — all billed through your existing Claude subscription.

[INSERT SCREENSHOT HERE]

---

## How It Works

ClaudOrchestrator sits on top of the Claude CLI (Claude Code) you already have installed. It authenticates using your existing Claude session and directs multiple specialized AI agents through a structured pipeline — from understanding your requirements to shipping working code.

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

## Epics

An **Epic** is the central unit of work in ClaudOrchestrator. It represents a self-contained goal — a new feature, a refactor, a bug fix, or an entirely new project — and acts as the container for everything the orchestrator generates and executes on your behalf.

When you create an Epic, you provide a high-level description of what you want to achieve. From that single input, ClaudOrchestrator drives the entire lifecycle: understanding the problem, designing a solution, breaking it into work, and implementing it step by step.

### What an Epic Contains

Each Epic is composed of four interconnected layers that build on one another:

- **Specification** — A full technical write-up of the goal: product requirements, architecture decisions, component breakdown, and data models. This is the source of truth the executor agents work from.
- **Tickets** — Discrete units of work decomposed from the spec, each with a clear scope, acceptance criteria, and dependency links to other tickets. Tickets map one-to-one with areas of the codebase.
- **Phases** — Each ticket is further broken down into granular implementation phases: ordered steps with explicit instructions, file targets, and expected outcomes. Phases are what the executor agent actually runs.
- **Progress state** — The Epic tracks the status of every ticket and phase in real time — what has been executed, what passed verification, what failed and was remediated, and what is still pending.

[INSERT SCREENSHOT HERE]

### The Planning Pipeline

Before any code is written, the Epic goes through a structured planning sequence. Each step refines the understanding of the problem and feeds into the next.

**1. Scout**

The Scout agent scans your project directory to build a map of the existing codebase. It identifies file structure, naming conventions, frameworks in use, and existing patterns. This context is injected into every subsequent planning step so that the generated plan fits naturally into what already exists rather than working against it.

**2. Clarify**

An interactive Q&A step where the orchestrator surfaces ambiguities in your request. Rather than making assumptions, it asks targeted questions — about scope, edge cases, preferred approaches, constraints — and uses your answers to sharpen the spec. You can answer as many or as few questions as you like before moving on.

[INSERT SCREENSHOT HERE]

**3. Spec Generation**

Using the scouted context and your clarification answers, the orchestrator produces a full technical specification document. This covers:

- Product requirements and success criteria
- Proposed architecture and component design
- Data models and API contracts
- Implementation approach and key decisions

The spec is editable. You can review it, request refinements through the chat panel, and iterate before committing to implementation.

**4. Ticket Decomposition**

The spec is broken into a set of tracked tickets. Each ticket represents a coherent chunk of work — a single service, a UI component, a data migration — with clearly defined scope and explicit dependency links. Tickets can be executed in parallel where dependencies allow.

[INSERT SCREENSHOT HERE]

**5. Phase Planning**

Each ticket is expanded into a sequence of implementation phases. A phase is a precise, step-by-step instruction set that tells the executor agent exactly what to do: which files to create or modify, what logic to implement, what interfaces to conform to. Phases are granular enough that each one represents a single reviewable unit of change.

**6. Plan Validation**

Before execution begins, the orchestrator runs a final review pass over the complete plan — checking for gaps, contradictions, missing dependencies, or instructions that conflict with the scouted codebase. Any issues are flagged and can be resolved before a single line of code is touched.

[INSERT SCREENSHOT HERE]

---

## Key Capabilities

### Execution Pipeline

Once the Epic plan is approved, ClaudOrchestrator drives execution with built-in safeguards.

- **Supervised or Autonomous modes** — choose whether to approve critical operations (especially shell commands) or let the orchestrator run freely
- **Auto-remediation** — when a phase fails, the remediator agent diagnoses and fixes the issue automatically (configurable retry limit)
- **Verification** — after each phase, a dedicated verifier agent runs your test suite, lint, and type checks, and reviews spec compliance
- **Review gates** — manual checkpoints where you can inspect work and decide whether to continue

[INSERT SCREENSHOT HERE]

### Real-Time Streaming

Watch the AI think and execute in real time. Every token, plan decision, and code change streams live to the interface as it happens, with per-step cost tracking.

### AI Chat Interface

Three dedicated chat modes available throughout the entire workflow:

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

---

## Interface Overview

The workspace is organized as a familiar developer IDE layout with four panels: an Activity Bar for navigation, an Explorer Panel showing your epics, tickets, and files, a central Editor for viewing specs and code, and an Agent Panel for interacting with the AI at any point in the workflow.

[INSERT SCREENSHOT HERE]

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

---

## Free to Use

ClaudOrchestrator is **free**. There is no subscription, no license fee, and no usage metering beyond what Claude Code itself already tracks. If you have a Claude subscription, you have everything you need to run the full orchestration pipeline.

---

## Notes & Known Limitations

- Works best on projects with an existing codebase that Claude can scout for context
- Autonomous mode executes shell commands without prompting — use supervised mode on unfamiliar projects
- Large epics with many tickets will consume quota proportionally; configure effort levels accordingly
- Auto-update is built in — the app will notify you when a new version is available
