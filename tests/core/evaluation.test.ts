import { describe, expect, it } from 'vitest';
import { sampleMap } from '../../src/content/maps';
import { evaluateMap } from '../../src/core/evaluation';
import { createPortableMap, parsePortableMap } from '../../src/core/portableMap';
import { TileType } from '../../src/core/types';

describe('agent map evaluation', () => {
  it('scores the sample and returns category evidence', async () => {
    const map = sampleMap();
    const parsed = parsePortableMap(createPortableMap(map, { name: 'Sample' }));
    const result = await evaluateMap(parsed.file, parsed.map, parsed.profile);
    expect(result.valid).toBe(true);
    expect(result.score).toBeGreaterThan(0);
    expect(result.categories.map((category) => category.id)).toEqual(['flow', 'timings', 'combat']);
  });

  it('suppresses scores when separated spawn capacity fails', async () => {
    const map = sampleMap();
    for (let index = 0; index < map.cells.length; index += 1)
      if (map.cells[index] === TileType.TSpawn) map.cells[index] = TileType.Floor;
    map.cells[40 * map.width + 26] = TileType.TSpawn;
    const parsed = parsePortableMap(createPortableMap(map, { name: 'Bad spawn' }));
    const result = await evaluateMap(parsed.file, parsed.map, parsed.profile);
    expect(result.valid).toBe(false);
    expect(result.score).toBeNull();
    expect(result.diagnostics.some((item) => item.code === 'SPAWN_CAPACITY_T')).toBe(true);
  });

  it('reports CT reachability to B independently', async () => {
    const rows = [
      '###############',
      '#T.T.T..AA..BB#',
      '#.............#',
      '###############',
      '#C.C.C..AA....#',
      '#.............#',
      '###############',
    ];
    const parsed = parsePortableMap({
      format: 'cs-map-maker',
      version: 1,
      name: 'Split',
      profile: 'two-site-3v3',
      width: 15,
      height: 7,
      rows,
    });
    const result = await evaluateMap(parsed.file, parsed.map, parsed.profile);
    expect(result.diagnostics.some((item) => item.code === 'UNREACHABLE_CT_B')).toBe(true);
  });
});
