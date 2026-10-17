import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePortableMap } from '../../src/core/portableMap';
import { buildGraph, hasLineOfSight, secondsForDistance } from '../../src/core/graph';
import { analyzeMap } from '../../src/core/analysis';

const fixture = JSON.parse(readFileSync('examples/maps/steelworks-3v3.csmap.json', 'utf8'));
const parsed = parsePortableMap(fixture);
const graph = buildGraph(parsed.map);
const cell = (x: number, y: number) => y * graph.width + x;
const lead = (x: number, y: number) =>
  secondsForDistance(graph.fromT[cell(x, y)] - graph.fromCT[cell(x, y)]);

describe('Steelworks one-site 3v3 layout', () => {
  it('preserves distinct lanes and a central single site', () => {
    expect(parsed.file.profile).toBe('one-site-3v3');
    expect(parsed.file.width).toBe(56);
    expect(parsed.file.height).toBe(70);
    expect(fixture.rows[35][9]).toBe('.');
    expect(fixture.rows[43][28]).toBe('I');
    expect(fixture.rows[36][49]).toBe('I');
    expect(graph.siteA.length).toBeGreaterThanOrEqual(12);
    expect(graph.siteB).toHaveLength(0);
    expect(graph.tSpawn.length).toBeGreaterThanOrEqual(3);
    expect(graph.ctSpawn.length).toBeGreaterThanOrEqual(3);
  });

  it('gives all initial CT positions a timing lead', () => {
    for (const [name, x, y] of [
      ['yard', 14, 18],
      ['fabrication', 28, 21],
      ['shipping', 41, 19],
    ] as const) {
      expect(graph.walkable[cell(x, y)], name).toBe(1);
      expect(lead(x, y), name).toBeGreaterThan(5);
      expect(secondsForDistance(graph.fromCT[cell(x, y)]), name).toBeLessThan(7);
    }
  });

  it('preserves meaningful first contact and site arrival', () => {
    const metrics = analyzeMap(graph);
    expect(metrics.tA).toBeGreaterThanOrEqual(10);
    expect(metrics.tA).toBeLessThan(18);
    expect(metrics.tA - metrics.ctA).toBeGreaterThan(4);
    expect(metrics.firstContact).toBeGreaterThan(5);
    expect(metrics.firstContact).toBeLessThan(12);
    expect(
      graph.tSpawn.some((t) => graph.ctSpawn.some((ct) => hasLineOfSight(graph, t, ct))),
    ).toBe(false);
  });

  it('keeps all three routes and all walkable space connected', () => {
    for (const index of graph.walkableCells)
      expect(Number.isFinite(graph.fromT[index])).toBe(true);
    for (const [x, y] of [
      [14, 18],
      [28, 21],
      [41, 19],
      [28, 28],
      [19, 44],
      [39, 45],
    ]) {
      expect(Number.isFinite(graph.fromT[cell(x, y)])).toBe(true);
      expect(Number.isFinite(graph.fromCT[cell(x, y)])).toBe(true);
    }
  });
});
