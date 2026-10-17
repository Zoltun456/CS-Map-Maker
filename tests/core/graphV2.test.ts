import { describe, expect, it } from 'vitest';
import {
  buildGraphV2,
  hasLineOfSightV2,
  nodeForLocation,
  validateGraphV2,
} from '../../src/core/graphV2';
import type { MapDocumentV2 } from '../../src/core/documentV2';

const document = (): MapDocumentV2 => ({
  version: 2,
  width: 3,
  height: 2,
  cellSize: 64,
  levels: [
    {
      id: 'low',
      name: 'Low',
      elevation: 0,
      ceilingHeight: 192,
      geometry: ['floor', 'half-cover', 'floor', 'floor', 'floor', 'floor'],
    },
    {
      id: 'high',
      name: 'High',
      elevation: 128,
      ceilingHeight: 192,
      geometry: ['floor', 'void', 'void', 'void', 'void', 'void'],
    },
  ],
  zones: [],
  features: [],
  links: [
    {
      id: 'ladder',
      kind: 'ladder',
      from: { levelId: 'low', x: 0, y: 0 },
      to: { levelId: 'high', x: 0, y: 0 },
      bidirectional: true,
    },
  ],
});

describe('2.5D graph', () => {
  it('connects layered floors only through traversal links', () => {
    const graph = buildGraphV2(document());
    const low = nodeForLocation(graph, { levelId: 'low', x: 0, y: 0 });
    const high = nodeForLocation(graph, { levelId: 'high', x: 0, y: 0 });
    expect(graph.neighbors[low]).toContainEqual(
      expect.objectContaining({ node: high, traversal: 'ladder' }),
    );
    expect(validateGraphV2(graph)).toEqual([]);
  });

  it('allows sight over half cover but not through full-height cover', () => {
    const map = document();
    const graph = buildGraphV2(map);
    const left = nodeForLocation(graph, { levelId: 'low', x: 0, y: 0 });
    const right = nodeForLocation(graph, { levelId: 'low', x: 2, y: 0 });
    expect(hasLineOfSightV2(graph, left, right)).toBe(true);
    map.levels[0].geometry[1] = 'full-cover';
    expect(hasLineOfSightV2(buildGraphV2(map), left, right)).toBe(false);
  });

  it('respects closed doors and directional visibility features', () => {
    const map = document();
    map.levels[0].geometry[1] = 'floor';
    map.features = [
      {
        id: 'door',
        kind: 'door',
        from: { levelId: 'low', x: 0, y: 0 },
        to: { levelId: 'low', x: 1, y: 0 },
        open: false,
      },
    ];
    let graph = buildGraphV2(map);
    const left = nodeForLocation(graph, { levelId: 'low', x: 0, y: 0 });
    const right = nodeForLocation(graph, { levelId: 'low', x: 2, y: 0 });
    expect(hasLineOfSightV2(graph, left, right)).toBe(false);
    map.features = [
      {
        id: 'one-way',
        kind: 'one-way-sight',
        from: { levelId: 'low', x: 0, y: 0 },
        to: { levelId: 'low', x: 1, y: 0 },
      },
    ];
    graph = buildGraphV2(map);
    expect(hasLineOfSightV2(graph, left, right)).toBe(true);
    expect(hasLineOfSightV2(graph, right, left)).toBe(false);
  });
});
