import {
  cloneDocumentV2,
  type GeometryType,
  type MapDocumentV2,
  type MapLocation,
} from './documentV2';

export type MapOperationV2 =
  | {
      type: 'paint-geometry';
      levelId: string;
      cells: Array<Pick<MapLocation, 'x' | 'y'>>;
      geometry: GeometryType;
    }
  | { type: 'set-level'; levelId: string; elevation?: number; ceilingHeight?: number };

export function applyMapOperationsV2(
  document: MapDocumentV2,
  operations: readonly MapOperationV2[],
) {
  const next = cloneDocumentV2(document);
  next.legacySource = undefined;
  for (const operation of operations) {
    const level = next.levels.find((item) => item.id === operation.levelId);
    if (!level) throw new Error(`Unknown level: ${operation.levelId}`);
    if (operation.type === 'paint-geometry') {
      for (const point of operation.cells) {
        if (point.x < 0 || point.y < 0 || point.x >= next.width || point.y >= next.height)
          throw new Error(`Operation coordinate is outside level ${level.id}.`);
        level.geometry[point.y * next.width + point.x] = operation.geometry;
      }
    } else {
      if (operation.elevation !== undefined) level.elevation = operation.elevation;
      if (operation.ceilingHeight !== undefined) level.ceilingHeight = operation.ceilingHeight;
    }
  }
  return next;
}
