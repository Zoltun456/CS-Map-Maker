import { useEffect, useState } from 'react';
import { useApp } from '../../app/state';
import { hashMap, RUBRIC_VERSION } from '../../core/rubric';
import type { PlaytestSessionV1 } from '../../core/playtest';
import { listPlaytests, savePlaytest } from './storage';

const download = (content: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'playtests.json';
  anchor.click();
  URL.revokeObjectURL(url);
};

export function PlaytestPage() {
  const app = useApp();
  const [sessions, setSessions] = useState<PlaytestSessionV1[]>([]);
  const [participant, setParticipant] = useState('local-tester');
  const [scenario, setScenario] = useState('Free play');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(3);
  useEffect(() => {
    void listPlaytests().then(setSessions);
  }, []);
  const save = async () => {
    const session: PlaytestSessionV1 = {
      schemaVersion: 1,
      id: crypto.randomUUID(),
      mapHash: hashMap(app.map),
      rubricVersion: RUBRIC_VERSION,
      createdAt: new Date().toISOString(),
      participant,
      scenario,
      profile: app.agentMetadata.profile,
      ratings: { flow: rating, combat: rating, readability: rating, fun: rating },
      ...(notes ? { notes } : {}),
    };
    await savePlaytest(session);
    setSessions((current) => [session, ...current]);
    setNotes('');
    app.showToast('Playtest evidence saved locally.');
  };
  return (
    <div className="agent-page">
      <div className="agent-intro">
        <h2>Playtest evidence</h2>
        <p>Human observations stay local and are shown separately from automated scores.</p>
      </div>
      <section className="card playtest-form">
        <label className="field">
          Participant label
          <input value={participant} onChange={(event) => setParticipant(event.target.value)} />
        </label>
        <label className="field">
          Scenario
          <input value={scenario} onChange={(event) => setScenario(event.target.value)} />
        </label>
        <label className="field">
          Overall ratings
          <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <div className="btnrow">
          <button className="btn primary" onClick={() => void save()}>
            Save session
          </button>
          <button
            className="btn"
            disabled={!sessions.length}
            onClick={() => download(JSON.stringify(sessions, null, 2))}
          >
            Export sessions
          </button>
        </div>
      </section>
      <div className="search-grid">
        {sessions.map((session) => (
          <article className="card" key={session.id}>
            <h3>{session.scenario}</h3>
            <p>
              {session.participant} · {new Date(session.createdAt).toLocaleString()}
            </p>
            <p>
              Map {session.mapHash} · fun {session.ratings.fun}/5
            </p>
            {session.notes && <p>{session.notes}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
