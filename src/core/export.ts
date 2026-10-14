import { HAMMER_UNITS_PER_CELL } from './map';
import { tileDefinition } from './tiles';
import { TileType, type MapDocument, type MapGraph } from './types';

export function mergeRectangles(
  map: MapDocument,
  predicate: (tile: TileType) => boolean,
): Array<[number, number, number, number]> {
  const used = new Uint8Array(map.width * map.height);
  const rectangles: Array<[number, number, number, number]> = [];
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1) {
      const cell = y * map.width + x;
      if (used[cell] || !predicate(map.cells[cell] as TileType)) continue;
      let right = x;
      while (
        right + 1 < map.width &&
        !used[y * map.width + right + 1] &&
        predicate(map.cells[y * map.width + right + 1] as TileType)
      )
        right += 1;
      let bottom = y;
      for (;;) {
        if (bottom + 1 >= map.height) break;
        let valid = true;
        for (let xx = x; xx <= right; xx += 1)
          if (
            used[(bottom + 1) * map.width + xx] ||
            !predicate(map.cells[(bottom + 1) * map.width + xx] as TileType)
          ) {
            valid = false;
            break;
          }
        if (!valid) break;
        bottom += 1;
      }
      for (let yy = y; yy <= bottom; yy += 1)
        for (let xx = x; xx <= right; xx += 1) used[yy * map.width + xx] = 1;
      rectangles.push([x, y, right, bottom]);
    }
  return rectangles;
}

function hammerRectangle(map: MapDocument, rectangle: [number, number, number, number]): string {
  const [x0, y0, x1, y1] = rectangle;
  const X0 = (x0 - map.width / 2) * HAMMER_UNITS_PER_CELL;
  const X1 = (x1 + 1 - map.width / 2) * HAMMER_UNITS_PER_CELL;
  const Y0 = (map.height / 2 - y1 - 1) * HAMMER_UNITS_PER_CELL;
  const Y1 = (map.height / 2 - y0) * HAMMER_UNITS_PER_CELL;
  return `X ${X0} to ${X1}, Y ${Y0} to ${Y1}  (${X1 - X0} × ${Y1 - Y0})`;
}

export function createHammerBlockout(map: MapDocument, graph: MapGraph): string {
  const point = (cell: number) =>
    `${((cell % map.width) + 0.5 - map.width / 2) * 64} ${(map.height / 2 - Math.floor(cell / map.width) - 0.5) * 64} 16`;
  const spread = (cells: readonly number[]) =>
    cells
      .filter((cell, index, all) =>
        all
          .slice(0, index)
          .every(
            (other) =>
              Math.hypot(
                (cell % map.width) - (other % map.width),
                Math.floor(cell / map.width) - Math.floor(other / map.width),
              ) >= 1.5,
          ),
      )
      .slice(0, 5);
  const rows = (rectangles: Array<[number, number, number, number]>, prefix: string) =>
    rectangles
      .map((rectangle, index) => `  ${prefix}${index + 1}: ${hammerRectangle(map, rectangle)}`)
      .join('\n');
  let output =
    '// de_yourmap blockout from 3v3 Map Lab. 1 cell = 64u. Map centred on 0,0, north is +Y.\n// Floor sits at Z 0. Walls fill everything that is not listed as floor.\n\n';
  output += `FLOOR (walkable areas, merged into rectangles)\n${rows(
    mergeRectangles(map, (tile) => tileDefinition(tile).walkable),
    'F',
  )}`;
  const indoor = mergeRectangles(map, (tile) => tile === TileType.Indoor);
  if (indoor.length)
    output += `\n\nINDOOR AREAS (roof these, ceiling at Z 192 to 256)\n${rows(indoor, 'I')}`;
  output += `\n\nCOVER BOXES (64 tall)\n${
    rows(
      mergeRectangles(map, (tile) => tile === TileType.Cover),
      'C',
    ) || '  none'
  }`;
  output +=
    '\n\nfunc_bomb_target\n' +
    (['A', 'B'] as const)
      .map((site) =>
        mergeRectangles(map, (tile) => tile === (site === 'A' ? TileType.SiteA : TileType.SiteB))
          .map((rectangle) => `  Site ${site}: ${hammerRectangle(map, rectangle)}, Z 0 to 128`)
          .join('\n'),
      )
      .filter(Boolean)
      .join('\n');
  output += `\n\nfunc_buyzone\n${mergeRectangles(map, (tile) => tile === TileType.TSpawn)
    .map((rectangle) => `  T: ${hammerRectangle(map, rectangle)}`)
    .join('\n')}\n${mergeRectangles(map, (tile) => tile === TileType.CTSpawn)
    .map((rectangle) => `  CT: ${hammerRectangle(map, rectangle)}`)
    .join('\n')}`;
  output += `\n\ninfo_player_terrorist origins\n${spread(graph.tSpawn)
    .map((cell) => `  ${point(cell)}`)
    .join('\n')}`;
  output += `\n\ninfo_player_counterterrorist origins\n${spread(graph.ctSpawn)
    .map((cell) => `  ${point(cell)}`)
    .join('\n')}`;
  return output;
}
