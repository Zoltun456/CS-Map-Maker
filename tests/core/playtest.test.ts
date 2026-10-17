import { describe, expect, it } from 'vitest';
import { validatePlaytestSession } from '../../src/core/playtest';

const session = {
  schemaVersion: 1,
  id: 'session-1',
  mapHash: 'deadbeef',
  rubricVersion: '2.0.0',
  createdAt: '2026-10-17T12:00:00.000Z',
  participant: 'tester',
  scenario: 'A retake',
  profile: 'two-site-3v3',
  ratings: { flow: 4, combat: 3, readability: 5, fun: 4 },
} as const;

describe('playtest sessions', () => {
  it('validates versioned local evidence', () => {
    expect(validatePlaytestSession(session)).toEqual(session);
    expect(() =>
      validatePlaytestSession({ ...session, ratings: { ...session.ratings, fun: 6 } }),
    ).toThrow('fun rating');
  });
});
