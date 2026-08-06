// Canvas2D renderers: straight-down, 3/4 "fake 3D", and isometric.
//
// All three share one lighting model: 2D visibility polygons cast from each light
// against the same wall segments used for collision. This is the technique the tech
// plan proposes, so it's implemented for real here rather than faked with gradients.
//
// All three also use a follow camera at a comparable zoom, so the badger occupies the
// same fraction of the screen in every mode and the comparison is honest.

import { BOXES, GROUND, LIGHTS, COLORS, AMBIENT, WORLD, occluders } from './scene.js';

const SEGS = occluders();
const EPS = 0.00015;

// ---------------------------------------------------------------- projections

export const PROJ = {
  topdown:      { scale: 58, ySquash: 1.0,  zLift: 0.0,
    to(wx, wy) { return [wx * this.scale, wy * this.scale]; } },
  threequarter: { scale: 60, ySquash: 0.74, zLift: 0.55,
    to(wx, wy) { return [wx * this.scale, wy * this.scale * this.ySquash]; } },
  iso:          { scale: 44, ySquash: 1.0,  zLift: 0.60,
    to(wx, wy) { const s = this.scale; return [(wx - wy) * s * 0.88, (wx + wy) * s * 0.5]; } },
};

// ------------------------------------------------------------------ lighting

// Nearest hit of ray (ox,oy)+t*(dx,dy) against all wall segments, capped at maxT.
function castRay(ox, oy, dx, dy, maxT) {
  let best = maxT;
  for (let i = 0; i < SEGS.length; i++) {
    const [ax, ay, bx, by] = SEGS[i];
    const sx = bx - ax, sy = by - ay;
    const denom = dx * sy - dy * sx;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((ax - ox) * sy - (ay - oy) * sx) / denom;
    const u = ((ax - ox) * dy - (ay - oy) * dx) / denom;
    if (t > 0 && t < best && u >= 0 && u <= 1) best = t;
  }
  return best;
}

// Visibility polygon in world space. `cone` = [facing, halfAngle] or null.
export function visibilityPolygon(lx, ly, radius, cone) {
  const angles = [];
  if (cone) angles.push(cone[0] - cone[1] + EPS, cone[0] + cone[1] - EPS);
  for (const s of SEGS) {
    for (const [px, py] of [[s[0], s[1]], [s[2], s[3]]]) {
      const dx = px - lx, dy = py - ly;
      if (dx * dx + dy * dy > radius * radius * 1.6) continue;
      const a = Math.atan2(dy, dx);
      angles.push(a - EPS, a, a + EPS);
    }
  }
  if (!cone) for (let i = 0; i < 12; i++) angles.push((i / 12) * Math.PI * 2 - Math.PI);

  const pts = [];
  for (let a of angles) {
    if (cone) {
      const d = Math.atan2(Math.sin(a - cone[0]), Math.cos(a - cone[0]));
      if (Math.abs(d) > cone[1]) continue;
      a = cone[0] + d;
    }
    const dx = Math.cos(a), dy = Math.sin(a);
    const t = castRay(lx, ly, dx, dy, radius);
    pts.push({ a, x: lx + dx * t, y: ly + dy * t });
  }
  pts.sort((p, q) => p.a - q.a);
  if (cone) pts.unshift({ a: -Infinity, x: lx, y: ly });   // close the wedge on the source
  return pts;
}

// Polygons are static unless a light switches on or off, so cache them by that key.
// Recomputing four of these every frame was what pinned the demo at 20fps.
const polyCache = new Map();
function polygonFor(L) {
  const key = L.id + ':' + (L.off ? 0 : 1);
  let p = polyCache.get(key);
  if (!p) { p = visibilityPolygon(L.x, L.y, L.r, L.cone || null); polyCache.set(key, p); }
  return p;
}

