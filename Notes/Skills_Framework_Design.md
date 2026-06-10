# Skill Packs — "Skill-Boosted Epics" Design Exploration (June 2026)

The idea: reusable, curated **frameworks for specific development jobs** that get injected
into the planning/execution pipeline — better design documents, better test plans, better
architecture. **Skill packs are the paid tier's feature: direct pipeline upgrades reserved
for paying customers.** The free pipeline is complete and honest on standard prompts;
paying unlocks the boosted pipeline.

---

## 1. Why this fits the product (and the climate)

- Claude Code has **native skills** (`SKILL.md` folders in `~/.claude/skills/` or
  `<project>/.claude/skills/`, auto-discovered by the CLI). The executor agent already runs
  through that CLI — so packs dropped into the target project are picked up natively during
  builds, zero new runtime needed for the execution side.
- Planning calls (specs, design doc, phase plans) are prompt-rendered in `prompts.rs` via
  Handlebars — a pack is just additional context injected into the right template at the
  right stage. Also zero new runtime.
- As the paid tier's flagship: the free app remains a complete orchestrator on standard
  prompts, and "Skill-boosted epics" is a crisp, demonstrable upgrade — measurably better
  design docs, architecture, and test plans on the same epic. Expert-curated frameworks
  are also the one paid surface that doesn't rot when Anthropic ships more native
  orchestration features.

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

## 5. Tier model ("Skill-boosted epics" — paid-exclusive)

- **Free**: the standard pipeline, unchanged. No pack injection. The UI may *show* the
  suggested-pack chips greyed with a "Skill-boosted epic (paid)" tag after scouting — the
  upgrade is visible at exactly the moment it would help, never nagging elsewhere.
- **Paid**: the entire skill system — pack injection at every stage, the curated library
  (per-platform design frameworks, per-language architecture packs, domain packs like
  game/CLI/API/dashboard), custom/user-authored packs, and new-pack drops.
- **Delivery**: packs are NOT bundled in the free binary. A valid license fetches the
  library once (signed archive from the release infrastructure) into the app data dir;
  fully offline afterwards. License check stays offline-tolerant — the gate is honest,
  not DRM theater: in a local app the real product is the curated, maintained, versioned
  library, and updates flow only to license holders.
- Epic JSON records which packs boosted it, so a boosted epic re-opened without a license
  still displays its provenance (and re-planning without the license falls back to
  standard prompts with a notice).

## 6. MVP slice (~1 week, gating included from day one)

1. Registry + manifest + packs dir in app data (2 launch packs to prove the format).
2. License flag (`config.license_key` validated offline) gating the registry — without it
   the registry resolves empty and the pipeline is byte-identical to today.
3. Injection into design-spec + phase-planning templates only.
4. Pack chips on the epic page post-scout (greyed + tagged for free users); ids persisted
   on the Epic.
5. Executor-side `SKILL.md` drop into the target project (copy on build start, `claudorch-*`
   prefixed, cleaned up after).
6. Defer: verification checklists, clarify objectives, Settings packs page, the download
   service (launch packs can ship inside the paid license bundle initially).

## 7. Open questions

- Pack versioning vs epic reproducibility: persist the pack *content hash* on the epic so
  re-running an old epic warns when a pack changed.
- Token budget: packs add prompt tokens to planning calls — cap injected content (~2-3k
  tokens/pack, max 2 packs/stage) and show the estimated extra cost on the pack chip.
- Native-skill collisions: if the target project already has `.claude/skills/` with the
  same name, never overwrite — prefix orchestrator-installed packs (`claudorch-*`) and
  clean them up after the build.
