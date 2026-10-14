import { createMap } from '../core/map';
import { TileType, type MapDocument } from '../core/types';

export function sampleMap(): MapDocument {
  const map = createMap(56, 44);
  const rect = (x0: number, y0: number, x1: number, y1: number, tile: TileType) => {
    for (let y = y0; y <= y1; y += 1)
      for (let x = x0; x <= x1; x += 1) map.cells[y * map.width + x] = tile;
  };
  rect(24, 1, 31, 5, TileType.Floor);
  rect(25, 2, 30, 2, TileType.CTSpawn);
  rect(10, 2, 24, 5, TileType.Floor);
  rect(31, 2, 46, 5, TileType.Floor);
  rect(3, 4, 17, 16, TileType.Floor);
  rect(6, 7, 13, 12, TileType.SiteA);
  rect(39, 4, 52, 16, TileType.Floor);
  rect(42, 7, 49, 12, TileType.SiteB);
  rect(21, 37, 34, 42, TileType.Floor);
  rect(24, 40, 31, 40, TileType.TSpawn);
  rect(3, 37, 21, 40, TileType.Floor);
  rect(3, 16, 6, 40, TileType.Floor);
  rect(3, 28, 4, 28, TileType.Wall);
  rect(25, 20, 30, 36, TileType.Floor);
  rect(13, 22, 25, 24, TileType.Floor);
  rect(12, 16, 15, 24, TileType.Floor);
  rect(25, 30, 26, 30, TileType.Wall);
  rect(25, 18, 37, 20, TileType.Floor);
  rect(34, 6, 37, 19, TileType.Floor);
  rect(35, 34, 50, 37, TileType.Floor);
  rect(47, 16, 50, 37, TileType.Floor);
  rect(30, 24, 44, 26, TileType.Floor);
  rect(41, 16, 44, 26, TileType.Floor);
  [
    [8, 9],
    [9, 9],
    [12, 11],
    [44, 9],
    [47, 11],
    [45, 11],
    [5, 31],
    [27, 28],
    [15, 38],
    [40, 35],
    [33, 19],
    [16, 8],
    [40, 13],
  ].forEach(([x, y]) => {
    map.cells[y * map.width + x] = TileType.Cover;
  });
  return map;
}

export function permafrostMap(): MapDocument {
  const map = sampleMap();
  const inside = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y += 1)
      for (let x = x0; x <= x1; x += 1)
        if (map.cells[y * map.width + x] === TileType.Floor)
          map.cells[y * map.width + x] = TileType.Indoor;
  };
  inside(24, 1, 31, 5);
  inside(31, 2, 46, 5);
  inside(39, 4, 52, 16);
  inside(34, 6, 37, 19);
  inside(31, 18, 37, 20);
  inside(30, 24, 44, 26);
  inside(41, 16, 44, 26);
  inside(47, 16, 50, 37);
  inside(35, 34, 50, 37);
  inside(12, 16, 15, 21);
  return map;
}
