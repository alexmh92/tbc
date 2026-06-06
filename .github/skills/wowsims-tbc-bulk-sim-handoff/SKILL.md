---
name: wowsims-tbc-bulk-sim-handoff
description: 'Use when continuing, debugging, validating, or modifying WoWSims TBC Bulk Sim candidate generation, bulk settings, and bulk/reforge integration points.'
argument-hint: 'Describe the TBC Bulk Sim candidate flow, settings, or integration issue to continue.'
---

# WoWSims TBC Bulk Sim Handoff

## When to Use

- Continue work on TBC bulk candidate generation and filtering.
- Debug bulk-tab gem constraints and request shaping.
- Validate integration boundaries between Bulk Sim flow and backend reforge optimizer.

## Current Architecture (TBC)

- Bulk candidate generation: `sim/bulk/candidates.go`.
- Bulk settings proto domain: `proto/api.proto` (`BulkSettings`).
- Bulk tab/UI flow: `ui/core/components/individual_sim_ui/bulk_tab.tsx` and related bulk utils.
- Suggest Reforges settings are separate (`ReforgeSettings` in `ui.proto`) and must not be merged with bulk settings.

## Key TBC Settings

- `BulkSettings` controls bulk-tab gem constraints (`max_gem_phase`, `max_gem_quality`).
- `ReforgeSettings` controls Suggest Reforges gem constraints (`max_gem_phase`, `max_gem_quality`).
- Keep these settings domains separate in code paths and serialization.

## TBC-Specific Constraints

- Do not copy MoP bulk orchestration 1:1 when request/response shapes differ.
- TBC has different supported classes/specs and proto fields than MoP; keep candidate logic tied to this repo’s proto/db model.
- TBC `core.Enchant` compatibility logic should not assume MoP-only fields like `EnchantType`.

## Key Files

- `sim/bulk/candidates.go`
- `proto/api.proto`
- `ui/core/components/individual_sim_ui/bulk_tab.tsx`
- `ui/core/components/individual_sim_ui/bulk/utils.ts`
- `ui/core/sim.ts`
- `ui/core/components/suggest_reforges_action.tsx`

## Validation Commands

```bash
npm run type-check
```

```bash
npm run build
```

```bash
go test -count=1 ./sim/core ./sim/web
```

## Common Pitfalls

- Conflating `BulkSettings` and `ReforgeSettings`.
- Porting MoP-only proto assumptions into TBC.
- Adding backend/frontend behavior that diverges from current TBC request structures.
