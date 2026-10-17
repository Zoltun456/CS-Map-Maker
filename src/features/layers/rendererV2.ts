import type { GeometryType, MapDocumentV2, MapLevel, ZoneKind } from '../../core/documentV2';

export const GEOMETRY_COLORS: Record<GeometryType, string> = {
  void: '#070a0b',
  floor: '#4b595d',
  wall: '#0b0f10',
  'full-cover': '#a3854f',
  'half-cover': '#c1a975',
};

export const ZONE_COLORS: Record<ZoneKind, string> = {
  't-spawn': '#8a6322',
  'ct-spawn': '#28507a',
  'site-a': '#7a3f3c',
  'site-b': '#7a3f3c',
  indoor: '#34495a',
  material: '#567061',
  callout: '#66547a',
};

const LABELS: Partial<Record<ZoneKind, string>> = {
  't-spawn': 'T',
  'ct-spawn': 'CT',
  'site-a': 'A',
  'site-b': 'B',
};

interface DrawLayerOptions {
  document: MapDocumentV2;
  level: MapLevel;
  adjacent?: MapLevel;
  cellSize: number;
  hoverCell: number;
  keyboardCell: number;
  selectedCell: number;
  highlightedCells: readonly number[];
}

const isOpen = (geometry: GeometryType) => geometry !== 'wall' && geometry !== 'void';

function drawLevelGeometry(
  context: CanvasRenderingContext2D,
  level: MapLevel,
  width: number,
  height: number,
  size: number,
) {
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const geometry = level.geometry[y * width + x];
      if (!isOpen(geometry)) continue;
      context.fillStyle = GEOMETRY_COLORS[geometry];
      context.fillRect(x * size, y * size, size + 0.5, size + 0.5);
    }
}

function drawWallEdges(
  context: CanvasRenderingContext2D,
  level: MapLevel,
  width: number,
  height: number,
  size: number,
) {
  context.fillStyle = 'rgba(200,215,218,.55)';
  const edge = Math.max(1, size * 0.12);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      if (!isOpen(level.geometry[y * width + x])) continue;
      if (x === 0 || !isOpen(level.geometry[y * width + x - 1]))
        context.fillRect(x * size, y * size, edge, size);
      if (x === width - 1 || !isOpen(level.geometry[y * width + x + 1]))
        context.fillRect((x + 1) * size - edge, y * size, edge, size);
      if (y === 0 || !isOpen(level.geometry[(y - 1) * width + x]))
        context.fillRect(x * size, y * size, size, edge);
      if (y === height - 1 || !isOpen(level.geometry[(y + 1) * width + x]))
        context.fillRect(x * size, (y + 1) * size - edge, size, edge);
    }
}

function drawCover(
  context: CanvasRenderingContext2D,
  level: MapLevel,
  width: number,
  size: number,
) {
  context.strokeStyle = 'rgba(40,28,10,.78)';
  context.lineWidth = Math.max(1, size * 0.08);
  level.geometry.forEach((geometry, index) => {
    if (geometry !== 'full-cover' && geometry !== 'half-cover') return;
    const x = (index % width) * size;
    const y = Math.floor(index / width) * size;
    const padding = size * (geometry === 'full-cover' ? 0.18 : 0.27);
    context.strokeRect(x + padding, y + padding, size - padding * 2, size - padding * 2);
    context.beginPath();
    context.moveTo(x + padding, y + padding);
    context.lineTo(x + size - padding, y + size - padding);
    if (geometry === 'full-cover') {
      context.moveTo(x + size - padding, y + padding);
      context.lineTo(x + padding, y + size - padding);
    }
    context.stroke();
  });
}

