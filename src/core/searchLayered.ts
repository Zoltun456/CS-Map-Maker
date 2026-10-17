import type { MapDocumentV2 } from './documentV2';
import { evaluateLayeredMap, hashLayeredMap } from './evaluationLayered';
import { applyMapOperationsV2, type MapOperationV2 } from './operationsV2';
import type { PortableMapFileV2 } from './portableV2';
import { createSeededRandom } from './random';
import { officialEvaluationConfig, RUBRIC_VERSION } from './rubric';

export interface LayeredSearchCandidate {
  document: MapDocumentV2;
  score: number | null;
  status: string;
  mapHash: string;
  parentHash: string;
  operations: MapOperationV2[];
  categories: Array<{ id: string; score: number; maximum: number }>;
  valid: boolean;
  novelty: number;
}

export async function searchLayeredMaps(request: {
  file: PortableMapFileV2;
  document: MapDocumentV2;
  seed: number;
  budget: number;
  protectedCells?: Array<{ levelId: string; x: number; y: number }>;
  signal?: AbortSignal;
  onProgress?: (completed: number, budget: number) => void;
}) {
  const random = createSeededRandom(request.seed);
  const protectedCells = new Set(
    [
      ...request.document.zones.flatMap((zone) => zone.cells),
      ...request.document.links.flatMap((link) => [link.from, link.to]),
      ...(request.protectedCells ?? []),
    ].map((point) => `${point.levelId}:${point.x}:${point.y}`),
  );
  const frontier: LayeredSearchCandidate[] = [];
  const baseHash = hashLayeredMap(request.document);
  const mutableCells = (document: MapDocumentV2) => {
    const cells: Array<{
      level: MapDocumentV2['levels'][number];
      x: number;
      y: number;
      geometry: MapDocumentV2['levels'][number]['geometry'][number];
    }> = [];
    for (const level of document.levels) {
      level.geometry.forEach((geometry, cell) => {
        const x = cell % document.width;
        const y = Math.floor(cell / document.width);
        if (protectedCells.has(`${level.id}:${x}:${y}`)) return;
        if (geometry === 'floor' || geometry === 'full-cover' || geometry === 'half-cover') {
          cells.push({ level, x, y, geometry });
          return;
        }
        const touchesFloor = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ].some(
          ([nextX, nextY]) =>
            nextX >= 0 &&
            nextY >= 0 &&
            nextX < document.width &&
            nextY < document.height &&
            level.geometry[nextY * document.width + nextX] === 'floor',
        );
        if (touchesFloor) cells.push({ level, x, y, geometry });
      });
    }
    return cells;
  };
  const dominates = (left: LayeredSearchCandidate, right: LayeredSearchCandidate) => {
    let better = false;
    for (const category of right.categories) {
      const leftCategory = left.categories.find((item) => item.id === category.id);
      const leftValue = (leftCategory?.score ?? 0) / (leftCategory?.maximum ?? 1);
      const rightValue = category.score / category.maximum;
      if (leftValue < rightValue) return false;
      if (leftValue > rightValue) better = true;
    }
    return better || (left.score ?? -1) > (right.score ?? -1);
  };
  for (let index = 0; index < request.budget; index += 1) {
    if (request.signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    const parentCandidate =
      frontier.length && random() < 0.7
        ? frontier[Math.floor(random() * frontier.length)]
        : undefined;
    const parent = parentCandidate?.document ?? request.document;
    const choices = mutableCells(parent);
    if (!choices.length) break;
    const { level, x, y, geometry: current } = choices[Math.floor(random() * choices.length)];
    const geometry =
      current === 'floor'
        ? random() < 0.7
          ? 'full-cover'
          : 'half-cover'
        : current === 'full-cover' || current === 'half-cover'
          ? 'floor'
          : 'floor';
    const operation: MapOperationV2 = {
      type: 'paint-geometry',
      levelId: level.id,
      cells: [{ x, y }],
      geometry,
    };
    const document = applyMapOperationsV2(parent, [operation]);
    const evaluation = await evaluateLayeredMap(
      request.file,
      document,
      officialEvaluationConfig(request.file.profile, { seed: request.seed, rounds: 200 }),
    );
    const mapHash = evaluation.mapHash;
    const operations = [...(parentCandidate?.operations ?? []), operation];
    const changed = document.levels.reduce(
      (count, levelItem, levelIndex) =>
        count +
        levelItem.geometry.reduce(
          (sum, value, cell) =>
            sum + Number(value !== request.document.levels[levelIndex].geometry[cell]),
          0,
        ),
      0,
    );
    const candidate: LayeredSearchCandidate = {
      document,
      score: evaluation.score,
      status: evaluation.status,
      mapHash,
      parentHash: parentCandidate?.mapHash ?? baseHash,
      operations,
      categories: evaluation.categories.map(({ id, score, maximum }) => ({
        id,
        score,
        maximum,
      })),
      valid: evaluation.valid,
      novelty: changed / (document.width * document.height * document.levels.length),
    };
    if (
      candidate.valid &&
      !frontier.some((item) => item.mapHash === mapHash || dominates(item, candidate))
    ) {
      for (let cursor = frontier.length - 1; cursor >= 0; cursor -= 1)
        if (dominates(candidate, frontier[cursor])) frontier.splice(cursor, 1);
      frontier.push(candidate);
    }
    frontier.sort(
      (left, right) =>
        Number(right.score ?? -1) - Number(left.score ?? -1) ||
        right.novelty - left.novelty ||
        left.mapHash.localeCompare(right.mapHash),
    );
    frontier.splice(8);
    request.onProgress?.(index + 1, request.budget);
    if (index % 10 === 0) await Promise.resolve();
  }
  return {
    schemaVersion: 1 as const,
    rubricVersion: RUBRIC_VERSION,
    seed: request.seed,
    evaluated: request.budget,
    frontier,
  };
}
