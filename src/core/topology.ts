import { hasLineOfSight } from './graph';
import type { MapGraph } from './types';

export interface TopologyAnalysis {
  articulationPoints: number[];
  encounterCells: number[];
  chokeCells: number[];
  averageDegree: number;
}

export function analyzeTopology(graph: MapGraph): TopologyAnalysis {
  const discovery = new Int32Array(graph.size).fill(-1);
  const low = new Int32Array(graph.size);
  const parent = new Int32Array(graph.size).fill(-1);
  const articulation = new Set<number>();
  let time = 0;
  const visit = (cell: number) => {
    discovery[cell] = low[cell] = time++;
    let children = 0;
    for (const edge of graph.neighbors[cell]) {
      const next = edge.cell;
      if (discovery[next] < 0) {
        parent[next] = cell;
        children += 1;
        visit(next);
        low[cell] = Math.min(low[cell], low[next]);
        if (parent[cell] < 0 ? children > 1 : low[next] >= discovery[cell]) articulation.add(cell);
      } else if (next !== parent[cell]) low[cell] = Math.min(low[cell], discovery[next]);
    }
  };
  for (const cell of graph.walkableCells) if (discovery[cell] < 0) visit(cell);
  const objectives = new Set([...graph.tSpawn, ...graph.ctSpawn, ...graph.siteA, ...graph.siteB]);
  const articulationPoints = [...articulation].filter((cell) => !objectives.has(cell));
  const chokeCells = graph.walkableCells.filter(
    (cell) => graph.neighbors[cell].length <= 2 && !objectives.has(cell),
  );
  const encounterCells = graph.walkableCells.filter((cell) => {
    if (!Number.isFinite(graph.fromT[cell]) || !Number.isFinite(graph.fromCT[cell])) return false;
    if (Math.abs(graph.fromT[cell] - graph.fromCT[cell]) > 4) return false;
    const candidates = graph.walkableCells.filter(
      (other) =>
        Math.abs(graph.fromT[other] - graph.fromCT[cell]) <= 4 &&
        Math.abs(graph.fromCT[other] - graph.fromT[cell]) <= 4,
    );
    return candidates.some((other) => hasLineOfSight(graph, cell, other));
  });
  return {
    articulationPoints,
    encounterCells,
    chokeCells,
    averageDegree: graph.walkableCells.length
      ? graph.walkableCells.reduce((sum, cell) => sum + graph.neighbors[cell].length, 0) /
        graph.walkableCells.length
      : 0,
  };
}
