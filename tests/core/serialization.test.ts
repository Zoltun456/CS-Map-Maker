import { describe, expect, it } from 'vitest';
import { createMap } from '../../src/core/map';
import { decodeMap, encodeMap, LayoutCodeError } from '../../src/core/serialization';
import { TileType } from '../../src/core/types';

describe('layout-code serialization', () => {
  it('round trips the legacy v1 format', () => {
    const map = createMap(4, 3);
    map.cells.set([0, 0, 1, 1, 2, 3, 4, 5, 6, 7, 1, 0]);
    const decoded = decodeMap(encodeMap(map));
    expect(decoded).toEqual(map);
  });
  it.each([
    ['missing prefix', btoa(JSON.stringify({ v: 1, W: 1, H: 1, c: '0,' }))],
    ['bad version', `CS3V3:${btoa(JSON.stringify({ v: 2, W: 1, H: 1, c: '0,' }))}`],
    ['oversized', `CS3V3:${btoa(JSON.stringify({ v: 1, W: 97, H: 1, c: '0x97,' }))}`],
    ['bad tile', `CS3V3:${btoa(JSON.stringify({ v: 1, W: 1, H: 1, c: '8,' }))}`],
    ['bad count', `CS3V3:${btoa(JSON.stringify({ v: 1, W: 1, H: 1, c: '0x2,' }))}`],
  ])('rejects %s', (_name, code) => expect(() => decodeMap(code)).toThrow(LayoutCodeError));
  it('does not allocate until dimensions are validated', () => {
    const code = `CS3V3:${btoa(JSON.stringify({ v: 1, W: Number.MAX_SAFE_INTEGER, H: Number.MAX_SAFE_INTEGER, c: `${TileType.Wall},` }))}`;
    expect(() => decodeMap(code)).toThrow('dimensions');
  });
});
