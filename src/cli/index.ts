#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { buildGraph } from '../core/graph';
import { MainThreadBatchRunner } from '../core/batchRunner';
import { runBatch } from '../core/simulation';
import { evaluateMap } from '../core/evaluation';
import { renderMapSvg } from '../core/svg';
import { encodeMap } from '../core/serialization';
import { createHammerBlockout } from '../core/export';
import type { MapEvaluation, ParsedPortableMap } from '../core/agentTypes';
import {
  evaluateMapV2,
  officialEvaluationConfig,
  RUBRIC_VERSION,
  type MapEvaluationV2,
} from '../core/rubric';
import { applyMapOperations, type MapOperation } from '../core/operations';
import { searchMaps } from '../core/search';
import { createPortableMap } from '../core/portableMap';
import { validatePlaytestSession } from '../core/playtest';
import { runCs2Adapter, type Cs2AdapterConfig } from '../integrations/cs2';
import { parseMapDocument, type ParsedMapDocument } from '../core/portable';
import { evaluateLayeredMap, type LayeredMapEvaluationV2 } from '../core/evaluationLayered';
import { renderLayeredMapSvg } from '../core/svgV2';
import { createPortableMapV2 } from '../core/portableV2';
import { applyMapOperationsV2, type MapOperationV2 } from '../core/operationsV2';
import { searchLayeredMaps } from '../core/searchLayered';
import { cloneDocumentV2 } from '../core/documentV2';

interface Arguments {
  command: string;
  inputs: string[];
  json: boolean;
  out?: string;
  rounds: number;
  requireGood: boolean;
  seed: number;
  budget: number;
  rubric: string;
  config?: string;
}

function usage(): never {
  process.stderr.write(
    'Usage: npm run --silent map -- <validate|analyze|simulate|evaluate|render|compare|apply|diff|repair|generate|improve|playtest|cs2> <file|directory> [--json] [--out DIR] [--config FILE] [--rounds 200-10000] [--seed N] [--budget N] [--rubric 2.0.0] [--require-good]\n',
  );
  process.exit(1);
}

function argumentsFrom(values: string[]): Arguments {
  if (!values.length) usage();
  const result: Arguments = {
    command: values[0],
    inputs: [],
    json: false,
    rounds: 1000,
    requireGood: false,
    seed: 0x3c6ef372,
    budget: 100,
    rubric: RUBRIC_VERSION,
  };
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--json') result.json = true;
    else if (value === '--require-good') result.requireGood = true;
    else if (value === '--out') result.out = values[++index];
    else if (value === '--rounds') result.rounds = Number(values[++index]);
    else if (value === '--seed') result.seed = Number(values[++index]);
    else if (value === '--budget') result.budget = Number(values[++index]);
    else if (value === '--rubric') result.rubric = values[++index];
    else if (value === '--config') result.config = values[++index];
    else if (value.startsWith('--')) throw new Error(`Unknown option: ${value}`);
    else result.inputs.push(value);
  }
  if (!Number.isInteger(result.rounds) || result.rounds < 200 || result.rounds > 10000)
    throw new Error('--rounds must be an integer from 200 to 10000');
  if (!Number.isSafeInteger(result.seed)) throw new Error('--seed must be a safe integer');
  if (!Number.isInteger(result.budget) || result.budget < 1 || result.budget > 10000)
    throw new Error('--budget must be an integer from 1 to 10000');
  if (result.rubric !== RUBRIC_VERSION) throw new Error(`Unsupported rubric: ${result.rubric}`);
  return result;
}

const jsonSafe = (_key: string, value: unknown) => {
  if (value instanceof Float32Array)
    return Array.from(value.entries()).filter(([, count]) => count > 0);
  if (value instanceof Uint8Array || value instanceof Float64Array) return Array.from(value);
  return value;
};
const serialize = (value: unknown) => `${JSON.stringify(value, jsonSafe, 2)}\n`;
const load = (path: string): ParsedMapDocument => parseMapDocument(readFileSync(path, 'utf8'));
const requireV1 = (loaded: ParsedMapDocument): ParsedPortableMap => {
  if (loaded.version !== 1) throw new Error('This command is not available for layered v2 maps.');
  return loaded.parsed;
};
const slug = (path: string) =>
  basename(path, extname(path))
    .replace(/[^a-z0-9_-]+/gi, '-')
    .toLowerCase();

type EvaluationOutput = MapEvaluation | MapEvaluationV2 | LayeredMapEvaluationV2;

