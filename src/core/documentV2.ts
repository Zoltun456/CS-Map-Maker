import { TileType, type MapDocument } from './types';

export type GeometryType = 'void' | 'floor' | 'wall' | 'full-cover' | 'half-cover';
export type ZoneKind =
  't-spawn' | 'ct-spawn' | 'site-a' | 'site-b' | 'indoor' | 'callout' | 'material';
export type EdgeFeatureKind = 'door' | 'window' | 'railing' | 'one-way-sight';
export type TraversalKind = 'stairs' | 'ramp' | 'ladder' | 'drop' | 'boost';

export interface MapLocation {
  levelId: string;
  x: number;
  y: number;
  z: number;
}

export interface MapLevel {
  id: string;
  name: string;
  elevation: number;
  ceilingHeight: number;
  geometry: GeometryType[];
}

export interface MapZone {
  id: string;
  kind: ZoneKind;
  name?: string;
  material?: string;
  cells: Array<Omit<MapLocation, 'z'>>;
}

export interface EdgeFeature {
  id: string;
  kind: EdgeFeatureKind;
  from: Omit<MapLocation, 'z'>;
  to: Omit<MapLocation, 'z'>;
  open?: boolean;
}

export interface TraversalLink {
  id: string;
  kind: TraversalKind;
  from: Omit<MapLocation, 'z'>;
  to: Omit<MapLocation, 'z'>;
  bidirectional: boolean;
}

export interface MapDocumentV2 {
  version: 2;
  width: number;
  height: number;
  cellSize: 64;
  levels: MapLevel[];
  zones: MapZone[];
  features: EdgeFeature[];
  links: TraversalLink[];
  legacySource?: MapDocument;
}

const geometryForTile = (tile: TileType): GeometryType => {
  if (tile === TileType.Wall) return 'wall';
  if (tile === TileType.Cover) return 'full-cover';
  return 'floor';
};

export function liftV1Map(map: MapDocument): MapDocumentV2 {
  const zoneCells = (tile: TileType) =>
    Array.from(map.cells, (value, index) => ({ value, index }))
      .filter(({ value }) => value === tile)
      .map(({ index }) => ({
        levelId: 'ground',
        x: index % map.width,
        y: Math.floor(index / map.width),
      }));
  const zones: MapZone[] = [
    ['t-spawn', TileType.TSpawn],
    ['ct-spawn', TileType.CTSpawn],
    ['site-a', TileType.SiteA],
    ['site-b', TileType.SiteB],
    ['indoor', TileType.Indoor],
  ].flatMap(([kind, tile], index) => {
    const cells = zoneCells(tile as TileType);
    return cells.length ? [{ id: `legacy-${index}`, kind: kind as ZoneKind, cells }] : [];
  });
  return {
    version: 2,
    width: map.width,
    height: map.height,
    cellSize: 64,
    levels: [
      {
        id: 'ground',
        name: 'Ground',
        elevation: 0,
        ceilingHeight: 192,
        geometry: Array.from(map.cells, (value) => geometryForTile(value as TileType)),
      },
    ],
    zones,
    features: [],
    links: [],
    legacySource: { width: map.width, height: map.height, cells: map.cells.slice() },
  };
}

export function cloneDocumentV2(document: MapDocumentV2): MapDocumentV2 {
  return {
    ...document,
    levels: document.levels.map((level) => ({ ...level, geometry: [...level.geometry] })),
    zones: document.zones.map((zone) => ({
      ...zone,
      cells: zone.cells.map((cell) => ({ ...cell })),
    })),
    features: document.features.map((feature) => ({
      ...feature,
      from: { ...feature.from },
      to: { ...feature.to },
    })),
    links: document.links.map((link) => ({ ...link, from: { ...link.from }, to: { ...link.to } })),
    ...(document.legacySource
      ? { legacySource: { ...document.legacySource, cells: document.legacySource.cells.slice() } }
      : {}),
  };
}

export function isV1Representable(document: MapDocumentV2): boolean {
  return Boolean(
    document.legacySource &&
    document.levels.length === 1 &&
    document.features.length === 0 &&
    document.links.length === 0,
  );
}

export function lowerV2ToV1(document: MapDocumentV2): MapDocument {
  if (!isV1Representable(document) || !document.legacySource)
    throw new Error(
      'This layered map uses v2-only features and cannot be exported losslessly as v1.',
    );
  return {
    width: document.legacySource.width,
    height: document.legacySource.height,
    cells: document.legacySource.cells.slice(),
  };
}
