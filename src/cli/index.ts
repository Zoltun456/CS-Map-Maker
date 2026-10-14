#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { buildGraph } from '../core/graph';
import { MainThreadBatchRunner } from '../core/batchRunner';
import { runBatch } from '../core/simulation';
import { evaluateMap } from '../core/evaluation';
import { parsePortableMap } from '../core/portableMap';
import { renderMapSvg } from '../core/svg';
import { encodeMap } from '../core/serialization';
import { createHammerBlockout } from '../core/export';
import type { MapEvaluation, ParsedPortableMap } from '../core/agentTypes';

interface Arguments {
  command: string;
  inputs: string[];
  json: boolean;
  out?: string;
  rounds: number;
  requireGood: boolean;
}

function usage(): never {
  process.stderr.write(
    'Usage: npm run map -- <validate|analyze|simulate|evaluate|render|compare> <file|directory> [--json] [--out DIR] [--rounds 200-10000] [--require-good]\n',
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
  };
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--json') result.json = true;
    else if (value === '--require-good') result.requireGood = true;
    else if (value === '--out') result.out = values[++index];
    else if (value === '--rounds') result.rounds = Number(values[++index]);
    else if (value.startsWith('--')) throw new Error(`Unknown option: ${value}`);
    else result.inputs.push(value);
  }
  if (!Number.isInteger(result.rounds) || result.rounds < 200 || result.rounds > 10000)
    throw new Error('--rounds must be an integer from 200 to 10000');
  return result;
}

const jsonSafe = (_key: string, value: unknown) => {
  if (value instanceof Float32Array)
    return Array.from(value.entries()).filter(([, count]) => count > 0);
  if (value instanceof Uint8Array || value instanceof Float64Array) return Array.from(value);
  return value;
};
const serialize = (value: unknown) => `${JSON.stringify(value, jsonSafe, 2)}\n`;
const load = (path: string): ParsedPortableMap => parsePortableMap(readFileSync(path, 'utf8'));
const slug = (path: string) =>
  basename(path, extname(path))
    .replace(/[^a-z0-9_-]+/gi, '-')
    .toLowerCase();

function human(evaluation: MapEvaluation): string {
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
  parsed: ParsedPortableMap,
  evaluation: MapEvaluation,
): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'report.json'), serialize(evaluation));
  writeFileSync(
    join(directory, 'preview.svg'),
    renderMapSvg(parsed.file, parsed.map, evaluation.diagnostics),
  );
  writeFileSync(join(directory, 'layout-code.txt'), `${encodeMap(parsed.map)}\n`);
  writeFileSync(
    join(directory, 'hammer-blockout.txt'),
    `${createHammerBlockout(parsed.map, buildGraph(parsed.map))}\n`,
  );
}

async function inspect(path: string, args: Arguments, simulate: boolean): Promise<MapEvaluation> {
  const parsed = load(path);
  const evaluation = await evaluateMap(
    parsed.file,
    parsed.map,
    parsed.profile,
    simulate
      ? {
          runner: new MainThreadBatchRunner(),
          rounds: args.rounds,
          onProgress: args.json
            ? undefined
            : (done, total) => process.stderr.write(`\rSimulating ${done}/${total}`),
        }
      : {},
  );
  if (simulate && !args.json) process.stderr.write('\n');
  return evaluation;
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  const commands = new Set(['validate', 'analyze', 'simulate', 'evaluate', 'render', 'compare']);
  if (!commands.has(args.command) || !args.inputs.length) usage();
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
    const results: Array<{ file: string; evaluation?: MapEvaluation; error?: string }> = [];
    for (const file of files) {
      try {
        results.push({ file, evaluation: await inspect(file, args, true) });
      } catch (error) {
        results.push({ file, error: error instanceof Error ? error.message : String(error) });
      }
    }
    results.sort(
      (a, b) =>
        Number(Boolean(b.evaluation?.valid)) - Number(Boolean(a.evaluation?.valid)) ||
        (b.evaluation?.score ?? -1) - (a.evaluation?.score ?? -1) ||
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
    else if (args.requireGood && !results.some((result) => result.evaluation?.status === 'good'))
      process.exitCode = 3;
    return;
  }
  const path = resolve(args.inputs[0]);
  const parsed = load(path);
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
      { plan: 'mixed', site: 'random', roundTime: 90 },
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
  if (args.command === 'evaluate' && args.out) writeArtifacts(args.out, parsed, evaluation);
  process.stdout.write(args.json ? serialize(evaluation) : human(evaluation));
  if (!evaluation.valid) process.exitCode = 2;
  else if (args.requireGood && evaluation.status !== 'good') process.exitCode = 3;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
