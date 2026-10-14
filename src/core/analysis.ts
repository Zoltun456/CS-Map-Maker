import { HAMMER_UNITS_PER_CELL, selectSeparatedCells } from './map';
import { hasLineOfSight, secondsForDistance } from './graph';
import type { AnalysisResult, MapGraph } from './types';

function minimum(distances: Float64Array, cells: readonly number[]): number {
  let result = Infinity;
  for (const cell of cells) result = Math.min(result, distances[cell]);
  return result;
}

export function analyzeMap(graph: MapGraph): AnalysisResult {
  let contactDistance = Infinity;
  let firstContactCell = -1;
  for (const cell of graph.walkableCells) {
    const distance = Math.max(graph.fromT[cell], graph.fromCT[cell]);
    if (distance < contactDistance) {
      contactDistance = distance;
      firstContactCell = cell;
    }
  }
  const candidates = graph.walkableCells.filter(
    (cell) => (cell % graph.width) % 2 === 0 && Math.floor(cell / graph.width) % 2 === 0,
  );
  const sightlines: AnalysisResult['sightlines'] = [];
  for (let left = 0; left < candidates.length; left += 1)
    for (let right = left + 1; right < candidates.length; right += 1) {
      const from = candidates[left];
      const to = candidates[right];
      const distance = Math.hypot(
        (from % graph.width) - (to % graph.width),
        Math.floor(from / graph.width) - Math.floor(to / graph.width),
      );
      if (
        distance < 14 ||
        (sightlines.length >= 6 && distance <= sightlines.at(-1)!.distance) ||
        !hasLineOfSight(graph, from, to)
      )
        continue;
      sightlines.push({ from, to, distance });
      sightlines.sort((a, b) => b.distance - a.distance);
      if (sightlines.length > 6) sightlines.pop();
    }
  const result: AnalysisResult = {
    tA: secondsForDistance(minimum(graph.fromT, graph.siteA)),
    tB: secondsForDistance(minimum(graph.fromT, graph.siteB)),
    ctA: secondsForDistance(minimum(graph.fromCT, graph.siteA)),
    ctB: secondsForDistance(minimum(graph.fromCT, graph.siteB)),
    rotateAB: secondsForDistance(minimum(graph.fromA, graph.siteB)),
    firstContact: secondsForDistance(contactDistance),
    firstContactCell,
    sightlines,
    longestSightline: sightlines.length ? sightlines[0].distance * HAMMER_UNITS_PER_CELL : 0,
    warnings: [],
  };
  if (selectSeparatedCells(graph.tSpawn, graph.width).length < 3)
    result.warnings.push('Paint room for 3 separated T spawns.');
  if (selectSeparatedCells(graph.ctSpawn, graph.width).length < 3)
    result.warnings.push('Paint room for 3 separated CT spawns.');
  if (!graph.siteA.length) result.warnings.push('Paint a bombsite A.');
  if (graph.siteA.length && !Number.isFinite(result.tA))
    result.warnings.push('Ts cannot walk to site A.');
  if (graph.siteB.length && !Number.isFinite(result.tB))
    result.warnings.push('Ts cannot walk to site B.');
  if (graph.siteA.length && !Number.isFinite(result.ctA))
    result.warnings.push('CTs cannot walk to site A.');
  if (graph.siteB.length && !Number.isFinite(result.ctB))
    result.warnings.push('CTs cannot walk to site B.');
  if (graph.tSpawn.some((a) => graph.ctSpawn.some((b) => hasLineOfSight(graph, a, b))))
    result.warnings.push('T and CT spawns can see each other. Block that line.');
  return result;
}
