// Shared world data for the render test.
//
// One definition, five renderers. Everything below is in metres, x east, y south,
// origin at the top-left of the slice. Anything with `height` is a solid that both
// blocks movement and casts shadow.

export const WORLD = { w: 26, h: 19 };

// kind drives colour and material choices in each renderer
export const BOXES = [
  // --- the house, north side. Walls modelled separately so you can get inside ---
  { kind: 'wall', x: 3, y: 1, w: 12, h: 0.4, height: 3.0 },          // back wall
  { kind: 'wall', x: 3, y: 1, w: 0.4, h: 6, height: 3.0 },           // west wall
  { kind: 'wall', x: 14.6, y: 1, w: 0.4, h: 6, height: 3.0 },        // east wall
  { kind: 'wall', x: 3, y: 6.6, w: 4.4, h: 0.4, height: 3.0 },       // front wall, left of window
  { kind: 'window', x: 7.4, y: 6.6, w: 2.2, h: 0.4, height: 3.0 },   // kitchen window
  { kind: 'wall', x: 9.6, y: 6.6, w: 1.6, h: 0.4, height: 3.0 },     // front wall, right of window
  { kind: 'door', x: 11.2, y: 6.6, w: 1.4, h: 0.4, height: 3.0 },    // back door + cat flap
  { kind: 'wall', x: 12.6, y: 6.6, w: 2.4, h: 0.4, height: 3.0 },    // front wall, right of door

  // --- kitchen furniture ---
  { kind: 'counter', x: 3.6, y: 1.6, w: 4.5, h: 1.0, height: 0.9 },
  { kind: 'fridge', x: 12.4, y: 1.6, w: 1.6, h: 1.2, height: 1.9 },

  // --- garden boundary ---
  { kind: 'fence', x: 0, y: 17.4, w: 11, h: 0.25, height: 1.8 },     // south fence, left
  { kind: 'fence', x: 13, y: 17.4, w: 13, h: 0.25, height: 1.8 },    // south fence, right
  //  gap x=11..13 is the loose panel — the way through
  { kind: 'fence', x: 0, y: 7, w: 0.25, h: 10.6, height: 1.8 },      // west fence
  { kind: 'fence', x: 25.75, y: 7, w: 0.25, h: 10.6, height: 1.8 },  // east fence

  // --- garden clutter ---
  { kind: 'shed', x: 19.5, y: 12.5, w: 3.2, h: 2.6, height: 2.2 },
  { kind: 'bin', x: 4.6, y: 11.0, w: 1.1, h: 1.1, height: 1.2 },
  { kind: 'bin', x: 6.0, y: 11.2, w: 1.1, h: 1.1, height: 1.2 },
  { kind: 'hedge', x: 16.5, y: 8.2, w: 6.0, h: 1.1, height: 1.5 },
  { kind: 'hedge', x: 0.6, y: 14.5, w: 3.4, h: 1.1, height: 1.5 },
  { kind: 'compost', x: 22.0, y: 15.6, w: 2.2, h: 1.6, height: 1.0 },
  { kind: 'lamp', x: 24.0, y: 9.0, w: 0.3, h: 0.3, height: 4.2 },
];

// Ground patches. Purely visual + a surface-noise value for the stealth read.
export const GROUND = [
  { kind: 'floor', x: 3.4, y: 1.4, w: 11.2, h: 5.2, noise: 0.75 },   // kitchen lino
  { kind: 'patio', x: 3, y: 7, w: 12, h: 2.6, noise: 0.45 },
  { kind: 'gravel', x: 15, y: 7, w: 3.2, h: 10.4, noise: 1.0 },      // the loud path
  { kind: 'soil', x: 8.5, y: 12.5, w: 4.0, h: 3.0, noise: 0.2 },     // diggable
];

// Lights. `cone` is [facing radians, half-angle radians] for directional ones.
export const LIGHTS = [
  { id: 'kitchen', x: 9.0, y: 3.6, z: 2.6, r: 9.5, color: '#ffd9a0', intensity: 1.0 },
  { id: 'spill',   x: 8.5, y: 7.6, z: 1.6, r: 7.0, color: '#ffcf90', intensity: 0.85,
    cone: [Math.PI / 2, 0.75] },                                      // out of the window
  { id: 'lamp',    x: 24.0, y: 9.0, z: 4.2, r: 9.0, color: '#cfe0ff', intensity: 0.7 },
  { id: 'pir',     x: 13.6, y: 7.2, z: 2.7, r: 12.0, color: '#ffffff', intensity: 1.25,
    cone: [Math.PI / 2, 0.55], pir: true },                           // security light, starts off
];

// Unlit ground multiplies down to this. Dark enough that light matters, light enough
// that you can still navigate — the balance the whole stealth read depends on.
export const AMBIENT = '#2c3c58';   // moonlit night

// The cat. Vision cone is the readability test that matters most.
export const CAT = { x: 20.5, y: 15.5, facing: Math.PI, coneRange: 7.0, coneHalf: 0.5 };

export const BADGER_START = { x: 11.9, y: 16.2 };  // just outside the loose fence panel

export const COLORS = {
  wall: '#7d6a5d', window: '#2f4a63', door: '#5d4a3c', counter: '#c9bfae',
  fridge: '#dfe4e6', fence: '#6b5540', shed: '#5a4a3a', bin: '#3f5b45',
  hedge: '#2f4a32', compost: '#4a3f30', lamp: '#4a4a52',
  grass: '#2c4230', floor: '#b9a894', patio: '#6e6a63', gravel: '#8a8579', soil: '#4a3a2c',
};

// Axis-aligned solids only, so collision is a rectangle test.
export function collides(x, y, radius) {
  for (const b of BOXES) {
    if (b.kind === 'window') continue;              // you can't fit, but it doesn't block sight
    if (x + radius > b.x && x - radius < b.x + b.w &&
        y + radius > b.y && y - radius < b.y + b.h) return true;
  }
  return x < radius || y < radius || x > WORLD.w - radius || y > WORLD.h - radius;
}

// Wall segments for 2D shadow casting. Boxes are grown by a hair so that segments
// which meet exactly at a corner overlap instead of touching — otherwise rays cast at
// the corner slip through the seam and light leaks out in a spike.
const CORNER_BLEED = 0.03;

export function occluders() {
  const segs = [];
  for (const b of BOXES) {
    if (b.kind === 'window') continue;              // light passes through
    const e = CORNER_BLEED;
    const x = b.x - e, y = b.y - e, w = b.w + e * 2, h = b.h + e * 2;
    segs.push([x, y, x + w, y], [x + w, y, x + w, y + h],
              [x + w, y + h, x, y + h], [x, y + h, x, y]);
  }
  return segs;
}

export function surfaceNoiseAt(x, y) {
  for (let i = GROUND.length - 1; i >= 0; i--) {
    const g = GROUND[i];
    if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) return g.noise;
  }
  return 0.1;                                        // grass
}
