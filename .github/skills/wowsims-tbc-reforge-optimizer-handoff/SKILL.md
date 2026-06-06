---
name: wowsims-tbc-reforge-optimizer-handoff
description: 'Use when continuing, debugging, validating, or modifying the WoWSims TBC backend reforge optimizer, /reforgeOptimize endpoint, gem/socket/cap logic, or meta-gem activation behavior.'
argument-hint: 'Describe the TBC reforge optimizer bug, fixture, or behavior to continue.'
---

# WoWSims TBC Reforge Optimizer Handoff

## When to Use

- Continue work in `sim/core/reforge_optimizer`.
- Debug backend Suggest Reforges parity issues.
- Validate gem, socket bonus, hard-cap/soft-cap, and meta-gem behavior.

## Current Architecture (TBC)

- Backend package: `sim/core/reforge_optimizer`.
- Frontend caller: `ui/core/components/suggest_reforges_action.tsx`.
- Backend endpoint: `/reforgeOptimize`.
- Worker API call: `reforgeOptimize`.
- Request/response protos: `ui.proto` (`ReforgeOptimizeRequest`, `ReforgeOptimizeResult`, `ReforgeSettings`).
- Final correctness must be validated by exact `core.ComputeStats` outcomes, not only solver objective deltas.

## Main Files

- `sim/core/reforge_optimizer/optimizer.go`
- `sim/core/reforge_optimizer/solver.go`
- `sim/core/reforge_optimizer/choices.go`
- `sim/core/reforge_optimizer/gems.go`
- `sim/core/reforge_optimizer/meta_gem_constraints.go`
- `sim/core/reforge_optimizer/gear.go`
- `sim/core/reforge_optimizer/caps.go`
- `sim/core/reforge_optimizer/solver_test.go`
- `ui/core/components/suggest_reforges_action.tsx`

## Critical TBC Behavior

- Compare-color meta gems must remain strict greater-than (example `25893`: blue > yellow).
- Final chosen gear must remain meta-valid after post-solver improvement/minimization.
- Socket bonus matching should be EP-driven; do not auto-force solely because a bonus touches an uncapped cap stat.
- Keep frontend/backend socket-force behavior aligned.

## Known Reference Fixture

- `reforge-reference-3.json` is the Shadow priest parity fixture.
- Corrected expected behavior:
    - Preserve active `25893` meta constraints.
    - Avoid unnecessary hit socket-bonus chasing when all-red is better EP.

## Latest Verified Session Learnings (June 2026)

- Keep solver constraint coefficients aligned with frontend LP model semantics (use objective/model deltas for constraints).
- Avoid adding eager hard-cap constraints before first solve pass; this can trigger cap-pass-limit failures on stable fixtures.
- Frontend parity debugging should be driven by historical methods in old `suggest_reforges_action.tsx` (`checkWeights`, `buildGemOptions`, `checkCaps`, `minimizeRegems`) rather than ad-hoc backend heuristics.
- Gem filtering/parity is highly sensitive to candidate-pruning rules and stat allow-lists; broad pruning changes can regress multiple fixtures even when a single reference improves.
- Regem minimization behavior can change fixture equality without changing high-level optimization quality; validate both strict fixture equality and EP/stat deltas when assessing parity.

## TBC Porting Constraints

- Do not port MoP-only optimizer assumptions directly.
- Keep TBC proto/message shapes authoritative.
- Avoid MoP-specific request or helper patterns that do not exist in this repo.

## Validation Commands

```bash
go test -count=1 ./sim/core/reforge_optimizer
```

```bash
npm run type-check
```

```bash
npm run build
```

## Common Pitfalls

- Accepting solver-feasible output without validating final exact behavior.
- Letting post-processing invalidate a solver-valid meta constraint.
- Introducing frontend/backend drift in gem/socket forcing behavior.
