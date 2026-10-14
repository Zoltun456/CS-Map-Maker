import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/state';
import { BatchCancelledError, MainThreadBatchRunner } from '../../core/batchRunner';
import { createRound, stepRound } from '../../core/simulation';
import type { Plan, SimulationOptions, SiteChoice } from '../../core/types';

const runner = new MainThreadBatchRunner();
const percent = (value: number, total: number) =>
  total ? `${Math.round((value / total) * 100)}%` : '—';

export function SimulationPanel() {
  const app = useApp();
  const [plan, setPlan] = useState<Plan>('mixed');
  const [site, setSite] = useState<SiteChoice>('random');
  const [roundTime, setRoundTime] = useState(90);
  const [rounds, setRounds] = useState(500);
  const [progress, setProgress] = useState<number | null>(null);
  const [speed, setSpeed] = useState(2);
  const runGeneration = useRef(0);
  const animation = useRef(0);
  const options: SimulationOptions = { plan, site, roundTime };
  const invalid = app.analysis.warnings.some((warning) => /Paint|cannot/.test(warning));
  const run = async () => {
    if (invalid) {
      app.showToast('Fix the warnings in Timings first.');
      return;
    }
    const controller = new AbortController();
    const generation = ++runGeneration.current;
    app.registerBatch(controller);
    app.setLive(null);
    setProgress(0);
    try {
      const result = await runner.run({
        graph: app.graph,
        options,
        rounds,
        signal: controller.signal,
        onProgress: (complete, total) => {
          if (generation === runGeneration.current) setProgress(complete / total);
        },
      });
      if (generation === runGeneration.current && !controller.signal.aborted) {
        app.setBatch(result);
        app.setOverlay('deaths');
      }
    } catch (error) {
      if (!(error instanceof BatchCancelledError)) {
        console.error(error);
        app.showToast('Simulation failed. Try again.');
      }
    } finally {
      if (generation === runGeneration.current) {
        setProgress(null);
        app.releaseBatch(controller);
      }
    }
  };
  const watch = () => {
    if (animation.current) {
      cancelAnimationFrame(animation.current);
      animation.current = 0;
      app.setLive(null);
      return;
    }
    if (invalid) {
      app.showToast('Fix the warnings in Timings first.');
      return;
    }
    const state = createRound(app.graph, options);
    app.setLive({ ...state });
    let last = performance.now();
    let accumulator = 0;
    const frame = (now: number) => {
      accumulator += Math.min(0.1, (now - last) / 1000) * speed;
      last = now;
      while (accumulator >= 0.05 && !state.outcome) {
        stepRound(state, 0.05);
        accumulator -= 0.05;
      }
      app.setLive({ ...state });
      if (!state.outcome) animation.current = requestAnimationFrame(frame);
      else animation.current = 0;
    };
    animation.current = requestAnimationFrame(frame);
  };
  useEffect(
    () => () => {
      if (animation.current) cancelAnimationFrame(animation.current);
    },
    [],
  );
  const stats = app.batch;
  const tPercent = stats ? (stats.T / stats.rounds) * 100 : 0;
  return (
    <div className="card">
      <h2>Simulate 3v3 rounds</h2>
      <div className="simopts">
        <label className="field">
          T plan
          <select
            className="sel"
            value={plan}
            onChange={(event) => setPlan(event.target.value as Plan)}
          >
            <option value="mixed">Mixed</option>
            <option value="rush">Rush</option>
            <option value="default">Default, then execute</option>
            <option value="fake">Fake one site, hit the other</option>
          </select>
        </label>
        <label className="field">
          Target site
          <select
            className="sel"
            value={site}
            onChange={(event) => setSite(event.target.value as SiteChoice)}
          >
            <option value="random">Random</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </label>
        <label className="field">
          Round time
          <select
            className="sel"
            value={roundTime}
            onChange={(event) => setRoundTime(Number(event.target.value))}
          >
            <option value="90">1:30 (Wingman)</option>
            <option value="105">1:45</option>
            <option value="115">1:55 (Competitive)</option>
          </select>
        </label>
        <label className="field">
          Rounds to run
          <select
            className="sel"
            value={rounds}
            onChange={(event) => setRounds(Number(event.target.value))}
          >
            <option>200</option>
            <option>500</option>
            <option>1000</option>
          </select>
        </label>
      </div>
      <div className="btnrow">
        <button className="btn primary" disabled={progress !== null} onClick={run}>
          Run rounds
        </button>
        <button className="btn" onClick={watch}>
          {app.live && !app.live.outcome ? 'Stop' : 'Watch a round'}
        </button>
        <div className="seg">
          {[1, 2, 4].map((value) => (
            <button key={value} aria-pressed={speed === value} onClick={() => setSpeed(value)}>
              {value}×
            </button>
          ))}
        </div>
      </div>
      {progress !== null && (
        <div className="progress" aria-label={`Simulation ${Math.round(progress * 100)}% complete`}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {stats && (
        <div className="results">
          <div className="winbar">
            <div className="wt" style={{ width: `${tPercent}%` }}>
              T {Math.round(tPercent)}%
            </div>
            <div className="wc" style={{ width: `${100 - tPercent}%` }}>
              CT {Math.round(100 - tPercent)}%
            </div>
          </div>
          <p className="note">
            {tPercent > 58
              ? 'T-sided. Try longer T routes, an extra CT angle, or faster rotations.'
              : tPercent < 42
                ? 'CT-sided. Try a second entrance, shorter T routes, or more cover on the T approach.'
                : 'Balanced for these bots. Next, playtest it for real.'}
          </p>
          <dl className="stats">
            <dt>T win at A</dt>
            <dd>{percent(stats.site.A.tWins, stats.site.A.rounds)}</dd>
            <dt>T win at B</dt>
            <dd>{percent(stats.site.B.tWins, stats.site.B.rounds)}</dd>
            <dt>Opening kill by T</dt>
            <dd>{percent(stats.firstKillsByT, stats.firstKills)}</dd>
            <dt>Average round</dt>
            <dd>{(stats.totalLength / stats.rounds).toFixed(1)} s</dd>
          </dl>
        </div>
      )}
      <p className="note">
        Bots follow simple rules: Ts pick a site and route, CTs set up 2-1, rotate on contact and
        retake. Use the results to compare layouts, not to predict real matches.
      </p>
    </div>
  );
}
