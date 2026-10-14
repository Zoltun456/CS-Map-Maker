import { createMap } from './map';
import { isTileType } from './tiles';
import type { MapDocument } from './types';

const PREFIX = 'CS3V3:';
const MAX_DIMENSION = 96;
const RUN = /^([0-7])(?:x([1-9]\d*))?$/;

export class LayoutCodeError extends Error {
  constructor(public readonly reason: string) {
    super(`Invalid layout code: ${reason}`);
    this.name = 'LayoutCodeError';
  }
}

export function encodeMap(map: MapDocument): string {
  let encoded = '';
  let previous = -1;
  let count = 0;
  const flush = () => {
    if (count) encoded += `${previous}${count > 1 ? `x${count}` : ''},`;
  };
  for (const cell of map.cells) {
    if (cell === previous) count += 1;
    else {
      flush();
      previous = cell;
      count = 1;
    }
  }
  flush();
  return PREFIX + btoa(JSON.stringify({ v: 1, W: map.width, H: map.height, c: encoded }));
}

export function decodeMap(code: string): MapDocument {
  if (!code.trim().startsWith(PREFIX)) throw new LayoutCodeError('missing CS3V3 prefix');
  let value: unknown;
  try {
    value = JSON.parse(atob(code.trim().slice(PREFIX.length)));
  } catch {
    throw new LayoutCodeError('payload is not valid base64 JSON');
  }
  if (!value || typeof value !== 'object') throw new LayoutCodeError('payload must be an object');
  const record = value as Record<string, unknown>;
  if (record.v !== 1) throw new LayoutCodeError('unsupported version');
  const width = record.W;
  const height = record.H;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    (width as number) < 1 ||
    (height as number) < 1 ||
    (width as number) > MAX_DIMENSION ||
    (height as number) > MAX_DIMENSION
  )
    throw new LayoutCodeError('dimensions must be integers from 1 to 96');
  if (typeof record.c !== 'string') throw new LayoutCodeError('cell data is missing');
  const area = (width as number) * (height as number);
  const decoded: number[] = [];
  for (const part of record.c.split(',')) {
    if (!part) continue;
    const match = RUN.exec(part);
    if (!match) throw new LayoutCodeError(`invalid run: ${part}`);
    const tile = Number(match[1]);
    const count = match[2] ? Number(match[2]) : 1;
    if (
      !isTileType(tile) ||
      !Number.isSafeInteger(count) ||
      count < 1 ||
      decoded.length + count > area
    )
      throw new LayoutCodeError('cell run exceeds map bounds');
    for (let index = 0; index < count; index += 1) decoded.push(tile);
  }
  if (decoded.length !== area)
    throw new LayoutCodeError(`expected ${area} cells, received ${decoded.length}`);
  const map = createMap(width as number, height as number);
  map.cells.set(decoded);
  return map;
}
