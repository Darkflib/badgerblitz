// Render test harness: same world, same simulation, five ways of drawing it.

import { BADGER_START, CAT, LIGHTS, collides, surfaceNoiseAt } from './scene.js';
import { render2D, illuminationAt, hasLineOfSight } from './r2d.js';
import { Renderer3D } from './r3d.js';

const MODES = {
  topdown:      { label: '2D — straight down',  kind: '2d', note: 'Cheapest art and the clearest read of light, cones and routes. The badger is fine from above — it is the architecture that vanishes, since walls, fences and hedges all flatten into coloured rectangles.' },
  threequarter: { label: '2.5D — 3/4 sprites',  kind: '2d', note: 'Tilted sprite view with y-sorted extrusion. Buildings gain mass, but tall thin things (fences, walls) become slabs that hide the garden behind them — you would need wall-fading. Costs 8 directions of art per animation.' },
  iso:          { label: 'Isometric',           kind: '2d', note: 'Architecture reads best of the 2D options. Two costs: the house and shed occlude a lot of playfield, and WASD no longer matches the screen axes (input here is rotated 45° to compensate).' },
  ortho3d:      { label: '3D — orthographic',   kind: '3d', note: 'Real geometry, real shadow maps. Visually this converges with isometric — the difference is the assets, not the camera. Foreground walls occlude just as badly, but here you can fade or cull them per-object.' },
  persp3d:      { label: '3D — perspective',    kind: '3d', note: 'The badger reads best here, and light spill looks great — but you lose the overview a stealth game needs. Pull the camera back far enough to see the cat and it becomes the orthographic view.' },
};

const state = {
  badger: { x: BADGER_START.x, y: BADGER_START.y, facing: -Math.PI / 2, vx: 0, vy: 0 },
  cat: { ...CAT },
  sneaking: false, pirOn: false, pirTimer: 0, spotted: false,
  spriteBadger: false, mode: 'threequarter',
  illumination: 0, sneakScore: 1, surface: 0.1,
};

