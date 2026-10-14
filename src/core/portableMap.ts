import { createMap } from './map';
import { resolveProfile } from './profiles';
import { decodeMap, encodeMap } from './serialization';
import { TileType, type MapDocument } from './types';
import type {
  MapProfileId,
  ParsedPortableMap,
  PortableMapFile,
  QualityTargets,
} from './agentTypes';

const SYMBOL_TO_TILE: Record<string, TileType> = {
  '#': TileType.Wall,
  '.': TileType.Floor,
  X: TileType.Cover,
  T: TileType.TSpawn,
  C: TileType.CTSpawn,
  A: TileType.SiteA,
  B: TileType.SiteB,
  I: TileType.Indoor,
};
const TILE_TO_SYMBOL = new Map(
  Object.entries(SYMBOL_TO_TILE).map(([symbol, tile]) => [tile, symbol]),
);
const TOP_LEVEL = new Set([
  'format',
  'version',
  'name',
  'notes',
  'profile',
  'width',
  'height',
  'rows',
  'targets',
]);
const TARGET_KEYS = new Set([
  'tWinRate',
  'firstContactSeconds',
  'ctLeadSeconds',
  'rotationSeconds',
  'maxSightlineUnits',
]);

export class PortableMapError extends Error {
  constructor(public readonly reason: string) {
    super(`Invalid agent map: ${reason}`);
    this.name = 'PortableMapError';
  }
}

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const range = (value: unknown, key: string): [number, number] => {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((part) => typeof part === 'number' && Number.isFinite(part)) ||
    value[0] >= value[1]
  )
    throw new PortableMapError(`${key} must be an increasing two-number range`);
  return [value[0] as number, value[1] as number];
};

export function parsePortableMap(input: string | unknown): ParsedPortableMap {
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      throw new PortableMapError('file is not valid JSON');
    }
  }
  if (!object(value)) throw new PortableMapError('root must be an object');
  for (const key of Object.keys(value))
    if (!TOP_LEVEL.has(key)) throw new PortableMapError(`unknown field: ${key}`);
  if (value.format !== 'cs-map-maker') throw new PortableMapError('format must be cs-map-maker');
  if (value.version !== 1) throw new PortableMapError('unsupported version');
  if (typeof value.name !== 'string' || !value.name.trim())
    throw new PortableMapError('name must be a non-empty string');
  if (value.notes !== undefined && typeof value.notes !== 'string')
    throw new PortableMapError('notes must be a string');
  if (value.profile !== 'two-site-3v3' && value.profile !== 'one-site-3v3')
    throw new PortableMapError('unknown profile');
  if (
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    (value.width as number) < 1 ||
    (value.height as number) < 1 ||
    (value.width as number) > 96 ||
    (value.height as number) > 96
  )
    throw new PortableMapError('dimensions must be integers from 1 to 96');
  if (!Array.isArray(value.rows) || value.rows.length !== value.height)
    throw new PortableMapError('row count must match height');
  const rows = value.rows as unknown[];
  for (let y = 0; y < rows.length; y += 1) {
    if (typeof rows[y] !== 'string' || (rows[y] as string).length !== value.width)
      throw new PortableMapError(`row ${y} width must match width`);
    for (const symbol of rows[y] as string)
      if (!(symbol in SYMBOL_TO_TILE)) throw new PortableMapError(`unknown grid symbol: ${symbol}`);
  }
  const targets: Partial<QualityTargets> = {};
  if (value.targets !== undefined) {
    if (!object(value.targets)) throw new PortableMapError('targets must be an object');
    for (const key of Object.keys(value.targets))
      if (!TARGET_KEYS.has(key)) throw new PortableMapError(`unknown target: ${key}`);
    for (const key of [
      'tWinRate',
      'firstContactSeconds',
      'ctLeadSeconds',
      'rotationSeconds',
    ] as const)
      if (value.targets[key] !== undefined) targets[key] = range(value.targets[key], key);
    if (value.targets.maxSightlineUnits !== undefined) {
      const sightline = value.targets.maxSightlineUnits;
      if (typeof sightline !== 'number' || !Number.isFinite(sightline) || sightline <= 0)
        throw new PortableMapError('maxSightlineUnits must be positive');
      targets.maxSightlineUnits = sightline;
    }
  }
  if (targets.tWinRate && (targets.tWinRate[0] < 0 || targets.tWinRate[1] > 1))
    throw new PortableMapError('tWinRate must stay between 0 and 1');
  const file: PortableMapFile = {
    format: 'cs-map-maker',
    version: 1,
    name: value.name.trim(),
    ...(value.notes ? { notes: value.notes } : {}),
    profile: value.profile as MapProfileId,
    width: value.width as number,
    height: value.height as number,
    rows: rows as string[],
    ...(Object.keys(targets).length ? { targets } : {}),
  };
  const map = createMap(file.width, file.height);
  file.rows.forEach((row, y) =>
    [...row].forEach((symbol, x) => {
      map.cells[y * file.width + x] = SYMBOL_TO_TILE[symbol];
    }),
  );
  return { file, map, profile: resolveProfile(file.profile, file.targets) };
}

export function createPortableMap(
  map: MapDocument,
  options: {
    name?: string;
    notes?: string;
    profile?: MapProfileId;
    targets?: Partial<QualityTargets>;
  } = {},
): PortableMapFile {
  const rows = Array.from({ length: map.height }, (_, y) =>
    Array.from({ length: map.width }, (_, x) =>
      TILE_TO_SYMBOL.get(map.cells[y * map.width + x])!,
    ).join(''),
  );
  return {
    format: 'cs-map-maker',
    version: 1,
    name: options.name ?? 'Untitled map',
    ...(options.notes ? { notes: options.notes } : {}),
    profile: options.profile ?? 'two-site-3v3',
    width: map.width,
    height: map.height,
    rows,
    ...(options.targets && Object.keys(options.targets).length ? { targets: options.targets } : {}),
  };
}

export const stringifyPortableMap = (file: PortableMapFile) => `${JSON.stringify(file, null, 2)}\n`;

export function portableMapFromLayoutCode(
  code: string,
  options: Parameters<typeof createPortableMap>[1] = {},
): PortableMapFile {
  return createPortableMap(decodeMap(code), options);
}

export function layoutCodeFromPortableMap(input: string | unknown): string {
  return encodeMap(parsePortableMap(input).map);
}
