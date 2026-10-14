import { describe, expect, it } from 'vitest';
import { sampleMap } from '../../src/content/maps';
import {
  createPortableMap,
  layoutCodeFromPortableMap,
  parsePortableMap,
  portableMapFromLayoutCode,
  stringifyPortableMap,
} from '../../src/core/portableMap';
import { encodeMap } from '../../src/core/serialization';

describe('agent map format', () => {
  it('round trips readable rows and metadata', () => {
    const map = sampleMap();
    const file = createPortableMap(map, {
      name: 'Agent candidate',
      notes: 'Keep mid compact.',
      profile: 'two-site-3v3',
      targets: { maxSightlineUnits: 2400 },
    });
    const parsed = parsePortableMap(stringifyPortableMap(file));
    expect(parsed.map).toEqual(map);
    expect(parsed.file.notes).toBe('Keep mid compact.');
    expect(parsed.profile.targets.maxSightlineUnits).toBe(2400);
  });

  it('converts to and from legacy layout codes', () => {
    const map = sampleMap();
    const portable = portableMapFromLayoutCode(encodeMap(map), { name: 'Legacy import' });
    expect(parsePortableMap(portable).map).toEqual(map);
    expect(
      parsePortableMap(portableMapFromLayoutCode(layoutCodeFromPortableMap(portable))).map,
    ).toEqual(map);
  });

  it.each([
    ['unknown root field', { extra: true }],
    ['unknown target', { targets: { mystery: 3 } }],
    ['bad row width', { rows: ['#'] }],
    ['bad symbol', { rows: ['?'] }],
  ])('rejects %s', (_name, change) => {
    const file = createPortableMap(sampleMap(), { name: 'Candidate' }) as unknown as Record<
      string,
      unknown
    >;
    Object.assign(file, change);
    expect(() => parsePortableMap(file)).toThrow();
  });
});