// How lit is this world point? Analytic — no pixel readback. Matches what you see.
export function illuminationAt(wx, wy, lights) {
  let total = 0;
  for (const L of lights) {
    if (L.off) continue;
    const dx = wx - L.x, dy = wy - L.y;
    const dist = Math.hypot(dx, dy);
    if (dist > L.r) continue;
    if (L.cone) {
      const a = Math.atan2(dy, dx);
      const d = Math.atan2(Math.sin(a - L.cone[0]), Math.cos(a - L.cone[0]));
      if (Math.abs(d) > L.cone[1]) continue;
    }
    if (dist > 0.001 && castRay(L.x, L.y, dx / dist, dy / dist, dist) < dist - 0.02) continue;
    total += L.intensity * (1 - dist / L.r);
  }
  return Math.min(1, total);
}

// Is there a clear line between two world points? Same occluders as the lighting,
// so what the cat can see and what you can see are guaranteed to agree.
export function hasLineOfSight(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const d = Math.hypot(dx, dy);
  if (d < 0.001) return true;
  return castRay(ax, ay, dx / d, dy / d, d) >= d - 0.02;
}

function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

const lightBuf = document.createElement('canvas');
const groundBuf = document.createElement('canvas');

function renderLightBuffer(w, h, proj, lights, ox, oy) {
  if (lightBuf.width !== w || lightBuf.height !== h) { lightBuf.width = w; lightBuf.height = h; }
  const c = lightBuf.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = AMBIENT;
  c.fillRect(0, 0, w, h);
  c.save();
  c.translate(ox, oy);
  c.globalCompositeOperation = 'lighter';

  for (const L of lights) {
    if (L.off) continue;
    const poly = polygonFor(L);
    if (poly.length < 3) continue;
    const [cx, cy] = proj.to(L.x, L.y);
    const [ex] = proj.to(L.x + L.r, L.y);
    const rad = Math.max(8, Math.abs(ex - cx));

    const g = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const [r, gg, b] = hexToRgb(L.color);
    const k = L.intensity * 1.25;
    g.addColorStop(0, `rgba(${Math.min(255, r * k) | 0},${Math.min(255, gg * k) | 0},${Math.min(255, b * k) | 0},1)`);
    g.addColorStop(0.5, `rgba(${r * k * 0.5 | 0},${gg * k * 0.5 | 0},${b * k * 0.5 | 0},1)`);
    g.addColorStop(1, 'rgba(0,0,0,1)');

    c.beginPath();
    poly.forEach((p, i) => {
      const [sx, sy] = proj.to(p.x, p.y);
      i ? c.lineTo(sx, sy) : c.moveTo(sx, sy);
    });
    c.closePath();
    c.fillStyle = g;
    c.fill();
  }
  c.restore();
  c.globalCompositeOperation = 'source-over';
  return lightBuf;
}

// ------------------------------------------------------------------- drawing

