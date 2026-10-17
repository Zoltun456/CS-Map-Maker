# Agent authoring

An external agent can create and assess maps without driving the canvas. The canonical interchange format is `.csmap.json`; the browser editor, CLI, legacy layout code, SVG preview, and Hammer output all convert through the same core. Version 1 remains supported, while version 2 adds overlapping elevation levels, semantic zones, edge features, and traversal links.

## Map format

The schemas are published at `public/schema/csmap.schema.json` and `public/schema/csmap-v2.schema.json`. For layered work, start from `examples/maps/layered-two-site.v2.csmap.json`. Flat examples remain available for compatibility.

```json
{
  "format": "cs-map-maker",
  "version": 1,
  "name": "Candidate 01",
  "profile": "two-site-3v3",
  "width": 16,
  "height": 10,
  "rows": ["################", "#TT....#.....AA#", "..."],
  "targets": { "tWinRate": [0.42, 0.58], "maxSightlineUnits": 3000 }
}
```

Every row must match `width`, and the row count must match `height`.

| Symbol    | Tile         |
| --------- | ------------ |
| `#`       | wall         |
| `.`       | floor        |
| `X`       | cover box    |
| `T`       | T spawn      |
| `C`       | CT spawn     |
| `A` / `B` | bombsite     |
| `I`       | indoor floor |

Version 2 separates geometry from meaning. Each ordered level has an ID, elevation, ceiling height, and geometry rows. Its symbols are `_` void, `.` floor, `#` wall, `X` full cover, and `x` half cover. Spawns, sites, indoor areas, materials, and callouts are separate zones whose cells include `levelId`, `x`, and `y`. Doors, windows, railings, and one-way sight are edge features. Stairs, ramps, ladders, drops, and boosts are explicit traversal links.

All zone and traversal endpoints must sit on floor geometry. IDs must be globally stable. A `drop` must not be bidirectional. Design targets are notes only and never change the official rubric.

Profiles are `two-site-3v3` (default, requires A and B) and `one-site-3v3` (requires A). Target overrides may set `tWinRate`, `firstContactSeconds`, `ctLeadSeconds`, `rotationSeconds`, or `maxSightlineUnits`.

## Commands

```sh
npm run --silent map -- validate examples/maps/two-site.csmap.json --json
npm run --silent map -- analyze candidate.csmap.json --json
npm run --silent map -- simulate candidate.csmap.json --rounds 1000 --seed 42 --json
npm run --silent map -- evaluate candidate.csmap.json --rounds 1000 --seed 42 --out map-artifacts/candidate
npm run --silent map -- improve candidate.csmap.json --budget 250 --seed 42 --out map-artifacts/search --json
npm run --silent map -- compare candidates/ --rounds 1000 --seed 42 --out map-artifacts/comparison --json
npm run --silent agent:trial -- candidate.v2.csmap.json --out map-artifacts/agent-trial --require-good
```

`--json` reserves stdout for JSON; progress goes to stderr. Version 2 is accepted by `validate`, `analyze`, `simulate`, `evaluate`, `compare`, `render`, `apply`, `diff`, `repair`, `generate`, and `improve`. Layered evaluation artifacts are `report.json`, a multi-floor `preview.svg`, and the exact versioned candidate. Lossy layout-code output is never produced for v2.

Exit code 0 means the command completed with a structurally valid map. Code 1 is an input or runtime failure, and code 2 is a hard-gate failure. Add `--require-good` to make a valid result below 75 return code 3.

## Recommended loop

1. Copy the layered profile example and produce several meaningfully different candidates.
2. Run `validate`; repair every error before simulation.
3. Run `evaluate --json --out ...` and use diagnostic codes, coordinates, observed values, and suggestions to revise the grid.
4. Prefer changes that improve a weak category without causing a hard failure or collapsing another category.
5. Run `compare` over the survivors. Inspect both the category breakdown and annotated SVG rather than optimizing only the total score.
6. Run `agent:trial` on the chosen candidate. It evaluates four fixed seeds, repeats a seed to verify determinism, enforces category floors, and emits a manifest, exact candidate, report, and layered SVG.
7. Load the chosen JSON in **Agent tools**, inspect level-aware findings in **2.5D**, and record human or CS2 evidence separately.

## Real agent trial contract

Give the agent the starter fixture, this document, a seed, an iteration budget, and an empty artifact directory. Require the final answer to contain the v2 map path, map hash, rubric version, seed suite, trial verdict, major tactical differences, and unresolved diagnostics. Do not reveal any additional benchmark maps during authoring.

For the first trial, use a budget of 12 manual revisions or 250 local search candidates. The candidate must remain schema-valid after every accepted change. A result is ready for a human/CS2 playtest only when every fixed-seed evaluation is valid, every category floor passes, the average is at least 75, and the score spread is at most five points. Preserve rejected candidates and operation histories so failures can be diagnosed rather than hidden.

Official evaluation uses rubric `2.0.0`; targets stored in a candidate are design notes and cannot redefine its grade. Seeded runs are reproducible. The score remains a design aid, and final acceptance still requires CS2 bot and human playtests.
