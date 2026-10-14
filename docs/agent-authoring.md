# Agent authoring

An external agent can create and assess maps without driving the canvas. The canonical interchange format is `.csmap.json`; the browser editor, CLI, legacy layout code, SVG preview, and Hammer output all convert through the same `MapDocument` core.

## Map format

The JSON Schema is published at `public/schema/csmap.schema.json`. Start from `examples/maps/two-site.csmap.json` or `examples/maps/one-site.csmap.json`.

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

Profiles are `two-site-3v3` (default, requires A and B) and `one-site-3v3` (requires A). Target overrides may set `tWinRate`, `firstContactSeconds`, `ctLeadSeconds`, `rotationSeconds`, or `maxSightlineUnits`.

## Commands

```sh
npm run map -- validate examples/maps/two-site.csmap.json --json
npm run map -- analyze candidate.csmap.json --json
npm run map -- simulate candidate.csmap.json --rounds 1000 --json
npm run map -- evaluate candidate.csmap.json --rounds 1000 --out map-artifacts/candidate
npm run map -- render candidate.csmap.json --out map-artifacts/candidate
npm run map -- compare candidates/ --rounds 1000 --out map-artifacts/comparison --json
```

`--json` reserves stdout for JSON; progress goes to stderr. Evaluation artifacts are `report.json`, `preview.svg`, `layout-code.txt`, and `hammer-blockout.txt`. Comparison evaluates candidates sequentially and writes `ranking.json` plus one artifact directory per map.

Exit code 0 means the command completed with a structurally valid map. Code 1 is an input or runtime failure, and code 2 is a hard-gate failure. Add `--require-good` to make a valid result below 75 return code 3.

## Recommended loop

1. Copy a profile example and produce several meaningfully different candidates.
2. Run `validate`; repair every error before simulation.
3. Run `evaluate --json --out ...` and use diagnostic codes, coordinates, observed values, and suggestions to revise the grid.
4. Prefer changes that improve a weak category without causing a hard failure or collapsing another category.
5. Run `compare` over the survivors. Inspect both the category breakdown and annotated SVG rather than optimizing only the total score.
6. Load the chosen JSON in **Agent tools**, inspect highlighted findings in **Layout lab**, then export the legacy layout code or Hammer blockout.

The score is a design aid. Simulation remains stochastic and deliberately simplified; final acceptance requires CS2 bot and human playtests.
