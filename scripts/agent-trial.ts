#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { evaluateLayeredMap } from '../src/core/evaluationLayered';
import { parseMapDocument } from '../src/core/portable';
import { officialEvaluationConfig, RUBRIC_VERSION } from '../src/core/rubric';
import { renderLayeredMapSvg } from '../src/core/svgV2';

const values = process.argv.slice(2);
const candidatePath = values.find((value) => !value.startsWith('--'));
if (!candidatePath) {
  process.stderr.write(
    'Usage: npm run --silent agent:trial -- <v2.csmap.json> [--out DIR] [--require-good]\n',
  );
  process.exit(1);
}
const outIndex = values.indexOf('--out');
const out = resolve(outIndex >= 0 ? values[outIndex + 1] : 'map-artifacts/agent-trial');
const loaded = parseMapDocument(readFileSync(resolve(candidatePath), 'utf8'));
if (loaded.version !== 2) throw new Error('The agent trial requires a layered version 2 map.');
const seeds = [42, 1337, 9001, 0x3c6ef372];
const reports = [];
for (const seed of seeds) {
  const config = officialEvaluationConfig(loaded.file.profile, { seed, rounds: 1000 });
  const first = await evaluateLayeredMap(loaded.file, loaded.document, config);
  const repeated = await evaluateLayeredMap(loaded.file, loaded.document, config);
  if (JSON.stringify(first) !== JSON.stringify(repeated))
    throw new Error(`Evaluation is not deterministic for seed ${seed}.`);
  reports.push(first);
}
const scores = reports.flatMap((report) => (report.score === null ? [] : [report.score]));
const valid = reports.every((report) => report.valid);
const averageScore = scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length);
const minimumScore = scores.length ? Math.min(...scores) : null;
const stable = scores.length < 2 || Math.max(...scores) - Math.min(...scores) <= 5;
const categoryFloors = reports.every((report) =>
  report.categories.every((category) => category.floorMet),
);
const verdict = !valid
  ? 'invalid'
  : averageScore >= 75 && categoryFloors && stable
    ? 'ready-for-playtest'
    : 'needs-iteration';
const manifest = {
  schemaVersion: 1,
  trial: 'layered-agent-map-v1',
  candidate: basename(candidatePath),
  mapHash: reports[0].mapHash,
  rubricVersion: RUBRIC_VERSION,
  seeds,
  roundsPerSeed: 1000,
  valid,
  stable,
  categoryFloors,
  averageScore: Math.round(averageScore * 100) / 100,
  minimumScore,
  verdict,
  reports: reports.map((report, index) => ({
    seed: seeds[index],
    score: report.score,
    status: report.status,
    diagnostics: report.diagnostics.map((item) => item.code),
    categories: report.categories.map(({ id, score, maximum, floorMet }) => ({
      id,
      score,
      maximum,
      floorMet,
    })),
  })),
};
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'trial-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(out, 'candidate.csmap.json'), `${JSON.stringify(loaded.file, null, 2)}\n`);
writeFileSync(join(out, 'report-seed-42.json'), `${JSON.stringify(reports[0], null, 2)}\n`);
writeFileSync(
  join(out, 'preview.svg'),
  renderLayeredMapSvg(loaded.file, loaded.document, reports[0].diagnostics),
);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
if (!valid) process.exitCode = 2;
else if (values.includes('--require-good') && verdict !== 'ready-for-playtest')
  process.exitCode = 3;
