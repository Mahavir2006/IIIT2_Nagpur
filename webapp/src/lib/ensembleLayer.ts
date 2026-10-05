// Ensemble probability-of-inundation raster (fraction of members with peak depth >= 0.3 m),
// draped on terrain exactly like the flood layer in components/map/MapView.tsx.
import type { Layer } from '@deck.gl/core';
import { BitmapLayer } from '@deck.gl/layers';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import type { ScenarioConfig } from '@/types/scenario';
import { ensembleBig } from '@/store/ensemble';
import { probPixels, type EnsembleAggregate } from './ensemble';

const TERRAIN = new TerrainExtension();
let cache: { agg: EnsembleAggregate; image: ImageData } | null = null;

export function buildEnsembleLayer(cfg: ScenarioConfig, visible: boolean): Layer | null {
  const agg = ensembleBig.agg;
  if (!visible || !agg || ensembleBig.cfgId !== cfg.id || typeof ImageData === 'undefined') return null;
  if (agg.cols !== cfg.grid.cols || agg.rows !== cfg.grid.rows) return null;
  if (!cache || cache.agg !== agg) {
    cache = { agg, image: new ImageData(probPixels(agg.prob) as Uint8ClampedArray<ArrayBuffer>, agg.cols, agg.rows) };
  }
  return new BitmapLayer({
    id: `ensemble-prob-${cfg.id}`,
    image: cache.image,
    bounds: cfg.bbox,
    opacity: 0.85,
    pickable: false,
    textureParameters: { minFilter: 'nearest', magFilter: 'nearest' },
    extensions: [TERRAIN],
  }) as unknown as Layer;
}
