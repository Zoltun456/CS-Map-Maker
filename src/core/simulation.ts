import { RUN_SPEED_CELLS_PER_SECOND } from './map';
import { distanceField, distanceTo, hasLineOfSight } from './graph';
import {
  TileType,
  type AgentState,
  type BatchStatistics,
  type MapGraph,
  type SimulationOptions,
  type SimulationState,
  type Team,
} from './types';

export const ROUND_RULES = {
  bombTime: 40,
  plantTime: 3.2,
  kitDefuseTime: 5,
  noKitDefuseTime: 10,
  weaponRange: 48,
} as const;

const pick = <T>(values: readonly T[]): T => values[Math.floor(Math.random() * values.length)];
const randomBetween = (minimum: number, maximum: number) =>
  minimum + Math.random() * (maximum - minimum);
const coordinates = (graph: MapGraph, cell: number): [number, number] => [
  (cell % graph.width) + 0.5,
  Math.floor(cell / graph.width) + 0.5,
];
const positionCell = (graph: MapGraph, agent: AgentState) =>
  Math.floor(agent.y) * graph.width + Math.floor(agent.x);

function nearSite(
  graph: MapGraph,
  siteCells: readonly number[],
  maxDistance: number,
  favorCover: boolean,
): number {
  const distances =
    siteCells === graph.siteA
      ? graph.fromA
      : siteCells === graph.siteB
        ? graph.fromB
        : distanceField(graph, siteCells);
  const candidates: number[] = [];
  for (const cell of graph.walkableCells)
    if (distances[cell] <= maxDistance) {
      let weight = 1;
      if (favorCover) {
        const x = cell % graph.width;
        const y = Math.floor(cell / graph.width);
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            const yy = y + dy;
            if (
              xx >= 0 &&
              yy >= 0 &&
              xx < graph.width &&
              yy < graph.height &&
              graph.map.cells[yy * graph.width + xx] === TileType.Cover
            )
              weight = 4;
          }
      }
      for (let index = 0; index < weight; index += 1) candidates.push(cell);
    }
  return candidates.length ? pick(candidates) : pick(siteCells);
}

function viaCell(graph: MapGraph, from: number, to: number, lenience: number): number | null {
  const fromField = distanceTo(graph, from);
  const toField = distanceTo(graph, to);
  const direct = fromField[to];
  for (let index = 0; index < 80; index += 1) {
    const candidate = pick(graph.walkableCells);
    const distance = fromField[candidate] + toField[candidate];
    if (
      distance <= direct * lenience &&
      fromField[candidate] > direct * 0.25 &&
      toField[candidate] > 3
    )
      return candidate;
  }
  return null;
}

function createAgent(
  graph: MapGraph,
  side: Team,
  index: number,
  start: number,
  steps: AgentState['steps'],
): AgentState {
  const [x, y] = coordinates(graph, start);
  return {
    side,
    id: `${side}${index + 1}`,
    x,
    y,
    cell: start,
    next: -1,
    alive: true,
    steps,
    stepIndex: 0,
    override: null,
    still: 0,
    target: null,
    aimTime: 0,
    skill: randomBetween(0.85, 1.15),
    kills: 0,
    visible: [],
  };
}

