# ClaudOrchestrator — Production Plan (June 2026)

Five workstreams, ordered. Phase 0 blocks everything; Workstream 3 (budget) is time-critical
(Agent SDK credit metering reportedly starts 2026-06-15 — verify at code.claude.com/docs/en/headless).

---

## Phase 0 — Repo rescue: name-clash removal + version control (Day 1)

**Goal:** a buildable, git-tracked source tree that a sync client can never silently corrupt again.

**Context (verified):** 12 frontend files still carry literal `(# Name clash 2026-04-22 …C #)` names
(tauri.ts, EpicContext.tsx, configStore.ts, chatStore.ts, AppProvider.tsx, Dashboard.tsx,
SettingsPage.tsx, HistoryPage.tsx, StatusBar.tsx, AgentPanel.tsx, ExplorerPanel.tsx, ClarifyingChat.tsx)
plus `dist\assets (# Name clash …)`. `package.json` and `plan_commands.rs` were restored to clean names
*mid-session* — the sync client (Proton Drive, judging by the `_PF` folder) is still actively writing here.

**Steps:**
1. **Pause Proton Drive sync** before touching anything. Renaming while it syncs risks a second
   generation of conflicts.
2. **Confirm this copy is canonical.** Check Proton Drive web UI / other machines for a newer copy.
   If a newer tree exists elsewhere, do this procedure there instead.
