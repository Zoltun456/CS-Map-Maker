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

Agents can author the readable `.csmap.json` format and use the same evaluator as the website without controlling a canvas:

```sh
npm run map -- validate examples/maps/two-site.csmap.json --json
npm run map -- evaluate examples/maps/two-site.csmap.json --out map-artifacts/sample
npm run map -- compare examples/maps --out map-artifacts/comparison --json
```

The **Agent tools** tab imports and exports the format, runs the shared 0–100 rubric, highlights diagnostic coordinates, and downloads reports, SVG previews, layout codes, and Hammer output. See [the agent-authoring guide](docs/agent-authoring.md) and [JSON Schema](public/schema/csmap.schema.json).

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

Simulation randomness deliberately remains non-deterministic. A future improvement should move batches behind Web Workers so hundreds or thousands of rounds can run in parallel, reducing variance while keeping the interface responsive. The `BatchRunner` interface is the seam for that work.

Agent scores combine hard playability gates with flow, timing, combat, and simplified simulation evidence. A high score helps select blockouts; it does not establish that a map is fun.

No license has been selected for this repository.
