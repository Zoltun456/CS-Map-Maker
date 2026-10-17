import type { Diagnostic, MapProfileId, MetricResult } from './agentTypes';
import type { MapDocumentV2 } from './documentV2';
import { buildGraphV2, hasLineOfSightV2, nodeForLocation, validateGraphV2 } from './graphV2';
import type { PortableMapFileV2 } from './portableV2';
import { createSeededRandom } from './random';
import {
  RUBRIC_VERSION,
  officialEvaluationConfig,
  type EvaluationConfig,
  type RubricCategory,
} from './rubric';

export interface LayeredScenarioResult {
  site: 'A' | 'B';
  plan: 'rush' | 'default' | 'fake';
  seed: number;
  rounds: number;
  tWinRate: number;
  plantRate: number;
  openingKillShare: number;
  timeoutRate: number;
}

export interface LayeredMapEvaluationV2 {
  schemaVersion: 2;
  rubricVersion: typeof RUBRIC_VERSION;
  map: {
    name: string;
    profile: MapProfileId;
    width: number;
    height: number;
    levels: number;
  };
  mapHash: string;
  seed: number;
  rounds: number;
  valid: boolean;
  status: 'invalid' | 'poor' | 'needs-work' | 'good' | 'excellent';
  score: number | null;
  categories: RubricCategory[];
  diagnostics: Diagnostic[];
  scenarios: LayeredScenarioResult[];
  evidence: {
    walkableNodes: number;
    reachableNodes: number;
    activeLevels: number;
    reachableLevels: number;
    traversalLinks: number;
    averageDegree: number;
    coverShare: number;
    visibleShare: number;
    timings: Record<string, { tSeconds: number; ctSeconds: number }>;
    simulation?: {
      tWinRate: { estimate: number; low: number; high: number };
      openingKillRate: { estimate: number; low: number; high: number };
      plantRate: number;
      timeoutRate: number;
      deathConcentration: number;
    };
  };
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));
const metric = (
  id: string,
  label: string,
  value: number,
  maximum: number,
  quality: number,
  unit?: string,
  target?: string,
): MetricResult => ({
  id,
  label,
  value,
  maximum,
  score: Math.round(clamp(quality) * maximum * 100) / 100,
  ...(unit ? { unit } : {}),
  ...(target ? { target } : {}),
});
const band = (value: number, low: number, high: number, falloff = high - low) =>
  value >= low && value <= high
    ? 1
    : value < low
      ? clamp(1 - (low - value) / Math.max(Number.EPSILON, falloff))
      : clamp(1 - (value - high) / Math.max(Number.EPSILON, falloff));

function shortestDistances(
  neighbors: Array<Array<{ node: number; cost: number }>>,
  starts: number[],
) {
  const distances = new Float64Array(neighbors.length);
  distances.fill(Number.POSITIVE_INFINITY);
  const open: Array<[number, number]> = [];
  for (const start of starts) {
    distances[start] = 0;
    open.push([0, start]);
  }
  while (open.length) {
    open.sort((left, right) => right[0] - left[0]);
    const [distance, node] = open.pop()!;
    if (distance !== distances[node]) continue;
    for (const edge of neighbors[node]) {
      const next = distance + edge.cost;
      if (next >= distances[edge.node]) continue;
      distances[edge.node] = next;
      open.push([next, edge.node]);
    }
  }
  return distances;
}

function wilson(successes: number, total: number) {
  if (!total) return { estimate: 0, low: 0, high: 1 };
  const estimate = successes / total;
  const z = 1.96;
  const denominator = 1 + (z * z) / total;
  const centre = estimate + (z * z) / (2 * total);
  const margin = z * Math.sqrt((estimate * (1 - estimate) + (z * z) / (4 * total)) / total);
  return {
    estimate,
    low: clamp((centre - margin) / denominator),
    high: clamp((centre + margin) / denominator),
  };
}

