import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/state';
import { MainThreadBatchRunner, BatchCancelledError } from '../../core/batchRunner';
import { evaluateMap } from '../../core/evaluation';
import { createHammerBlockout } from '../../core/export';
import {
  createPortableMap,
  parsePortableMap,
  PortableMapError,
  stringifyPortableMap,
} from '../../core/portableMap';
import { resolveProfile } from '../../core/profiles';
import { encodeMap } from '../../core/serialization';
import { renderMapSvg } from '../../core/svg';
import type { MapEvaluation, MapProfileId } from '../../core/agentTypes';

const runner = new MainThreadBatchRunner();
const safeJson = (value: unknown) =>
  JSON.stringify(
    value,
    (_key, item) =>
      item instanceof Float32Array
        ? Array.from(item.entries()).filter(([, count]) => count > 0)
        : item instanceof Float64Array || item instanceof Uint8Array
          ? Array.from(item)
          : item,
    2,
  );
const download = (name: string, content: string, type = 'text/plain') => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

export function AgentToolsPage() {
  const app = useApp();
  const portable = useMemo(
    () => createPortableMap(app.map, app.agentMetadata),
    [app.map, app.agentMetadata],
  );
  const [source, setSource] = useState('');
  const [sourceDirty, setSourceDirty] = useState(false);
  const [rounds, setRounds] = useState(1000);
  const [evaluation, setEvaluation] = useState<MapEvaluation | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const displayedSource = sourceDirty ? source : stringifyPortableMap(portable);

  const apply = () => {
    try {
      const parsed = parsePortableMap(displayedSource);
      app.commitMap(parsed.map);
      app.setAgentMetadata({
        name: parsed.file.name,
        ...(parsed.file.notes ? { notes: parsed.file.notes } : {}),
        profile: parsed.file.profile,
        ...(parsed.file.targets ? { targets: parsed.file.targets } : {}),
      });
      setSource('');
      setSourceDirty(false);
      setEvaluation(null);
      app.showToast('Agent map loaded');
    } catch (error) {
      console.warn(error);
      app.showToast(
        error instanceof PortableMapError ? error.message : 'Agent map could not be loaded.',
      );
    }
  };
  const run = async () => {
    const active = new AbortController();
    controller.current?.abort();
    controller.current = active;
    app.registerBatch(active);
    setProgress(0);
    app.setHighlightedCells([]);
    try {
      const profile = resolveProfile(portable.profile, portable.targets);
      const result = await evaluateMap(portable, app.map, profile, {
        runner,
        rounds,
        signal: active.signal,
        onProgress: (done, total) => setProgress(done / total),
      });
      if (!active.signal.aborted) setEvaluation(result);
    } catch (error) {
      if (!(error instanceof BatchCancelledError)) {
        console.error(error);
        app.showToast('Evaluation failed.');
      }
    } finally {
      if (controller.current === active) {
        controller.current = null;
        app.releaseBatch(active);
        setProgress(null);
      }
    }
  };
  const report = evaluation ? safeJson(evaluation) : '';
  const svg = renderMapSvg(portable, app.map, evaluation?.diagnostics ?? []);
  return (
    <div className="agent-page">
      <div className="agent-intro">
        <h2>Agent map tools</h2>
        <p>
          Author maps as readable JSON, run the same evaluator used by the CLI, and export evidence
          an autonomous agent can act on.
        </p>
      </div>
      <div className="agent-grid">
        <section className="card">
          <h2>Agent map document</h2>
          <div className="simopts">
            <label className="field">
              Name
              <input
                value={app.agentMetadata.name}
                onChange={(event) =>
                  app.setAgentMetadata({ ...app.agentMetadata, name: event.target.value })
                }
              />
            </label>
            <label className="field">
              Profile
              <select
                className="sel"
                value={app.agentMetadata.profile}
                onChange={(event) =>
                  app.setAgentMetadata({
                    ...app.agentMetadata,
                    profile: event.target.value as MapProfileId,
                  })
                }
              >
                <option value="two-site-3v3">Two-site 3v3</option>
                <option value="one-site-3v3">One-site 3v3</option>
              </select>
            </label>
          </div>
          <textarea
            className="code agent-source"
            aria-label="Agent map JSON"
            value={displayedSource}
            onChange={(event) => {
              setSource(event.target.value);
              setSourceDirty(true);
            }}
          />
          <div className="btnrow">
            <button className="btn primary" onClick={apply}>
              Apply JSON
            </button>
            <label className="btn file-button">
              Upload JSON
              <input
                type="file"
                accept=".json,.csmap.json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file)
                    void file.text().then((value) => {
                      setSource(value);
                      setSourceDirty(true);
                    });
                }}
              />
            </label>
            <button
              className="btn"
              onClick={() =>
                download(
                  `${app.agentMetadata.name}.csmap.json`,
                  stringifyPortableMap(portable),
                  'application/json',
                )
              }
            >
              Download JSON
            </button>
            <button
              className="btn"
              onClick={() =>
                void navigator.clipboard
                  .writeText(stringifyPortableMap(portable))
                  .then(() => app.showToast('Agent JSON copied'))
              }
            >
              Copy JSON
            </button>
          </div>
        </section>
        <section className="card">
          <h2>Evaluate</h2>
          <label className="field">
            Simulation rounds
            <select
              className="sel"
              value={rounds}
              onChange={(event) => setRounds(Number(event.target.value))}
            >
              {[200, 500, 1000, 2000, 5000, 10000].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <div className="btnrow top-gap">
            <button className="btn primary" disabled={progress !== null} onClick={() => void run()}>
              Evaluate map
            </button>
            <button
              className="btn"
              disabled={progress === null}
              onClick={() => controller.current?.abort()}
            >
              Cancel
            </button>
          </div>
          {progress !== null && (
            <div
              className="progress"
              aria-label={`Evaluation ${Math.round(progress * 100)}% complete`}
            >
              <div style={{ width: `${progress * 100}%` }} />
            </div>
          )}
          {evaluation && (
            <>
              <div className={`agent-score ${evaluation.status}`}>
                <strong>{evaluation.status}</strong>
                <span>
                  {evaluation.score === null ? 'Hard gates failed' : `${evaluation.score}/100`}
                </span>
              </div>
              <div className="category-grid">
                {evaluation.categories.map((category) => (
                  <details key={category.id}>
                    <summary>
                      <strong>
                        {category.score}/{category.maximum}
                      </strong>
                      <span>{category.label}</span>
                    </summary>
                    <dl>
                      {category.metrics.map((metric) => (
                        <div key={metric.id}>
                          <dt>{metric.label}</dt>
                          <dd>
                            {Number.isFinite(metric.value)
                              ? Math.round(metric.value * 100) / 100
                              : 'n/a'}
                            {metric.unit === '%' ? '%' : metric.unit ? ` ${metric.unit}` : ''}
                            {metric.target ? ` · target ${metric.target}` : ''}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ))}
              </div>
              <h3>Diagnostics</h3>
              <div className="diagnostics">
                {evaluation.diagnostics.length === 0 && <p className="note">No diagnostics.</p>}
                {evaluation.diagnostics.map((item) => (
                  <button
                    className={`diagnostic ${item.severity}`}
                    key={item.code}
                    onClick={() => {
                      app.setHighlightedCells(
                        item.coordinates.map(({ x, y }) => y * app.map.width + x),
                      );
                      app.setTab('lab');
                    }}
                  >
                    <strong>{item.code}</strong>
                    <span>
                      {item.message} {item.suggestion}
                    </span>
                  </button>
                ))}
              </div>
              <div className="btnrow top-gap">
                <button
                  className="btn"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(report)
                      .then(() => app.showToast('Evaluation report copied'))
                  }
                >
                  Copy report
                </button>
                <button
                  className="btn"
                  onClick={() => download('report.json', report, 'application/json')}
                >
                  Report
                </button>
                <button
                  className="btn"
                  onClick={() => download('preview.svg', svg, 'image/svg+xml')}
                >
                  SVG
                </button>
                <button
                  className="btn"
                  onClick={() => download('layout-code.txt', encodeMap(app.map))}
                >
                  Layout code
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    download('hammer-blockout.txt', createHammerBlockout(app.map, app.graph))
                  }
                >
                  Hammer
                </button>
              </div>
            </>
          )}
        </section>
        <section className="card agent-preview">
          <h2>Annotated preview</h2>
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
            alt="Agent map preview with diagnostic cells highlighted"
          />
        </section>
      </div>
    </div>
  );
}
