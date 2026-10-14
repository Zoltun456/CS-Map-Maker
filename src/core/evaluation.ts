import { analyzeMap } from './analysis';
import { buildGraph, hasLineOfSight } from './graph';
import { selectSeparatedCells } from './map';
import type {
  CategoryScore,
  ConfidenceInterval,
  Diagnostic,
  MapCoordinate,
  MapEvaluation,
  MapProfile,
  MetricResult,
  PortableMapFile,
} from './agentTypes';
import { TileType, type BatchRunner, type BatchStatistics, type MapGraph } from './types';

const coordinates = (graph: MapGraph, cells: readonly number[]): MapCoordinate[] =>
  cells.slice(0, 24).map((cell) => ({ x: cell % graph.width, y: Math.floor(cell / graph.width) }));
const bandScore = (value: number, range: [number, number], maximum: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value >= range[0] && value <= range[1]) return maximum;
  const width = Math.max(1, range[1] - range[0]);
  const distance = value < range[0] ? range[0] - value : value - range[1];
  return Math.max(0, maximum * (1 - distance / width));
};
const metric = (
  id: string,
  label: string,
  value: number,
  score: number,
  maximum: number,
  unit?: string,
  target?: string,
): MetricResult => ({
  id,
  label,
  value,
  score,
  maximum,
  ...(unit ? { unit } : {}),
  ...(target ? { target } : {}),
});
const rounded = (value: number) => Math.round(value * 100) / 100;

function componentCount(graph: MapGraph, cells: readonly number[]): number {
  const remaining = new Set(cells);
  let count = 0;
  while (remaining.size) {
    count += 1;
    const queue = [remaining.values().next().value as number];
    remaining.delete(queue[0]);
    while (queue.length) {
      const cell = queue.pop()!;
      for (const edge of graph.neighbors[cell])
        if (remaining.delete(edge.cell)) queue.push(edge.cell);
    }
  }
  return count;
}

function disconnectedCells(graph: MapGraph): number[] {
  if (!graph.walkableCells.length) return [];
  const seen = new Set<number>();
  const queue = [graph.tSpawn[0] ?? graph.walkableCells[0]];
  seen.add(queue[0]);
  while (queue.length) {
    const cell = queue.pop()!;
    for (const edge of graph.neighbors[cell])
      if (!seen.has(edge.cell)) {
        seen.add(edge.cell);
        queue.push(edge.cell);
      }
  }
  return graph.walkableCells.filter((cell) => !seen.has(cell));
}

function siteEntrances(graph: MapGraph, sites: readonly number[]): number {
  const site = new Set(sites);
  const boundary = new Set<number>();
  for (const cell of sites)
    for (const edge of graph.neighbors[cell]) if (!site.has(edge.cell)) boundary.add(edge.cell);
  return componentCount(graph, [...boundary]);
}

function shortestPath(graph: MapGraph, start: number, distances: Float64Array): number[] {
  if (!Number.isFinite(distances[start])) return [];
  const path = [start];
  let cell = start;
  while (distances[cell] > 0 && path.length <= graph.size) {
    const next = graph.neighbors[cell]
      .map((edge) => edge.cell)
      .sort((left, right) => distances[left] - distances[right])[0];
    if (next === undefined || distances[next] >= distances[cell]) break;
    path.push(next);
    cell = next;
  }
  return path;
}

function adjacentCoverRatio(graph: MapGraph): number {
  let covered = 0;
  for (const cell of graph.walkableCells) {
    const x = cell % graph.width;
    const y = Math.floor(cell / graph.width);
    let found = false;
    for (let dy = -1; dy <= 1 && !found; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (
          xx >= 0 &&
          yy >= 0 &&
          xx < graph.width &&
          yy < graph.height &&
          graph.map.cells[yy * graph.width + xx] === TileType.Cover
        ) {
          found = true;
          break;
        }
      }
    if (found) covered += 1;
  }
  return graph.walkableCells.length ? covered / graph.walkableCells.length : 0;
}

