# Elemental Shaman BiS Upgrade Planner

Rank your next TBC Elemental Shaman upgrade by its simulated single-swap DPS gain.

## [Open the hosted Upgrade Planner](https://alexmh92.github.io/tbc/shaman/elemental/)

## What it does

- Imports your current character through the WoWSims addon, current JSON export, or legacy TBC WoWSims JSON.
- Uses the built-in Pre-Raid and Phase 1–5 Elemental Shaman BiS presets.
- Tests every selected preset item as an individual swap against your current gear.
- Ranks upgrades by DPS gain and percentage gain.
- Shows whether a result is statistically significant or within simulation noise.
- Handles paired ring/trinket slots, two-handed weapons, owned items, and incompatible off-hands.

## How to use it

1. Open the [Elemental Shaman simulator](https://alexmh92.github.io/tbc/shaman/elemental/).
2. Select **Import → Addon** and paste your WoWSims Exporter output. JSON imports are also supported.
3. Check your talents, rotation, buffs, consumes, and encounter settings.
4. Open **Upgrade Planner** and select the BiS phases you want to compare. Phase 2 is selected by default.
5. Select **Sim upgrades** and rank your soft-reserve choices using the resulting DPS gains.

Legacy JSON from `wowsims.github.io/tbc/elemental_shaman/` imports gear, race, and talents. Rotation, buffs, and consumes stay on the current simulator settings and should be reviewed before running the planner.

## About this fork

This project is a public fork of [WoWSims TBC](https://github.com/wowsims/tbc-new). The simulation engine, game data, class implementations, and original UI are maintained by the WoWSims team. This fork adds the Elemental Shaman Upgrade Planner and its GitHub Pages deployment.

The project remains under the upstream [MIT licence](LICENSE). No imported character data is sent to a custom server; simulations run in your browser.

## Development

- [Installation guide](docs/installation.md)
- [Development commands](docs/commands.md)
- [Upstream WoWSims project](https://github.com/wowsims/tbc-new)