function shade(hex, mul) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.min(255, r * mul) | 0},${Math.min(255, g * mul) | 0},${Math.min(255, b * mul) | 0})`;
}

function poly(c, proj, corners) {
  c.beginPath();
  corners.forEach(([x, y], i) => { const [sx, sy] = proj.to(x, y); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); });
  c.closePath();
}

function drawGround(c, proj) {
  c.fillStyle = COLORS.grass;
  poly(c, proj, [[0, 0], [WORLD.w, 0], [WORLD.w, WORLD.h], [0, WORLD.h]]);
  c.fill();
  for (const g of GROUND) {
    c.fillStyle = COLORS[g.kind];
    poly(c, proj, [[g.x, g.y], [g.x + g.w, g.y], [g.x + g.w, g.y + g.h], [g.x, g.y + g.h]]);
    c.fill();
  }
}

// An extruded box: top face plus whichever side faces point at the viewer.
function drawPrism(c, proj, b, mode, lit) {
  const base = COLORS[b.kind] || '#888';
  const lift = b.height * proj.scale * proj.zLift;
  const P = (x, y) => proj.to(x, y);
  const top = shade(base, 0.5 + lit * 1.0);
  const side = shade(base, 0.30 + lit * 0.62);
  const front = shade(base, 0.40 + lit * 0.80);

  if (mode === 'topdown') {
    c.fillStyle = top;
    poly(c, proj, [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]);
    c.fill();
    return;
  }

  const c00 = P(b.x, b.y), c10 = P(b.x + b.w, b.y);
  const c11 = P(b.x + b.w, b.y + b.h), c01 = P(b.x, b.y + b.h);
  const up = (p) => [p[0], p[1] - lift];

  const faces = mode === 'iso'
    ? [[c01, c11, front], [c11, c10, side]]   // south-west and south-east faces
    : [[c01, c11, front], [c11, c10, side]];  // 3/4 shows the south face plus a sliver

  for (const [a, bb, fill] of faces) {
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(a[0], a[1]); c.lineTo(bb[0], bb[1]);
    c.lineTo(...up(bb)); c.lineTo(...up(a));
    c.closePath(); c.fill();
  }

  c.fillStyle = top;
  c.beginPath();
  [c00, c10, c11, c01].forEach((p, i) => { const q = up(p); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); });
  c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 1; c.stroke();
}

function drawBadger(c, proj, bx, by, facing, mode, lit, sneaking) {
  const [sx, sy] = proj.to(bx, by);
  const s = proj.scale;
  const lift = mode === 'topdown' ? 0 : s * 0.34 * proj.zLift;
  c.save();
  c.translate(sx, sy - lift);

  c.save();                                            // contact shadow stays on the ground
  c.translate(0, lift);
  if (mode !== 'topdown') c.scale(1, proj.ySquash);
  c.fillStyle = 'rgba(0,0,0,0.42)';
  c.beginPath(); c.ellipse(0, 0, s * 0.46, s * 0.32, 0, 0, 7); c.fill();
  c.restore();

  c.rotate(mode === 'iso' ? facing - Math.PI / 4 : facing);
  if (mode !== 'topdown') c.scale(1, proj.ySquash + 0.20);

  const body = shade('#55555c', 0.55 + lit * 0.85);
  const pale = shade('#eceae4', 0.55 + lit * 0.85);
  const dark = shade('#17171c', 0.7 + lit * 0.9);

  c.fillStyle = body;                                  // body
  c.beginPath(); c.ellipse(-s * 0.05, 0, s * 0.42, s * 0.27, 0, 0, 7); c.fill();

  c.fillStyle = pale;                                  // head + the face that makes it a badger
  c.beginPath(); c.ellipse(s * 0.36, 0, s * 0.23, s * 0.18, 0, 0, 7); c.fill();
  c.fillStyle = dark;
  c.beginPath(); c.ellipse(s * 0.40, -s * 0.09, s * 0.20, s * 0.048, 0, 0, 7); c.fill();
  c.beginPath(); c.ellipse(s * 0.40, s * 0.09, s * 0.20, s * 0.048, 0, 0, 7); c.fill();
  c.beginPath(); c.arc(s * 0.56, 0, s * 0.05, 0, 7); c.fill();
  c.fillStyle = pale;                                  // ears
  c.beginPath(); c.arc(s * 0.22, -s * 0.16, s * 0.055, 0, 7); c.fill();
  c.beginPath(); c.arc(s * 0.22, s * 0.16, s * 0.055, 0, 7); c.fill();

  if (sneaking) {
    c.strokeStyle = 'rgba(120,220,140,0.9)'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(0, 0, s * 0.54, s * 0.38, 0, 0, 7); c.stroke();
  }
  c.restore();
}

function drawCat(c, proj, cat, mode, lit) {
  const [sx, sy] = proj.to(cat.x, cat.y);
  const s = proj.scale;
  const lift = mode === 'topdown' ? 0 : s * 0.26 * proj.zLift;
  c.save();
  c.translate(sx, sy - lift);
  c.save();
  c.translate(0, lift);
  if (mode !== 'topdown') c.scale(1, proj.ySquash);
  c.fillStyle = 'rgba(0,0,0,0.36)';
  c.beginPath(); c.ellipse(0, 0, s * 0.30, s * 0.21, 0, 0, 7); c.fill();
  c.restore();
  c.rotate(mode === 'iso' ? cat.facing - Math.PI / 4 : cat.facing);
  if (mode !== 'topdown') c.scale(1, proj.ySquash + 0.20);
  c.fillStyle = shade('#4a4048', 0.6 + lit * 0.9);
  c.beginPath(); c.ellipse(-s * 0.04, 0, s * 0.28, s * 0.15, 0, 0, 7); c.fill();
  c.beginPath(); c.arc(s * 0.26, 0, s * 0.13, 0, 7); c.fill();
  c.beginPath(); c.moveTo(s * 0.20, -s * 0.13); c.lineTo(s * 0.26, -s * 0.25);
  c.lineTo(s * 0.32, -s * 0.11); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(s * 0.20, s * 0.13); c.lineTo(s * 0.26, s * 0.25);
  c.lineTo(s * 0.32, s * 0.11); c.closePath(); c.fill();
  c.fillStyle = '#a8e06a';                             // eyeshine, so you can find it in the dark
  c.beginPath(); c.arc(s * 0.33, -s * 0.05, s * 0.028, 0, 7); c.fill();
  c.beginPath(); c.arc(s * 0.33, s * 0.05, s * 0.028, 0, 7); c.fill();
  c.restore();
}

// The cat's cone, clipped by the same occluders as the lights — so it genuinely
// cannot see through the shed. This is the readability test that matters.
function drawVisionCone(c, proj, cat, alerted) {
  const pts = visibilityPolygon(cat.x, cat.y, cat.coneRange, [cat.facing, cat.coneHalf]);
  if (pts.length < 3) return;
  c.save();
  c.beginPath();
  pts.forEach((p, i) => { const [sx, sy] = proj.to(p.x, p.y); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); });
  c.closePath();
  c.fillStyle = alerted ? 'rgba(255,80,60,0.32)' : 'rgba(255,225,140,0.15)';
  c.fill();
  c.strokeStyle = alerted ? 'rgba(255,110,80,0.8)' : 'rgba(255,225,140,0.35)';
  c.lineWidth = 1.5; c.stroke();
  c.restore();
}

// ------------------------------------------------------------------ entry point

export function render2D(canvas, mode, state) {
  const proj = PROJ[mode];
  const host = canvas.parentElement;
  const w = Math.max(320, host.clientWidth), h = Math.max(240, host.clientHeight);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const lights = LIGHTS.map(L => ({ ...L, off: L.pir ? !state.pirOn : false }));
  const lit = (x, y) => illuminationAt(x, y, lights);

  // Follow camera, biased slightly so more of the world sits above the badger.
  const [fx, fy] = proj.to(state.badger.x, state.badger.y);
  const ox = w / 2 - fx, oy = h * 0.56 - fy;

  if (groundBuf.width !== w || groundBuf.height !== h) { groundBuf.width = w; groundBuf.height = h; }
  const gc = groundBuf.getContext('2d');
  gc.setTransform(1, 0, 0, 1, 0, 0);
  gc.fillStyle = '#05080f';
  gc.fillRect(0, 0, w, h);
  gc.save(); gc.translate(ox, oy);
  drawGround(gc, proj);
  if (mode === 'topdown') for (const b of BOXES) drawPrism(gc, proj, b, mode, 1);
  gc.restore();
  gc.globalCompositeOperation = 'multiply';
  gc.drawImage(renderLightBuffer(w, h, proj, lights, ox, oy), 0, 0);
  gc.globalCompositeOperation = 'source-over';
  ctx.drawImage(groundBuf, 0, 0, w, h);

  ctx.save();
  ctx.translate(ox, oy);
  drawVisionCone(ctx, proj, state.cat, state.spotted);

  // Depth sort: everything that stands up, painted back to front.
  const depth = (x, y) => mode === 'iso' ? x + y : y;
  const queue = [
    { d: depth(state.badger.x, state.badger.y) + 0.01,
      draw: () => drawBadger(ctx, proj, state.badger.x, state.badger.y, state.badger.facing,
                             mode, lit(state.badger.x, state.badger.y), state.sneaking) },
    { d: depth(state.cat.x, state.cat.y) + 0.01,
      draw: () => drawCat(ctx, proj, state.cat, mode, lit(state.cat.x, state.cat.y)) },
  ];
  if (mode !== 'topdown') {
    for (const b of BOXES) {
      queue.push({ d: depth(b.x + b.w, b.y + b.h),
        draw: () => drawPrism(ctx, proj, b, mode, lit(b.x + b.w / 2, b.y + b.h / 2)) });
    }
  }
  queue.sort((p, q) => p.d - q.d);
  for (const q of queue) q.draw();
  ctx.restore();
}
