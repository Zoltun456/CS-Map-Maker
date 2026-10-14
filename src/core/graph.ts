import { RUN_SPEED_CELLS_PER_SECOND } from './map';
import { tileDefinition } from './tiles';
import { TileType, type MapDocument, type MapGraph } from './types';

const DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export function buildGraph(map: MapDocument): MapGraph {
  const immutableMap = { width: map.width, height: map.height, cells: map.cells.slice() };
  const size = map.width * map.height;
  const walkable = new Uint8Array(size);
  for (let index = 0; index < size; index += 1)
    walkable[index] = tileDefinition(map.cells[index]).walkable ? 1 : 0;
  const neighbors = Array.from({ length: size }, () => [] as { cell: number; cost: number }[]);
  const walkableCells: number[] = [];
  const isWalkable = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < map.width && y < map.height && Boolean(walkable[y * map.width + x]);
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1) {
      const index = y * map.width + x;
      if (!walkable[index]) continue;
      walkableCells.push(index);
      for (const [dx, dy, cost] of DIRECTIONS) {
        if (!isWalkable(x + dx, y + dy)) continue;
        if (dx && dy && !(isWalkable(x + dx, y) && isWalkable(x, y + dy))) continue;
        neighbors[index].push({ cell: (y + dy) * map.width + x + dx, cost });
      }
    }
  const cellsOfType = (type: TileType) =>
    Array.from(map.cells, (_, index) => index).filter((index) => map.cells[index] === type);
  const graph = {
    map: immutableMap,
    width: map.width,
    height: map.height,
    size,
    walkable,
    neighbors,
    walkableCells,
    fieldCache: new Map<number, Float64Array>(),
    sightCache: new Uint8Array(size * size),
    tSpawn: cellsOfType(TileType.TSpawn),
    ctSpawn: cellsOfType(TileType.CTSpawn),
    siteA: cellsOfType(TileType.SiteA),
    siteB: cellsOfType(TileType.SiteB),
  } as MapGraph;
  graph.fromT = distanceField(graph, graph.tSpawn);
  graph.fromCT = distanceField(graph, graph.ctSpawn);
  graph.fromA = distanceField(graph, graph.siteA);
  graph.fromB = distanceField(graph, graph.siteB);
  return graph;
}

export function distanceField(graph: MapGraph, sources: readonly number[]): Float64Array {
  const distances = new Float64Array(graph.size).fill(Infinity);
  const heap: Array<[number, number]> = [];
  const push = (distance: number, cell: number) => {
    heap.push([distance, cell]);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent][0] <= heap[index][0]) break;
      [heap[parent], heap[index]] = [heap[index], heap[parent]];
      index = parent;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      heap[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
        if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
        if (smallest === index) break;
        [heap[smallest], heap[index]] = [heap[index], heap[smallest]];
        index = smallest;
      }
    }
    return top;
  };
  for (const source of sources)
    if (graph.walkable[source]) {
      distances[source] = 0;
      push(0, source);
    }
  while (heap.length) {
    const [distance, cell] = pop();
    if (distance > distances[cell]) continue;
    for (const edge of graph.neighbors[cell]) {
      const next = distance + edge.cost;
      if (next < distances[edge.cell]) {
        distances[edge.cell] = next;
        push(next, edge.cell);
      }
    }
  }
  return distances;
}

export function distanceTo(graph: MapGraph, cell: number): Float64Array {
  let distances = graph.fieldCache.get(cell);
  if (!distances) {
    if (graph.fieldCache.size > 500) graph.fieldCache.clear();
    distances = distanceField(graph, [cell]);
    graph.fieldCache.set(cell, distances);
  }
  return distances;
}

export function hasLineOfSight(graph: MapGraph, from: number, to: number): boolean {
  if (from === to) return true;
  const key = from * graph.size + to;
  const cached = graph.sightCache[key];
  if (cached) return cached === 1;
  const ax = (from % graph.width) + 0.5;
  const ay = Math.floor(from / graph.width) + 0.5;
  const bx = (to % graph.width) + 0.5;
  const by = Math.floor(to / graph.width) + 0.5;
  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.ceil(Math.hypot(dx, dy) * 4);
  let visible = true;
  for (let step = 1; step < steps; step += 1) {
    const x = Math.floor(ax + (dx * step) / steps);
    const y = Math.floor(ay + (dy * step) / steps);
    if (tileDefinition(graph.map.cells[y * graph.width + x]).blocksSight) {
      visible = false;
      break;
    }
  }
  graph.sightCache[key] = graph.sightCache[to * graph.size + from] = visible ? 1 : 2;
  return visible;
}

export function secondsForDistance(distance: number): number {
  return distance / RUN_SPEED_CELLS_PER_SECOND;
}
