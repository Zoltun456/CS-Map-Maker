import { cloneMap, paintCells, rasterizeLine } from './map';
import { TileType, type MapDocument } from './types';

export type MapOperation =
  | { type: 'paint'; cells: number[]; tile: TileType; brushSize?: number }
  | {
      type: 'rectangle';
      from: { x: number; y: number };
      to: { x: number; y: number };
      tile: TileType;
    }
  | {
      type: 'corridor';
      from: { x: number; y: number };
      to: { x: number; y: number };
      width: number;
    }
  | { type: 'mirror'; axis: 'horizontal' | 'vertical' }
  | { type: 'replace'; from: TileType; to: TileType };

export function applyMapOperations(
  map: MapDocument,
  operations: readonly MapOperation[],
): MapDocument {
  let result = cloneMap(map);
  for (const operation of operations) {
    if (operation.type === 'paint')
      result = paintCells(result, operation.cells, operation.brushSize ?? 1, operation.tile);
    else if (operation.type === 'rectangle') {
      const cells: number[] = [];
      for (
        let y = Math.min(operation.from.y, operation.to.y);
        y <= Math.max(operation.from.y, operation.to.y);
        y += 1
      )
        for (
          let x = Math.min(operation.from.x, operation.to.x);
          x <= Math.max(operation.from.x, operation.to.x);
          x += 1
        )
          if (x >= 0 && y >= 0 && x < result.width && y < result.height)
            cells.push(y * result.width + x);
      result = paintCells(result, cells, 1, operation.tile);
    } else if (operation.type === 'corridor') {
      const from = operation.from.y * result.width + operation.from.x;
      const to = operation.to.y * result.width + operation.to.x;
      result = paintCells(
        result,
        rasterizeLine(from, to, result.width),
        operation.width,
        TileType.Floor,
      );
    } else if (operation.type === 'replace') {
      const next = cloneMap(result);
      next.cells.forEach((tile, index) => {
        if (tile === operation.from) next.cells[index] = operation.to;
      });
      result = next;
    } else {
      const next = cloneMap(result);
      for (let y = 0; y < result.height; y += 1)
        for (let x = 0; x < result.width; x += 1) {
          const sourceX = operation.axis === 'vertical' ? result.width - x - 1 : x;
          const sourceY = operation.axis === 'horizontal' ? result.height - y - 1 : y;
          next.cells[y * result.width + x] = result.cells[sourceY * result.width + sourceX];
        }
      result = next;
    }
  }
  return result;
}
