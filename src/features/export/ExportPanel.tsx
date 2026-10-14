import { useState } from 'react';
import { useApp } from '../../app/state';
import { createHammerBlockout } from '../../core/export';
import { decodeMap, encodeMap, LayoutCodeError } from '../../core/serialization';
import { drawBase } from '../editor/renderer';
import { Dialog } from '../../components/Dialog';

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function ExportPanel() {
  const app = useApp();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [modal, setModal] = useState<'hammer' | 'image' | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const copyCode = async () => {
    const code = encodeMap(app.map);
    setPaste(code);
    setPasteOpen(true);
    try {
      await copyText(code);
      app.showToast('Layout code copied');
    } catch {
      app.showToast('Select the code and press Ctrl+C');
    }
  };
  const load = () => {
    try {
      app.commitMap(decodeMap(paste));
      app.showToast('Layout loaded');
    } catch (error) {
      console.warn(error);
      app.showToast(
        error instanceof LayoutCodeError
          ? 'That layout code is invalid.'
          : 'That code could not be loaded.',
      );
    }
  };
  const openImage = () => {
    const canvas = document.createElement('canvas');
    const size = 16;
    canvas.width = app.map.width * size;
    canvas.height = app.map.height * size;
    const context = canvas.getContext('2d');
    if (context) drawBase(context, app.map, size);
    setImageUrl(canvas.toDataURL('image/png'));
    setModal('image');
  };
  const hammer = createHammerBlockout(app.map, app.graph);
  return (
    <div className="card">
      <h2>Share and export</h2>
      <div className="btnrow">
        <button className="btn" onClick={copyCode}>
          Copy layout code
        </button>
        <button className="btn" onClick={() => setPasteOpen((value) => !value)}>
          Paste a code
        </button>
        <button className="btn" onClick={() => setModal('hammer')}>
          Hammer blockout
        </button>
        <button className="btn" onClick={openImage}>
          Top-down image
        </button>
      </div>
      {pasteOpen && (
        <div className="pastebox">
          <textarea
            className="code"
            aria-label="Layout code"
            placeholder="Paste a layout code from a friend"
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
          />
          <button className="btn" onClick={load}>
            Load layout
          </button>
        </div>
      )}
      <p className="note">
        Your layout saves in this browser automatically. Layout codes let friends open your map
        here.
      </p>
      {modal === 'hammer' && (
        <Dialog title="Hammer blockout" onClose={() => setModal(null)}>
          <p className="note">
            Build each floor rectangle with the Block tool, then wrap walls around the edges. Spawn
            origins are already spaced for you.
          </p>
          <textarea className="code tall" readOnly value={hammer} />
          <div className="btnrow">
            <button
              className="btn primary"
              onClick={() => void copyText(hammer).then(() => app.showToast('Blockout copied'))}
            >
              Copy
            </button>
            <button className="btn" onClick={() => setModal(null)}>
              Close
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'image' && (
        <Dialog title="Top-down image" onClose={() => setModal(null)}>
          <p className="note">Right-click or long-press the image to save it.</p>
          <img src={imageUrl} alt="Top-down view of the layout" />
          <button className="btn" onClick={() => setModal(null)}>
            Close
          </button>
        </Dialog>
      )}
    </div>
  );
}
