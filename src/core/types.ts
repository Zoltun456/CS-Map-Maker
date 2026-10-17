export enum TileType {
  Wall = 0,
  Floor = 1,
  Cover = 2,
  TSpawn = 3,
  CTSpawn = 4,
  SiteA = 5,
  SiteB = 6,
  Indoor = 7,
}

export interface TileDefinition {
  type: TileType;
  name: string;
  key: string;
  color: string;
  walkable: boolean;
  blocksMovement: boolean;
  blocksSight: boolean;
}

export interface MapDocument {
  width: number;
  height: number;
  cells: Uint8Array;
}

export interface GraphEdge {
  cell: number;
  cost: number;
}

export interface MapGraph {
  map: MapDocument;
  width: number;
  height: number;
  size: number;
  walkable: Uint8Array;
  neighbors: GraphEdge[][];
  walkableCells: number[];
  fieldCache: Map<number, Float64Array>;
  sightCache: Uint8Array;
  tSpawn: number[];
  ctSpawn: number[];
  siteA: number[];
  siteB: number[];
  fromT: Float64Array;
  fromCT: Float64Array;
  fromA: Float64Array;
  fromB: Float64Array;
}

export interface Sightline {
  from: number;
  to: number;
  distance: number;
}

export interface AnalysisResult {
  tA: number;
  tB: number;
  ctA: number;
  ctB: number;
  rotateAB: number;
  firstContact: number;
  firstContactCell: number;
  sightlines: Sightline[];
  longestSightline: number;
  warnings: string[];
}

export type Team = 'T' | 'CT';
export type Plan = 'mixed' | 'rush' | 'default' | 'fake';
export type SiteChoice = 'random' | 'A' | 'B';

export interface SimulationOptions {
  plan: Plan;
  site: SiteChoice;
  roundTime: number;
  seed?: number;
}

export interface AgentStep {
  cell: number;
  until?: number;
  final?: boolean;
}

export interface AgentState {
  side: Team;
  id: string;
  x: number;
  y: number;
  cell: number;
  next: number;
  alive: boolean;
  steps: AgentStep[];
  stepIndex: number;
  override: { cell: number; at: number } | null;
  still: number;
  target: AgentState | null;
  aimTime: number;
  skill: number;
  kills: number;
  visible: Array<[AgentState, number]>;
  carrier?: boolean;
  kit?: boolean;
  home?: 'A' | 'B';
  pickup?: boolean;
  postplant?: boolean;
}

export interface SimulationEvent {
  time: number;
  killer?: string;
  victim?: string;
  side?: Team;
  cell?: number;
  killerX?: number;
  killerY?: number;
  victimX?: number;
  victimY?: number;
  plant?: 'A' | 'B';
  rotate?: 'A' | 'B';
}

export interface SimulationState {
  graph: MapGraph;
  time: number;
  roundTime: number;
  site: 'A' | 'B';
  plan: Exclude<Plan, 'mixed'>;
  agents: AgentState[];
  events: SimulationEvent[];
  outcome: { winner: Team; reason: string; time: number } | null;
  bomb: {
    state: 'carried' | 'dropped' | 'planted';
    cell: number;
    plantProgress: number;
    defuseProgress: number;
    plantedAt: number;
    activeDefuserId: string | null;
  };
  alerts: { A: Set<string>; B: Set<string> };
  rotatedTo: 'A' | 'B' | null;
  firstKill: { time: number; side: Team } | null;
  plantedSite?: 'A' | 'B';
  random: () => number;
}

export interface SiteStatistics {
  rounds: number;
  tWins: number;
  plants: number;
}

export interface BatchStatistics {
  rounds: number;
  T: number;
  CT: number;
  reasons: Record<string, number>;
  site: { A: SiteStatistics; B: SiteStatistics };
  plan: Record<string, { rounds: number; tWins: number }>;
  deathsT: Float32Array;
  deathsCT: Float32Array;
  firstKillsByT: number;
  firstKillTime: number;
  firstKills: number;
  totalLength: number;
  postPlantRounds: number;
  retakes: number;
  roundLengthBuckets: Record<'0-30' | '30-60' | '60-90' | '90+', number>;
}

export interface BatchRunRequest {
  graph: MapGraph;
  options: SimulationOptions;
  rounds: number;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
}

export interface BatchRunner {
  run(request: BatchRunRequest): Promise<BatchStatistics>;
}
