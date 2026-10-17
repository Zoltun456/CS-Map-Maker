import { describe, expect, it } from 'vitest';
import { sampleMap } from '../../src/content/maps';
import {
  cloneDocumentV2,
  isV1Representable,
  liftV1Map,
  lowerV2ToV1,
} from '../../src/core/documentV2';
import { createPortableMapV2, parsePortableMapV2 } from '../../src/core/portableV2';

describe('version 2 map documents', () => {
  it('lifts v1 without mutating it and round trips layered JSON', () => {
    const map = sampleMap();
    const document = liftV1Map(map);
    const cloned = cloneDocumentV2(document);
    cloned.levels[0].geometry[0] = 'floor';
    expect(document.levels[0].geometry[0]).toBe('wall');
    expect(isV1Representable(document)).toBe(true);
    expect(lowerV2ToV1(document)).toEqual(map);

    document.levels.push({
      id: 'bridge',
      name: 'Bridge',
      elevation: 128,
      ceilingHeight: 192,
      geometry: Array(document.width * document.height).fill('void'),
    });
    document.links.push({
      id: 'stairs-1',
      kind: 'stairs',
      from: { levelId: 'ground', x: 4, y: 4 },
      to: { levelId: 'bridge', x: 4, y: 4 },
      bidirectional: true,
    });
    const file = createPortableMapV2(document, { name: 'Layered', profile: 'two-site-3v3' });
    const parsed = parsePortableMapV2(file);
    expect(parsed.document.levels).toHaveLength(2);
    expect(parsed.document.links[0].kind).toBe('stairs');
    expect(isV1Representable(parsed.document)).toBe(false);
    expect(() => lowerV2ToV1(parsed.document)).toThrow('cannot be exported losslessly');
  });
});
