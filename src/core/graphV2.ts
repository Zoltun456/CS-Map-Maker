import type { MapDocumentV2, MapLocation, TraversalKind } from './documentV2';

export interface GraphEdgeV2 {
  node: number;
  cost: number;
  traversal: 'walk' | TraversalKind;
}

export interface MapGraphV2 {
  document: MapDocumentV2;
  area: number;
  size: number;
  walkable: Uint8Array;
  neighbors: GraphEdgeV2[][];
  levelIndex: Map<string, number>;
  zoneNodes: Map<string, number[]>;
}

const WALKABLE = new Set(['floor']);
const DIRECTIONS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

export const nodeForLocation = (graph: MapGraphV2, location: Omit<MapLocation, 'z'>) => {
  const level = graph.levelIndex.get(location.levelId);
  return level === undefined
    ? -1
    : level * graph.area + location.y * graph.document.width + location.x;
};

export function buildGraphV2(document: MapDocumentV2): MapGraphV2 {
  const area = document.width * document.height;
  const levelIndex = new Map(document.levels.map((level, index) => [level.id, index]));
  const size = area * document.levels.length;
  const walkable = new Uint8Array(size);
  const neighbors = Array.from({ length: size }, () => [] as GraphEdgeV2[]);
  const graph: MapGraphV2 = {
    document,
    area,
    size,
    walkable,
    neighbors,
    levelIndex,
    zoneNodes: new Map(),
  };
  const inBounds = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < document.width && y < document.height;
  document.levels.forEach((level, levelNumber) => {
    for (let cell = 0; cell < area; cell += 1)
      walkable[levelNumber * area + cell] = WALKABLE.has(level.geometry[cell]) ? 1 : 0;
    for (let y = 0; y < document.height; y += 1)
      for (let x = 0; x < document.width; x += 1) {
        const node = levelNumber * area + y * document.width + x;
        if (!walkable[node]) continue;
        for (const [dx, dy, cost] of DIRECTIONS) {
          if (!inBounds(x + dx, y + dy)) continue;
          const next = levelNumber * area + (y + dy) * document.width + x + dx;
          if (!walkable[next]) continue;
          if (dx && dy) {
            const sideA = levelNumber * area + y * document.width + x + dx;
            const sideB = levelNumber * area + (y + dy) * document.width + x;
            if (!walkable[sideA] || !walkable[sideB]) continue;
          }
          const blocked = document.features.some(
            (feature) =>
              feature.kind === 'door' &&
              !feature.open &&
              ((nodeForLocation(graph, feature.from) === node &&
                nodeForLocation(graph, feature.to) === next) ||
                (nodeForLocation(graph, feature.to) === node &&
                  nodeForLocation(graph, feature.from) === next)),
          );
          if (!blocked) neighbors[node].push({ node: next, cost, traversal: 'walk' });
        }
      }
  });
  for (const link of document.links) {
    const from = nodeForLocation(graph, link.from);
    const to = nodeForLocation(graph, link.to);
    if (from < 0 || to < 0 || !walkable[from] || !walkable[to]) continue;
    const fromLevel = document.levels[Math.floor(from / area)];
    const toLevel = document.levels[Math.floor(to / area)];
    const horizontal = Math.hypot(link.from.x - link.to.x, link.from.y - link.to.y);
    const vertical = Math.abs(fromLevel.elevation - toLevel.elevation) / document.cellSize;
    const cost = Math.max(1, Math.hypot(horizontal, vertical));
    neighbors[from].push({ node: to, cost, traversal: link.kind });
    if (link.bidirectional) neighbors[to].push({ node: from, cost, traversal: link.kind });
  }
  for (const zone of document.zones)
    graph.zoneNodes.set(
      zone.id,
      zone.cells.map((cell) => nodeForLocation(graph, cell)).filter((node) => node >= 0),
    );
  return graph;
}

export function validateGraphV2(graph: MapGraphV2): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const link of graph.document.links) {
    if (ids.has(link.id)) errors.push(`Duplicate traversal link ID: ${link.id}`);
    ids.add(link.id);
    const from = nodeForLocation(graph, link.from);
    const to = nodeForLocation(graph, link.to);
    if (from < 0 || to < 0)
      errors.push(`Traversal ${link.id} references an unknown level or cell.`);
    else if (!graph.walkable[from] || !graph.walkable[to])
      errors.push(`Traversal ${link.id} must connect walkable floor cells.`);
    else if (link.kind === 'drop' && link.bidirectional)
      errors.push(`Drop ${link.id} cannot be bidirectional.`);
  }
  for (const level of graph.document.levels)
    if (level.ceilingHeight < 128)
      errors.push(`Level ${level.id} has insufficient player clearance.`);
  return errors;
}

export function hasLineOfSightV2(graph: MapGraphV2, from: number, to: number): boolean {
  if (from === to) return true;
  const width = graph.document.width;
  const area = graph.area;
  const point = (node: number) => {
    const levelNumber = Math.floor(node / area);
    const cell = node % area;
    const level = graph.document.levels[levelNumber];
    return {
      x: (cell % width) + 0.5,
      y: Math.floor(cell / width) + 0.5,
      z: (level.elevation + 64) / graph.document.cellSize,
    };
  };
  const a = point(from);
  const b = point(to);
  const fromLevel = Math.floor(from / area);
  const toLevel = Math.floor(to / area);
  let previousX = Math.floor(a.x);
  let previousY = Math.floor(a.y);
  const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 4));
  for (let step = 1; step < steps; step += 1) {
    const ratio = step / steps;
    const x = Math.floor(a.x + (b.x - a.x) * ratio);
    const y = Math.floor(a.y + (b.y - a.y) * ratio);
    const z = (a.z + (b.z - a.z) * ratio) * graph.document.cellSize;
    if ((x !== previousX || y !== previousY) && fromLevel === toLevel) {
      const levelId = graph.document.levels[fromLevel].id;
      const edge = graph.document.features.find(
        (feature) =>
          feature.from.levelId === levelId &&
          feature.to.levelId === levelId &&
          ((feature.from.x === previousX &&
            feature.from.y === previousY &&
            feature.to.x === x &&
            feature.to.y === y) ||
            (feature.to.x === previousX &&
              feature.to.y === previousY &&
              feature.from.x === x &&
              feature.from.y === y)),
      );
      if (edge?.kind === 'door' && !edge.open) return false;
      if (
        edge?.kind === 'one-way-sight' &&
        !(
          edge.from.x === previousX &&
          edge.from.y === previousY &&
          edge.to.x === x &&
          edge.to.y === y
        )
      )
        return false;
      previousX = x;
      previousY = y;
    }
    for (const level of graph.document.levels) {
      const geometry = level.geometry[y * width + x];
      const height =
        geometry === 'half-cover'
          ? 48
          : geometry === 'full-cover' || geometry === 'wall'
            ? level.ceilingHeight
            : 0;
      if (height && z >= level.elevation && z <= level.elevation + height) return false;
    }
  }
  return true;
}
