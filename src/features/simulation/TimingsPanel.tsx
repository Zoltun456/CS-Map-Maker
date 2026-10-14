import { useApp } from '../../app/state';

const format = (value: number) => (Number.isFinite(value) ? `${value.toFixed(1)} s` : '—');
function Chip({ value, low, high }: { value: number; low: number; high: number }) {
  const state = !Number.isFinite(value) ? 'na' : value < low ? 'lo' : value > high ? 'hi' : 'ok';
  return (
    <span className={`chip ${state}`}>
      {state === 'na' ? 'n/a' : state === 'lo' ? 'short' : state === 'hi' ? 'long' : 'good'}
    </span>
  );
}

export function TimingsPanel() {
  const { analysis, graph } = useApp();
  const hasB = graph.siteB.length > 0;
  const rows: Array<[string, number, number, number] | false> = [
    ['CT to A', analysis.ctA, 3, 8],
    hasB && ['CT to B', analysis.ctB, 3, 8],
    ['T to A', analysis.tA, 10, 18],
    hasB && ['T to B', analysis.tB, 10, 18],
    ['CT lead at A', analysis.tA - analysis.ctA, 5, 12],
    hasB && ['CT lead at B', analysis.tB - analysis.ctB, 5, 12],
    hasB && ['Rotate A ↔ B', analysis.rotateAB, 6, 14],
    ['First contact', analysis.firstContact, 5, 12],
  ];
  return (
    <div className="card">
      <h2>Timings</h2>
      <table className="times">
        <tbody>
          {rows
            .filter((row): row is [string, number, number, number] => Boolean(row))
            .map(([label, value, low, high]) => (
              <tr key={label}>
                <td>
                  {label}
                  <Chip value={value} low={low} high={high} />
                </td>
                <td className="v">{format(value)}</td>
                <td className="tg">
                  {low}–{high} s
                </td>
              </tr>
            ))}
          <tr>
            <td>
              Longest sightline
              {analysis.longestSightline > 3000 ? (
                <span className="chip hi">AWP lane</span>
              ) : analysis.longestSightline ? (
                <span className="chip ok">good</span>
              ) : null}
            </td>
            <td className="v">{Math.round(analysis.longestSightline)} u</td>
            <td className="tg">&lt; 3000 u</td>
          </tr>
        </tbody>
      </table>
      <ul className="warn" aria-live="polite">
        {analysis.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <p className="note">
        Running with a rifle at 220 u/s. One grid cell is 64 Hammer units. Targets are starting
        points for a 3v3 map, not rules. Tune them by playtesting.
      </p>
    </div>
  );
}