const dominatesEvaluation = (left: EvaluationOutput, right: EvaluationOutput) => {
  if (left.valid !== right.valid) return left.valid;
  const leftScores = new Map(
    left.categories.map((category) => [category.id, category.score / category.maximum]),
  );
  let better = false;
  for (const category of right.categories) {
    const value = leftScores.get(category.id) ?? 0;
    const other = category.score / category.maximum;
    if (value < other) return false;
    if (value > other) better = true;
  }
  return better;
};

const confidenceAdjustedScore = (evaluation: EvaluationOutput | undefined) => {
  if (!evaluation?.valid || evaluation.score === null) return -1;
  const simulation = evaluation.evidence.simulation;
  return simulation
    ? evaluation.score - (simulation.tWinRate.high - simulation.tWinRate.low) * 20
    : evaluation.score;
};

function human(evaluation: EvaluationOutput): string {
  const heading = evaluation.valid
    ? `${evaluation.map.name}: ${evaluation.status} (${evaluation.score}/100)`
    : `${evaluation.map.name}: invalid`;
  const categories = evaluation.categories
    .map((item) => `  ${item.label}: ${item.score}/${item.maximum}`)
    .join('\n');
  const diagnostics = evaluation.diagnostics.length
    ? evaluation.diagnostics
        .map((item) => `  [${item.severity}] ${item.code}: ${item.message} ${item.suggestion}`)
        .join('\n')
    : '  No diagnostics.';
  return `${heading}\n${categories}\n${diagnostics}\n`;
}

function writeArtifacts(
  directory: string,
  parsed: ParsedMapDocument,
  evaluation: EvaluationOutput,
): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'report.json'), serialize(evaluation));
  if (parsed.version === 2) {
    writeFileSync(
      join(directory, 'preview.svg'),
      renderLayeredMapSvg(parsed.file, parsed.document, evaluation.diagnostics),
    );
    writeFileSync(join(directory, 'map.v2.csmap.json'), serialize(parsed.file));
  } else {
    writeFileSync(
      join(directory, 'preview.svg'),
      renderMapSvg(parsed.parsed.file, parsed.parsed.map, evaluation.diagnostics),
    );
    writeFileSync(join(directory, 'layout-code.txt'), `${encodeMap(parsed.parsed.map)}\n`);
    writeFileSync(
      join(directory, 'hammer-blockout.txt'),
      `${createHammerBlockout(parsed.parsed.map, buildGraph(parsed.parsed.map))}\n`,
    );
  }
}

