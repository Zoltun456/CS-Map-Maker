import { createMap } from '../../core/map';
import { PAINT_TILES } from '../../core/tiles';
import { TileType } from '../../core/types';
import { permafrostMap, sampleMap } from '../../content/maps';
import { useApp } from '../../app/state';

export function EditorRail() {
  const app = useApp();
  return (
    <aside className="rail">
      <div className="group">
        <h3>Paint</h3>
        <div className="tiles">
          {PAINT_TILES.map((tile) => (
            <button
              className="tile"
              key={tile.type}
              data-testid={`tile-${tile.type}`}
              aria-pressed={app.tool === tile.type}
              onClick={() => app.setTool(tile.type)}
            >
              <i style={{ background: tile.color }} />
              {tile.name}
              <kbd>{tile.key}</kbd>
            </button>
          ))}
        </div>
      </div>
      <div className="group">
        <h3>Shape</h3>
        <div className="seg">
          {(['brush', 'rect'] as const).map((shape) => (
            <button
              key={shape}
              aria-pressed={app.shape === shape}
              onClick={() => app.setShape(shape)}
            >
              {shape === 'rect' ? 'Box' : 'Brush'}
            </button>
          ))}
        </div>
        <div className="seg top-gap">
          {[1, 2, 3].map((size) => (
            <button
              key={size}
              aria-pressed={app.brushSize === size}
              onClick={() => app.setBrushSize(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
      <div className="group">
        <h3>Map</h3>
        <div className="btnrow">
          <button className="btn" disabled={!app.canUndo} onClick={app.undo} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button className="btn" disabled={!app.canRedo} onClick={app.redo} title="Redo (Ctrl+Y)">
            Redo
          </button>
        </div>
        <label className="field top-gap">
          Grid size
          <select
            className="sel"
            value={`${app.map.width}x${app.map.height}`}
            onChange={(event) => {
              const [width, height] = event.target.value.split('x').map(Number);
              app.resize(width, height);
            }}
          >
            {['40x30', '48x36', '56x44', '64x48'].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
        <div className="btnrow top-gap">
          <button
            className="btn"
            onClick={() => {
              app.commitMap(sampleMap());
              app.showToast('Sample layout loaded');
            }}
          >
            Load sample
          </button>
          <button
            className="btn"
            onClick={() => {
              app.commitMap(permafrostMap());
              app.setOverlay('plain');
              app.showToast('Permafrost loaded');
            }}
          >
            Load Permafrost
          </button>
          <button
            className="btn"
            onClick={() => {
              if (window.confirm('Clear the whole map?'))
                app.commitMap(createMap(app.map.width, app.map.height, TileType.Wall));
            }}
          >
            Clear
          </button>
        </div>
      </div>
    </aside>
  );
}
