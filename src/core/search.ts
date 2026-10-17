import type { MapProfile, PortableMapFile } from './agentTypes';
import { evaluateMap } from './evaluation';
import { applyMapOperations, type MapOperation } from './operations';
import { createSeededRandom, normalizeSeed } from './random';
import { hashMap, RUBRIC_VERSION } from './rubric';
import { TileType, type MapDocument } from './types';

export interface SearchRequest {
  map: MapDocument;
  file: PortableMapFile;
  profile: MapProfile;
  seed: number;
  budget: number;
  protectedCells?: number[];
  signal?: AbortSignal;
  onProgress?: (progress: SearchProgress) => void;
}

export interface SearchProgress {
  completed: number;
  budget: number;
  frontierSize: number;
}

export interface SearchCandidate {
  map: MapDocument;
  mapHash: string;
  parentHash: string;
  operations: MapOperation[];
  score: number | null;
  categories: Array<{ id: string; score: number; maximum: number }>;
  valid: boolean;
  novelty: number;
}

export interface SearchResult {
  schemaVersion: 1;
  rubricVersion: typeof RUBRIC_VERSION;
  seed: number;
  evaluated: number;
  frontier: SearchCandidate[];
}

const dominates = (left: SearchCandidate, right: SearchCandidate) => {
  if (left.valid !== right.valid) return left.valid;
  const scores = new Map(
    left.categories.map((category) => [category.id, category.score / category.maximum]),
  );
  let better = false;
  for (const category of right.categories) {
    const value = scores.get(category.id) ?? 0;
    const other = category.score / category.maximum;
    if (value < other) return false;
    if (value > other) better = true;
  }
  return better || (left.score ?? -1) > (right.score ?? -1);
};

function mutation(
  map: MapDocument,
  random: () => number,
  protectedCells: Set<number>,
): MapOperation {
  const walkable = Array.from(map.cells, (tile, cell) => ({ tile, cell })).filter(
    ({ tile, cell }) => tile !== TileType.Wall && !protectedCells.has(cell),
  );
  const walls = Array.from(map.cells, (tile, cell) => ({ tile, cell })).filter(
    ({ tile, cell }) => tile === TileType.Wall && !protectedCells.has(cell),
  );
  if (random() < 0.55 && walkable.length) {
    const { cell } = walkable[Math.floor(random() * walkable.length)];
    return {
      type: 'paint',
      cells: [cell],
      tile: random() < 0.5 ? TileType.Cover : TileType.Floor,
      brushSize: 1,
    };
  }
  const { cell = 0 } = walls[Math.floor(random() * Math.max(1, walls.length))] ?? {};
  return { type: 'paint', cells: [cell], tile: TileType.Floor, brushSize: random() < 0.25 ? 2 : 1 };
}

export async function searchMaps(request: SearchRequest): Promise<SearchResult> {
  const random = createSeededRandom(normalizeSeed(request.seed));
  const parentHash = hashMap(request.map);
  const frontier: SearchCandidate[] = [];
  const protectedCells = new Set(request.protectedCells ?? []);
  for (let index = 0; index < request.budget; index += 1) {
    if (request.signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    const parent =
      frontier.length && random() < 0.7
        ? frontier[Math.floor(random() * frontier.length)].map
        : request.map;
    const operations = [mutation(parent, random, protectedCells)];
    const map = applyMapOperations(parent, operations);
    const evaluation = await evaluateMap(request.file, map, request.profile);
    const changed = map.cells.reduce(
      (count, tile, cell) => count + Number(tile !== request.map.cells[cell]),
      0,
    );
    const candidate: SearchCandidate = {
      map,
      mapHash: hashMap(map),
      parentHash,
      operations,
      score: evaluation.score,
      categories: evaluation.categories.map(({ id, score, maximum }) => ({ id, score, maximum })),
      valid: evaluation.valid,
      novelty: changed / map.cells.length,
    };
    if (!frontier.some((item) => dominates(item, candidate))) {
      for (let cursor = frontier.length - 1; cursor >= 0; cursor -= 1)
        if (dominates(candidate, frontier[cursor])) frontier.splice(cursor, 1);
      frontier.push(candidate);
      frontier.sort(
        (a, b) =>
          Number(b.valid) - Number(a.valid) ||
          (b.score ?? -1) - (a.score ?? -1) ||
          b.novelty - a.novelty ||
          a.mapHash.localeCompare(b.mapHash),
      );
      if (frontier.length > 12) frontier.length = 12;
    }
    request.onProgress?.({
      completed: index + 1,
      budget: request.budget,
      frontierSize: frontier.length,
    });
    if (index % 20 === 19) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return {
    schemaVersion: 1,
    rubricVersion: RUBRIC_VERSION,
    seed: request.seed,
    evaluated: request.budget,
    frontier,
  };
}