export function hashLayeredMap(document: MapDocumentV2): string {
  const source = JSON.stringify({
    width: document.width,
    height: document.height,
    levels: document.levels,
    zones: document.zones,
    features: document.features,
    links: document.links,
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const zoneNodes = (document: MapDocumentV2, kind: string) => {
  const graph = buildGraphV2(document);
  return document.zones
    .filter((zone) => zone.kind === kind)
    .flatMap((zone) => zone.cells.map((cell) => nodeForLocation(graph, cell)))
    .filter((node) => node >= 0 && graph.walkable[node]);
};

export async function evaluateLayeredMap(
  file: PortableMapFileV2,
  document: MapDocumentV2,
  config: EvaluationConfig = officialEvaluationConfig(file.profile),
): Promise<LayeredMapEvaluationV2> {
  const graph = buildGraphV2(document);
  const diagnostics: Diagnostic[] = validateGraphV2(graph).map((message) => ({
    code: 'VERTICAL_GRAPH_INVALID',
    severity: 'error',
    message,
    suggestion: 'Repair the referenced level geometry or traversal link.',
    coordinates: [],
    affectedCount: 0,
  }));
  const requiredSites: Array<'A' | 'B'> = file.profile === 'one-site-3v3' ? ['A'] : ['A', 'B'];
  const tSpawn = zoneNodes(document, 't-spawn');
  const ctSpawn = zoneNodes(document, 'ct-spawn');
  const sites = Object.fromEntries(
    requiredSites.map((site) => [site, zoneNodes(document, site === 'A' ? 'site-a' : 'site-b')]),
  ) as Record<'A' | 'B', number[]>;
  const required: Array<[string, number[]]> = [
    ['T spawn', tSpawn],
    ['CT spawn', ctSpawn],
    ...requiredSites.map((site) => [`Site ${site}`, sites[site]] as [string, number[]]),
  ];
  for (const [label, nodes] of required)
    if (!nodes.length)
      diagnostics.push({
        code: `MISSING_${label.toUpperCase().replaceAll(' ', '_')}`,
        severity: 'error',
        message: `${label} needs at least one walkable floor cell.`,
        suggestion: `Place the ${label} zone on floor geometry.`,
        coordinates: [],
        affectedCount: 0,
      });
  const fromT = shortestDistances(graph.neighbors, tSpawn);
  const fromCT = shortestDistances(graph.neighbors, ctSpawn);
  for (const site of requiredSites)
    if (
      sites[site].length &&
      sites[site].every((node) => !Number.isFinite(fromT[node]) || !Number.isFinite(fromCT[node]))
    )
      diagnostics.push({
        code: `SITE_${site}_UNREACHABLE`,
        severity: 'error',
        message: `Site ${site} is not reachable from both teams.`,
        suggestion: 'Connect the site with walkable floor and valid traversal links.',
        coordinates: document.zones
          .filter((zone) => zone.kind === `site-${site.toLowerCase()}`)
          .flatMap((zone) =>
            zone.cells.map((cell) => ({
              ...cell,
              z: document.levels.find((level) => level.id === cell.levelId)?.elevation,
            })),
          ),
        affectedCount: sites[site].length,
      });
  const walkableNodes = Array.from(graph.walkable.keys()).filter((node) => graph.walkable[node]);
  const reachableNodes = walkableNodes.filter((node) => Number.isFinite(fromT[node])).length;
  if (walkableNodes.length && reachableNodes < walkableNodes.length)
    diagnostics.push({
      code: 'UNREACHABLE_LEVEL_REGIONS',
      severity: 'error',
      message: `${walkableNodes.length - reachableNodes} walkable layered cells are disconnected from T spawn.`,
      suggestion: 'Connect or remove isolated rooms and upper-level regions.',
      coordinates: walkableNodes
        .filter((node) => !Number.isFinite(fromT[node]))
        .slice(0, 48)
        .map((node) => {
          const level = document.levels[Math.floor(node / graph.area)];
          const cell = node % graph.area;
          return {
            levelId: level.id,
            x: cell % document.width,
            y: Math.floor(cell / document.width),
            z: level.elevation,
          };
        }),
      affectedCount: walkableNodes.length - reachableNodes,
    });

  const activeLevels = document.levels.filter((level) =>
    level.geometry.some((item) => item === 'floor'),
  );
  const reachableLevelIds = new Set(
    walkableNodes
      .filter((node) => Number.isFinite(fromT[node]))
      .map((node) => document.levels[Math.floor(node / graph.area)].id),
  );
  const averageDegree =
    walkableNodes.reduce((sum, node) => sum + graph.neighbors[node].length, 0) /
    Math.max(1, walkableNodes.length);
  const coverCount = document.levels.reduce(
    (sum, level) =>
      sum + level.geometry.filter((item) => item === 'full-cover' || item === 'half-cover').length,
    0,
  );
  const coverShare = coverCount / Math.max(1, walkableNodes.length + coverCount);
  const losSample = walkableNodes.filter(
    (_, index) => index % Math.max(1, Math.ceil(walkableNodes.length / 96)) === 0,
  );
  let visiblePairs = 0;
  let testedPairs = 0;
  for (let left = 0; left < losSample.length; left += 1)
    for (let right = left + 1; right < losSample.length; right += 1) {
      testedPairs += 1;
      if (hasLineOfSightV2(graph, losSample[left], losSample[right])) visiblePairs += 1;
    }
  const visibleShare = visiblePairs / Math.max(1, testedPairs);
  const secondsPerCell = 0.25;
  const timings: Record<string, { tSeconds: number; ctSeconds: number }> = {};
  for (const site of requiredSites) {
    timings[site] = {
      tSeconds: Math.min(...sites[site].map((node) => fromT[node])) * secondsPerCell,
      ctSeconds: Math.min(...sites[site].map((node) => fromCT[node])) * secondsPerCell,
    };
  }

  const flowMetrics = [
    metric(
      'reachable-space',
      'Reachable playable space',
      reachableNodes / Math.max(1, walkableNodes.length),
      10,
      reachableNodes / Math.max(1, walkableNodes.length),
      '%',
      '100%',
    ),
    metric(
      'average-degree',
      'Route connectivity',
      averageDegree,
      10,
      band(averageDegree, 2.2, 5.5, 2),
      'edges',
      '2.2–5.5',
    ),
  ];
  const timingQuality =
    requiredSites.reduce((sum, site) => {
      const timing = timings[site];
      const lead = timing.tSeconds - timing.ctSeconds;
      return sum + band(lead, 2, 10, 8) * band(timing.tSeconds, 5, 18, 10);
    }, 0) / requiredSites.length;
  const timingMetrics = [
    metric(
      'site-arrivals',
      'Site arrival balance',
      timingQuality,
      15,
      timingQuality,
      '%',
      'CT arrives 2–10s earlier',
    ),
  ];
  const combatMetrics = [
    metric(
      'cover-share',
      'Cover density',
      coverShare,
      10,
      band(coverShare, 0.06, 0.22, 0.12),
      '%',
      '6–22%',
    ),
    metric(
      'visible-share',
      'Sightline exposure',
      visibleShare,
      10,
      band(visibleShare, 0.04, 0.28, 0.24),
      '%',
      '4–28%',
    ),
  ];
  const objectiveQuality =
    requiredSites.reduce((sum, site) => sum + clamp(sites[site].length / 6), 0) /
    requiredSites.length;
  const objectiveMetrics = [
    metric(
      'site-space',
      'Accessible objective space',
      objectiveQuality,
      15,
      objectiveQuality,
      '%',
      '6+ cells per site',
    ),
  ];
  const verticalQuality =
    activeLevels.length <= 1
      ? 1
      : (reachableLevelIds.size / activeLevels.length) *
        clamp(document.links.length / (activeLevels.length - 1));
  const verticalMetrics = [
    metric(
      'level-reachability',
      'Reachable active levels',
      reachableLevelIds.size / Math.max(1, activeLevels.length),
      6,
      reachableLevelIds.size / Math.max(1, activeLevels.length),
      '%',
      '100%',
    ),
    metric(
      'traversal-clarity',
      'Traversal coverage',
      document.links.length,
      4,
      verticalQuality,
      'links',
      'at least one per level transition',
    ),
  ];

  const scenarios: LayeredScenarioResult[] = [];
  const scenarioPlans = requiredSites.flatMap((site) =>
    (['rush', 'default', ...(requiredSites.length > 1 ? ['fake' as const] : [])] as const).map(
      (plan) => ({ site, plan }),
    ),
  );
  const roundsPerScenario = Math.max(1, Math.floor(config.rounds / scenarioPlans.length));
  let tWins = 0;
  let plants = 0;
  let openings = 0;
  let timeouts = 0;
  let totalRounds = 0;
  scenarioPlans.forEach((scenario, index) => {
    const rounds =
      index === scenarioPlans.length - 1 ? config.rounds - totalRounds : roundsPerScenario;
    const seed = (config.seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
    const random = createSeededRandom(seed);
    const timing = timings[scenario.site];
    const lead = timing.tSeconds - timing.ctSeconds;
    const routeFactor = clamp((averageDegree - 1.5) / 4);
    const baseT = clamp(0.5 - (lead - 5) * 0.018 + (routeFactor - 0.5) * 0.08, 0.18, 0.82);
    const plantChance = clamp(0.48 - lead * 0.018 + routeFactor * 0.18, 0.08, 0.88);
    const openingChance = clamp(0.5 + (visibleShare - 0.15) * 0.12, 0.3, 0.7);
    const timeoutChance = clamp(
      0.03 + (1 - routeFactor) * 0.08 + Number(!Number.isFinite(timing.tSeconds)) * 0.8,
    );
    let scenarioTWins = 0;
    let scenarioPlants = 0;
    let scenarioOpenings = 0;
    let scenarioTimeouts = 0;
    for (let round = 0; round < rounds; round += 1) {
      scenarioTWins += Number(random() < baseT);
      scenarioPlants += Number(random() < plantChance);
      scenarioOpenings += Number(random() < openingChance);
      scenarioTimeouts += Number(random() < timeoutChance);
    }
    tWins += scenarioTWins;
    plants += scenarioPlants;
    openings += scenarioOpenings;
    timeouts += scenarioTimeouts;
    totalRounds += rounds;
    scenarios.push({
      ...scenario,
      seed,
      rounds,
      tWinRate: scenarioTWins / rounds,
      plantRate: scenarioPlants / rounds,
      openingKillShare: scenarioOpenings / rounds,
      timeoutRate: scenarioTimeouts / rounds,
    });
  });
  const tWinRate = tWins / Math.max(1, totalRounds);
  const plantRate = plants / Math.max(1, totalRounds);
  const openingKillShare = openings / Math.max(1, totalRounds);
  const timeoutRate = timeouts / Math.max(1, totalRounds);
  const simulationQuality =
    (band(tWinRate, ...config.thresholds.tWinRate, 0.2) +
      band(plantRate, ...config.thresholds.plantRate, 0.25) +
      band(openingKillShare, ...config.thresholds.openingKillShare, 0.2) +
      band(timeoutRate, 0, config.thresholds.maximumTimeoutRate, 0.15)) /
    4;
  const simulationMetrics = [
    metric(
      't-win-rate',
      'T win rate',
      tWinRate,
      6,
      band(tWinRate, ...config.thresholds.tWinRate, 0.2),
      '%',
      '42–58%',
    ),
    metric(
      'plant-rate',
      'Plant rate',
      plantRate,
      5,
      band(plantRate, ...config.thresholds.plantRate, 0.25),
      '%',
      '15–70%',
    ),
    metric(
      'opening-share',
      'T opening-kill share',
      openingKillShare,
      5,
      band(openingKillShare, ...config.thresholds.openingKillShare, 0.2),
      '%',
      '40–60%',
    ),
    metric(
      'timeout-rate',
      'Timeout rate',
      timeoutRate,
      4,
      band(timeoutRate, 0, config.thresholds.maximumTimeoutRate, 0.15),
      '%',
      '≤10%',
    ),
  ];
  const category = (
    id: RubricCategory['id'],
    label: string,
    maximum: number,
    metrics: MetricResult[],
  ): RubricCategory => {
    const score = Math.round(metrics.reduce((sum, item) => sum + item.score, 0) * 100) / 100;
    return { id, label, maximum, score, floorMet: score / maximum >= 0.6, metrics };
  };
  const categories = [
    category('flow', 'Flow and route structure', 20, flowMetrics),
    category('timings', 'Timings', 15, timingMetrics),
    category('combat', 'Combat geometry', 20, combatMetrics),
    category('objectives', 'Sites and objective play', 15, objectiveMetrics),
    category('simulation', 'Simulation robustness', 20, simulationMetrics),
    category('verticality', 'Vertical clarity and navigation', 10, verticalMetrics),
  ];
  if (simulationQuality < 0.6)
    diagnostics.push({
      code: 'LAYERED_SIMULATION_UNSTABLE',
      severity: 'warning',
      message: 'The seeded layered scenario matrix falls outside official balance thresholds.',
      suggestion: 'Adjust timing leads, route connectivity, or objective access.',
      coordinates: [],
      affectedCount: 0,
    });
  const valid = !diagnostics.some((item) => item.severity === 'error');
  const score = valid
    ? Math.round(categories.reduce((sum, item) => sum + item.score, 0) * 100) / 100
    : null;
  const allFloors = categories.every((item) => item.floorMet);
  const excellentFloors = categories.every((item) => item.score / item.maximum >= 0.75);
  const status = !valid
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
    map: {
      name: file.name,
      profile: file.profile,
      width: document.width,
      height: document.height,
      levels: document.levels.length,
    },
    mapHash: hashLayeredMap(document),
    seed: config.seed,
    rounds: config.rounds,
    valid,
    status,
    score,
    categories,
    diagnostics,
    scenarios,
    evidence: {
      walkableNodes: walkableNodes.length,
      reachableNodes,
      activeLevels: activeLevels.length,
      reachableLevels: reachableLevelIds.size,
      traversalLinks: document.links.length,
      averageDegree,
      coverShare,
      visibleShare,
      timings,
      simulation: {
        tWinRate: wilson(tWins, totalRounds),
        openingKillRate: wilson(openings, totalRounds),
        plantRate,
        timeoutRate,
        deathConcentration: 0,
      },
    },
  };
}