export function createRound(graph: MapGraph, options: SimulationOptions): SimulationState {
  const hasB = graph.siteB.length > 0;
  const site =
    options.site === 'A' || !hasB
      ? 'A'
      : options.site === 'B'
        ? 'B'
        : Math.random() < 0.5
          ? 'A'
          : 'B';
  const plan =
    options.plan === 'mixed'
      ? pick(
          hasB
            ? (['rush', 'default', 'default', 'fake'] as const)
            : (['rush', 'default', 'default'] as const),
        )
      : options.plan === 'fake' && !hasB
        ? 'default'
        : options.plan;
  const targetSite = site === 'A' ? graph.siteA : graph.siteB;
  const otherSite = site === 'A' ? graph.siteB : graph.siteA;
  const state: SimulationState = {
    graph,
    time: 0,
    roundTime: options.roundTime || 90,
    site,
    plan,
    agents: [],
    events: [],
    outcome: null,
    bomb: {
      state: 'carried',
      cell: -1,
      plantProgress: 0,
      defuseProgress: 0,
      plantedAt: 0,
      activeDefuserId: null,
    },
    alerts: { A: new Set(), B: new Set() },
    rotatedTo: null,
    firstKill: null,
  };
  const executeAt = plan === 'rush' ? 0 : randomBetween(12, Math.min(32, state.roundTime - 35));
  const tSpawns = [...graph.tSpawn].sort(() => Math.random() - 0.5);
  const ctSpawns = [...graph.ctSpawn].sort(() => Math.random() - 0.5);
  for (let index = 0; index < 3; index += 1) {
    const start = tSpawns[index % tSpawns.length];
    const spot = index === 0 ? pick(targetSite) : nearSite(graph, targetSite, 2, false);
    const steps: AgentState['steps'] = [];
    if (plan === 'fake' && index < 2)
      steps.push({ cell: nearSite(graph, otherSite, 5, false), until: executeAt });
    else if (plan !== 'rush' || Math.random() < 0.35) {
      const intermediate = viaCell(graph, start, spot, plan === 'rush' ? 1.2 : 1.5);
      if (intermediate !== null)
        steps.push({ cell: intermediate, until: plan === 'rush' ? 0 : executeAt });
    }
    steps.push({ cell: spot, final: true });
    state.agents.push(createAgent(graph, 'T', index, start, steps));
  }
  state.agents[0].carrier = true;
  const roles: Array<'A' | 'B' | 'mid'> = hasB
    ? [
        ...pick([
          ['A', 'A', 'B'],
          ['A', 'B', 'B'],
          ['A', 'B', 'B'],
          ['A', 'A', 'B'],
          ['A', 'B', 'mid'],
        ] as const),
      ]
    : ['A', 'A', 'mid'];
  for (let index = 0; index < 3; index += 1) {
    const start = ctSpawns[index % ctSpawns.length];
    let role = roles[index];
    let spot: number;
    if (role === 'mid') {
      const candidates = graph.walkableCells.filter(
        (cell) =>
          graph.fromCT[cell] < graph.fromT[cell] - 10 &&
          (hasB
            ? Math.abs(graph.fromA[cell] - graph.fromB[cell]) < 6
            : graph.fromA[cell] > 6 && graph.fromA[cell] < 14),
      );
      spot = candidates.length ? pick(candidates) : nearSite(graph, graph.siteA, 3, true);
      role = 'A';
    } else spot = nearSite(graph, role === 'A' ? graph.siteA : graph.siteB, 3, true);
    const agent = createAgent(graph, 'CT', index, start, [{ cell: spot, final: true }]);
    agent.home = role;
    agent.kit = Math.random() < 0.6;
    state.agents.push(agent);
  }
  return state;
}

function bestNext(graph: MapGraph, cell: number, distances: Float64Array): number {
  let best = -1;
  let bestDistance = Infinity;
  for (const edge of graph.neighbors[cell])
    if (distances[edge.cell] < distances[cell]) {
      const value = distances[edge.cell] + edge.cost;
      if (value < bestDistance) {
        bestDistance = value;
        best = edge.cell;
      }
    }
  return best;
}

function moveTo(state: SimulationState, agent: AgentState, target: number, delta: number): boolean {
  const distances = distanceTo(state.graph, target);
  let remaining = RUN_SPEED_CELLS_PER_SECOND * delta;
  let moved = false;
  while (remaining > 1e-6) {
    if (agent.next < 0) {
      if (agent.cell === target) break;
      agent.next = bestNext(state.graph, agent.cell, distances);
      if (agent.next < 0) break;
    }
    const [nextX, nextY] = coordinates(state.graph, agent.next);
    const dx = nextX - agent.x;
    const dy = nextY - agent.y;
    const distance = Math.hypot(dx, dy);
    moved = true;
    if (distance <= remaining) {
      agent.x = nextX;
      agent.y = nextY;
      agent.cell = agent.next;
      agent.next = -1;
      remaining -= distance;
    } else {
      agent.x += (dx / distance) * remaining;
      agent.y += (dy / distance) * remaining;
      remaining = 0;
    }
  }
  agent.still = moved ? 0 : agent.still + delta;
  return agent.cell === target && agent.next < 0;
}

const killRate = (distance: number) => 2.3 * Math.exp(-(distance * 64) / 1700);

