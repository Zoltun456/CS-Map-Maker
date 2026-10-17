import { useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/state';
import { createPortableMap } from '../../core/portableMap';
import { resolveProfile } from '../../core/profiles';
import { renderMapSvg } from '../../core/svg';
import { searchMaps, type SearchResult } from '../../core/search';

export function SearchPage() {
  const app = useApp();
  const [seed, setSeed] = useState(42);
  const [budget, setBudget] = useState(100);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const controller = useRef<AbortController | null>(null);
  const file = useMemo(
    () => createPortableMap(app.map, app.agentMetadata),
    [app.map, app.agentMetadata],
  );
  const run = async () => {
    const active = new AbortController();
    controller.current?.abort();
    controller.current = active;
    app.registerBatch(active);
    setProgress(0);
    try {
      const next = await searchMaps({
        map: app.map,
        file,
        profile: resolveProfile(file.profile),
        seed,
        budget,
        signal: active.signal,
        onProgress: ({ completed, budget: total }) => setProgress(completed / total),
      });
      if (!active.signal.aborted) setResult(next);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error(error);
        app.showToast('Candidate search failed.');
      }
    } finally {
      if (controller.current === active) {
        controller.current = null;
        app.releaseBatch(active);
        setProgress(null);
      }
    }
  };
  return (
    <div className="agent-page">
      <div className="agent-intro">
        <h2>Candidate search</h2>
        <p>
          Explore deterministic, tactically distinct mutations. Search never changes the active map
          until you accept a candidate.
        </p>
      </div>
      <section className="card search-controls">
        <label className="field">
          Seed
          <input
            type="number"
            value={seed}
            onChange={(event) => setSeed(Number(event.target.value))}
          />
        </label>
        <label className="field">
          Candidate budget
          <select value={budget} onChange={(event) => setBudget(Number(event.target.value))}>
            {[25, 100, 250, 500].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <div className="btnrow">
          <button className="btn primary" disabled={progress !== null} onClick={() => void run()}>
            Search maps
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
          <div className="progress" aria-label={`Search ${Math.round(progress * 100)}% complete`}>
            <div style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </section>
      {result && (
        <>
          <p className="note">
            Rubric {result.rubricVersion} · seed {result.seed} · evaluated {result.evaluated}
          </p>
          <div className="search-grid">
            {result.frontier.map((candidate, index) => {
              const svg = renderMapSvg({ ...file, name: `Candidate ${index + 1}` }, candidate.map);
              return (
                <article className="card candidate" key={candidate.mapHash}>
                  <img
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
                    alt={`Candidate ${index + 1} map preview`}
                  />
                  <h3>Candidate {index + 1}</h3>
                  <p>
                    {candidate.valid ? `${candidate.score}/100` : 'Hard gates failed'} · novelty{' '}
                    {Math.round(candidate.novelty * 100)}%
                  </p>
                  <dl className="stats">
                    {candidate.categories.map((category) => (
                      <div key={category.id}>
                        <dt>{category.id}</dt>
                        <dd>
                          {category.score}/{category.maximum}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    className="btn primary"
                    onClick={() => {
                      app.commitMap(candidate.map);
                      app.setTab('lab');
                      app.showToast('Candidate accepted as one undoable edit.');
                    }}
                  >
                    Accept candidate
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
