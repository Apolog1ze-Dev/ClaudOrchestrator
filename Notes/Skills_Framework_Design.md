# Skill Packs — "Skill-Boosted Epics" Design Exploration (June 2026)

The idea: reusable, curated **frameworks for specific development jobs** that get injected
into the planning/execution pipeline — better design documents, better test plans, better
architecture — packaged as content, with the premium library as the supporter-tier perk.

---

## 1. Why this fits the product (and the climate)

- Claude Code has **native skills** (`SKILL.md` folders in `~/.claude/skills/` or
  `<project>/.claude/skills/`, auto-discovered by the CLI). The executor agent already runs
  through that CLI — so packs dropped into the target project are picked up natively during
  builds, zero new runtime needed for the execution side.
- Planning calls (specs, design doc, phase plans) are prompt-rendered in `prompts.rs` via
  Handlebars — a pack is just additional context injected into the right template at the
  right stage. Also zero new runtime.
- This is **content, not capability**: the app stays fully functional without packs, which
  keeps the freeware ethos intact while giving the supporter tier something genuinely
  valuable ("Skill-boosted epics"). Content libraries are also the one paid surface that
  doesn't rot when Anthropic ships more native orchestration features.

## 2. Pack anatomy

A pack is a folder of markdown + a manifest — deliberately the same mental model as native
Claude Code skills so packs can be authored once and used in both places:

```
packs/
  design-web-dashboard/
    pack.json            ← manifest: id, name, version, tier (free|supporter),
                            applies_to { stages, languages, platforms, keywords }
    DESIGN.md            ← injected into the design-spec prompt
    components.md        ← reference patterns (tokens, layout grids, a11y checklist)
  testing-node/
    pack.json
    PHASE_PLANNING.md    ← injected into phase planning (test strategy section)
    SKILL.md             ← written into <target>/.claude/skills/testing-node/ for the executor
  arch-tauri-desktop/
    pack.json
    TECH_SPEC.md         ← injected into tech-spec prompt (canonical structure, IPC patterns)
```

Manifest example:

```json
{
  "id": "design-web-dashboard",
  "name": "Web Dashboard Design Framework",
  "version": 1,
  "tier": "supporter",
  "applies_to": {
    "stages": ["spec_design", "clarify"],
    "languages": ["typescript", "javascript"],
    "platforms": ["web"],
    "keywords": ["dashboard", "admin", "analytics"]
  }
}
```

## 3. Injection points (one per pipeline stage)

| Stage | Mechanism | What a pack contributes |
|---|---|---|
| Clarify | extra coverage objectives appended to the continue-turn prompt | domain-specific probing ("real-time updates? export formats?") |
| Design spec | `{{skill_frameworks}}` block in `SPEC_DESIGN_TEMPLATE` | a real design-doc skeleton: token system, component inventory, layout grid, a11y checklist, sample palettes |
| Tech spec | same block in `SPEC_TECH_TEMPLATE` | canonical architecture for the stack (e.g. Tauri: commands/state/storage layering; Express: router/service/repo) |
| Phase planning | block in `PHASE_PLANNER_TEMPLATE` | common test patterns per stack, definition-of-done templates |
| Execution | write `SKILL.md` files into `<target>/.claude/skills/` before the build | the executor's CLI discovers them natively — conventions travel into the actual code-writing session |
| Verification | extra checks appended to the verifier prompt | stack-specific review checklist (e.g. "no unwrap in command handlers") |

Implementation is a small `SkillPackRegistry` in Rust: scan `packs/` (bundled via Tauri
resources + a user dir for custom packs), filter by `applies_to` against scout output +
objective keywords, render selected packs' stage files into a single context block, and
hand it to `render_prompt` as one more variable. ~300 lines plus template touch-ups.

## 4. Selection UX

- After scouting, the epic page shows **suggested packs** (matched on language/platform/
  keywords) as toggle chips: "Web Dashboard Design ⚡", "Node Test Patterns".
- Selected pack ids persist on the Epic (`skill_pack_ids: Vec<String>`), so re-planning
  and remediation use the same frameworks.
- Settings gets a Packs page: installed packs, tier badges, custom-pack folder location.

## 5. Tier model ("Skill-boosted epics")

- **Free**: the engine, pack loading, custom/user-authored packs, and 2–3 starter packs
  (generic test patterns, generic design checklist) — so the feature is honest, documented,
  and testable by everyone.
- **Supporter**: the curated library (per-platform design frameworks, per-language
  architecture packs, domain packs like game/CLI/API/dashboard) + early access to new
  packs. License check stays offline-tolerant; packs are static content shipped in the
  supporter build or downloaded once — no server dependency at runtime.
- Authoring pipeline: packs are markdown in a public-spec format, so the community can
  author and share free packs — which markets the premium library.

## 6. MVP slice (~1 week)

1. Registry + manifest + bundled `packs/` dir (2 starter packs).
2. Injection into design-spec + phase-planning templates only.
3. Pack chips on the epic page post-scout; ids persisted on the Epic.
4. Executor-side `SKILL.md` drop into the target project (one-line: copy on build start).
5. Defer: verification checklists, clarify objectives, Settings page, tier gating.

## 7. Open questions

- Pack versioning vs epic reproducibility: persist the pack *content hash* on the epic so
  re-running an old epic warns when a pack changed.
- Token budget: packs add prompt tokens to planning calls — cap injected content (~2-3k
  tokens/pack, max 2 packs/stage) and show the estimated extra cost on the pack chip.
- Native-skill collisions: if the target project already has `.claude/skills/` with the
  same name, never overwrite — prefix orchestrator-installed packs (`claudorch-*`) and
  clean them up after the build.