function coverMultiplier(graph: MapGraph, target: AgentState, shooter: AgentState): number {
  const cell = positionCell(graph, target);
  const x = cell % graph.width;
  const y = Math.floor(cell / graph.width);
  const shooterX = shooter.x - target.x;
  const shooterY = shooter.y - target.y;
  const shooterLength = Math.hypot(shooterX, shooterY) || 1;
  for (let dy = -1; dy <= 1; dy += 1)
    for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const xx = x + dx;
      const yy = y + dy;
      if (
        xx < 0 ||
        yy < 0 ||
        xx >= graph.width ||
        yy >= graph.height ||
        graph.map.cells[yy * graph.width + xx] !== TileType.Cover
      )
        continue;
      if ((dx * shooterX + dy * shooterY) / (Math.hypot(dx, dy) * shooterLength) > 0.55) return 0.5;
    }
  return 1;
}

const siteForCell = (graph: MapGraph, cell: number): 'A' | 'B' =>
  !graph.siteB.length || graph.fromA[cell] <= graph.fromB[cell] ? 'A' : 'B';
const finish = (state: SimulationState, winner: Team, reason: string) => {
  state.outcome = { winner, reason, time: state.time };
};

export function advanceDefuse(
  bomb: SimulationState['bomb'],
  eligibleDefusers: readonly AgentState[],
  delta: number,
): boolean {
  let defuser = eligibleDefusers.find((agent) => agent.id === bomb.activeDefuserId);
  if (!defuser)
    defuser = [...eligibleDefusers].sort(
      (a, b) => Number(Boolean(b.kit)) - Number(Boolean(a.kit)) || a.id.localeCompare(b.id),
    )[0];
  if (!defuser) {
    bomb.activeDefuserId = null;
    bomb.defuseProgress = 0;
    return false;
  }
  if (bomb.activeDefuserId !== defuser.id) bomb.defuseProgress = 0;
  bomb.activeDefuserId = defuser.id;
  bomb.defuseProgress += delta;
  return (
    bomb.defuseProgress >= (defuser.kit ? ROUND_RULES.kitDefuseTime : ROUND_RULES.noKitDefuseTime)
  );
}

function rotate(state: SimulationState, site: 'A' | 'B') {
  if (state.rotatedTo === site || state.bomb.state === 'planted') return;
  state.rotatedTo = site;
  const cells = site === 'A' ? state.graph.siteA : state.graph.siteB;
  for (const agent of state.agents)
    if (agent.side === 'CT' && agent.alive && agent.home !== site)
      agent.override = {
        cell: nearSite(state.graph, cells, 3, true),
        at: state.time + randomBetween(1, 2.5),
      };
  state.events.push({ time: state.time, rotate: site });
}

