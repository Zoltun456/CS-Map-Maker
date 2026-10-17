# 3v3 Map Lab

3v3 Map Lab is a browser-based Counter-Strike 2 layout sketcher. Paint a blockout on a 64-unit grid, inspect route timings and sightlines, run lightweight bot simulations, and export dimensions for Source 2 Hammer.

## Development

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Quality commands:

```sh
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run verify
```

## Autonomous agent workflow

Agents can author readable v1 or layered v2 `.csmap.json` files and use the same versioned evaluator and deterministic search engine as the website without controlling a canvas:

```sh
npm run --silent map -- validate examples/maps/two-site.csmap.json --json
npm run --silent map -- evaluate examples/maps/two-site.csmap.json --seed 42 --out map-artifacts/sample
npm run --silent map -- improve examples/maps/two-site.csmap.json --seed 42 --budget 250 --out map-artifacts/search --json
npm run --silent map -- compare examples/maps --seed 42 --out map-artifacts/comparison --json
npm run --silent agent:trial -- examples/maps/layered-two-site.v2.csmap.json --out map-artifacts/agent-trial
```

The **Agent tools** tab runs the shared rubric, **Search** explores a reproducible Pareto frontier, **2.5D** edits overlapping floors, and **Playtests** stores local human evidence. See [the agent-authoring guide](docs/agent-authoring.md), [v1 schema](public/schema/csmap.schema.json), and [v2 schema](public/schema/csmap-v2.schema.json).

The layered trial uses four fixed seeds, verifies deterministic replay, checks every category floor, and writes a versioned manifest with exact-map and SVG evidence.

`npm run build` produces a conventional static site in `dist/`. The Vite base path is configured for the GitHub Pages project URL at `https://zoltun456.github.io/CS-Map-Maker/`.

## Deployment

Pushes to `main` run the CI checks and deploy the production build through GitHub Actions. To enable the first deployment, open the repository on GitHub, go to **Settings → Pages**, and select **GitHub Actions** as the source under **Build and deployment**. The `Deploy GitHub Pages` workflow builds the application and publishes only `dist/`.

If the project moves to a custom domain or a root user site, change `base` in `vite.config.ts` to `/` before deploying.

## Architecture

- `src/core/` contains framework-independent map, pathfinding, analysis, serialization, simulation, and export logic.
- `src/cli/` exposes validation, analysis, simulation, evaluation, rendering, and comparison to external agents.
- `src/features/` contains React controllers and UI grouped by user workflow.
- `src/content/` contains sample maps, themes, and guide content.
- `src/styles/` contains the shared visual system and responsive rules.
- `tests/` contains Vitest unit/component tests and Playwright browser tests.

Application state is managed through React context and a reducer. The canvas stays imperative for drawing performance; edits flow back through immutable `MapDocument` snapshots. Simulation batches always capture a graph snapshot and are canceled when the layout changes.

## Layout-code compatibility

The app reads and writes the original `CS3V3:` version 1 layout format and retains the `cs3v3-layout` and `cs3v3-tab` local-storage keys. Imported codes are validated before memory is allocated or the current map changes.

## Simulator limits

The simulator is a comparison tool, not a match predictor. Agents use simplified path choice, visibility, cover, reaction, rotation, planting, and defusing rules. Real movement, utility, sound decisions, boosts, economy, and player strategy are outside its model. Always validate a layout through bot and human playtests.

Simulation and candidate search are seeded and reproducible. The `BatchRunner` interface remains the seam for moving larger batches to dedicated workers.

Agent scores combine hard playability gates with flow, timing, combat, and simplified simulation evidence. A high score helps select blockouts; it does not establish that a map is fun.

No license has been selected for this repository.