const keys = new Set();
addEventListener('keydown', e => {
  if (['w','a','s','d','shift',' '].includes(e.key.toLowerCase())) e.preventDefault();
  keys.add(e.key.toLowerCase());
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

const c2d = document.getElementById('c2d');
const c3d = document.getElementById('c3d');
const stage = document.getElementById('stage');
let r3d = null;

function lightsNow() {
  return LIGHTS.map(L => ({ ...L, off: L.pir ? !state.pirOn : false }));
}

// Can the cat actually see the badger? Cone + range + line of sight, using the same
// occluders the lights use. Illumination raises the odds; sneaking lowers them.
function catSees() {
  const dx = state.badger.x - state.cat.x, dy = state.badger.y - state.cat.y;
  const dist = Math.hypot(dx, dy);
  if (dist > state.cat.coneRange) return false;

  const a = Math.atan2(dy, dx);
  const d = Math.atan2(Math.sin(a - state.cat.facing), Math.cos(a - state.cat.facing));
  if (Math.abs(d) > state.cat.coneHalf) return false;

  if (!hasLineOfSight(state.cat.x, state.cat.y, state.badger.x, state.badger.y)) return false;

  // Closer targets are easier to spot, so the sneak score has to clear a higher bar
  // the nearer you are. One number, same one the HUD shows.
  const threshold = 0.35 + (1 - dist / state.cat.coneRange) * 0.4;
  return state.sneakScore < threshold;
}

function step(dt) {
  const sneak = keys.has('shift');
  state.sneaking = sneak;
  const speed = (sneak ? 2.1 : 4.6) * dt;
  let mx = 0, my = 0;
  if (keys.has('w')) my -= 1;
  if (keys.has('s')) my += 1;
  if (keys.has('a')) mx -= 1;
  if (keys.has('d')) mx += 1;

  // Isometric input is rotated 45° so "up" means up the screen, not up the world grid.
  if (state.mode === 'iso' && (mx || my)) {
    const a = Math.atan2(my, mx) + Math.PI / 4;
    const m = Math.hypot(mx, my);
    mx = Math.cos(a) * m; my = Math.sin(a) * m;
  }

  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len; my /= len;
    state.badger.facing = Math.atan2(my, mx);
    const nx = state.badger.x + mx * speed;
    const ny = state.badger.y + my * speed;
    if (!collides(nx, state.badger.y, 0.42)) state.badger.x = nx;
    if (!collides(state.badger.x, ny, 0.42)) state.badger.y = ny;
  }
  state.moving = len > 0;

  // PIR floodlight: trips on the gravel path, holds for a few seconds.
  const onGravel = state.badger.x > 15 && state.badger.x < 18.2 && state.badger.y > 7 && state.badger.y < 17.4;
  if (onGravel && state.moving) state.pirTimer = 4.0;
  state.pirTimer = Math.max(0, state.pirTimer - dt);
  state.pirOn = state.pirTimer > 0;

  state.illumination = illuminationAt(state.badger.x, state.badger.y, lightsNow());
  state.surface = surfaceNoiseAt(state.badger.x, state.badger.y);

  // The sneak score from the tech plan. One number, drives the bar and the AI alike.
  const speedPen = state.moving ? (sneak ? 0.10 : 0.30) : 0;
  const surfacePen = state.surface * (state.moving ? 0.30 : 0.05);
  state.sneakScore = Math.max(0, Math.min(1,
    1 - speedPen - surfacePen - state.illumination * 0.45));

  state.spotted = catSees();
}

let last = performance.now(), fps = 0, acc = 0, frames = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt; frames++;
  if (acc > 0.4) { fps = frames / acc; acc = 0; frames = 0; }

  step(dt);
  const m = MODES[state.mode];
  if (m.kind === '2d') {
    c2d.style.display = ''; c3d.style.display = 'none';
    render2D(c2d, state.mode, state);
  } else {
    c2d.style.display = 'none'; c3d.style.display = '';
    if (!r3d) r3d = new Renderer3D(c3d);
    r3d.render(state.mode, state);
  }
  updateHud(fps);
  requestAnimationFrame(loop);
}

const el = id => document.getElementById(id);
function updateHud(fps) {
  el('bar-sneak').style.width = (state.sneakScore * 100).toFixed(0) + '%';
  el('bar-sneak').style.background = state.sneakScore > 0.7 ? '#6fd18a'
    : state.sneakScore > 0.45 ? '#e0c15a' : '#e0674a';
  el('bar-light').style.width = (state.illumination * 100).toFixed(0) + '%';
  el('v-surface').textContent = state.surface < 0.25 ? 'grass / soil (quiet)'
    : state.surface < 0.5 ? 'patio (some noise)'
    : state.surface < 0.8 ? 'lino (squeaky)' : 'gravel (loud)';
  el('v-pir').textContent = state.pirOn ? 'TRIGGERED' : 'idle';
  el('v-pir').className = state.pirOn ? 'val alarm' : 'val';
  el('v-seen').textContent = state.spotted ? 'THE CAT HAS SEEN YOU' : 'unnoticed';
  el('v-seen').className = state.spotted ? 'val alarm' : 'val good';
  el('v-fps').textContent = fps.toFixed(0);
  el('stagenote').textContent = MODES[state.mode].note;
  el('sprite-row').style.display = MODES[state.mode].kind === '3d' ? '' : 'none';
}

// --- mode buttons -----------------------------------------------------------
const bar = el('modes');
for (const [key, m] of Object.entries(MODES)) {
  const b = document.createElement('button');
  b.textContent = m.label;
  b.dataset.mode = key;
  b.className = key === state.mode ? 'active' : '';
  b.onclick = () => {
    state.mode = key;
    [...bar.children].forEach(x => x.className = x.dataset.mode === key ? 'active' : '');
  };
  bar.appendChild(b);
}
el('spriteToggle').onchange = e => { state.spriteBadger = e.target.checked; };

requestAnimationFrame(loop);