export function stepRound(state: SimulationState, delta: number): void {
  if (state.outcome) return;
  const { graph } = state;
  state.time += delta;
  const alive = state.agents.filter((agent) => agent.alive);
  for (const agent of alive) {
    agent.visible = [];
    const cell = positionCell(graph, agent);
    for (const enemy of alive)
      if (enemy.side !== agent.side) {
        const distance = Math.hypot(enemy.x - agent.x, enemy.y - agent.y);
        if (
          distance <= ROUND_RULES.weaponRange &&
          hasLineOfSight(graph, cell, positionCell(graph, enemy))
        )
          agent.visible.push([enemy, distance]);
      }
  }
  for (const agent of alive)
    if (agent.side === 'CT')
      for (const [enemy] of agent.visible) {
        const site = siteForCell(graph, positionCell(graph, enemy));
        const distances = site === 'A' ? graph.fromA : graph.fromB;
        if (distances[positionCell(graph, enemy)] <= 14) state.alerts[site].add(enemy.id);
        if (state.alerts[site].size >= 2) rotate(state, site);
      }
  const kills: Array<[AgentState, AgentState]> = [];
  for (const agent of alive) {
    if (!agent.visible.length) {
      agent.target = null;
      continue;
    }
    agent.visible.sort((a, b) => a[1] - b[1]);
    const [enemy, distance] = agent.visible[0];
    if (agent.target !== enemy) {
      agent.target = enemy;
      agent.aimTime = randomBetween(0.22, 0.45) * (agent.still > 0.8 ? 0.7 : 1);
      continue;
    }
    agent.aimTime -= delta;
    if (
      agent.aimTime <= 0 &&
      Math.random() <
        1 -
          Math.exp(-killRate(distance) * agent.skill * coverMultiplier(graph, enemy, agent) * delta)
    )
      kills.push([agent, enemy]);
  }
  for (const [killer, victim] of kills) {
    if (!victim.alive) continue;
    victim.alive = false;
    killer.kills += 1;
    const cell = positionCell(graph, victim);
    state.events.push({
      time: state.time,
      killer: killer.id,
      victim: victim.id,
      side: victim.side,
      cell,
      killerX: killer.x,
      killerY: killer.y,
      victimX: victim.x,
      victimY: victim.y,
    });
    if (!state.firstKill) state.firstKill = { time: state.time, side: killer.side };
    if (victim.carrier) {
      victim.carrier = false;
      if (state.bomb.state === 'carried') {
        state.bomb.state = 'dropped';
        state.bomb.cell = graph.walkable[cell] ? cell : victim.cell;
      }
    }
    if (victim.side === 'CT' && state.bomb.state !== 'planted')
      rotate(state, siteForCell(graph, cell));
  }

  const targetSite = state.site === 'A' ? graph.siteA : graph.siteB;
  const eligibleDefusers: AgentState[] = [];
  for (const agent of state.agents) {
    if (!agent.alive) continue;
    const fighting = agent.visible.length > 0;
    if (agent.side === 'T') {
      if (state.bomb.state === 'planted' && !agent.postplant) {
        agent.postplant = true;
        agent.override = {
          cell: nearSite(graph, [state.bomb.cell], 6, true),
          at: state.time + randomBetween(0, 1),
        };
      }
      if (
        state.bomb.state === 'dropped' &&
        !agent.pickup &&
        !state.agents.some((other) => other.pickup && other.alive)
      ) {
        const bombField = distanceTo(graph, state.bomb.cell);
        const terrorists = state.agents
          .filter((other) => other.alive && other.side === 'T')
          .sort((a, b) => bombField[a.cell] - bombField[b.cell]);
        if (terrorists[0] === agent) {
          agent.pickup = true;
          agent.override = { cell: state.bomb.cell, at: state.time };
        }
      }
    }
    if (fighting) {
      if (agent.carrier) state.bomb.plantProgress = 0;
      continue;
    }
    const step = agent.steps[agent.stepIndex];
    const target =
      agent.override && state.time >= agent.override.at ? agent.override.cell : step.cell;
    const waitUntil = agent.override ? 0 : (step.until ?? 0);
    const arrived = moveTo(state, agent, target, delta);
    if (!arrived) {
      if (agent.carrier) state.bomb.plantProgress = 0;
      continue;
    }
    if (agent.side === 'T') {
      if (agent.pickup && agent.override && target === agent.override.cell) {
        agent.pickup = false;
        agent.carrier = true;
        state.bomb.state = 'carried';
        agent.override = null;
        agent.steps = [{ cell: pick(targetSite), final: true }];
        agent.stepIndex = 0;
        continue;
      }
      if (
        agent.carrier &&
        state.bomb.state === 'carried' &&
        (graph.map.cells[agent.cell] === TileType.SiteA ||
          graph.map.cells[agent.cell] === TileType.SiteB) &&
        !agent.override
      ) {
        state.bomb.plantProgress += delta;
        if (state.bomb.plantProgress >= ROUND_RULES.plantTime) {
          state.bomb.state = 'planted';
          state.bomb.cell = agent.cell;
          state.bomb.plantedAt = state.time;
          agent.carrier = false;
          state.plantedSite = graph.map.cells[agent.cell] === TileType.SiteA ? 'A' : 'B';
          state.events.push({ time: state.time, plant: state.plantedSite });
          for (const ct of state.agents)
            if (ct.side === 'CT' && ct.alive)
              ct.override = { cell: state.bomb.cell, at: state.time + randomBetween(0.5, 1.5) };
        }
        continue;
      }
    } else if (state.bomb.state === 'planted' && agent.cell === state.bomb.cell)
      eligibleDefusers.push(agent);
    if (!agent.override && !step.final && state.time >= waitUntil) agent.stepIndex += 1;
  }

  if (state.bomb.state === 'planted') {
    if (advanceDefuse(state.bomb, eligibleDefusers, delta)) {
      finish(state, 'CT', 'Defused');
      return;
    }
  }

  const terroristsAlive = state.agents.some((agent) => agent.alive && agent.side === 'T');
  const ctsAlive = state.agents.some((agent) => agent.alive && agent.side === 'CT');
  if (state.bomb.state === 'planted') {
    if (!ctsAlive) finish(state, 'T', 'Elimination');
    else if (state.time - state.bomb.plantedAt >= ROUND_RULES.bombTime)
      finish(state, 'T', 'Bomb exploded');
  } else if (!terroristsAlive) finish(state, 'CT', 'Elimination');
  else if (!ctsAlive) finish(state, 'T', 'Elimination');
  else if (state.time >= state.roundTime) finish(state, 'CT', 'Time ran out');
}

