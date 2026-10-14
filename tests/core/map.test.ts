import { describe, expect, it } from 'vitest';
import { createMap, paintCells, rasterizeLine } from '../../src/core/map';
import { TileType } from '../../src/core/types';

describe('brush interpolation', () => {
  it('fills every cell crossed by a fast pointer movement', () => {
    const line = rasterizeLine(0, 24, 5);
    expect(line).toEqual([0, 6, 12, 18, 24]);
    const painted = paintCells(createMap(5, 5), line, 1, TileType.Floor);
    expect(line.every((cell) => painted.cells[cell] === TileType.Floor)).toBe(true);
  });
});
