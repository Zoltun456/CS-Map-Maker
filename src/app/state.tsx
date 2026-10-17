import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { analyzeMap } from '../core/analysis';
import { buildGraph } from '../core/graph';
import { cloneMap, resizeMap } from '../core/map';
import { decodeMap, encodeMap } from '../core/serialization';
import { sampleMap } from '../content/maps';
import type {
  AnalysisResult,
  BatchStatistics,
  MapDocument,
  MapGraph,
  SimulationState,
  TileType,
} from '../core/types';
import type { MapCoordinate, MapProfileId, QualityTargets } from '../core/agentTypes';
import { cloneDocumentV2, liftV1Map, type MapDocumentV2 } from '../core/documentV2';
import { createPortableMapV2, parsePortableMapV2 } from '../core/portableV2';

const STORAGE_LAYOUT = 'cs3v3-layout';
const STORAGE_TAB = 'cs3v3-tab';
const STORAGE_AGENT_META = 'cs3v3-agent-meta';
const STORAGE_V2 = 'csmap-layout-v2';
export type AppTab =
  'lab' | 'layers' | 'agent' | 'search' | 'playtest' | 'guide' | 'themes' | 'permafrost';
export type Overlay = 'plain' | 'race' | 'sight' | 'deaths';
export interface AgentMetadata {
  name: string;
  notes?: string;
  profile: MapProfileId;
  targets?: Partial<QualityTargets>;
}

interface HistoryState {
  map: MapDocument;
  undo: MapDocument[];
  redo: MapDocument[];
}
type HistoryAction =
  | { type: 'commit'; map: MapDocument }
  | { type: 'replace'; map: MapDocument }
  | { type: 'undo' }
  | { type: 'redo' };

interface LayerHistoryState {
  document: MapDocumentV2;
  undo: MapDocumentV2[];
  redo: MapDocumentV2[];
}
type LayerHistoryAction =
  { type: 'commit'; document: MapDocumentV2 } | { type: 'undo' } | { type: 'redo' };

function reducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'undo' && state.undo.length)
    return {
      map: state.undo.at(-1)!,
      undo: state.undo.slice(0, -1),
      redo: [cloneMap(state.map), ...state.redo].slice(0, 80),
    };
  if (action.type === 'redo' && state.redo.length)
    return {
      map: state.redo[0],
      undo: [...state.undo, cloneMap(state.map)].slice(-80),
      redo: state.redo.slice(1),
    };
  if (action.type === 'commit')
    return { map: action.map, undo: [...state.undo, cloneMap(state.map)].slice(-80), redo: [] };
  if (action.type === 'replace') return { map: action.map, undo: state.undo, redo: state.redo };
  return state;
}

function initialMap(): MapDocument {
  try {
    const saved = localStorage.getItem(STORAGE_LAYOUT);
    return saved ? decodeMap(saved) : sampleMap();
  } catch {
    return sampleMap();
  }
}

function initialLayeredDocument(fallback: MapDocumentV2): MapDocumentV2 {
  try {
    const saved = localStorage.getItem(STORAGE_V2);
    return saved ? parsePortableMapV2(JSON.parse(saved)).document : fallback;
  } catch {
    return fallback;
  }
}

function layeredReducer(state: LayerHistoryState, action: LayerHistoryAction): LayerHistoryState {
  if (action.type === 'commit')
    return {
      document: action.document,
      undo: [...state.undo, cloneDocumentV2(state.document)].slice(-80),
      redo: [],
    };
  if (action.type === 'undo' && state.undo.length)
    return {
      document: state.undo.at(-1)!,
      undo: state.undo.slice(0, -1),
      redo: [cloneDocumentV2(state.document), ...state.redo].slice(0, 80),
    };
  if (action.type === 'redo' && state.redo.length)
    return {
      document: state.redo[0],
      undo: [...state.undo, cloneDocumentV2(state.document)].slice(-80),
      redo: state.redo.slice(1),
    };
  return state;
}

