import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { evaluateLayeredMap } from '../../src/core/evaluationLayered';
import { parseMapDocument } from '../../src/core/portable';
import { officialEvaluationConfig } from '../../src/core/rubric';
import { searchLayeredMaps } from '../../src/core/searchLayered';

const fixture = () => {
  const loaded = parseMapDocument(
    readFileSync('examples/maps/layered-two-site.v2.csmap.json', 'utf8'),
  );
  if (loaded.version !== 2) throw new Error('expected v2 fixture');
  return loaded;
};

test('layered evaluation is deterministic and carries level-aware evidence', async () => {
  const loaded = fixture();
  const config = officialEvaluationConfig(loaded.file.profile, { seed: 42, rounds: 300 });
  const first = await evaluateLayeredMap(loaded.file, loaded.document, config);
  const second = await evaluateLayeredMap(loaded.file, loaded.document, config);
  expect(second).toEqual(first);
  expect(first.valid).toBe(true);
  expect(first.map.levels).toBe(2);
  expect(first.evidence.reachableLevels).toBe(2);
  expect(first.categories.map((category) => category.id)).toEqual([
    'flow',
    'timings',
    'combat',
    'objectives',
    'simulation',
    'verticality',
  ]);
});

test('an unreachable upper region fails a hard gate with level coordinates', async () => {
  const loaded = fixture();
  loaded.document.links = [];
  const report = await evaluateLayeredMap(loaded.file, loaded.document);
  const diagnostic = report.diagnostics.find((item) => item.code === 'UNREACHABLE_LEVEL_REGIONS');
  expect(report.valid).toBe(false);
  expect(diagnostic?.coordinates.some((point) => point.levelId === 'overlook')).toBe(true);
});

test('layered search is deterministic and only publishes unique playable candidates', async () => {
  const loaded = fixture();
  const request = {
    file: loaded.file,
    document: loaded.document,
    seed: 4242,
    budget: 12,
  };
  const first = await searchLayeredMaps(request);
  const second = await searchLayeredMaps(request);
  const hashes = first.frontier.map((candidate) => candidate.mapHash);
  expect(hashes).toEqual(second.frontier.map((candidate) => candidate.mapHash));
  expect(new Set(hashes).size).toBe(hashes.length);
  expect(first.frontier.length).toBeGreaterThan(0);
  expect(first.frontier.every((candidate) => candidate.valid)).toBe(true);
  expect(first.frontier.every((candidate) => candidate.parentHash.length > 0)).toBe(true);
});
