import { describe, expect, it } from 'vitest';
import { buildGraph } from '../../src/core/graph';
import { createMap } from '../../src/core/map';
import { analyzeTopology } from '../../src/core/topology';
import { TileType } from '../../src/core/types';

describe('tactical topology', () => {
  it('finds single points of failure in a corridor', () => {
    const map = createMap(7, 3);
    for (let x = 1; x < 6; x += 1) map.cells[map.width + x] = TileType.Floor;
    const topology = analyzeTopology(buildGraph(map));
    expect(topology.articulationPoints.length).toBeGreaterThan(0);
    expect(topology.chokeCells.length).toBeGreaterThan(0);
  });
});