interface AppContextValue {
  map: MapDocument;
  graph: MapGraph;
  analysis: AnalysisResult;
  tab: AppTab;
  setTab(tab: AppTab): void;
  overlay: Overlay;
  setOverlay(overlay: Overlay): void;
  tool: TileType;
  setTool(tool: TileType): void;
  brushSize: number;
  setBrushSize(size: number): void;
  shape: 'brush' | 'rect';
  setShape(shape: 'brush' | 'rect'): void;
  batch: BatchStatistics | null;
  setBatch(value: BatchStatistics | null): void;
  live: SimulationState | null;
  setLive(value: SimulationState | null): void;
  commitMap(map: MapDocument): void;
  replaceStroke(map: MapDocument): void;
  resize(width: number, height: number): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
  cancelSimulation(message?: string): void;
  registerBatch(controller: AbortController): void;
  releaseBatch(controller: AbortController): void;
  toast: string;
  showToast(message: string): void;
  agentMetadata: AgentMetadata;
  setAgentMetadata(value: AgentMetadata): void;
  highlightedCells: number[];
  setHighlightedCells(value: number[]): void;
  layeredDocument: MapDocumentV2;
  commitLayeredDocument(document: MapDocumentV2): void;
  undoLayered(): void;
  redoLayered(): void;
  canUndoLayered: boolean;
  canRedoLayered: boolean;
  layeredHighlights: MapCoordinate[];
  setLayeredHighlights(value: MapCoordinate[]): void;
  layeredLevelId: string;
  setLayeredLevelId(value: string): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [history, dispatch] = useReducer(reducer, undefined, () => ({
    map: initialMap(),
    undo: [],
    redo: [],
  }));
  const [layeredHistory, dispatchLayered] = useReducer(layeredReducer, undefined, () => ({
    document: initialLayeredDocument(liftV1Map(history.map)),
    undo: [],
    redo: [],
  }));
  const [tab, setTabState] = useState<AppTab>(() => {
    const saved = localStorage.getItem(STORAGE_TAB);
    return saved === 'layers' ||
      saved === 'agent' ||
      saved === 'search' ||
      saved === 'playtest' ||
      saved === 'guide' ||
      saved === 'themes' ||
      saved === 'permafrost'
      ? saved
      : 'lab';
  });
  const [layeredLevelId, setLayeredLevelId] = useState(layeredHistory.document.levels[0].id);
  const [agentMetadata, setAgentMetadata] = useState<AgentMetadata>(() => {
    try {
      const value = JSON.parse(
        localStorage.getItem(STORAGE_AGENT_META) ?? 'null',
      ) as AgentMetadata | null;
      if (value && (value.profile === 'two-site-3v3' || value.profile === 'one-site-3v3'))
        return value;
    } catch {
      /* use defaults */
    }
    return { name: 'Untitled map', profile: 'two-site-3v3' };
  });
  const [highlightedCells, setHighlightedCells] = useState<number[]>([]);
  const [layeredHighlights, setLayeredHighlights] = useState<MapCoordinate[]>([]);
  const [overlay, setOverlay] = useState<Overlay>('race');
  const [tool, setTool] = useState<TileType>(1);
  const [brushSize, setBrushSize] = useState(1);
  const [shape, setShape] = useState<'brush' | 'rect'>('brush');
  const [batch, setBatch] = useState<BatchStatistics | null>(null);
  const [live, setLive] = useState<SimulationState | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const batchController = useRef<AbortController | null>(null);
  const graph = useMemo(() => buildGraph(history.map), [history.map]);
  const analysis = useMemo(() => analyzeMap(graph), [graph]);

  useEffect(() => {
    localStorage.setItem(STORAGE_LAYOUT, encodeMap(history.map));
  }, [history.map]);
  useEffect(() => {
    localStorage.setItem(
      STORAGE_V2,
      JSON.stringify(
        createPortableMapV2(layeredHistory.document, {
          name: agentMetadata.name,
          profile: agentMetadata.profile,
          notes: agentMetadata.notes,
          designTargets: agentMetadata.targets,
        }),
      ),
    );
  }, [agentMetadata, layeredHistory.document]);
  useEffect(() => {
    localStorage.setItem(STORAGE_TAB, tab);
  }, [tab]);
  useEffect(() => {
    localStorage.setItem(STORAGE_AGENT_META, JSON.stringify(agentMetadata));
  }, [agentMetadata]);
  const showToast = (message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  };
  const cancelSimulation = (message?: string) => {
    if (batchController.current) {
      batchController.current.abort();
      batchController.current = null;
      if (message) showToast(message);
    }
    setLive(null);
  };
  const prepareEdit = () => {
    cancelSimulation('Simulation cancelled because the layout changed.');
    setBatch(null);
  };
  const commitMap = (map: MapDocument) => {
    prepareEdit();
    dispatch({ type: 'commit', map });
  };
  const replaceStroke = (map: MapDocument) => {
    dispatch({ type: 'replace', map });
  };
  const undo = () => {
    if (!history.undo.length) return;
    prepareEdit();
    dispatch({ type: 'undo' });
  };
  const redo = () => {
    if (!history.redo.length) return;
    prepareEdit();
    dispatch({ type: 'redo' });
  };
  const setTab = (value: AppTab) => setTabState(value);
  const value: AppContextValue = {
    map: history.map,
    graph,
    analysis,
    tab,
    setTab,
    overlay,
    setOverlay,
    tool,
    setTool,
    brushSize,
    setBrushSize,
    shape,
    setShape,
    batch,
    setBatch,
    live,
    setLive,
    commitMap,
    replaceStroke,
    resize: (width, height) => commitMap(resizeMap(history.map, width, height)),
    undo,
    redo,
    canUndo: Boolean(history.undo.length),
    canRedo: Boolean(history.redo.length),
    cancelSimulation,
    registerBatch: (controller) => {
      batchController.current?.abort();
      batchController.current = controller;
    },
    releaseBatch: (controller) => {
      if (batchController.current === controller) batchController.current = null;
    },
    toast,
    showToast,
    agentMetadata,
    setAgentMetadata,
    highlightedCells,
    setHighlightedCells,
    layeredDocument: layeredHistory.document,
    commitLayeredDocument: (document) => {
      prepareEdit();
      dispatchLayered({ type: 'commit', document });
    },
    undoLayered: () => {
      if (!layeredHistory.undo.length) return;
      prepareEdit();
      dispatchLayered({ type: 'undo' });
    },
    redoLayered: () => {
      if (!layeredHistory.redo.length) return;
      prepareEdit();
      dispatchLayered({ type: 'redo' });
    },
    canUndoLayered: Boolean(layeredHistory.undo.length),
    canRedoLayered: Boolean(layeredHistory.redo.length),
    layeredHighlights,
    setLayeredHighlights,
    layeredLevelId,
    setLayeredLevelId,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
