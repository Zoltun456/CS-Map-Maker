import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useApp } from '../../app/state';
import { cloneDocumentV2, type GeometryType, type ZoneKind } from '../../core/documentV2';
import { createPortableMapV2, parsePortableMapV2 } from '../../core/portableV2';
import { rasterizeLine } from '../../core/map';
import { buildGraphV2, validateGraphV2 } from '../../core/graphV2';
import { GEOMETRY_COLORS, ZONE_COLORS, drawLayeredMap } from './rendererV2';

type Tool = GeometryType | ZoneKind;

export function LayeredPage() {
  const app = useApp();
  const [tool, setTool] = useState<Tool>('floor');
  const [selectedCell, setSelectedCell] = useState(0);
  const [hoverCell, setHoverCell] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [cellSize, setCellSize] = useState(14);
  const canvas = useRef<HTMLCanvasElement>(null);
  const canvasWrap = useRef<HTMLElement>(null);
  const stroke = useRef<{ start: number; last: number } | null>(null);
  const document = app.layeredDocument;
  const levelIndex = Math.max(
    0,
    document.levels.findIndex((level) => level.id === app.layeredLevelId),
  );
  const level = document.levels[levelIndex];
  const graphErrors = useMemo(() => validateGraphV2(buildGraphV2(document)), [document]);
  const portable = useMemo(
    () =>
      createPortableMapV2(document, {
        name: app.agentMetadata.name,
        profile: app.agentMetadata.profile,
      }),
    [document, app.agentMetadata.name, app.agentMetadata.profile],
  );
  useEffect(() => {
    const resize = () => {
      if (!canvasWrap.current) return;
      setCellSize(
        Math.max(
          7,
          Math.min(
            canvasWrap.current.clientWidth / document.width,
            Math.max(320, window.innerHeight - 230) / document.height,
          ),
        ),
      );
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (canvasWrap.current) observer.observe(canvasWrap.current);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [document.width, document.height]);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context || !canvas.current) return;
    const width = Math.floor(cellSize * document.width);
    const height = Math.floor(cellSize * document.height);
    const ratio = window.devicePixelRatio || 1;
    canvas.current.width = width * ratio;
    canvas.current.height = height * ratio;
    canvas.current.style.width = `${width}px`;
    canvas.current.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawLayeredMap(context, {
      document,
      level,
      adjacent: document.levels[levelIndex - 1],
      cellSize,
      hoverCell,
      keyboardCell: focused ? selectedCell : -1,
      selectedCell,
      highlightedCells: app.layeredHighlights
        .filter((point) => point.levelId === level.id)
        .map((point) => point.y * document.width + point.x),
    });
  }, [
    app.layeredHighlights,
    cellSize,
    document,
    focused,
    hoverCell,
    level,
    levelIndex,
    selectedCell,
  ]);
  const eventCell = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - bounds.left) / bounds.width) * document.width);
    const y = Math.floor(((event.clientY - bounds.top) / bounds.height) * document.height);
    return x >= 0 && y >= 0 && x < document.width && y < document.height
      ? y * document.width + x
      : -1;
  };
  const paintCells = (cells: readonly number[]) => {
    const next = cloneDocumentV2(document);
    next.legacySource = undefined;
    if (tool in GEOMETRY_COLORS) {
      for (const cell of cells) next.levels[levelIndex].geometry[cell] = tool as GeometryType;
    } else {
      let zone = next.zones.find(
        (item) => item.kind === tool && item.cells.some((cell) => cell.levelId === level.id),
      );
      if (!zone) {
        zone = { id: `${tool}-${level.id}`, kind: tool as ZoneKind, cells: [] };
        next.zones.push(zone);
      }
      const existing = new Set(zone.cells.map((cell) => `${cell.levelId}:${cell.x}:${cell.y}`));
      for (const cell of cells) {
        const value = {
          levelId: level.id,
          x: cell % document.width,
          y: Math.floor(cell / document.width),
        };
        const key = `${value.levelId}:${value.x}:${value.y}`;
        if (!existing.has(key)) zone.cells.push(value);
      }
    }
    app.commitLayeredDocument(next);
  };
  const finishStroke = () => {
    if (!stroke.current) return;
    const cells = rasterizeLine(stroke.current.start, stroke.current.last, document.width);
    stroke.current = null;
    paintCells(cells);
  };
  const keyboard = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      paintCells([selectedCell]);
      return;
    }
    const next =
      event.key === 'ArrowLeft'
        ? Math.max(0, selectedCell - 1)
        : event.key === 'ArrowRight'
          ? Math.min(document.width * document.height - 1, selectedCell + 1)
          : event.key === 'ArrowUp'
            ? Math.max(0, selectedCell - document.width)
            : event.key === 'ArrowDown'
              ? Math.min(document.width * document.height - 1, selectedCell + document.width)
              : null;
    if (next === null) return;
    event.preventDefault();
    setSelectedCell(next);
  };
  const addLevel = () => {
    const next = cloneDocumentV2(document);
    const id = `level-${next.levels.length + 1}`;
    next.levels.push({
      id,
      name: `Level ${next.levels.length + 1}`,
      elevation: level.elevation + 128,
      ceilingHeight: 192,
      geometry: Array(document.width * document.height).fill('void'),
    });
    next.legacySource = undefined;
    app.commitLayeredDocument(next);
    app.setLayeredLevelId(id);
  };
  const changeLevel = (change: Partial<Pick<typeof level, 'elevation' | 'ceilingHeight'>>) => {
    const next = cloneDocumentV2(document);
    Object.assign(next.levels[levelIndex], change);
    next.legacySource = undefined;
    app.commitLayeredDocument(next);
  };
  const addStairs = () => {
    const lower = document.levels[levelIndex - 1];
    if (!lower) return;
    const x = selectedCell % document.width;
    const y = Math.floor(selectedCell / document.width);
    const next = cloneDocumentV2(document);
    next.links.push({
      id: `stairs-${Date.now()}`,
      kind: 'stairs',
      from: { levelId: lower.id, x, y },
      to: { levelId: level.id, x, y },
      bidirectional: true,
    });
    next.legacySource = undefined;
    app.commitLayeredDocument(next);
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([`${JSON.stringify(portable, null, 2)}\n`], { type: 'application/json' }),
    );
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${app.agentMetadata.name}.v2.csmap.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="agent-page">
      <div className="agent-intro">
        <h2>2.5D layout</h2>
        <p>
          Edit overlapping floors and semantic zones. Adjacent lower geometry is ghosted behind the
          active level.
        </p>
      </div>
      <div className="layer-layout">
        <aside className="card layer-tools">
          <label className="field">
            Active level
            <select
              value={level.id}
              onChange={(event) => app.setLayeredLevelId(event.target.value)}
            >
              {document.levels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · Z {item.elevation}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={addLevel}>
            Add upper level
          </button>
          <div className="btnrow">
            <button
              className="btn"
              onClick={() => changeLevel({ elevation: level.elevation - 64 })}
            >
              Z −64
            </button>
            <button
              className="btn"
              onClick={() => changeLevel({ elevation: level.elevation + 64 })}
            >
              Z +64
            </button>
          </div>
          <label className="field">
            Ceiling
            <select
              value={level.ceilingHeight}
              onChange={(event) => changeLevel({ ceilingHeight: Number(event.target.value) })}
            >
              {[128, 192, 256, 320].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <button className="btn" disabled={levelIndex === 0} onClick={addStairs}>
            Add stairs at selected cell
          </button>
          <div className="btnrow">
            <button className="btn" disabled={!app.canUndoLayered} onClick={app.undoLayered}>
              Undo
            </button>
            <button className="btn" disabled={!app.canRedoLayered} onClick={app.redoLayered}>
              Redo
            </button>
          </div>
          <h3>Geometry</h3>
          <div className="tiles">
            {(['floor', 'wall', 'full-cover', 'half-cover', 'void'] as GeometryType[]).map(
              (value, index) => (
                <button
                  className="tile"
                  aria-pressed={tool === value}
                  key={value}
                  onClick={() => setTool(value)}
                >
                  <i style={{ background: GEOMETRY_COLORS[value] }} />
                  {value.replace('-', ' ')}
                  <kbd>{index + 1}</kbd>
                </button>
              ),
            )}
          </div>
          <h3>Zones</h3>
          <div className="tiles">
            {(['t-spawn', 'ct-spawn', 'site-a', 'site-b', 'indoor', 'callout'] as ZoneKind[]).map(
              (value) => (
                <button
                  className="tile"
                  aria-pressed={tool === value}
                  key={value}
                  onClick={() => setTool(value)}
                >
                  <i style={{ background: ZONE_COLORS[value] }} />
                  {value.replace('-', ' ')}
                </button>
              ),
            )}
          </div>
        </aside>
        <section className="card layered-canvas-wrap" ref={canvasWrap}>
          <canvas
            ref={canvas}
            role="application"
            aria-label={`Edit ${level.name} at elevation ${level.elevation}. Use arrow keys to move and Space or Enter to paint.`}
            tabIndex={0}
            onKeyDown={keyboard}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              const cell = eventCell(event);
              if (cell < 0) return;
              setSelectedCell(cell);
              stroke.current = { start: cell, last: cell };
            }}
            onPointerMove={(event) => {
              const cell = eventCell(event);
              setHoverCell(cell);
              if (stroke.current && cell >= 0) stroke.current.last = cell;
            }}
            onPointerUp={finishStroke}
            onPointerCancel={() => {
              stroke.current = null;
            }}
            onPointerLeave={() => {
              if (!stroke.current) setHoverCell(-1);
            }}
          />
          <div className="readout" aria-live="polite">
            Cell {selectedCell % document.width}, {Math.floor(selectedCell / document.width)} ·{' '}
            {level.geometry[selectedCell]} · Z {level.elevation}
          </div>
          <div className="legend">Ghost: level below · green marker: traversal link</div>
        </section>
        <aside className="card">
          <h3>Document</h3>
          <p>
            {document.levels.length} levels · {document.links.length} traversal links ·{' '}
            {document.zones.length} zones
          </p>
          <p>
            Elevation {level.elevation} u · ceiling {level.ceilingHeight} u
          </p>
          <div className="btnrow">
            <button className="btn" onClick={download}>
              Download v2
            </button>
            <button
              className="btn"
              onClick={() =>
                void navigator.clipboard
                  .writeText(`${JSON.stringify(portable, null, 2)}\n`)
                  .then(() => app.showToast('V2 JSON copied'))
              }
            >
              Copy v2 JSON
            </button>
          </div>
          <label className="btn file-button">
            Import v2
            <input
              type="file"
              accept=".json,.csmap.json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file)
                  void file.text().then((text) => {
                    const parsed = parsePortableMapV2(JSON.parse(text));
                    app.commitLayeredDocument(parsed.document);
                    app.setLayeredLevelId(parsed.document.levels[0].id);
                  });
              }}
            />
          </label>
          {graphErrors.length ? (
            <ul className="warn">
              {graphErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : (
            <p className="note">Layer graph is valid.</p>
          )}
          <p className="note">
            Stored separately under <code>csmap-layout-v2</code>; legacy <code>CS3V3:</code> data
            remains untouched.
          </p>
        </aside>
      </div>
    </div>
  );
}
