import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { HAMMER_UNITS_PER_CELL, paintCells, rasterizeLine } from '../../core/map';
import { tileDefinition } from '../../core/tiles';
import { useApp } from '../../app/state';
import { drawMap } from './renderer';

function rectangle(from: number, to: number, width: number): [number, number, number, number] {
  return [
    Math.min(from % width, to % width),
    Math.min(Math.floor(from / width), Math.floor(to / width)),
    Math.max(from % width, to % width),
    Math.max(Math.floor(from / width), Math.floor(to / width)),
  ];
}

export function MapCanvas() {
  const app = useApp();
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(14);
  const [hover, setHover] = useState(-1);
  const [keyboardCell, setKeyboardCell] = useState(0);
  const [focused, setFocused] = useState(false);
  const [sightOrigin, setSightOrigin] = useState(-1);
  const gesture = useRef<{
    pointer: number;
    start: number;
    last: number;
    base: typeof app.map;
    current: typeof app.map;
  } | null>(null);

  useEffect(() => {
    const resize = () => {
      if (!wrapper.current) return;
      setCellSize(
        Math.max(
          5,
          Math.min(
            wrapper.current.clientWidth / app.map.width,
            Math.max(320, window.innerHeight - 190) / app.map.height,
          ),
        ),
      );
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (wrapper.current) observer.observe(wrapper.current);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [app.map.width, app.map.height]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const width = Math.floor(cellSize * app.map.width);
    const height = Math.floor(cellSize * app.map.height);
    const ratio = window.devicePixelRatio || 1;
    element.width = width * ratio;
    element.height = height * ratio;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    const context = element.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawMap(context, {
      map: app.map,
      graph: app.graph,
      analysis: app.analysis,
      overlay: app.overlay,
      batch: app.batch,
      live: app.live,
      cellSize,
      hoverCell: hover,
      keyboardCell: focused ? keyboardCell : -1,
      sightOrigin,
      rectangle:
        gesture.current && app.shape === 'rect'
          ? rectangle(gesture.current.start, gesture.current.last, app.map.width)
          : undefined,
      brushSize: app.brushSize,
      highlightedCells: app.highlightedCells,
    });
  }, [app, cellSize, hover, keyboardCell, focused, sightOrigin]);

  const eventCell = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - bounds.left) / cellSize);
    const y = Math.floor((event.clientY - bounds.top) / cellSize);
    return x >= 0 && y >= 0 && x < app.map.width && y < app.map.height ? y * app.map.width + x : -1;
  };
  const begin = (event: PointerEvent<HTMLCanvasElement>) => {
    if (app.live && !app.live.outcome) return;
    const cell = eventCell(event);
    if (cell < 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setKeyboardCell(cell);
    if (app.overlay === 'sight') {
      setSightOrigin((value) => (value === cell ? -1 : cell));
      return;
    }
    const base = app.map;
    const current =
      app.shape === 'brush' ? paintCells(base, [cell], app.brushSize, app.tool) : base;
    gesture.current = { pointer: event.pointerId, start: cell, last: cell, base, current };
    if (app.shape === 'brush') app.commitMap(current);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const cell = eventCell(event);
    setHover(cell);
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId || cell < 0 || cell === active.last) return;
    if (app.shape === 'brush') {
      active.current = paintCells(
        active.current,
        rasterizeLine(active.last, cell, app.map.width),
        app.brushSize,
        app.tool,
      );
      app.replaceStroke(active.current);
    }
    active.last = cell;
  };
  const finish = (event: PointerEvent<HTMLCanvasElement>) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (app.shape === 'rect') {
      const [x0, y0, x1, y1] = rectangle(active.start, active.last, app.map.width);
      const cells: number[] = [];
      for (let y = y0; y <= y1; y += 1)
        for (let x = x0; x <= x1; x += 1) cells.push(y * app.map.width + x);
      app.commitMap(paintCells(active.base, cells, 1, app.tool));
    }
    gesture.current = null;
  };
  const cancel = (event: PointerEvent<HTMLCanvasElement>) => {
    if (gesture.current?.pointer !== event.pointerId) return;
    if (app.shape === 'brush') app.replaceStroke(gesture.current.current);
    gesture.current = null;
  };
  const keyboard = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      app.commitMap(paintCells(app.map, [keyboardCell], app.brushSize, app.tool));
      return;
    }
    const next =
      event.key === 'ArrowLeft'
        ? Math.max(0, keyboardCell - 1)
        : event.key === 'ArrowRight'
          ? Math.min(app.map.cells.length - 1, keyboardCell + 1)
          : event.key === 'ArrowUp'
            ? Math.max(0, keyboardCell - app.map.width)
            : event.key === 'ArrowDown'
              ? Math.min(app.map.cells.length - 1, keyboardCell + app.map.width)
              : null;
    if (next === null) return;
    event.preventDefault();
    setKeyboardCell(next);
  };
  const readCell = hover >= 0 ? hover : keyboardCell;
  const x = readCell % app.map.width;
  const y = Math.floor(readCell / app.map.width);
  const hammerX = (x + 0.5 - app.map.width / 2) * HAMMER_UNITS_PER_CELL;
  const hammerY = (app.map.height / 2 - y - 0.5) * HAMMER_UNITS_PER_CELL;
  const announcement = `Cell ${x}, ${y}. ${tileDefinition(app.map.cells[readCell]).name}. Hammer ${hammerX}, ${hammerY}.`;
  return (
    <div className="stage">
      <div className="overlaybar seg" aria-label="Map overlay">
        {(['plain', 'race', 'sight', 'deaths'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={app.overlay === value}
            onClick={() => app.setOverlay(value)}
          >
            {value === 'plain'
              ? 'Plain'
              : value === 'race'
                ? 'Who arrives first'
                : value === 'sight'
                  ? 'Sightlines'
                  : 'Death map'}
          </button>
        ))}
      </div>
      <div className="canvaswrap" ref={wrapper}>
        <canvas
          ref={canvas}
          id="map"
          role="application"
          tabIndex={0}
          aria-label="Map grid editor. Use arrow keys to move and Space or Enter to paint."
          aria-describedby="canvas-help"
          onKeyDown={keyboard}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onPointerLeave={() => {
            if (!gesture.current) setHover(-1);
          }}
        />
        {app.live && (
          <div className="hud">
            <span>
              {Math.max(
                0,
                Math.floor(
                  app.live.bomb.state === 'planted'
                    ? 40 - (app.live.time - app.live.bomb.plantedAt)
                    : app.live.roundTime - app.live.time,
                ),
              )}
              s
            </span>
            <span>
              {app.live.agents.filter((agent) => agent.side === 'T' && agent.alive).length} v{' '}
              {app.live.agents.filter((agent) => agent.side === 'CT' && agent.alive).length}
            </span>
          </div>
        )}
      </div>
      <div id="canvas-help" className="readout" aria-live="polite">
        {focused || hover >= 0
          ? announcement
          : 'Hover a cell to see its Hammer coordinates and arrival times.'}
      </div>
      <div className="legend">
        {app.overlay === 'race'
          ? 'Ts get there first · even · CTs first. Dashed ring: earliest contact.'
          : app.overlay === 'sight'
            ? 'Cover boxes and walls block sight. Click a floor cell to inspect visibility.'
            : app.overlay === 'deaths'
              ? app.batch
                ? 'Gold: mostly Ts die · blue: mostly CTs die.'
                : 'Run rounds to fill the death map.'
              : ''}
      </div>
    </div>
  );
}
