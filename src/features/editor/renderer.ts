import { hasLineOfSight } from '../../core/graph';
import { HAMMER_UNITS_PER_CELL } from '../../core/map';
import { tileDefinition } from '../../core/tiles';
import {
  TileType,
  type AnalysisResult,
  type BatchStatistics,
  type MapDocument,
  type MapGraph,
  type SimulationState,
} from '../../core/types';
import type { Overlay } from '../../app/state';

const T_COLOR = '#e9b44c';
const CT_COLOR = '#5fa6e3';

export interface DrawOptions {
  map: MapDocument;
  graph: MapGraph;
  analysis: AnalysisResult;
  overlay: Overlay;
  batch: BatchStatistics | null;
  live: SimulationState | null;
  cellSize: number;
  hoverCell: number;
  keyboardCell: number;
  sightOrigin: number;
  rectangle?: [number, number, number, number];
  brushSize: number;
  highlightedCells: readonly number[];
}

export function drawBase(
  context: CanvasRenderingContext2D,
  map: MapDocument,
  cellSize: number,
  labels = true,
) {
  context.fillStyle = '#070a0b';
  context.fillRect(0, 0, map.width * cellSize, map.height * cellSize);
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1) {
      const tile = map.cells[y * map.width + x];
      if (tile === TileType.Wall) continue;
      context.fillStyle = tileDefinition(tile).color;
      context.fillRect(x * cellSize, y * cellSize, cellSize + 0.5, cellSize + 0.5);
    }
  context.fillStyle = 'rgba(200,215,218,.55)';
  const edge = Math.max(1, cellSize * 0.12);
  for (let y = 0; y < map.height; y += 1)
    for (let x = 0; x < map.width; x += 1) {
      if (map.cells[y * map.width + x] === TileType.Wall) continue;
      if (x === 0 || map.cells[y * map.width + x - 1] === TileType.Wall)
        context.fillRect(x * cellSize, y * cellSize, edge, cellSize);
      if (x === map.width - 1 || map.cells[y * map.width + x + 1] === TileType.Wall)
        context.fillRect((x + 1) * cellSize - edge, y * cellSize, edge, cellSize);
      if (y === 0 || map.cells[(y - 1) * map.width + x] === TileType.Wall)
        context.fillRect(x * cellSize, y * cellSize, cellSize, edge);
      if (y === map.height - 1 || map.cells[(y + 1) * map.width + x] === TileType.Wall)
        context.fillRect(x * cellSize, (y + 1) * cellSize - edge, cellSize, edge);
    }
  context.strokeStyle = 'rgba(40,28,10,.7)';
  context.lineWidth = Math.max(1, cellSize * 0.08);
  for (let index = 0; index < map.cells.length; index += 1)
    if (map.cells[index] === TileType.Cover) {
      const x = (index % map.width) * cellSize;
      const y = Math.floor(index / map.width) * cellSize;
      const padding = cellSize * 0.18;
      context.strokeRect(x + padding, y + padding, cellSize - padding * 2, cellSize - padding * 2);
      context.beginPath();
      context.moveTo(x + padding, y + padding);
      context.lineTo(x + cellSize - padding, y + cellSize - padding);
      context.moveTo(x + cellSize - padding, y + padding);
      context.lineTo(x + padding, y + cellSize - padding);
      context.stroke();
    }
  if (labels) drawLabels(context, map, cellSize);
}

