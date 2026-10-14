# Agent Guide

## Commands

- Install with `npm install` and keep `package-lock.json` committed.
- Run all required local checks with `npm run verify` and browser coverage with `npm run test:e2e`.
- For autonomous map work, start with `docs/agent-authoring.md` and use `npm run map -- evaluate` rather than reimplementing checks.
- Never edit generated output in `dist/`, coverage reports, or Playwright reports.

## Boundaries

- Keep `src/core/` pure and independent of React and browser DOM APIs, except standard platform types such as `AbortSignal`.
- UI components may orchestrate core functions but must not duplicate simulation, pathfinding, serialization, or tile rules.
- Browser Agent Tools and the CLI must call the same portable-map parser and evaluator from `src/core/`.
- All map changes use immutable `MapDocument` snapshots through the app reducer so undo, persistence, and simulation cancellation stay coherent.
- The canvas renderer draws state; it does not own application state.

## Invariants

- Every visibility consumer uses `TileDefinition.blocksSight` through `hasLineOfSight`.
- Every movement consumer uses the graph produced from `TileDefinition.walkable`.
- Batch runs use a captured graph and must support cancellation without leaving controls disabled or publishing stale results.
- One bomb may have at most one active defuser. Changing or interrupting the defuser resets progress.
- Layout-code version 1, the `CS3V3:` prefix, and existing local-storage keys remain backward compatible.
- A pointer stroke creates one undo entry, including interpolated cells and cancellation cleanup.
- New interactive UI must be operable with a keyboard and expose an accessible name and state.
- Diagnostic codes and `.csmap.json` symbols are public agent interfaces; change them only with versioned compatibility handling.

## Tests

Add core regression tests for rule changes and Playwright coverage for cross-component workflows. Avoid tests that merely restate implementation details.
