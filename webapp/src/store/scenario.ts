import { create } from 'zustand';
import type { ScenarioConfig, ScenarioIndexEntry } from '@/types/scenario';
import { loadIndex, loadScenario, MissingDataError } from '@/lib/data';
import { big } from '@/lib/big';
import { prepareRoads } from '@/lib/impact';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

interface ScenarioState {
  index: ScenarioIndexEntry[];
  indexStatus: LoadStatus;
  currentId: string | null;
  status: LoadStatus;
  error: string | null;
  config: ScenarioConfig | null;
  /** Bumps when big.scenario changes. */
  version: number;
  refreshIndex: () => Promise<void>;
  select: (id: string) => Promise<void>;
}

let loadToken = 0;

export const useScenario = create<ScenarioState>((set, get) => ({
  index: [],
  indexStatus: 'idle',
  currentId: null,
  status: 'idle',
  error: null,
  config: null,
  version: 0,

  refreshIndex: async () => {
    if (get().indexStatus !== 'ready') set({ indexStatus: 'loading' });
    try {
      const index = await loadIndex();
      set({ index, indexStatus: 'ready' });
      if (!get().currentId && index.length) {
        const pref = index.find((e) => e.id === 'tehri') ?? index[0];
        void get().select(pref.id);
      }
    } catch (e) {
      set({ indexStatus: e instanceof MissingDataError ? 'missing' : 'error', error: String(e instanceof Error ? e.message : e) });
    }
  },

  select: async (id) => {
    const token = ++loadToken;
    set({ currentId: id, status: 'loading', error: null });
    try {
      const s = await loadScenario(id);
      if (token !== loadToken) return;
      big.scenario = s;
      big.roads = prepareRoads(s.exposure.roads, { bbox: s.config.bbox, grid: s.config.grid });
      big.places = [];
      set((st) => ({ status: 'ready', config: s.config, version: st.version + 1 }));
    } catch (e) {
      if (token !== loadToken) return;
      set({ status: e instanceof MissingDataError ? 'missing' : 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
