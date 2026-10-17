import { describe, expect, it } from 'vitest';
import { createPortableMap, parsePortableMap } from '../../src/core/portableMap';
import { searchMaps } from '../../src/core/search';
import { sampleMap } from '../../src/content/maps';

describe('deterministic candidate search', () => {
  it('repeats the same frontier for a seed without mutating the parent', async () => {
    const parsed = parsePortableMap(createPortableMap(sampleMap(), { name: 'Search base' }));
    const before = parsed.map.cells.slice();
    const request = {
      map: parsed.map,
      file: parsed.file,
      profile: parsed.profile,
      seed: 42,
      budget: 8,
    };
    const first = await searchMaps(request);
    const second = await searchMaps(request);
    expect(first.frontier.map((candidate) => candidate.mapHash)).toEqual(
      second.frontier.map((candidate) => candidate.mapHash),
    );
    expect(parsed.map.cells).toEqual(before);
  });
});
