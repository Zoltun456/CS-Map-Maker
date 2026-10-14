import { describe, expect, it } from 'vitest';
import { MainThreadBatchRunner, BatchCancelledError } from '../../src/core/batchRunner';
import { buildGraph } from '../../src/core/graph';
import { sampleMap } from '../../src/content/maps';

describe('batch runner', () => {
  it('completes requested rounds against its captured graph', async () => {
    const result = await new MainThreadBatchRunner().run({
      graph: buildGraph(sampleMap()),
      options: { plan: 'rush', site: 'A', roundTime: 90 },
      rounds: 2,
    });
    expect(result.rounds).toBe(2);
  });
  it('stops at an abort boundary', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new MainThreadBatchRunner().run({
        graph: buildGraph(sampleMap()),
        options: { plan: 'rush', site: 'A', roundTime: 90 },
        rounds: 50,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(BatchCancelledError);
  });
});