function drawZones(
  context: CanvasRenderingContext2D,
  document: MapDocumentV2,
  level: MapLevel,
  size: number,
) {
  for (const zone of document.zones) {
    const cells = zone.cells.filter((cell) => cell.levelId === level.id);
    if (!cells.length) continue;
    context.fillStyle = `${ZONE_COLORS[zone.kind]}aa`;
    for (const cell of cells)
      context.fillRect(cell.x * size, cell.y * size, size + 0.5, size + 0.5);
    const label = zone.name || LABELS[zone.kind];
    if (!label) continue;
    const x = cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length;
    const y = cells.reduce((sum, cell) => sum + cell.y, 0) / cells.length;
    const large = zone.kind === 'site-a' || zone.kind === 'site-b';
    context.font = `700 ${Math.round(size * (large ? 3 : 1.35))}px "Chakra Petch",sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = large
      ? 'rgba(255,190,180,.55)'
      : zone.kind === 't-spawn'
        ? '#e9b44c'
        : zone.kind === 'ct-spawn'
          ? '#5fa6e3'
          : '#e8edef';
    context.fillText(label, (x + 0.5) * size, (y + 0.5) * size + (large ? 0 : -size * 1.2));
  }
}

export function drawLayeredMap(context: CanvasRenderingContext2D, options: DrawLayerOptions) {
  const { document, level, adjacent, cellSize: size } = options;
  context.clearRect(0, 0, document.width * size, document.height * size);
  context.fillStyle = GEOMETRY_COLORS.void;
  context.fillRect(0, 0, document.width * size, document.height * size);
  if (adjacent) {
    context.save();
    context.globalAlpha = 0.2;
    drawLevelGeometry(context, adjacent, document.width, document.height, size);
    drawWallEdges(context, adjacent, document.width, document.height, size);
    context.restore();
  }
  drawLevelGeometry(context, level, document.width, document.height, size);
  drawZones(context, document, level, size);
  drawWallEdges(context, level, document.width, document.height, size);
  drawCover(context, level, document.width, size);

  for (const link of document.links) {
    const endpoint =
      link.from.levelId === level.id ? link.from : link.to.levelId === level.id ? link.to : null;
    if (!endpoint) continue;
    const x = (endpoint.x + 0.5) * size;
    const y = (endpoint.y + 0.5) * size;
    context.strokeStyle = '#74d99b';
    context.fillStyle = '#10251a';
    context.lineWidth = Math.max(1.5, size * 0.12);
    context.beginPath();
    context.arc(x, y, Math.max(4, size * 0.32), 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.font = `700 ${Math.max(7, Math.round(size * 0.45))}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#bff4d1';
    context.fillText(link.kind === 'ladder' ? 'L' : link.kind === 'drop' ? 'D' : '↕', x, y);
  }

  if (size >= 8) {
    context.strokeStyle = 'rgba(255,255,255,.05)';
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 1; x < document.width; x += 1) {
      context.moveTo(x * size + 0.5, 0);
      context.lineTo(x * size + 0.5, document.height * size);
    }
    for (let y = 1; y < document.height; y += 1) {
      context.moveTo(0, y * size + 0.5);
      context.lineTo(document.width * size, y * size + 0.5);
    }
    context.stroke();
  }
  for (const highlighted of options.highlightedCells) {
    context.strokeStyle = '#ffcc43';
    context.lineWidth = Math.max(2, size * 0.18);
    context.strokeRect(
      (highlighted % document.width) * size + 1,
      Math.floor(highlighted / document.width) * size + 1,
      size - 2,
      size - 2,
    );
  }
  const activeCell = options.hoverCell >= 0 ? options.hoverCell : options.keyboardCell;
  if (activeCell >= 0) {
    context.strokeStyle = '#fff';
    context.lineWidth = options.hoverCell >= 0 ? 1 : 2;
    context.strokeRect(
      (activeCell % document.width) * size + 0.5,
      Math.floor(activeCell / document.width) * size + 0.5,
      size - 1,
      size - 1,
    );
  }
  if (options.selectedCell >= 0 && options.selectedCell !== activeCell) {
    context.strokeStyle = '#ffcc43';
    context.lineWidth = Math.max(1.5, size * 0.12);
    context.strokeRect(
      (options.selectedCell % document.width) * size + 2,
      Math.floor(options.selectedCell / document.width) * size + 2,
      size - 4,
      size - 4,
    );
  }
}
