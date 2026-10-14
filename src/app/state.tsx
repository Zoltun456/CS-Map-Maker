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

const STORAGE_LAYOUT = 'cs3v3-layout';
const STORAGE_TAB = 'cs3v3-tab';
export type AppTab = 'lab' | 'guide' | 'themes' | 'permafrost';
export type Overlay = 'plain' | 'race' | 'sight' | 'deaths';

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
  registerBatch(controller: AbortController | null): void;
  toast: string;
  showToast(message: string): void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [history, dispatch] = useReducer(reducer, undefined, () => ({
    map: initialMap(),
    undo: [],
    redo: [],
  }));
  const [tab, setTabState] = useState<AppTab>(() => {
    const saved = localStorage.getItem(STORAGE_TAB);
    return saved === 'guide' || saved === 'themes' || saved === 'permafrost' ? saved : 'lab';
  });
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
    localStorage.setItem(STORAGE_TAB, tab);
  }, [tab]);
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
      batchController.current = controller;
    },
    toast,
    showToast,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
