import { TileType, type MapDocument } from './types';

export const HAMMER_UNITS_PER_CELL = 64;
export const RUN_SPEED_CELLS_PER_SECOND = 220 / HAMMER_UNITS_PER_CELL;

export function createMap(width: number, height: number, fill = TileType.Wall): MapDocument {
  const cells = new Uint8Array(width * height);
  if (fill !== TileType.Wall) cells.fill(fill);
  return { width, height, cells };
}

export function cloneMap(map: MapDocument): MapDocument {
  return { width: map.width, height: map.height, cells: map.cells.slice() };
}

export function resizeMap(map: MapDocument, width: number, height: number): MapDocument {
  const resized = createMap(width, height);
  for (let y = 0; y < Math.min(height, map.height); y += 1) {
    for (let x = 0; x < Math.min(width, map.width); x += 1) {
      resized.cells[y * width + x] = map.cells[y * map.width + x];
    }
  }
  return resized;
}

export function rasterizeLine(from: number, to: number, width: number): number[] {
  let x0 = from % width;
  let y0 = Math.floor(from / width);
  const x1 = to % width;
  const y1 = Math.floor(to / width);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  const cells: number[] = [];
  for (;;) {
    cells.push(y0 * width + x0);
    if (x0 === x1 && y0 === y1) break;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x0 += sx;
    }
    if (twice <= dx) {
      error += dx;
      y0 += sy;
    }
  }
  return cells;
}

export function paintCells(
  map: MapDocument,
  centers: readonly number[],
  brushSize: number,
  tile: TileType,
): MapDocument {
  const next = cloneMap(map);
  const offset = Math.floor((brushSize - 1) / 2);
  for (const center of centers) {
    const startX = (center % map.width) - offset;
    const startY = Math.floor(center / map.width) - offset;
    for (let y = startY; y < startY + brushSize; y += 1) {
      for (let x = startX; x < startX + brushSize; x += 1) {
        if (x >= 0 && y >= 0 && x < map.width && y < map.height)
          next.cells[y * map.width + x] = tile;
      }
    }
  }
  return next;
}