function drawLabels(context: CanvasRenderingContext2D, map: MapDocument, size: number) {
  for (const [tile, label, color] of [
    [TileType.SiteA, 'A', '#ffb3a8'],
    [TileType.SiteB, 'B', '#ffb3a8'],
    [TileType.TSpawn, 'T', T_COLOR],
    [TileType.CTSpawn, 'CT', CT_COLOR],
  ] as const) {
    let totalX = 0;
    let totalY = 0;
    let count = 0;
    for (let index = 0; index < map.cells.length; index += 1)
      if (map.cells[index] === tile) {
        totalX += index % map.width;
        totalY += Math.floor(index / map.width);
        count += 1;
      }
    if (!count) continue;
    const large = tile === TileType.SiteA || tile === TileType.SiteB;
    context.font = `700 ${Math.round(size * (large ? 3 : 1.4))}px "Chakra Petch",sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = large ? 'rgba(255,190,180,.55)' : color;
    context.fillText(
      label,
      (totalX / count + 0.5) * size,
      (totalY / count + 0.5) * size + (large ? 0 : -size * 1.4),
    );
  }
}

function ring(
  context: CanvasRenderingContext2D,
  cell: number,
  width: number,
  size: number,
  color: string,
  dashed = false,
) {
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.setLineDash(dashed ? [3, 3] : []);
  context.beginPath();
  context.arc(
    ((cell % width) + 0.5) * size,
    (Math.floor(cell / width) + 0.5) * size,
    Math.max(6, size * 0.9),
    0,
    Math.PI * 2,
  );
  context.stroke();
  context.setLineDash([]);
}

export function drawMap(context: CanvasRenderingContext2D, options: DrawOptions) {
  const { map, graph, analysis, overlay, batch, live, cellSize: size } = options;
  context.clearRect(0, 0, map.width * size, map.height * size);
  drawBase(context, map, size, false);
  if (overlay === 'race' && !live)
    for (const cell of graph.walkableCells) {
      const difference = (graph.fromT[cell] - graph.fromCT[cell]) / (220 / HAMMER_UNITS_PER_CELL);
      if (!Number.isFinite(difference)) continue;
      const strength = Math.min(1, Math.abs(difference) / 10);
      context.fillStyle =
        Math.abs(difference) < 1.5
          ? 'rgba(255,255,255,.42)'
          : difference > 0
            ? `rgba(95,166,227,${0.12 + strength * 0.45})`
            : `rgba(233,180,76,${0.12 + strength * 0.45})`;
      context.fillRect(
        (cell % map.width) * size,
        Math.floor(cell / map.width) * size,
        size + 0.5,
        size + 0.5,
      );
    }
  if (overlay === 'deaths' && batch && !live) {
    let maximum = 0;
    for (let index = 0; index < graph.size; index += 1)
      maximum = Math.max(maximum, batch.deathsT[index] + batch.deathsCT[index]);
    for (let index = 0; index < graph.size; index += 1) {
      const total = batch.deathsT[index] + batch.deathsCT[index];
      if (!total) continue;
      const share = batch.deathsT[index] / total;
      const strength = Math.sqrt(total / maximum);
      context.fillStyle =
        share > 0.6
          ? `rgba(233,180,76,${0.2 + strength * 0.75})`
          : share < 0.4
            ? `rgba(95,166,227,${0.2 + strength * 0.75})`
            : `rgba(240,240,240,${0.2 + strength * 0.7})`;
      context.fillRect(
        (index % map.width) * size,
        Math.floor(index / map.width) * size,
        size + 0.5,
        size + 0.5,
      );
    }
  }
  if (overlay === 'sight' && !live) {
    if (options.sightOrigin >= 0 && graph.walkable[options.sightOrigin]) {
      for (const cell of graph.walkableCells)
        if (hasLineOfSight(graph, options.sightOrigin, cell)) {
          const distance =
            Math.hypot(
              (cell % map.width) - (options.sightOrigin % map.width),
              Math.floor(cell / map.width) - Math.floor(options.sightOrigin / map.width),
            ) * 64;
          context.fillStyle =
            distance > 3000
              ? 'rgba(228,106,95,.45)'
              : distance > 2000
                ? 'rgba(227,195,95,.35)'
                : 'rgba(255,255,255,.28)';
          context.fillRect(
            (cell % map.width) * size,
            Math.floor(cell / map.width) * size,
            size + 0.5,
            size + 0.5,
          );
        }
      ring(context, options.sightOrigin, map.width, size, '#fff');
    } else
      for (const line of analysis.sightlines) {
        context.strokeStyle =
          line.distance * 64 > 3000 ? 'rgba(228,106,95,.9)' : 'rgba(227,195,95,.8)';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(
          ((line.from % map.width) + 0.5) * size,
          (Math.floor(line.from / map.width) + 0.5) * size,
        );
        context.lineTo(
          ((line.to % map.width) + 0.5) * size,
          (Math.floor(line.to / map.width) + 0.5) * size,
        );
        context.stroke();
      }
  }
  if (analysis.firstContactCell >= 0 && overlay === 'race' && !live)
    ring(context, analysis.firstContactCell, map.width, size, '#fff', true);
  for (const cell of options.highlightedCells) {
    context.strokeStyle = '#ffcc43';
    context.lineWidth = Math.max(2, size * 0.18);
    context.strokeRect(
      (cell % map.width) * size + 1,
      Math.floor(cell / map.width) * size + 1,
      size - 2,
      size - 2,
    );
  }
  drawLabels(context, map, size);
  context.strokeStyle = 'rgba(255,255,255,.05)';
  context.lineWidth = 1;
  context.beginPath();
  if (size >= 8) {
    for (let x = 1; x < map.width; x += 1) {
      context.moveTo(x * size + 0.5, 0);
      context.lineTo(x * size + 0.5, map.height * size);
    }
    for (let y = 1; y < map.height; y += 1) {
      context.moveTo(0, y * size + 0.5);
      context.lineTo(map.width * size, y * size + 0.5);
    }
  }
  context.stroke();
  if (options.rectangle) {
    const [x0, y0, x1, y1] = options.rectangle;
    context.strokeStyle = '#fff';
    context.setLineDash([4, 3]);
    context.strokeRect(x0 * size, y0 * size, (x1 - x0 + 1) * size, (y1 - y0 + 1) * size);
    context.setLineDash([]);
  } else {
    const cell = options.hoverCell >= 0 ? options.hoverCell : options.keyboardCell;
    if (cell >= 0 && !live) {
      const x = cell % map.width;
      const y = Math.floor(cell / map.width);
      const offset = Math.floor((options.brushSize - 1) / 2);
      context.strokeStyle = '#fff';
      context.lineWidth = options.hoverCell >= 0 ? 1 : 2;
      context.strokeRect(
        (x - offset) * size + 0.5,
        (y - offset) * size + 0.5,
        options.brushSize * size - 1,
        options.brushSize * size - 1,
      );
    }
  }
  if (live) drawLive(context, live, size);
}

function drawLive(context: CanvasRenderingContext2D, live: SimulationState, size: number) {
  const radius = Math.max(5, size * 0.55);
  if (live.bomb.state !== 'carried') {
    const cell = live.bomb.cell;
    const x = ((cell % live.graph.width) + 0.5) * size;
    const y = (Math.floor(cell / live.graph.width) + 0.5) * size;
    context.fillStyle = live.bomb.state === 'planted' ? '#e46a5f' : '#c33';
    context.fillRect(x - size * 0.35, y - size * 0.35, size * 0.7, size * 0.7);
  }
  context.font = `700 ${Math.max(8, Math.round(size * 0.6))}px "Chakra Petch",sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const agent of live.agents)
    if (agent.alive) {
      context.fillStyle = agent.side === 'T' ? T_COLOR : CT_COLOR;
      context.beginPath();
      context.arc(agent.x * size, agent.y * size, radius, 0, Math.PI * 2);
      context.fill();
      if (agent.carrier) {
        context.strokeStyle = '#e46a5f';
        context.lineWidth = 2;
        context.stroke();
      }
      context.fillStyle = '#0e1315';
      context.fillText(agent.id.replace(/\D/g, ''), agent.x * size, agent.y * size + 0.5);
    }
}