function interval(successes: number, total: number): ConfidenceInterval {
  if (!total) return { estimate: 0, low: 0, high: 0 };
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return { estimate: p, low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function simulationCategory(stats: BatchStatistics, profile: MapProfile): CategoryScore {
  const range = profile.targets.tWinRate;
  const overall = stats.T / stats.rounds;
  const siteScores = (['A', 'B'] as const)
    .filter((site) => profile.requiredSites.includes(site))
    .map((site) =>
      stats.site[site].rounds ? stats.site[site].tWins / stats.site[site].rounds : 0,
    );
  const siteAverage = siteScores.reduce(
    (sum, value) => sum + bandScore(value, range, 6 / siteScores.length),
    0,
  );
  const opening = stats.firstKills ? stats.firstKillsByT / stats.firstKills : 0.5;
  return {
    id: 'simulation',
    label: 'Simulation',
    maximum: 20,
    score: rounded(bandScore(overall, range, 8) + siteAverage + bandScore(opening, [0.4, 0.6], 6)),
    metrics: [
      metric(
        't-win-rate',
        'T win rate',
        overall,
        bandScore(overall, range, 8),
        8,
        '%',
        `${Math.round(range[0] * 100)}–${Math.round(range[1] * 100)}%`,
      ),
      metric(
        'site-balance',
        'Per-site balance',
        siteAverage / 6,
        siteAverage,
        6,
        '%',
        'within profile win range',
      ),
      metric(
        'opening-balance',
        'T opening-kill share',
        opening,
        bandScore(opening, [0.4, 0.6], 6),
        6,
        '%',
        '40–60%',
      ),
    ],
  };
}

export async function evaluateMap(
  file: PortableMapFile,
  map: import('./types').MapDocument,
  profile: MapProfile,
  options: {
    runner?: BatchRunner;
    rounds?: number;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<MapEvaluation> {
  const graph = buildGraph(map);
  const analysis = analyzeMap(graph);
  const diagnostics: Diagnostic[] = [];
  const add = (
    diagnostic: Omit<Diagnostic, 'coordinates' | 'affectedCount'> & { cells?: number[] },
  ) => {
    const cells = diagnostic.cells ?? [];
    const { cells: _cells, ...value } = diagnostic;
    void _cells;
    diagnostics.push({
      ...value,
      coordinates: coordinates(graph, cells),
      affectedCount: cells.length,
    });
  };
  for (const [team, cells] of [
    ['T', graph.tSpawn],
    ['CT', graph.ctSpawn],
  ] as const) {
    if (selectSeparatedCells(cells, graph.width).length < 3)
      add({
        code: `SPAWN_CAPACITY_${team}`,
        severity: 'error',
        message: `${team} spawn cannot fit three separated players.`,
        suggestion: 'Paint a wider spawn area with at least three cells 1.5 grid units apart.',
        cells,
      });
  }
  const siteData = { A: graph.siteA, B: graph.siteB };
  for (const site of profile.requiredSites) {
    const sites = siteData[site];
    if (!sites.length) {
      add({
        code: `MISSING_SITE_${site}`,
        severity: 'error',
        message: `Required site ${site} is missing.`,
        suggestion: `Paint a contiguous site ${site} area.`,
      });
      continue;
    }
    if (sites.length < 12)
      add({
        code: `SMALL_SITE_${site}`,
        severity: 'warning',
        message: `Site ${site} has only ${sites.length} cells.`,
        suggestion: 'Expand the plant area to at least 12 cells.',
        cells: sites,
        observed: sites.length,
        expected: 'at least 12 cells',
      });
    for (const [team, field] of [
      ['T', graph.fromT],
      ['CT', graph.fromCT],
    ] as const)
      if (!sites.some((cell) => Number.isFinite(field[cell])))
        add({
          code: `UNREACHABLE_${team}_${site}`,
          severity: 'error',
          message: `${team}s cannot reach site ${site}.`,
          suggestion: 'Connect the spawn network to this site with walkable cells.',
          cells: sites,
        });
  }
  const spawnPeeks: number[] = [];
  for (const t of graph.tSpawn)
    for (const ct of graph.ctSpawn) if (hasLineOfSight(graph, t, ct)) spawnPeeks.push(t, ct);
  if (spawnPeeks.length)
    add({
      code: 'SPAWN_SIGHTLINE',
      severity: 'error',
      message: 'The teams can see each other from spawn.',
      suggestion: 'Add a wall, cover, or bend between the spawn areas.',
      cells: [...new Set(spawnPeeks)],
    });
  const disconnected = disconnectedCells(graph);
  if (disconnected.length)
    add({
      code: 'DISCONNECTED_WALKABLE',
      severity: 'warning',
      message: `${disconnected.length} walkable cells are disconnected from the main layout.`,
      suggestion: 'Connect or remove isolated playable areas.',
      cells: disconnected,
    });
  const entrances = {
    A: graph.siteA.length ? siteEntrances(graph, graph.siteA) : 0,
    B: graph.siteB.length ? siteEntrances(graph, graph.siteB) : 0,
  };
  for (const site of profile.requiredSites)
    if (entrances[site] !== 2)
      add({
        code: `SITE_ENTRANCES_${site}`,
        severity: 'warning',
        message: `Site ${site} has ${entrances[site]} distinct entrance region${entrances[site] === 1 ? '' : 's'}.`,
        suggestion: 'Aim for two separated, defensible approaches.',
        cells: siteData[site],
        observed: entrances[site],
        expected: '2',
      });
  const deadEnds = graph.walkableCells.filter(
    (cell) =>
      graph.neighbors[cell].length <= 1 &&
      ![TileType.TSpawn, TileType.CTSpawn, TileType.SiteA, TileType.SiteB].includes(
        graph.map.cells[cell] as TileType,
      ),
  );
  if (deadEnds.length)
    add({
      code: 'DEAD_ENDS',
      severity: 'warning',
      message: `${deadEnds.length} non-objective cells are dead ends.`,
      suggestion: 'Open a loop or remove space that traps players.',
      cells: deadEnds,
    });
  if (analysis.longestSightline > profile.targets.maxSightlineUnits)
    add({
      code: 'LONG_SIGHTLINE',
      severity: 'warning',
      message: `The longest sightline is ${Math.round(analysis.longestSightline)} units.`,
      suggestion: 'Break the lane with a bend, wall, or cover.',
      observed: analysis.longestSightline,
      expected: `at most ${profile.targets.maxSightlineUnits} units`,
    });

  const requiredEntrances = profile.requiredSites.map((site) => entrances[site]);
  const entranceScore = requiredEntrances.reduce(
    (sum, value) => sum + Math.max(0, 8 / requiredEntrances.length - Math.abs(value - 2) * 3),
    0,
  );
  const tStart = selectSeparatedCells(graph.tSpawn, graph.width)[0] ?? graph.tSpawn[0] ?? -1;
  const pathA = tStart >= 0 ? shortestPath(graph, tStart, graph.fromA) : [];
  const pathB = tStart >= 0 ? shortestPath(graph, tStart, graph.fromB) : [];
  const shared = new Set(pathA.slice(1));
  const routeOverlap =
    profile.requiredSites.length === 2 && pathA.length && pathB.length
      ? pathB.slice(1).filter((cell) => shared.has(cell)).length /
        Math.max(1, Math.min(pathA.length - 1, pathB.length - 1))
      : 0;
  const routeScore = 4 * (1 - Math.min(1, Math.max(0, routeOverlap - 0.25) / 0.75));
  if (profile.requiredSites.length === 2 && routeOverlap > 0.75)
    add({
      code: 'ROUTE_OVERLAP',
      severity: 'warning',
      message: `The shortest routes to A and B overlap by ${Math.round(routeOverlap * 100)}%.`,
      suggestion: 'Separate the site approaches earlier to create meaningful route choices.',
      cells: pathB.filter((cell) => shared.has(cell)),
      observed: routeOverlap,
      expected: 'at most 25%',
    });
  const disconnectedScore = graph.walkableCells.length
    ? 6 * (1 - Math.min(1, disconnected.length / graph.walkableCells.length))
    : 0;
  const deadEndScore = graph.walkableCells.length
    ? 6 * (1 - Math.min(1, deadEnds.length / Math.max(1, graph.walkableCells.length * 0.08)))
    : 0;
  const narrow =
    graph.walkableCells.filter((cell) => graph.neighbors[cell].length <= 2).length /
    Math.max(1, graph.walkableCells.length);
  const chokeScore = bandScore(narrow, [0.03, 0.18], 6);
  const flow: CategoryScore = {
    id: 'flow',
    label: 'Flow',
    maximum: 30,
    score: rounded(entranceScore + routeScore + disconnectedScore + deadEndScore + chokeScore),
    metrics: [
      metric(
        'site-entrances',
        'Site entrance quality',
        requiredEntrances.reduce((a, b) => a + b, 0) / requiredEntrances.length,
        entranceScore,
        8,
        '',
        '2 per site',
      ),
      metric(
        'route-overlap',
        'A/B shortest-route overlap',
        routeOverlap,
        routeScore,
        4,
        '%',
        '≤ 25%',
      ),
      metric(
        'connected-space',
        'Connected playable space',
        graph.walkableCells.length ? 1 - disconnected.length / graph.walkableCells.length : 0,
        disconnectedScore,
        6,
        '%',
        '100%',
      ),
      metric(
        'dead-ends',
        'Dead-end control',
        deadEnds.length,
        deadEndScore,
        6,
        'cells',
        'few or none',
      ),
      metric('choke-share', 'Narrow-cell share', narrow, chokeScore, 6, '%', '3–18%'),
    ],
  };

  const timingMetrics: MetricResult[] = [];
  const pushTiming = (
    id: string,
    label: string,
    value: number,
    target: [number, number],
    maximum: number,
  ) =>
    timingMetrics.push(
      metric(
        id,
        label,
        value,
        bandScore(value, target, maximum),
        maximum,
        's',
        `${target[0]}–${target[1]}`,
      ),
    );
  pushTiming(
    'first-contact',
    'First contact',
    analysis.firstContact,
    profile.targets.firstContactSeconds,
    7,
  );
  const perSite = profile.requiredSites.length;
  for (const site of profile.requiredSites) {
    const t = site === 'A' ? analysis.tA : analysis.tB;
    const ct = site === 'A' ? analysis.ctA : analysis.ctB;
    pushTiming(
      `ct-lead-${site.toLowerCase()}`,
      `CT lead at ${site}`,
      t - ct,
      profile.targets.ctLeadSeconds,
      12 / perSite,
    );
  }
  if (profile.requiredSites.length === 2)
    pushTiming('rotation', 'A ↔ B rotation', analysis.rotateAB, profile.targets.rotationSeconds, 6);
  else pushTiming('t-arrival', 'T arrival at A', analysis.tA, [10, 18], 6);
  const timings: CategoryScore = {
    id: 'timings',
    label: 'Timings',
    maximum: 25,
    score: rounded(timingMetrics.reduce((sum, item) => sum + item.score, 0)),
    metrics: timingMetrics,
  };

  const coverAdjacency = adjacentCoverRatio(graph);
  const sightScore = analysis.longestSightline
    ? Math.min(10, (profile.targets.maxSightlineUnits / analysis.longestSightline) * 10)
    : 10;
  const coverScore = bandScore(coverAdjacency, [0.12, 0.4], 8);
  const exposedTravel = Math.min(1, analysis.sightlines.length / 6);
  const exposureScore = 7 * (1 - exposedTravel * 0.7);
  const combat: CategoryScore = {
    id: 'combat',
    label: 'Combat',
    maximum: 25,
    score: rounded(sightScore + coverScore + exposureScore),
    metrics: [
      metric(
        'longest-sightline',
        'Longest sightline',
        analysis.longestSightline,
        sightScore,
        10,
        'u',
        `≤ ${profile.targets.maxSightlineUnits}`,
      ),
      metric(
        'cover-adjacency',
        'Walkable cells near cover',
        coverAdjacency,
        coverScore,
        8,
        '%',
        '12–40%',
      ),
      metric(
        'long-lane-pressure',
        'Long-lane pressure',
        exposedTravel,
        exposureScore,
        7,
        '%',
        'lower is safer',
      ),
    ],
  };

  const hardInvalid = diagnostics.some((item) => item.severity === 'error');
  const categories = [flow, timings, combat];
  let stats: BatchStatistics | undefined;
  if (!hardInvalid && options.runner && (options.rounds ?? 1000) > 0) {
    stats = await options.runner.run({
      graph,
      options: { plan: 'mixed', site: 'random', roundTime: 90 },
      rounds: options.rounds ?? 1000,
      signal: options.signal,
      onProgress: options.onProgress,
    });
    categories.push(simulationCategory(stats, profile));
  }
  const maximum = categories.reduce((sum, item) => sum + item.maximum, 0);
  const rawScore = categories.reduce((sum, item) => sum + item.score, 0);
  const score = hardInvalid ? null : rounded((rawScore / maximum) * 100);
  const status = hardInvalid
    ? 'invalid'
    : score! >= 75
      ? 'good'
      : score! >= 60
        ? 'needs-work'
        : 'poor';
  const totalDeaths = stats
    ? Array.from(stats.deathsT).reduce(
        (sum, value, index) => sum + value + stats!.deathsCT[index],
        0,
      )
    : 0;
  const deathConcentration =
    stats && totalDeaths
      ? Array.from(stats.deathsT, (value, index) => value + stats.deathsCT[index])
          .sort((a, b) => b - a)
          .slice(0, Math.max(1, Math.ceil(graph.walkableCells.length * 0.1)))
          .reduce((sum, value) => sum + value, 0) / totalDeaths
      : 0;
  return {
    schemaVersion: 1,
    map: { name: file.name, profile: profile.id, width: map.width, height: map.height },
    valid: !hardInvalid,
    status,
    score,
    categories,
    diagnostics,
    evidence: {
      analysis,
      entrances,
      disconnectedCells: disconnected.length,
      deadEnds: deadEnds.length,
      coverAdjacency,
      exposedTravel,
      ...(stats
        ? {
            simulation: {
              statistics: stats,
              tWinRate: interval(stats.T, stats.rounds),
              openingKillRate: interval(stats.firstKillsByT, stats.firstKills),
              plantRate: (stats.site.A.plants + stats.site.B.plants) / stats.rounds,
              retakeRate: stats.postPlantRounds ? stats.retakes / stats.postPlantRounds : 0,
              deathConcentration,
            },
          }
        : {}),
    },
  };
}