async function inspect(
  path: string,
  args: Arguments,
  simulate: boolean,
): Promise<EvaluationOutput> {
  const parsed = load(path);
  if (parsed.version === 2)
    return evaluateLayeredMap(
      parsed.file,
      parsed.document,
      officialEvaluationConfig(parsed.file.profile, {
        rounds: simulate ? args.rounds : 200,
        seed: args.seed,
      }),
    );
  const legacy = parsed.parsed;
  const progress = args.json
    ? undefined
    : (done: number, total: number) => process.stderr.write(`\rSimulating ${done}/${total}`);
  const evaluation = simulate
    ? await evaluateMapV2(
        legacy.file,
        legacy.map,
        officialEvaluationConfig(legacy.file.profile, { rounds: args.rounds, seed: args.seed }),
        { runner: new MainThreadBatchRunner(), onProgress: progress },
      )
    : await evaluateMap(legacy.file, legacy.map, legacy.profile);
  if (simulate && !args.json) process.stderr.write('\n');
  return evaluation;
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  const commands = new Set([
    'validate',
    'analyze',
    'simulate',
    'evaluate',
    'render',
    'compare',
    'apply',
    'diff',
    'repair',
    'generate',
    'improve',
    'playtest',
    'cs2',
  ]);
  if (!commands.has(args.command) || !args.inputs.length) usage();
  if (args.command === 'playtest') {
    const input = JSON.parse(readFileSync(resolve(args.inputs[0]), 'utf8')) as unknown;
    const sessions = Array.isArray(input)
      ? input.map(validatePlaytestSession)
      : [validatePlaytestSession(input)];
    process.stdout.write(serialize({ schemaVersion: 1, valid: true, sessions }));
    return;
  }
  if (args.command === 'compare') {
    const files = args.inputs.flatMap((input) => {
      const path = resolve(input);
      if (!existsSync(path)) throw new Error(`Input does not exist: ${input}`);
      return statSync(path).isDirectory()
        ? readdirSync(path)
            .filter((name) => name.endsWith('.csmap.json'))
            .map((name) => join(path, name))
        : [path];
    });
    if (!files.length) throw new Error('No .csmap.json candidates found');
    const results: Array<{ file: string; evaluation?: EvaluationOutput; error?: string }> = [];
    for (const file of files) {
      try {
        results.push({ file, evaluation: await inspect(file, args, true) });
      } catch (error) {
        results.push({ file, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const paretoRanks = new Map<EvaluationOutput, number>();
    let remaining = results.flatMap((result) => (result.evaluation ? [result.evaluation] : []));
    let layer = 1;
    while (remaining.length) {
      const frontier = remaining.filter(
        (candidate) =>
          !remaining.some((other) => other !== candidate && dominatesEvaluation(other, candidate)),
      );
      for (const evaluation of frontier) paretoRanks.set(evaluation, layer);
      remaining = remaining.filter((evaluation) => !frontier.includes(evaluation));
      layer += 1;
    }
    results.sort(
      (a, b) =>
        Number(Boolean(b.evaluation?.valid)) - Number(Boolean(a.evaluation?.valid)) ||
        (paretoRanks.get(a.evaluation!) ?? Number.MAX_SAFE_INTEGER) -
          (paretoRanks.get(b.evaluation!) ?? Number.MAX_SAFE_INTEGER) ||
        confidenceAdjustedScore(b.evaluation) - confidenceAdjustedScore(a.evaluation) ||
        (b.evaluation?.categories.reduce((sum, item) => sum + item.score, 0) ?? -1) -
          (a.evaluation?.categories.reduce((sum, item) => sum + item.score, 0) ?? -1) ||
        a.file.localeCompare(b.file),
    );
    const ranking = results.map((result, index) => ({
      rank: index + 1,
      file: result.file,
      valid: result.evaluation?.valid ?? false,
      status: result.evaluation?.status ?? 'invalid',
      score: result.evaluation?.score ?? null,
      paretoRank: result.evaluation ? paretoRanks.get(result.evaluation) : null,
      confidenceAdjustedScore: confidenceAdjustedScore(result.evaluation),
      categories:
        result.evaluation?.categories.map(({ id, score, maximum }) => ({ id, score, maximum })) ??
        [],
      diagnostics:
        result.evaluation?.diagnostics.map(({ code, severity, message }) => ({
          code,
          severity,
          message,
        })) ?? [],
      ...(result.error ? { error: result.error } : {}),
    }));
    if (args.out) {
      mkdirSync(args.out, { recursive: true });
      for (const result of results) {
        const directory = join(args.out, slug(result.file));
        if (result.evaluation) writeArtifacts(directory, load(result.file), result.evaluation);
        else {
          mkdirSync(directory, { recursive: true });
          writeFileSync(
            join(directory, 'error.json'),
            serialize({ file: result.file, error: result.error }),
          );
        }
      }
      writeFileSync(join(args.out, 'ranking.json'), serialize(ranking));
    }
    process.stdout.write(
      args.json
        ? serialize(ranking)
        : ranking
            .map(
              (result) =>
                `${result.rank}. ${basename(result.file)} — ${result.status}${result.score === null ? '' : ` ${result.score}/100`}${result.error ? ` (${result.error})` : ''}`,
            )
            .join('\n') + '\n',
    );
    if (!results.some((result) => result.evaluation?.valid)) process.exitCode = 2;
    else if (
      args.requireGood &&
      !results.some(
        (result) =>
          result.evaluation?.status === 'good' || result.evaluation?.status === 'excellent',
      )
    )
      process.exitCode = 3;
    return;
  }
  const path = resolve(args.inputs[0]);
  const loaded = load(path);
  if (loaded.version === 2) {
    if (args.command === 'render') {
      const evaluation = await evaluateLayeredMap(
        loaded.file,
        loaded.document,
        officialEvaluationConfig(loaded.file.profile, { rounds: 200, seed: args.seed }),
      );
      const svg = renderLayeredMapSvg(loaded.file, loaded.document, evaluation.diagnostics);
      if (args.out) {
        mkdirSync(args.out, { recursive: true });
        writeFileSync(join(args.out, 'preview.svg'), svg);
      } else process.stdout.write(svg);
      return;
    }
    if (args.command === 'apply') {
      if (!args.inputs[1]) throw new Error('apply requires an operations JSON file');
      const operations = JSON.parse(
        readFileSync(resolve(args.inputs[1]), 'utf8'),
      ) as MapOperationV2[];
      const document = applyMapOperationsV2(loaded.document, operations);
      process.stdout.write(
        serialize(
          createPortableMapV2(document, {
            name: loaded.file.name,
            profile: loaded.file.profile,
            notes: loaded.file.notes,
            designTargets: loaded.file.designTargets,
          }),
        ),
      );
      return;
    }
    if (args.command === 'diff') {
      if (!args.inputs[1]) throw new Error('diff requires a second map file');
      const other = load(resolve(args.inputs[1]));
      if (other.version !== 2) throw new Error('diff requires maps with matching versions');
      if (
        loaded.document.width !== other.document.width ||
        loaded.document.height !== other.document.height
      )
        throw new Error('diff requires maps with matching dimensions');
      const operations: MapOperationV2[] = [];
      for (const level of loaded.document.levels) {
        const target = other.document.levels.find((item) => item.id === level.id);
        if (!target) throw new Error(`Second map is missing level ${level.id}`);
        for (let cell = 0; cell < level.geometry.length; cell += 1)
          if (level.geometry[cell] !== target.geometry[cell])
            operations.push({
              type: 'paint-geometry',
              levelId: level.id,
              cells: [
                { x: cell % loaded.document.width, y: Math.floor(cell / loaded.document.width) },
              ],
              geometry: target.geometry[cell],
            });
      }
      process.stdout.write(serialize(operations));
      return;
    }
    if (args.command === 'repair') {
      const document = cloneDocumentV2(loaded.document);
      const requiredFloor = [
        ...document.zones.flatMap((zone) => zone.cells),
        ...document.links.flatMap((link) => [link.from, link.to]),
      ];
      for (const point of requiredFloor) {
        const level = document.levels.find((item) => item.id === point.levelId);
        if (level) level.geometry[point.y * document.width + point.x] = 'floor';
      }
      for (const level of document.levels) level.ceilingHeight = Math.max(128, level.ceilingHeight);
      for (const link of document.links) if (link.kind === 'drop') link.bidirectional = false;
      document.legacySource = undefined;
      process.stdout.write(
        serialize(
          createPortableMapV2(document, {
            name: loaded.file.name,
            profile: loaded.file.profile,
            notes: loaded.file.notes,
          }),
        ),
      );
      return;
    }
    if (args.command === 'generate' || args.command === 'improve') {
      const result = await searchLayeredMaps({
        file: loaded.file,
        document: loaded.document,
        seed: args.seed,
        budget: args.budget,
        onProgress: args.json
          ? undefined
          : (completed, budget) => process.stderr.write(`\rSearching ${completed}/${budget}`),
      });
      if (!args.json) process.stderr.write('\n');
      const candidates = result.frontier.map((candidate, index) => ({
        rank: index + 1,
        mapHash: candidate.mapHash,
        parentHash: candidate.parentHash,
        score: candidate.score,
        status: candidate.status,
        valid: candidate.valid,
        novelty: candidate.novelty,
        categories: candidate.categories,
        operations: candidate.operations,
        map: createPortableMapV2(candidate.document, {
          name: `${loaded.file.name} candidate ${index + 1}`,
          profile: loaded.file.profile,
        }),
      }));
      if (args.out) {
        mkdirSync(args.out, { recursive: true });
        writeFileSync(
          join(args.out, 'search-result.json'),
          serialize({ ...result, frontier: candidates }),
        );
        for (const candidate of candidates)
          writeFileSync(
            join(args.out, `candidate-${candidate.rank}.v2.csmap.json`),
            serialize(candidate.map),
          );
      }
      process.stdout.write(serialize({ ...result, frontier: candidates }));
      return;
    }
    if (args.command === 'cs2')
      throw new Error('CS2 adapter support for native layered packages is not yet available.');
    if (args.command === 'simulate') {
      const evaluation = await evaluateLayeredMap(
        loaded.file,
        loaded.document,
        officialEvaluationConfig(loaded.file.profile, { rounds: args.rounds, seed: args.seed }),
      );
      process.stdout.write(
        args.json
          ? serialize({
              seed: args.seed,
              rounds: args.rounds,
              scenarios: evaluation.scenarios,
              evidence: evaluation.evidence.simulation,
            })
          : human(evaluation),
      );
      if (!evaluation.valid) process.exitCode = 2;
      return;
    }
    const evaluation = await inspect(path, args, args.command === 'evaluate');
    if (args.command === 'evaluate' && args.out) writeArtifacts(args.out, loaded, evaluation);
    process.stdout.write(args.json ? serialize(evaluation) : human(evaluation));
    if (!evaluation.valid) process.exitCode = 2;
    else if (args.requireGood && evaluation.status !== 'good' && evaluation.status !== 'excellent')
      process.exitCode = 3;
    return;
  }
  const parsed = requireV1(loaded);
  if (args.command === 'cs2') {
    if (!args.config || !args.out) throw new Error('cs2 requires --config FILE and --out DIR');
    const config = JSON.parse(readFileSync(resolve(args.config), 'utf8')) as Cs2AdapterConfig;
    const manifest = await runCs2Adapter(parsed.map, config, resolve(args.out));
    process.stdout.write(serialize(manifest));
    if (manifest.status === 'failed') process.exitCode = 1;
    return;
  }
  if (args.command === 'apply') {
    if (!args.inputs[1]) throw new Error('apply requires an operations JSON file');
    const operations = JSON.parse(readFileSync(resolve(args.inputs[1]), 'utf8')) as MapOperation[];
    const map = applyMapOperations(parsed.map, operations);
    process.stdout.write(
      serialize(
        createPortableMap(map, {
          name: parsed.file.name,
          notes: parsed.file.notes,
          profile: parsed.file.profile,
          targets: parsed.file.targets,
        }),
      ),
    );
    return;
  }
  if (args.command === 'diff') {
    if (!args.inputs[1]) throw new Error('diff requires a second map file');
    const other = requireV1(load(resolve(args.inputs[1])));
    if (parsed.map.width !== other.map.width || parsed.map.height !== other.map.height)
      throw new Error('diff requires maps with matching dimensions');
    const operations: MapOperation[] = [];
    for (let cell = 0; cell < parsed.map.cells.length; cell += 1)
      if (parsed.map.cells[cell] !== other.map.cells[cell])
        operations.push({
          type: 'paint',
          cells: [cell],
          tile: other.map.cells[cell],
          brushSize: 1,
        });
    process.stdout.write(serialize(operations));
    return;
  }
  if (args.command === 'repair' || args.command === 'generate' || args.command === 'improve') {
    const result = await searchMaps({
      map: parsed.map,
      file: parsed.file,
      profile: parsed.profile,
      seed: args.seed,
      budget: args.budget,
      onProgress: args.json
        ? undefined
        : ({ completed, budget }) => process.stderr.write(`\rSearching ${completed}/${budget}`),
    });
    if (!args.json) process.stderr.write('\n');
    const candidates = result.frontier.map((candidate, index) => ({
      rank: index + 1,
      mapHash: candidate.mapHash,
      score: candidate.score,
      valid: candidate.valid,
      novelty: candidate.novelty,
      operations: candidate.operations,
      map: createPortableMap(candidate.map, {
        name: `${parsed.file.name} candidate ${index + 1}`,
        profile: parsed.file.profile,
      }),
    }));
    if (args.out) {
      mkdirSync(args.out, { recursive: true });
      writeFileSync(
        join(args.out, 'search-result.json'),
        serialize({ ...result, frontier: candidates }),
      );
      for (const candidate of candidates)
        writeFileSync(
          join(args.out, `candidate-${candidate.rank}.csmap.json`),
          serialize(candidate.map),
        );
    }
    process.stdout.write(serialize({ ...result, frontier: candidates }));
    return;
  }
  if (args.command === 'render') {
    const evaluation = await evaluateMap(parsed.file, parsed.map, parsed.profile);
    const svg = renderMapSvg(parsed.file, parsed.map, evaluation.diagnostics);
    if (args.out) {
      mkdirSync(args.out, { recursive: true });
      writeFileSync(join(args.out, 'preview.svg'), svg);
    } else process.stdout.write(svg);
    return;
  }
  if (args.command === 'simulate') {
    const validation = await evaluateMap(parsed.file, parsed.map, parsed.profile);
    if (!validation.valid) {
      process.stdout.write(args.json ? serialize(validation) : human(validation));
      process.exitCode = 2;
      return;
    }
    const stats = runBatch(
      buildGraph(parsed.map),
      { plan: 'mixed', site: 'random', roundTime: 90, seed: args.seed },
      args.rounds,
    );
    process.stdout.write(
      args.json
        ? serialize(stats)
        : `Rounds: ${stats.rounds}\nT: ${stats.T} (${Math.round((stats.T / stats.rounds) * 100)}%)\nCT: ${stats.CT}\n`,
    );
    return;
  }
  const evaluation = await inspect(path, args, args.command === 'evaluate');
  if (args.command === 'evaluate' && args.out) writeArtifacts(args.out, loaded, evaluation);
  process.stdout.write(args.json ? serialize(evaluation) : human(evaluation));
  if (!evaluation.valid) process.exitCode = 2;
  else if (args.requireGood && evaluation.status !== 'good' && evaluation.status !== 'excellent')
    process.exitCode = 3;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
