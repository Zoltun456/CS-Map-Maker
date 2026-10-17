import { useEffect } from 'react';
import { AppProvider, useApp } from './app/state';
import { TILE_DEFINITIONS } from './core/tiles';
import { EditorRail } from './features/editor/EditorRail';
import { MapCanvas } from './features/editor/MapCanvas';
import { ExportPanel } from './features/export/ExportPanel';
import { Tabs } from './features/navigation/Tabs';
import { SimulationPanel } from './features/simulation/SimulationPanel';
import { TimingsPanel } from './features/simulation/TimingsPanel';
import { GuidePage } from './content/GuidePage';
import { PermafrostPage } from './content/PermafrostPage';
import { ThemesPage } from './content/ThemesPage';
import { AgentToolsPage } from './features/agent/AgentToolsPage';
import { SearchPage } from './features/search/SearchPage';
import { PlaytestPage } from './features/playtest/PlaytestPage';
import { LayeredPage } from './features/layers/LayeredPage';

function AppContents() {
  const app = useApp();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches('input,textarea,select,[contenteditable="true"]'))
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          if (app.tab === 'layers') app.redoLayered();
          else app.redo();
        } else if (app.tab === 'layers') app.undoLayered();
        else app.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        if (app.tab === 'layers') app.redoLayered();
        else app.redo();
        return;
      }
      const tile = TILE_DEFINITIONS.find((definition) => definition.key === event.key);
      if (tile) app.setTool(tile.type);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [app]);
  return (
    <>
      <header className="top">
        <div className="brand">
          <h1>
            3v3 <span>Map Lab</span>
          </h1>
          <p>
            Block out a Counter-Strike 2 layout, check its timings, and simulate rounds before you
            open Hammer.
          </p>
        </div>
        <Tabs />
      </header>
      <main>
        <section
          id="panel-lab"
          role="tabpanel"
          aria-labelledby="tab-lab"
          hidden={app.tab !== 'lab'}
          className="lab"
        >
          <EditorRail />
          <MapCanvas />
          <div className="panel">
            <TimingsPanel />
            <SimulationPanel />
            <ExportPanel />
          </div>
        </section>
        <section
          id="panel-layers"
          role="tabpanel"
          aria-labelledby="tab-layers"
          hidden={app.tab !== 'layers'}
        >
          <LayeredPage />
        </section>
        <section
          id="panel-agent"
          role="tabpanel"
          aria-labelledby="tab-agent"
          hidden={app.tab !== 'agent'}
        >
          <AgentToolsPage />
        </section>
        <section
          id="panel-search"
          role="tabpanel"
          aria-labelledby="tab-search"
          hidden={app.tab !== 'search'}
        >
          <SearchPage />
        </section>
        <section
          id="panel-playtest"
          role="tabpanel"
          aria-labelledby="tab-playtest"
          hidden={app.tab !== 'playtest'}
        >
          <PlaytestPage />
        </section>
        <section
          id="panel-guide"
          role="tabpanel"
          aria-labelledby="tab-guide"
          hidden={app.tab !== 'guide'}
        >
          <GuidePage />
        </section>
        <section
          id="panel-themes"
          role="tabpanel"
          aria-labelledby="tab-themes"
          hidden={app.tab !== 'themes'}
        >
          <ThemesPage />
        </section>
        <section
          id="panel-permafrost"
          role="tabpanel"
          aria-labelledby="tab-permafrost"
          hidden={app.tab !== 'permafrost'}
        >
          <PermafrostPage />
        </section>
      </main>
      <div className="toast" role="status" aria-live="polite" hidden={!app.toast}>
        {app.toast}
      </div>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContents />
    </AppProvider>
  );
}
