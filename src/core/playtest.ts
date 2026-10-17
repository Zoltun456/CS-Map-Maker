import type { MapProfileId } from './agentTypes';
import { RUBRIC_VERSION } from './rubric';

export interface PlaytestSessionV1 {
  schemaVersion: 1;
  id: string;
  mapHash: string;
  rubricVersion: typeof RUBRIC_VERSION;
  createdAt: string;
  participant: string;
  scenario: string;
  side?: 'T' | 'CT' | 'observer';
  site?: 'A' | 'B';
  profile: MapProfileId;
  ratings: {
    flow: number;
    combat: number;
    readability: number;
    fun: number;
  };
  notes?: string;
  preferredMapHash?: string;
  comparedMapHash?: string;
}

export function validatePlaytestSession(value: unknown): PlaytestSessionV1 {
  if (!value || typeof value !== 'object') throw new Error('playtest session must be an object');
  const session = value as PlaytestSessionV1;
  if (session.schemaVersion !== 1 || !session.id || !session.mapHash)
    throw new Error('invalid playtest identity');
  if (session.rubricVersion !== RUBRIC_VERSION) throw new Error('unsupported playtest rubric');
  for (const [name, rating] of Object.entries(session.ratings ?? {}))
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new Error(`${name} rating must be an integer from 1 to 5`);
  if (Object.keys(session.ratings ?? {}).length !== 4)
    throw new Error('all four ratings are required');
  return session;
}
