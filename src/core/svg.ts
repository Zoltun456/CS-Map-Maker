import { TILE_DEFINITIONS } from './tiles';
import type { Diagnostic, PortableMapFile } from './agentTypes';
import type { MapDocument } from './types';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!,
  );

export function renderMapSvg(
  file: PortableMapFile,
  map: MapDocument,
  diagnostics: readonly Diagnostic[] = [],
): string {
  const size = 16;
  const highlights = new Set(
    diagnostics.flatMap((diagnostic) =>
      diagnostic.coordinates.map(({ x, y }) => y * map.width + x),
    ),
  );
  const cells = Array.from(map.cells, (tile, index) => {
    const x = (index % map.width) * size;
    const y = Math.floor(index / map.width) * size;
    const color = TILE_DEFINITIONS[tile].color;
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${color}"${highlights.has(index) ? ' stroke="#ffcc43" stroke-width="3"' : ''}/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title" viewBox="0 0 ${map.width * size} ${map.height * size}"><title id="title">${escape(file.name)}</title><rect width="100%" height="100%" fill="#0b0f10"/>${cells}</svg>\n`;
}
