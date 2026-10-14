import { describe, expect, it } from 'vitest';
import { buildGraph, hasLineOfSight } from '../../src/core/graph';
import { createMap } from '../../src/core/map';
import { TileType } from '../../src/core/types';

describe('map graph', () => {
  it('does not cut diagonally through blocked corners', () => {
    const map = createMap(2, 2, TileType.Floor);
    map.cells[1] = TileType.Wall;
    map.cells[2] = TileType.Wall;
    expect(buildGraph(map).neighbors[0]).toEqual([]);
  });
  it('treats cover boxes as movement and sight blockers', () => {
    const map = createMap(3, 1, TileType.Floor);
    map.cells[1] = TileType.Cover;
    const graph = buildGraph(map);
    expect(graph.walkable[1]).toBe(0);
    expect(hasLineOfSight(graph, 0, 2)).toBe(false);
  });
});
