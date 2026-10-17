import type { AnalysisResult, BatchStatistics, MapDocument } from './types';

export type MapProfileId = 'two-site-3v3' | 'one-site-3v3';

export interface QualityTargets {
  tWinRate: [number, number];
  firstContactSeconds: [number, number];
  ctLeadSeconds: [number, number];
  rotationSeconds: [number, number];
  maxSightlineUnits: number;
}

export interface PortableMapFile {
  format: 'cs-map-maker';
  version: 1;
  name: string;
  notes?: string;
  profile: MapProfileId;
  width: number;
  height: number;
  rows: string[];
  targets?: Partial<QualityTargets>;
}

export interface MapProfile {
  id: MapProfileId;
  label: string;
  requiredSites: Array<'A' | 'B'>;
  targets: QualityTargets;
}

export interface MapCoordinate {
  x: number;
  y: number;
  levelId?: string;
  z?: number;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  suggestion: string;
  coordinates: MapCoordinate[];
  affectedCount: number;
  observed?: number;
  expected?: string;
}

export interface MetricResult {
  id: string;
  label: string;
  value: number;
  unit?: string;
  target?: string;
  score: number;
  maximum: number;
}

export interface CategoryScore {
  id: 'flow' | 'timings' | 'combat' | 'simulation';
  label: string;
  score: number;
  maximum: number;
  metrics: MetricResult[];
}

export interface ConfidenceInterval {
  estimate: number;
  low: number;
  high: number;
}

export interface EvaluationEvidence {
  analysis: AnalysisResult;
  entrances: { A: number; B: number };
  disconnectedCells: number;
  deadEnds: number;
  coverAdjacency: number;
  exposedTravel: number;
  simulation?: {
    statistics: BatchStatistics;
    tWinRate: ConfidenceInterval;
    openingKillRate: ConfidenceInterval;
    plantRate: number;
    retakeRate: number;
    deathConcentration: number;
  };
}

export interface MapEvaluation {
  schemaVersion: 1;
  map: { name: string; profile: MapProfileId; width: number; height: number };
  valid: boolean;
  status: 'invalid' | 'poor' | 'needs-work' | 'good' | 'excellent';
  score: number | null;
  categories: CategoryScore[];
  diagnostics: Diagnostic[];
  evidence: EvaluationEvidence;
}

export interface ParsedPortableMap {
  file: PortableMapFile;
  map: MapDocument;
  profile: MapProfile;
}
