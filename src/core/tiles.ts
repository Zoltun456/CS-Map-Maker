import { TileType, type TileDefinition } from './types';

export const TILE_DEFINITIONS: readonly TileDefinition[] = [
  {
    type: TileType.Wall,
    name: 'Wall',
    key: '2',
    color: '#0b0f10',
    walkable: false,
    blocksMovement: true,
    blocksSight: true,
  },
  {
    type: TileType.Floor,
    name: 'Floor',
    key: '1',
    color: '#4b595d',
    walkable: true,
    blocksMovement: false,
    blocksSight: false,
  },
  {
    type: TileType.Cover,
    name: 'Cover box',
    key: '3',
    color: '#a3854f',
    walkable: false,
    blocksMovement: true,
    blocksSight: true,
  },
  {
    type: TileType.TSpawn,
    name: 'T spawn',
    key: '4',
    color: '#8a6322',
    walkable: true,
    blocksMovement: false,
    blocksSight: false,
  },
  {
    type: TileType.CTSpawn,
    name: 'CT spawn',
    key: '5',
    color: '#28507a',
    walkable: true,
    blocksMovement: false,
    blocksSight: false,
  },
  {
    type: TileType.SiteA,
    name: 'Site A',
    key: '6',
    color: '#7a3f3c',
    walkable: true,
    blocksMovement: false,
    blocksSight: false,
  },
  {
    type: TileType.SiteB,
    name: 'Site B',
    key: '7',
    color: '#7a3f3c',
    walkable: true,
    blocksMovement: false,
    blocksSight: false,
  },
  {
    type: TileType.Indoor,
    name: 'Indoor floor',
    key: '8',
    color: '#34495a',
    walkable: true,
    blocksMovement: false,
    blocksSight: false,
  },
] as const;

export const TILE_BY_TYPE = new Map(TILE_DEFINITIONS.map((tile) => [tile.type, tile]));
export const PAINT_TILES = [
  TileType.Floor,
  TileType.Wall,
  TileType.Cover,
  TileType.TSpawn,
  TileType.CTSpawn,
  TileType.SiteA,
  TileType.SiteB,
  TileType.Indoor,
].map((type) => TILE_BY_TYPE.get(type)!);

export function tileDefinition(type: number): TileDefinition {
  const tile = TILE_BY_TYPE.get(type as TileType);
  if (!tile) throw new RangeError(`Unknown tile type: ${type}`);
  return tile;
}

export function isTileType(value: number): value is TileType {
  return TILE_BY_TYPE.has(value as TileType);
}
