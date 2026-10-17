import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import type { MapDocument } from '../core/types';
import { buildGraph } from '../core/graph';
import { createHammerBlockout } from '../core/export';
import { hashMap, RUBRIC_VERSION } from '../core/rubric';

export interface ExternalCommandHook {
  executable: string;
  args: string[];
  timeoutMs?: number;
}

export interface Cs2AdapterConfig {
  steps: Array<{ name: 'compile' | 'navigation' | 'bots'; command: ExternalCommandHook }>;
  telemetryPath?: string;
}

export interface ExternalRunManifestV1 {
  schemaVersion: 1;
  mapHash: string;
  rubricVersion: typeof RUBRIC_VERSION;
  startedAt: string;
  completedAt: string;
  status: 'complete' | 'partial' | 'failed';
  steps: Array<{ name: string; exitCode: number | null; stdout: string; stderr: string }>;
  telemetry?: unknown;
}

const command = (
  hook: ExternalCommandHook,
  variables: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> =>
  new Promise((complete) => {
    const substitute = (value: string) =>
      value.replace(/\{(\w+)\}/g, (_match, key: string) => variables[key] ?? '');
    const child = spawn(resolve(substitute(hook.executable)), hook.args.map(substitute), {
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => (stdout += String(data)));
    child.stderr.on('data', (data) => (stderr += String(data)));
    const timer = setTimeout(() => child.kill(), hook.timeoutMs ?? 120000);
    signal?.addEventListener('abort', () => child.kill(), { once: true });
    child.on('error', (error) => {
      clearTimeout(timer);
      complete({ exitCode: null, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      complete({ exitCode, stdout, stderr });
    });
  });

export async function runCs2Adapter(
  map: MapDocument,
  config: Cs2AdapterConfig,
  outDirectory: string,
  signal?: AbortSignal,
): Promise<ExternalRunManifestV1> {
  mkdirSync(outDirectory, { recursive: true });
  const mapHash = hashMap(map);
  const blockout = join(outDirectory, 'hammer-blockout.txt');
  const telemetryPath = resolve(outDirectory, config.telemetryPath ?? 'telemetry.json');
  writeFileSync(blockout, `${createHammerBlockout(map, buildGraph(map))}\n`);
  const startedAt = new Date().toISOString();
  const steps: ExternalRunManifestV1['steps'] = [];
  for (const step of config.steps) {
    if (signal?.aborted) break;
    const result = await command(
      step.command,
      { out: resolve(outDirectory), map: blockout, telemetry: telemetryPath },
      signal,
    );
    steps.push({ name: step.name, ...result });
    if (result.exitCode !== 0) break;
  }
  let telemetry: unknown;
  try {
    telemetry = JSON.parse(readFileSync(telemetryPath, 'utf8'));
    if ((telemetry as { mapHash?: string }).mapHash !== mapHash)
      throw new Error('Telemetry map hash does not match the exported map.');
  } catch (error) {
    if (config.telemetryPath)
      steps.push({
        name: 'telemetry',
        exitCode: null,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
      });
  }
  const failed = steps.some((step) => step.exitCode !== 0);
  const manifest: ExternalRunManifestV1 = {
    schemaVersion: 1,
    mapHash,
    rubricVersion: RUBRIC_VERSION,
    startedAt,
    completedAt: new Date().toISOString(),
    status: failed ? 'failed' : steps.length === config.steps.length ? 'complete' : 'partial',
    steps,
    ...(telemetry ? { telemetry } : {}),
  };
  writeFileSync(join(outDirectory, 'run-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
