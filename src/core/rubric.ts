import type { BatchRunner, BatchStatistics, MapDocument, Plan } from './types';
import type { CategoryScore, Diagnostic, MapProfileId, PortableMapFile } from './agentTypes';
import { evaluateMap } from './evaluation';
import { resolveProfile } from './profiles';
import { buildGraph } from './graph';
import { mergeStatistics } from './simulation';
import { analyzeTopology, type TopologyAnalysis } from './topology';

export const RUBRIC_VERSION = '2.0.0';

export interface EvaluationConfig {
  rubricVersion: typeof RUBRIC_VERSION;
  profile: MapProfileId;
  seed: number;
  rounds: number;
  thresholds: {
    tWinRate: [number, number];
    siteTWinRate: [number, number];
    openingKillShare: [number, number];
    plantRate: [number, number];
    maximumTimeoutRate: number;
    maximumDeathConcentration: number;
  };
}

export const officialEvaluationConfig = (
  profile: MapProfileId,
  overrides: Partial<Pick<EvaluationConfig, 'seed' | 'rounds'>> = {},
): EvaluationConfig =>
  Object.freeze({
    rubricVersion: RUBRIC_VERSION,
    profile,
    seed: overrides.seed ?? 0x3c6ef372,
    rounds: overrides.rounds ?? 1000,
    thresholds: Object.freeze({
      tWinRate: [0.42, 0.58] as [number, number],
      siteTWinRate: [0.35, 0.65] as [number, number],
      openingKillShare: [0.4, 0.6] as [number, number],
      plantRate: [0.15, 0.7] as [number, number],
      maximumTimeoutRate: 0.1,
      maximumDeathConcentration: 0.7,
    }),
  });

export type RubricCategoryId =
  'flow' | 'timings' | 'combat' | 'objectives' | 'simulation' | 'verticality';

export interface RubricCategory extends Omit<CategoryScore, 'id'> {
  id: RubricCategoryId;
  floorMet: boolean;
}

export interface MapEvaluationV2 {
  schemaVersion: 2;
  rubricVersion: typeof RUBRIC_VERSION;
  map: { name: string; profile: MapProfileId; width: number; height: number };
  mapHash: string;
  seed: number;
  rounds: number;
  valid: boolean;
  status: 'invalid' | 'poor' | 'needs-work' | 'good' | 'excellent';
  score: number | null;
  categories: RubricCategory[];
  diagnostics: Diagnostic[];
  evidence: Awaited<ReturnType<typeof evaluateMap>>['evidence'];
  scenarios: Array<{
    site: 'A' | 'B';
    plan: Exclude<Plan, 'mixed'>;
    seed: number;
    rounds: number;
    tWinRate: number;
    plantRate: number;
  }>;
  topology: TopologyAnalysis;
}

