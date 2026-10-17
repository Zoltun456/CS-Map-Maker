import type { MapProfileId, PortableMapFile } from './agentTypes';
import {
  cloneDocumentV2,
  type EdgeFeature,
  type MapDocumentV2,
  type MapZone,
  type TraversalLink,
} from './documentV2';

export interface PortableMapLevelV2 {
  id: string;
  name: string;
  elevation: number;
  ceilingHeight: number;
  rows: string[];
}

export interface PortableMapFileV2 {
  format: 'cs-map-maker';
  version: 2;
  name: string;
  notes?: string;
  profile: MapProfileId;
  width: number;
  height: number;
  cellSize: 64;
  levels: PortableMapLevelV2[];
  zones: MapZone[];
  features: EdgeFeature[];
  links: TraversalLink[];
  designTargets?: PortableMapFile['targets'];
}

const SYMBOLS = { _: 'void', '.': 'floor', '#': 'wall', X: 'full-cover', x: 'half-cover' } as const;
const REVERSE = new Map(Object.entries(SYMBOLS).map(([symbol, geometry]) => [geometry, symbol]));
const ZONE_KINDS = new Set([
  't-spawn',
  'ct-spawn',
  'site-a',
  'site-b',
  'indoor',
  'callout',
  'material',
]);
const FEATURE_KINDS = new Set(['door', 'window', 'railing', 'one-way-sight']);
const LINK_KINDS = new Set(['stairs', 'ramp', 'ladder', 'drop', 'boost']);
const validId = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);

const integer = (value: unknown, label: string, minimum: number, maximum: number) => {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum)
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  return value as number;
};

export function parsePortableMapV2(value: unknown): {
  file: PortableMapFileV2;
  document: MapDocumentV2;
} {
  if (!value || typeof value !== 'object') throw new Error('v2 map root must be an object');
  const file = value as PortableMapFileV2;
  if (file.format !== 'cs-map-maker' || file.version !== 2) throw new Error('unsupported v2 map');
  if (typeof file.name !== 'string' || !file.name.trim())
    throw new Error('v2 map name is required');
  if (file.profile !== 'two-site-3v3' && file.profile !== 'one-site-3v3')
    throw new Error('unsupported v2 profile');
  const width = integer(file.width, 'width', 1, 96);
  const height = integer(file.height, 'height', 1, 96);
  if (file.cellSize !== 64) throw new Error('v2 cellSize must be 64');
  if (!Array.isArray(file.levels) || !file.levels.length)
    throw new Error('v2 map needs at least one level');
  const ids = new Set<string>();
  const levels = file.levels.map((level) => {
    if (!validId(level.id) || ids.has(level.id))
      throw new Error('level IDs must be valid and unique');
    ids.add(level.id);
    if (!Array.isArray(level.rows) || level.rows.length !== height)
      throw new Error(`level ${level.id} row count must match height`);
    const geometry = level.rows.flatMap((row) => {
      if (typeof row !== 'string' || row.length !== width)
        throw new Error(`level ${level.id} row width must match width`);
      return [...row].map((symbol) => {
        const geometry = SYMBOLS[symbol as keyof typeof SYMBOLS];
        if (!geometry) throw new Error(`unknown v2 geometry symbol: ${symbol}`);
        return geometry;
      });
    });
    return {
      id: level.id,
      name: level.name || level.id,
      elevation: integer(level.elevation, `level ${level.id} elevation`, -4096, 4096),
      ceilingHeight: integer(level.ceilingHeight, `level ${level.id} ceilingHeight`, 64, 1024),
      geometry,
    };
  });
  if (!Array.isArray(file.zones) || !Array.isArray(file.features) || !Array.isArray(file.links))
    throw new Error('v2 zones, features, and links must be arrays');
  const zones = file.zones;
  const features = file.features;
  const links = file.links;
  const publicIds = new Set<string>();
  for (const item of [...zones, ...features, ...links]) {
    if (!validId(item.id) || publicIds.has(item.id))
      throw new Error('zone, feature, and link IDs must be valid and globally unique');
    publicIds.add(item.id);
  }
  for (const zone of zones) {
    if (!ZONE_KINDS.has(zone.kind) || !Array.isArray(zone.cells) || !zone.cells.length)
      throw new Error(`zone ${zone.id} has an invalid kind or empty cells`);
    const coordinates = new Set<string>();
    for (const cell of zone.cells) {
      const key = `${cell.levelId}:${cell.x}:${cell.y}`;
      if (coordinates.has(key)) throw new Error(`zone ${zone.id} contains a duplicate cell`);
      coordinates.add(key);
    }
  }
  for (const feature of features)
    if (!FEATURE_KINDS.has(feature.kind))
      throw new Error(`feature ${feature.id} has an invalid kind`);
  for (const link of links) {
    if (!LINK_KINDS.has(link.kind) || typeof link.bidirectional !== 'boolean')
      throw new Error(`link ${link.id} has an invalid kind or direction`);
    if (link.kind === 'drop' && link.bidirectional)
      throw new Error(`drop ${link.id} cannot be bidirectional`);
  }
  for (const item of [
    ...zones.flatMap((zone) => zone.cells),
    ...features.flatMap((feature) => [feature.from, feature.to]),
    ...links.flatMap((link) => [link.from, link.to]),
  ]) {
    if (!item || typeof item !== 'object') throw new Error('v2 coordinate must be an object');
    if (
      !ids.has(item.levelId) ||
      !Number.isInteger(item.x) ||
      !Number.isInteger(item.y) ||
      item.x < 0 ||
      item.y < 0 ||
      item.x >= width ||
      item.y >= height
    )
      throw new Error('v2 coordinate is outside its level');
  }
  for (const feature of features) {
    const distance =
      Math.abs(feature.from.x - feature.to.x) + Math.abs(feature.from.y - feature.to.y);
    if (feature.from.levelId !== feature.to.levelId || distance !== 1)
      throw new Error(`feature ${feature.id} must join adjacent cells on one level`);
  }
  const document: MapDocumentV2 = {
    version: 2,
    width,
    height,
    cellSize: 64,
    levels,
    zones,
    features,
    links,
  };
  return { file, document };
}

export function createPortableMapV2(
  document: MapDocumentV2,
  metadata: Pick<PortableMapFileV2, 'name' | 'profile'> &
    Partial<Pick<PortableMapFileV2, 'notes' | 'designTargets'>>,
): PortableMapFileV2 {
  const stable = cloneDocumentV2(document);
  return {
    format: 'cs-map-maker',
    version: 2,
    name: metadata.name,
    ...(metadata.notes ? { notes: metadata.notes } : {}),
    profile: metadata.profile,
    width: stable.width,
    height: stable.height,
    cellSize: 64,
    levels: stable.levels.map((level) => ({
      id: level.id,
      name: level.name,
      elevation: level.elevation,
      ceilingHeight: level.ceilingHeight,
      rows: Array.from({ length: stable.height }, (_, y) =>
        level.geometry
          .slice(y * stable.width, (y + 1) * stable.width)
          .map((geometry) => REVERSE.get(geometry)!)
          .join(''),
      ),
    })),
    zones: stable.zones,
    features: stable.features,
    links: stable.links,
    ...(metadata.designTargets ? { designTargets: metadata.designTargets } : {}),
  };
}
