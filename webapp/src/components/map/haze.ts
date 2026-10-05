// Atmospheric haze for the 3D terrain: fragments fade toward a sky colour with distance from the
// camera. Distance is the clip-space w (view depth) normalised by the viewport height, so the effect
// is the same at every zoom level: close terrain stays crisp, the horizon softens.

import { LayerExtension, type Layer } from '@deck.gl/core';

export interface HazeOptions {
  /** Haze colour, 0–1 RGB. */
  color: [number, number, number];
  /** Maximum blend, 0–1. */
  strength: number;
}

const f = (x: number) => x.toFixed(4);

export class HazeExtension extends LayerExtension<HazeOptions> {
  static extensionName = 'HazeExtension';

  constructor(opts: HazeOptions) {
    super(opts);
  }

  getShaders(this: Layer, extension: HazeExtension) {
    const { color, strength } = extension.opts;
    return {
      inject: {
        'vs:#decl': 'out float haze_dist;',
        'vs:DECKGL_FILTER_GL_POSITION': `
  haze_dist = position.w / max(1.0, project.viewportSize.y / project.devicePixelRatio);
`,
        'fs:#decl': 'in float haze_dist;',
        'fs:DECKGL_FILTER_COLOR': `
  float haze_f = smoothstep(1.9, 7.5, haze_dist) * ${f(strength)};
  color.rgb = mix(color.rgb, vec3(${f(color[0])}, ${f(color[1])}, ${f(color[2])}), haze_f);
`,
      },
    };
  }
}