3. **Re-scan and rename** (the clash set has changed during the day — never use a stale list):
   ```powershell
   Get-ChildItem -Recurse -File src, src-tauri\src, . -Depth 0 -ErrorAction SilentlyContinue |
     Where-Object Name -match '\(# Name clash' |
     ForEach-Object {
       $clean = $_.Name -replace ' \(# Name clash [^)]*\)', ''
       $dest  = Join-Path $_.DirectoryName $clean
       if (Test-Path -LiteralPath $dest) { Write-Warning "Twin exists, diff manually: $($_.FullName)" }
       else { Rename-Item -LiteralPath $_.FullName -NewName $clean }
     }
   ```
   (Run once for `src`, `src-tauri\src`, and the repo root. If a clean twin exists, diff and keep the
   newer content manually — currently there are no twins, so it's pure renames.)
4. **Delete regenerable trees:** `dist/` entirely; `cargo clean` in `src-tauri` (clears clash-named
   incremental artifacts).
5. **Move the updater signing key OUT of the project** (`~\.tauri\claudorchestrator.key` inside the
   repo — the literal `~` folder). Relocate to the real `$HOME\.tauri\`, delete the in-repo copy,
   and ideally rotate the keypair.
6. **Verify build:** `npm install` → `npm run build` → `cargo check` in src-tauri. Fix residual import
   errors (there should be none once names are clean — imports already reference clean names).
7. **git init + initial commit.** Audit `.gitignore` first: node_modules, dist, src-tauri/target,
   release/, *.key, .claudorchestrator/. Then push to a private GitHub repo and add a minimal CI
   workflow (`npm run build` + `cargo check` on push) so corruption is caught within minutes, not weeks.
8. **Recommended:** move the project out of the synced folder permanently (git is your sync now);
   or exclude the folder from Proton Drive.

**Phase 0.5 (fold into the same week, from the earlier review):** atomic JSON writes
(temp + rename in `fs_helpers.rs`), loud corrupt-file handling, and a `schema_version` field on all
persisted JSON. The budget ledger (W3) and hand-off status files (W1) multiply the number of
on-disk files — land write-safety before they exist.

---

## Workstream 1 — Truth in features + one-click hand-off (supervised executor deferred)

### 1a. Truth pass (2–3 days, do immediately after Phase 0)

| Claim today | Reality | Action |
|---|---|---|
| "Approve critical operations (especially shell commands)" | Executor always gets unrestricted `Bash` via `--allowedTools` (executor.rs:50) | Reword README + Settings: supervised = **phase-level gates + verification-command approval**. Add explicit Settings note: "the executor agent can run shell commands without per-command prompts." |
| "Tickets execute in parallel where dependencies allow" | Sequential, priority-sorted; `dependencies` never read | Remove claim; (cheap win: topo-sort by dependencies before the loop) |
| "No extra costs" | Agent SDK credit metering from June 15 | Reword to "runs on your Claude subscription's agent budget"; W3 makes it visible |
| Review-gate **Retry** button | Marks failed, doesn't retry | Wire `ReviewDecision::Retry` to the existing `retry_phase` path (re-execute + re-verify in-loop) |
| Verification deny = pass | `(true, "Skipped by user")` verifier.rs:33 | Introduce `skipped` check state; exclude from score denominator; never count as pass |
| Failed phase → next phase runs anyway | `continue` in execute loop | **Halt ticket on phase failure** (mark remaining phases `blocked`), epic continues to независимые tickets only if deps allow; default behavior = stop ticket |
| One-click "Trust all" → autonomous | No confirmation | Add a typed-confirmation step |

### 1b. Defer the supervised executor — and say so

Per-tool-call gating (permission-prompt MCP bridge) is deferred. Document the decision:
users who want command-level control get it through **hand-off into interactive Claude Code**,
which has its own native permission prompts. That's the honest story and it makes hand-off the
safety feature, not just a convenience.

### 1c. One-click hand-off (the priority feature, ~1.5–2 weeks)

**Bundle format** — written into the target repo, human-readable, deterministic (stable ordering,
no embedded timestamps), versioned (`bundle_version: 1`):

```
docs/plan/                       (location user-configurable)
  README.md                      ← agent-facing: read order, status protocol, conventions
  spec.md                        ← PRD + tech spec (+ design if present)
  tickets/01-auth-service.md     ← frontmatter: id, status, dependencies, acceptance_criteria
  phases/01-02-jwt-middleware.md ← ordered steps, file targets, test strategy, done-when, status
  status.json                    ← machine-readable mirror for re-import
```

**Targets (v1), each one click:**
1. **Claude Code (interactive)** — write bundle + generate `.claude/commands/execute-phase.md`
   slash command + append a marked section to CLAUDE.md/AGENTS.md
   (`<!-- claudorch:begin -->…<!-- claudorch:end -->`, never clobber user content).
   Launch: open Windows Terminal in target dir running `claude` with a preloaded prompt
   ("Read docs/plan/README.md, execute phase NN-MM"). **Key selling point: interactive sessions
   use normal subscription limits, not the metered agent credit.**
2. **Codex CLI** — bundle + AGENTS.md + launch `codex` (or copy `codex exec "…"` one-liner).
3. **Gemini CLI** — bundle + GEMINI.md/AGENTS.md + launch.
4. **Cursor / VS Code** — bundle + AGENTS.md + `cursor .` / `code .`.
5. **Copy as prompt** — per phase/ticket: self-contained mega-prompt (context, conventions,
   acceptance criteria) to clipboard. Universal fallback, zero maintenance.

**Round-trip (v1 = button, v2 = watcher):** bundle README instructs the executing agent to flip
frontmatter `status: done` + update `status.json` + (if git) commit with trailer
`Plan-Phase: <epic>/<ticket>/<phase>`. App side v1: a **"Sync status"** button re-reads the bundle
and `git log --grep "Plan-Phase:"`, marks phases `executed_externally`, and offers **"Verify now"**
(existing verifier on the diff — it's already provider-agnostic). v2: filesystem/git watcher for
automatic detection.

**Code surface:** new `src-tauri/src/commands/handoff_commands.rs`
(`generate_handoff_bundle`, `launch_handoff_target`, `sync_handoff_status`); exporters as pure
functions over existing types (unit-testable — first tests in the repo). Frontend: Hand-off button
on epic Ready view + per-ticket/phase menus; target picker with "remember my tool"; status badges.
Detect installed tools the same way `find_claude_bin` works today (presence detection per target).

---

## Workstream 2 — Multi-provider: BYO API keys + expanded CLI + per-task granularity (~2–3 weeks)

**Architecture: one `AgentBackend` trait, two call classes.**
The codebase has exactly two kinds of model calls:
- **Tool-using agentic calls** (scout, executor, remediator) → require an agent runtime.
  **Stay CLI-backed in v1** (Claude CLI today; Codex/Gemini CLI as future agentic backends).
- **Pure prompt→JSON calls** (clarify, specs, decompose, phase-planning, validation, chat
  ask/refine, verifier diff-review) → portable to any API. This is ~80% of planning-quota burn
  and the cheap 80% of the work.

```rust
trait AgentBackend {
    fn id(&self) -> BackendId;            // claude_cli | anthropic_api | openai_api | gemini_api | openrouter
    fn capabilities(&self) -> Caps;       // tools, structured_output, sessions, streaming, effort, cost_kind
    async fn run(&self, req: AgentRequest, cb: StreamCallback) -> Result<AgentResult>;
}
```

**v1 backends:** `claude_cli` (wraps existing `run_claude`), `anthropic_api`, `openai_api`,
`gemini_api`, and **`openrouter`** (recommended first API backend: one key → hundreds of models,
returns exact cost per call, has a /models endpoint with pricing metadata — least maintenance).
All four big APIs support schema-constrained JSON output natively (tool-forcing / response_format /
responseSchema), mapping cleanly onto the existing `json_schema` option. SSE streams normalize to
the existing `FrontendStreamEvent`.

**Granular assignment (the user-facing ask):** replace `ModelAssignment { model_id, effort }` with
`{ backend, model_id, effort?, params? }`. Keep the 4 role defaults (orchestrator/scout/executor/
verifier) + an **advanced per-task override map** (clarify, spec_gen, decompose, phase_plan,
validate, chat, verify_diff…). Settings renders a matrix; capability gating greys out invalid
combos (e.g., scout on an API backend in v1) with a tooltip explaining why.

**Model catalogs:** fetch dynamically per backend (Anthropic /v1/models, OpenAI /models, Gemini
list, OpenRouter /models) with hardcoded fallback — this also retires the stale hardcoded Claude
list and its dated snapshot IDs.

**Key storage:** OS keychain (Windows Credential Manager via `keyring` crate / Tauri plugin) —
never plaintext config JSON. Settings: per-provider key entry + "Test connection" button.

**Expanded CLI integration:** startup `claude --version` check with minimum-version gate and
graceful flag fallback; adopt `--bare` when stable; plumb `--permission-mode`; presence-detect
`codex` and `gemini` CLIs (shared detection util) — used by hand-off launchers in v1, future
agentic backends in v2. ToS guardrails: BYO API keys are unrestricted; driving official CLIs
locally is fine; never touch subscription OAuth tokens directly.

---

## Workstream 3 — Budget usage + clear limits (~1 week; **v1 before June 15**)

**v1 (ship this week, 2–3 days):**
- **Persistent cost ledger:** append-only `.claudorchestrator/usage.jsonl` per workspace
  (+ global aggregate in app data): `{ts, epic, task/role, backend, model, tokens_in/out,
  cost_usd, reported_vs_computed, duration}`. Wrap it around `run_claude` now; API backends
  plug into the same ledger later. Fixes ephemeral cost state (today: rebuilt, partially lost).
- **Status-bar budget widget:** current epic spend + monthly workspace spend, always visible.
- **Plan-aware monthly context:** detected plan → known agent-credit pool ($20 Pro / $100 Max 5x /
  $200 Max 20x) → "est. $X of $Y monthly agent budget" with a user-adjustable correction (no API
  exposes remaining credit yet; build defensively, recheck CLI capabilities after June 15).
- **In-app notice** explaining the June 15 metering change and what it means for this app.

**v2 (after multi-provider lands):**
- Per-epic budget + monthly cap settings; warn at 80%, stop **between phases** at 100% with
  explicit "continue anyway" override (never kill mid-call).
- Pre-flight estimates per operation from ledger history ("phase ≈ $0.40 avg on this epic").
- Cost breakdown views: per role/model/task on the epic dashboard; monthly graph in History.
- Honesty labels: CLI `total_cost_usd` shown as "estimate" (known upstream bugs); API-computed
  costs (tokens × pricing table) and OpenRouter-reported costs shown as exact.

---

## Workstream 4 — Context-aware clarifying questions (~1 week)

Replace batch-rounds-behind-a-conversational-UI with a real conversation (full diagnosis in chat
log, 2026-06-09):

**Backend:**
- Round 1 unchanged (single experience question) but **consume `status` and `enhanced_objective`**
  from the structured output (both already in the schema; both currently discarded).
- Rounds 2+: keep one `claude` session alive via `--resume <clarify_session_id>` (same mechanism
  the remediator already uses; store session id on the epic). Each user answer = next turn; model
  returns `{questions: [1–2], status, enhanced_objective, topic}` per turn; `status: "sufficient"`
  ends the loop (user can always "Ask more" / "Generate Specs" early).
- Add `topic: concept|design|deep_dive` to the schema for UI grouping; themed pacing moves into
  the system prompt ("cover concept before design") — the model decides timing, so palette is
  generated *after* the style answer by construction.
- Persist `enhanced_objective` per turn; feed the latest into spec generation (free spec-quality win).
- Fallback: if `--resume` fails (expired session), regenerate statelessly from full Q/A history
  (current `capture_intent` becomes the fallback path).
- Delete: count heuristics (EpicPage.tsx:146–162), increment-before-generate round counter
  (keep round as display metadata, incremented after success), keyword dedup (keep exact-match
  as a cheap guard).

**Frontend (ClarifyingChat):**
- After each confirm: inline "Thinking about your next question…" (stream thinking into it).
- Topic headers when `topic` changes ("Design — based on your concept answers").
- "Generate Specs" prominently enabled when model signals sufficient.

**Cost/latency:** N small calls instead of 3 big ones; in-session caching keeps marginal cost
modest; 1–2 questions per turn balances adaptivity vs. waiting. With W2, clarify becomes routable
to a cheap fast model.

---

## Sequencing

| Order | What | Why now | Size |
|---|---|---|---|
| 0 | Repo rescue + git/CI + key relocation (+ atomic writes) | Nothing else is safe to build first | 1–2 days |
| 1 | Truth pass (1a) | Cheap, restores claim/code integrity | 2–3 days |
| 2 | Budget v1 (W3) | **June 15 metering deadline** | 2–3 days |
| 3 | Clarify fix (W4) | Highest user-pain : effort ratio; self-contained | ~1 week |
| 4 | Hand-off v1 (W1c) | Flagship feature; defines the "execute anywhere" story | 1.5–2 weeks |
| 5 | Multi-provider (W2) | Biggest; benefits from backend trait designed alongside hand-off | 2–3 weeks |
| 6 | Budget v2 | Needs W2's per-backend cost data | ~1 week |

Total ≈ 7–9 weeks part-time. Each stage is independently shippable; cut releases per stage via
the existing release script + auto-updater.
