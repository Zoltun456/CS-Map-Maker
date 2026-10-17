import { describe, expect, it } from 'vitest';
import { MainThreadBatchRunner } from '../../src/core/batchRunner';
import { parsePortableMap } from '../../src/core/portableMap';
import { evaluateMapV2, officialEvaluationConfig } from '../../src/core/rubric';
import minimal from '../../examples/maps/minimal-valid.csmap.json';
import strong from '../../examples/maps/two-site.csmap.json';

describe('official rubric', () => {
  it('does not let candidate targets redefine grading', () => {
    const parsed = parsePortableMap({
      ...minimal,
      targets: {
        tWinRate: [0, 1],
        firstContactSeconds: [0, 1000],
        ctLeadSeconds: [-1000, 1000],
        rotationSeconds: [0, 1000],
        maxSightlineUnits: 100000,
      },
    });
    expect(officialEvaluationConfig('two-site-3v3').profile).toBe('two-site-3v3');
    expect(parsed.profile.targets.tWinRate).toEqual([0, 1]);
  });

  it('does not rate the minimal fixture good under the robust scorecard', async () => {
    const parsed = parsePortableMap(minimal);
    const result = await evaluateMapV2(
      parsed.file,
      parsed.map,
      officialEvaluationConfig(parsed.file.profile, { rounds: 200, seed: 17 }),
      { runner: new MainThreadBatchRunner() },
    );
    expect(['poor', 'needs-work']).toContain(result.status);
    expect(result.categories).toHaveLength(6);
  });

  it('keeps the reviewed sample above the minimal benchmark', async () => {
    const runner = new MainThreadBatchRunner();
    const strongMap = parsePortableMap(strong);
    const weakMap = parsePortableMap(minimal);
    const config = officialEvaluationConfig('two-site-3v3', { rounds: 200, seed: 17 });
    const [strongResult, weakResult] = await Promise.all([
      evaluateMapV2(strongMap.file, strongMap.map, config, { runner }),
      evaluateMapV2(weakMap.file, weakMap.map, config, { runner }),
    ]);
    expect(strongResult.score).toBeGreaterThan(weakResult.score!);
    expect(strongResult.status).toBe('good');
  });
});