export function runBatch(
  graph: MapGraph,
  options: SimulationOptions,
  rounds: number,
): BatchStatistics {
  const statistics: BatchStatistics = {
    rounds: 0,
    T: 0,
    CT: 0,
    reasons: {},
    site: { A: { rounds: 0, tWins: 0, plants: 0 }, B: { rounds: 0, tWins: 0, plants: 0 } },
    plan: {},
    deathsT: new Float32Array(graph.size),
    deathsCT: new Float32Array(graph.size),
    firstKillsByT: 0,
    firstKillTime: 0,
    firstKills: 0,
    totalLength: 0,
    postPlantRounds: 0,
    retakes: 0,
    roundLengthBuckets: { '0-30': 0, '30-60': 0, '60-90': 0, '90+': 0 },
  };
  for (let round = 0; round < rounds; round += 1) {
    const state = createRound(graph, options);
    let guard = 0;
    while (!state.outcome && guard++ < 3000) stepRound(state, 0.1);
    if (!state.outcome) finish(state, 'CT', 'Time ran out');
    const outcome = state.outcome!;
    statistics.rounds += 1;
    statistics[outcome.winner] += 1;
    statistics.totalLength += outcome.time;
    const lengthBucket =
      outcome.time < 30
        ? '0-30'
        : outcome.time < 60
          ? '30-60'
          : outcome.time < 90
            ? '60-90'
            : '90+';
    statistics.roundLengthBuckets[lengthBucket] += 1;
    if (state.plantedSite) {
      statistics.postPlantRounds += 1;
      if (outcome.winner === 'CT') statistics.retakes += 1;
    }
    const reason = `${outcome.winner} · ${outcome.reason}`;
    statistics.reasons[reason] = (statistics.reasons[reason] ?? 0) + 1;
    const site = statistics.site[state.site];
    site.rounds += 1;
    if (outcome.winner === 'T') site.tWins += 1;
    if (state.plantedSite) statistics.site[state.plantedSite].plants += 1;
    const plan =
      statistics.plan[state.plan] ?? (statistics.plan[state.plan] = { rounds: 0, tWins: 0 });
    plan.rounds += 1;
    if (outcome.winner === 'T') plan.tWins += 1;
    for (const event of state.events)
      if (event.victim && event.cell !== undefined)
        (event.side === 'T' ? statistics.deathsT : statistics.deathsCT)[event.cell] += 1;
    if (state.firstKill) {
      statistics.firstKills += 1;
      statistics.firstKillTime += state.firstKill.time;
      if (state.firstKill.side === 'T') statistics.firstKillsByT += 1;
    }
  }
  return statistics;
}

export function mergeStatistics(
  target: BatchStatistics | null,
  source: BatchStatistics,
): BatchStatistics {
  if (!target) return source;
  target.rounds += source.rounds;
  target.T += source.T;
  target.CT += source.CT;
  target.totalLength += source.totalLength;
  target.firstKillsByT += source.firstKillsByT;
  target.firstKillTime += source.firstKillTime;
  target.firstKills += source.firstKills;
  target.postPlantRounds += source.postPlantRounds;
  target.retakes += source.retakes;
  for (const bucket of ['0-30', '30-60', '60-90', '90+'] as const)
    target.roundLengthBuckets[bucket] += source.roundLengthBuckets[bucket];
  for (const [reason, count] of Object.entries(source.reasons))
    target.reasons[reason] = (target.reasons[reason] ?? 0) + count;
  for (const site of ['A', 'B'] as const) {
    target.site[site].rounds += source.site[site].rounds;
    target.site[site].tWins += source.site[site].tWins;
    target.site[site].plants += source.site[site].plants;
  }
  for (const [name, value] of Object.entries(source.plan)) {
    const plan = target.plan[name] ?? (target.plan[name] = { rounds: 0, tWins: 0 });
    plan.rounds += value.rounds;
    plan.tWins += value.tWins;
  }
  for (let index = 0; index < target.deathsT.length; index += 1) {
    target.deathsT[index] += source.deathsT[index];
    target.deathsCT[index] += source.deathsCT[index];
  }
  return target;
}
