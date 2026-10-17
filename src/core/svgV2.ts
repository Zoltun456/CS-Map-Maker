import type { Diagnostic } from './agentTypes';
import type { MapDocumentV2 } from './documentV2';
import type { PortableMapFileV2 } from './portableV2';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!,
  );
const colors = {
  void: '#070a0b',
  floor: '#4b595d',
  wall: '#0b0f10',
  'full-cover': '#a3854f',
  'half-cover': '#c1a975',
} as const;
const zoneColors = {
  't-spawn': '#8a6322',
  'ct-spawn': '#28507a',
  'site-a': '#7a3f3c',
  'site-b': '#7a3f3c',
  indoor: '#34495a',
  material: '#567061',
  callout: '#66547a',
} as const;

export function renderLayeredMapSvg(
  file: PortableMapFileV2,
  document: MapDocumentV2,
  diagnostics: readonly Diagnostic[] = [],
) {
  const cell = 14;
  const gap = 46;
  const floorWidth = document.width * cell;
  const floorHeight = document.height * cell;
  const width = floorWidth;
  const height = document.levels.length * (floorHeight + gap);
  const sheets = document.levels
    .map((level, levelIndex) => {
      const offset = levelIndex * (floorHeight + gap);
      const highlighted = new Set(
        diagnostics.flatMap((diagnostic) =>
          diagnostic.coordinates
            .filter((point) => !point.levelId || point.levelId === level.id)
            .map((point) => point.y * document.width + point.x),
        ),
      );
      const geometry = level.geometry
        .map(
          (item, index) =>
            `<rect x="${(index % document.width) * cell}" y="${offset + 28 + Math.floor(index / document.width) * cell}" width="${cell}" height="${cell}" fill="${colors[item]}"${highlighted.has(index) ? ' stroke="#ffcc43" stroke-width="3"' : ''}/>`,
        )
        .join('');
      const zones = document.zones
        .filter((zone) => zone.cells.some((point) => point.levelId === level.id))
        .flatMap((zone) =>
          zone.cells
            .filter((point) => point.levelId === level.id)
            .map(
              (point) =>
                `<rect x="${point.x * cell + 2}" y="${offset + 30 + point.y * cell}" width="${cell - 4}" height="${cell - 4}" fill="${zoneColors[zone.kind]}" opacity=".8"/>`,
            ),
        )
        .join('');
      const links = document.links
        .flatMap((link) =>
          [link.from, link.to]
            .filter((point) => point.levelId === level.id)
            .map(
              (point) =>
                `<circle cx="${(point.x + 0.5) * cell}" cy="${offset + 28 + (point.y + 0.5) * cell}" r="4" fill="#74d99b"/>`,
            ),
        )
        .join('');
      return `<g><text x="0" y="${offset + 18}" fill="#e8edef" font-family="sans-serif" font-weight="700">${escape(level.name)} · ${escape(level.id)} · Z ${level.elevation}</text>${geometry}${zones}${links}</g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title" viewBox="0 0 ${width} ${height}"><title id="title">${escape(file.name)} layered floor sheets</title><rect width="100%" height="100%" fill="#070a0b"/>${sheets}</svg>\n`;
}