export function hashMap(map: MapDocument): string {
  let hash = 2166136261;
  const values = [map.width, map.height, ...map.cells];
  for (const value of values) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const scaled = (
  source: CategoryScore | undefined,
  id: RubricCategoryId,
  label: string,
  maximum: number,
): RubricCategory => {
  const score = source ? Math.round((source.score / source.maximum) * maximum * 100) / 100 : 0;
  return {
    id,
    label,
    maximum,
    score,
    floorMet: score / maximum >= 0.6,
    metrics: source?.metrics ?? [],
  };
};

export async function evaluateMapV2(
  file: PortableMapFile,
  map: MapDocument,
  config: EvaluationConfig = officialEvaluationConfig(file.profile),
  options: {
    runner?: BatchRunner;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<MapEvaluationV2> {
  const profile = resolveProfile(config.profile);
  const topology = analyzeTopology(buildGraph(map));
  const scenarios = profile.requiredSites.flatMap((site) =>
    (
      ['rush', 'default', ...(profile.requiredSites.length > 1 ? ['fake' as const] : [])] as const
    ).map((plan) => ({ site, plan })),
  );
  const scenarioResults: MapEvaluationV2['scenarios'] = [];
  let statistics: BatchStatistics | null = null;
  if (options.runner) {
    const graph = buildGraph(map);
    let completed = 0;
    const baseRounds = Math.floor(config.rounds / scenarios.length);
    for (let index = 0; index < scenarios.length; index += 1) {
      const scenario = scenarios[index];
      const rounds =
        index === scenarios.length - 1 ? config.rounds - completed : Math.max(1, baseRounds);
      const seed = (config.seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
      const result = await options.runner.run({
        graph,
        options: { plan: scenario.plan, site: scenario.site, roundTime: 90, seed },
        rounds,
        signal: options.signal,
        onProgress: (done) => options.onProgress?.(completed + done, config.rounds),
      });
      completed += rounds;
      statistics = mergeStatistics(statistics, result);
      const plants = result.site.A.plants + result.site.B.plants;
      scenarioResults.push({
        ...scenario,
        seed,
        rounds,
        tWinRate: result.T / result.rounds,
        plantRate: plants / result.rounds,
      });
    }
  }
  const legacy = await evaluateMap(
    file,
    map,
    profile,
    statistics
      ? {
          runner: { run: async () => statistics! },
          rounds: statistics.rounds,
          signal: options.signal,
          seed: config.seed,
        }
      : {},
  );
  const source = new Map(legacy.categories.map((category) => [category.id, category]));
  const requiredSites = profile.requiredSites.length;
  const siteSizes = profile.requiredSites.map((site) =>
    site === 'A' ? legacy.evidence.analysis.tA : legacy.evidence.analysis.tB,
  );
  const reachable = siteSizes.filter(Number.isFinite).length / requiredSites;
  const entranceQuality =
    profile.requiredSites.reduce(
      (sum, site) => sum + Math.max(0, 1 - Math.abs(legacy.evidence.entrances[site] - 2) / 2),
      0,
    ) / requiredSites;
  const objectiveScore = Math.round((reachable * 8 + entranceQuality * 7) * 100) / 100;
  const objective: RubricCategory = {
    id: 'objectives',
    label: 'Sites and objective play',
    score: objectiveScore,
    maximum: 15,
    floorMet: objectiveScore / 15 >= 0.6,
    metrics: [],
  };
  const vertical: RubricCategory = {
    id: 'verticality',
    label: 'Vertical clarity and navigation',
    score: 10,
    maximum: 10,
    floorMet: true,
    metrics: [],
  };
  const categories: RubricCategory[] = [
    scaled(source.get('flow'), 'flow', 'Flow and route structure', 20),
    scaled(source.get('timings'), 'timings', 'Timings', 15),
    scaled(source.get('combat'), 'combat', 'Combat geometry', 20),
    objective,
    scaled(source.get('simulation'), 'simulation', 'Simulation robustness', 20),
    vertical,
  ];
  const flowCategory = categories.find((category) => category.id === 'flow')!;
  const articulationShare = topology.articulationPoints.length / Math.max(1, map.cells.length);
  const topologyPenalty = Math.min(6, topology.articulationPoints.length * 0.35);
  flowCategory.score = Math.max(0, Math.round((flowCategory.score - topologyPenalty) * 100) / 100);
  flowCategory.floorMet = flowCategory.score / flowCategory.maximum >= 0.6;
  flowCategory.metrics.push({
    id: 'articulation-points',
    label: 'Single-route articulation points',
    value: topology.articulationPoints.length,
    score: Math.max(0, 6 - topologyPenalty),
    maximum: 6,
    unit: 'cells',
    target: 'few or none',
  });
  const diagnostics = [...legacy.diagnostics];
  if (topology.articulationPoints.length)
    diagnostics.push({
      code: 'ROUTE_ARTICULATION_POINTS',
      severity: articulationShare > 0.01 ? 'warning' : 'info',
      message: `${topology.articulationPoints.length} cells are single points of failure in the route graph.`,
      suggestion: 'Add a nearby alternate connection or widen the route network.',
      coordinates: topology.articulationPoints.slice(0, 24).map((cell) => ({
        x: cell % map.width,
        y: Math.floor(cell / map.width),
      })),
      affectedCount: topology.articulationPoints.length,
    });
  const simulation = legacy.evidence.simulation;
  if (simulation) {
    const timeoutRounds = Object.entries(simulation.statistics.reasons)
      .filter(([reason]) => reason.includes('Time ran out'))
      .reduce((sum, [, count]) => sum + count, 0);
    const checks: Array<[boolean, string, string, number, string]> = [
      [
        simulation.plantRate >= config.thresholds.plantRate[0] &&
          simulation.plantRate <= config.thresholds.plantRate[1],
        'SIMULATION_PLANT_RATE',
        'Plant rate is outside the official robustness range.',
        simulation.plantRate,
        '15–70%',
      ],
      [
        timeoutRounds / simulation.statistics.rounds <= config.thresholds.maximumTimeoutRate,
        'SIMULATION_TIMEOUT_RATE',
        'Too many simulated rounds end by timeout.',
        timeoutRounds / simulation.statistics.rounds,
        'at most 10%',
      ],
      [
        simulation.deathConcentration <= config.thresholds.maximumDeathConcentration,
        'SIMULATION_DEATH_CONCENTRATION',
        'Deaths are overly concentrated in a small part of the map.',
        simulation.deathConcentration,
        'at most 70%',
      ],
    ];
    for (const [passed, code, message, observed, expected] of checks)
      if (!passed)
        diagnostics.push({
          code,
          severity: 'warning',
          message,
          suggestion: 'Revise route choice, objective access, or encounter geometry.',
          coordinates: [],
          affectedCount: 0,
          observed,
          expected,
        });
    const simulationCategory = categories.find((category) => category.id === 'simulation')!;
    const failed = checks.filter(([passed]) => !passed).length;
    simulationCategory.score = Math.max(0, simulationCategory.score - failed * 4);
    simulationCategory.floorMet = simulationCategory.score / simulationCategory.maximum >= 0.6;
  }
  const score = legacy.valid
    ? Math.round(categories.reduce((sum, category) => sum + category.score, 0) * 100) / 100
    : null;
  const allFloors = categories.every((category) => category.floorMet);
  const excellentFloors = categories.every((category) => category.score / category.maximum >= 0.75);
  const status = !legacy.valid
    ? 'invalid'
    : score! >= 88 && excellentFloors
      ? 'excellent'
      : score! >= 75 && allFloors
        ? 'good'
        : score! >= 50
          ? 'needs-work'
          : 'poor';
  return {
    schemaVersion: 2,
    rubricVersion: RUBRIC_VERSION,
    map: { name: file.name, profile: config.profile, width: map.width, height: map.height },
    mapHash: hashMap(map),
    seed: config.seed,
    rounds: options.runner ? config.rounds : 0,
    valid: legacy.valid,
    status,
    score,
    categories,
    diagnostics,
    evidence: legacy.evidence,
    scenarios: scenarioResults,
    topology,
  };
}
