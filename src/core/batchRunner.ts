import { mergeStatistics, runBatch } from './simulation';
import type { BatchRunner, BatchStatistics } from './types';

export class BatchCancelledError extends Error {
  constructor() {
    super('Batch simulation cancelled');
    this.name = 'BatchCancelledError';
  }
}

export class MainThreadBatchRunner implements BatchRunner {
  async run({
    graph,
    options,
    rounds,
    signal,
    onProgress,
  }: Parameters<BatchRunner['run']>[0]): Promise<BatchStatistics> {
    let completed = 0;
    let statistics: BatchStatistics | null = null;
    while (completed < rounds) {
      if (signal?.aborted) throw new BatchCancelledError();
      const count = Math.min(25, rounds - completed);
      statistics = mergeStatistics(
        statistics,
        runBatch(graph, { ...options, seed: (options.seed ?? 0x3c6ef372) + completed }, count),
      );
      completed += count;
      onProgress?.(completed, rounds);
      if (completed < rounds) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return statistics!;
  }
}
