import { describe, expect, it } from 'vitest';
import { advanceDefuse } from '../../src/core/simulation';
import type { AgentState, SimulationState } from '../../src/core/types';

function ct(id: string, kit: boolean): AgentState {
  return {
    side: 'CT',
    id,
    x: 0,
    y: 0,
    cell: 0,
    next: -1,
    alive: true,
    steps: [],
    stepIndex: 0,
    override: null,
    still: 0,
    target: null,
    aimTime: 0,
    skill: 1,
    kills: 0,
    visible: [],
    kit,
  };
}

describe('defusing', () => {
  it('uses one kit defuser and never multiplies progress by player count', () => {
    const bomb: SimulationState['bomb'] = {
      state: 'planted',
      cell: 0,
      plantProgress: 0,
      defuseProgress: 0,
      plantedAt: 0,
      activeDefuserId: null,
    };
    expect(advanceDefuse(bomb, [ct('CT2', false), ct('CT1', true)], 1)).toBe(false);
    expect(bomb).toMatchObject({ activeDefuserId: 'CT1', defuseProgress: 1 });
  });
  it('resets progress if the active defuser changes or is interrupted', () => {
    const bomb: SimulationState['bomb'] = {
      state: 'planted',
      cell: 0,
      plantProgress: 0,
      defuseProgress: 4,
      plantedAt: 0,
      activeDefuserId: 'CT1',
    };
    advanceDefuse(bomb, [ct('CT2', false)], 1);
    expect(bomb).toMatchObject({ activeDefuserId: 'CT2', defuseProgress: 1 });
    advanceDefuse(bomb, [], 1);
    expect(bomb).toMatchObject({ activeDefuserId: null, defuseProgress: 0 });
  });
});
