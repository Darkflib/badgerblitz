// Gait lab. Tune the walk cycle in isolation, then check it reads at game camera size.

import * as THREE from '../vendor/three.module.min.js';
import { Badger, LEG_LEN } from './badger.js';
import { GAITS, LEGS, strideFrequency, gaitForSpeed } from './gait.js';

const HEX = (h) => new THREE.Color(h);
const el = (id) => document.getElementById(id);

const state = {
  speed: 1.4, gait: 'auto', sneaking: false, digging: false,
  timeScale: 1, camera: 'follow', silhouette: false, showStrip: true,
};

// ---------------------------------------------------------------------- scene

const canvas = el('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = HEX('#0a1019');
scene.fog = new THREE.Fog('#0a1019', 14, 42);

// A grid ground, so foot planting is visible rather than inferred.
function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#263a2c'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#31492f'; x.lineWidth = 3;
  x.strokeRect(0, 0, 128, 128);
  x.strokeStyle = '#2b4130'; x.lineWidth = 1;
  for (let i = 32; i < 128; i += 32) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(120, 120);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(240, 240),
  new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

scene.add(new THREE.AmbientLight(HEX('#2c3c58'), 0.9));
const key = new THREE.DirectionalLight(HEX('#ffd9a0'), 2.2);
key.position.set(4, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -4; key.shadow.camera.right = 4;
key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
key.shadow.bias = -0.002;
scene.add(key);
const rim = new THREE.DirectionalLight(HEX('#8fa8d8'), 0.7);
rim.position.set(-6, 3, -4);
scene.add(rim);

const badger = new Badger();
scene.add(badger.object3D);

const persp = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
const ortho = new THREE.OrthographicCamera(-3, 3, 2, -2, 0.1, 200);

// ------------------------------------------------------------- foot slip probe
//
// While a paw is in stance it should be motionless in world space. Comparing how far it
// actually moves against how far the body moved gives a direct read on whether the
// stride frequency matches the speed. Anything above a few percent reads as skating.

const pawWorld = badger.legs.map(() => new THREE.Vector3());
const pawPrev = badger.legs.map(() => null);
let slipAcc = 0, slipSamples = 0, slipShown = 0;

let slipMeasurable = true;

function measureSlip(poses, dt, travelled) {
  // Sampling between frames only means anything if a frame is short relative to the
  // stride. At 0.1s/frame a trotting leg can cross from stance into swing and back
  // inside one frame, and the "slip" reported is just the swing being sampled. Report
  // nothing rather than something wrong.
  slipMeasurable = dt > 0 && dt < 0.025;
  if (!slipMeasurable) { pawPrev.fill(null); return; }
  if (travelled < 1e-5) return;
  for (let i = 0; i < badger.legs.length; i++) {
    badger.legs[i].paw.getWorldPosition(pawWorld[i]);
    const prev = pawPrev[i];
    if (poses[i].stance && prev) {
      const moved = Math.hypot(pawWorld[i].x - prev.x, pawWorld[i].z - prev.z);
      slipAcc += moved / travelled;
      slipSamples++;
    }
    pawPrev[i] = pawPrev[i] || new THREE.Vector3();
    pawPrev[i].copy(pawWorld[i]);
  }
}

// ------------------------------------------------------------------ phase strip

const strip = el('strip');
function drawStrip(g, phase) {
  const w = strip.clientWidth, h = strip.clientHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (strip.width !== w * dpr) { strip.width = w * dpr; strip.height = h * dpr; }
  const c = strip.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);

  const padL = 30, rowH = (h - 8) / 4, barH = rowH * 0.56;
  c.font = '10px ui-monospace, monospace';
  for (let i = 0; i < 4; i++) {
    const y = 4 + i * rowH + (rowH - barH) / 2;
    const trackW = w - padL - 6;
    c.fillStyle = '#9aa6b8';
    c.fillText(LEGS[i], 4, y + barH - 1);

    // Stance is a solid bar, swing is hollow. The width difference IS the duty factor —
    // the whole point of the tuning, made visible. Bars are drawn one cycle either side
    // so the pattern wraps, which means they must be clipped to the track or they run
    // over the leg labels.
    const off = g.offsets[i];
    c.save();
    c.beginPath(); c.rect(padL, 0, trackW, h); c.clip();
    for (let k = -1; k <= 1; k++) {
      const x0 = padL + (((0 - off) % 1 + 1) % 1 + k) * trackW;
      c.fillStyle = '#e8c069';
      c.fillRect(x0, y, g.duty * trackW, barH);
      c.strokeStyle = 'rgba(232,192,105,0.45)';
      c.strokeRect(x0 + g.duty * trackW, y, (1 - g.duty) * trackW, barH);
    }
    c.restore();
  }
  // playhead
  const px = padL + phase * (w - padL - 6);
  c.strokeStyle = '#6fd18a'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(px, 2); c.lineTo(px, h - 2); c.stroke();
}

// ----------------------------------------------------------------------- loop

let last = performance.now(), fps = 0, acc = 0, frames = 0;
let bx = 0, bz = 0, facing = 0, dist = 0;

function loop(now) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += elapsed; frames++;
  if (acc > 0.5) { fps = frames / acc; acc = 0; frames = 0; }

  const dt = elapsed * state.timeScale;
  const speed = state.digging ? 0 : state.speed * (state.sneaking ? 0.45 : 1);
  const gaitName = state.gait === 'auto' ? gaitForSpeed(speed, state.sneaking) : state.gait;

  // Walk a wide arc, so turn-lean and the head stabiliser get exercised.
  const turnRate = 0.16;
  facing += turnRate * dt * (speed > 0.05 ? 1 : 0);
  const travelled = speed * dt;
  bx += Math.cos(facing) * travelled;
  bz += Math.sin(facing) * travelled;
  dist += travelled;

  const poses = badger.update(dt, {
    speed, facing, x: bx, y: bz,
    sneaking: state.sneaking, digging: state.digging,
    gait: state.gait === 'auto' ? null : state.gait,
  });
  measureSlip(poses, dt, travelled);

  // camera
  const w = canvas.parentElement.clientWidth, h = canvas.parentElement.clientHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  }
  const aspect = w / h;
  let cam;
  if (state.camera === 'game') {
    cam = ortho;
    const z = 1.55;
    cam.left = -z * aspect; cam.right = z * aspect; cam.top = z; cam.bottom = -z;
    cam.position.set(bx - 6, 9.2, bz + 7.4);
    cam.lookAt(bx, 0.3, bz);
    cam.updateProjectionMatrix();
  } else if (state.camera === 'side') {
    cam = persp; cam.aspect = aspect;
    const side = facing + Math.PI / 2;
    cam.position.set(bx + Math.cos(side) * 2.4, 0.42, bz + Math.sin(side) * 2.4);
    cam.lookAt(bx, 0.30, bz);
    cam.updateProjectionMatrix();
  } else {
    cam = persp; cam.aspect = aspect;
    const back = facing + Math.PI * 0.82;
    cam.position.set(bx + Math.cos(back) * 2.1, 1.05, bz + Math.sin(back) * 2.1);
    cam.lookAt(bx, 0.32, bz);
    cam.updateProjectionMatrix();
  }
  renderer.render(scene, cam);

  const g = GAITS[gaitName];
  if (state.showStrip) drawStrip(g, badger.phase);

  if (slipSamples > 40) { slipShown = slipAcc / slipSamples; slipAcc = 0; slipSamples = 0; }
  updateHud(g, gaitName, speed, fps);
  requestAnimationFrame(loop);
}

function updateHud(g, gaitName, speed, fps) {
  el('v-gait').textContent = g.label + (state.gait === 'auto' ? ' (auto)' : '');
  el('v-speed').textContent = speed.toFixed(2) + ' m/s';
  el('v-freq').textContent = strideFrequency(speed, g, LEG_LEN * 0.92).toFixed(2) + ' Hz';
  el('v-duty').textContent = (g.duty * 100).toFixed(0) + '% stance';
  if (!slipMeasurable) {
    el('v-slip').textContent = 'frame too long';
    el('v-slip').className = 'val';
  } else {
    el('v-slip').textContent = (slipShown * 100).toFixed(1) + '%';
    el('v-slip').className = slipShown < 0.08 ? 'val good' : slipShown < 0.2 ? 'val warn' : 'val alarm';
  }
  el('v-fps').textContent = fps.toFixed(0);
  el('strip-wrap').style.display = state.showStrip ? '' : 'none';
}

// -------------------------------------------------------------------- controls

el('speed').oninput = e => { state.speed = +e.target.value; el('speed-out').textContent = (+e.target.value).toFixed(1); };
el('timescale').oninput = e => { state.timeScale = +e.target.value; el('ts-out').textContent = (+e.target.value).toFixed(2) + '×'; };

for (const [group, key] of [['gaitBtns', 'gait'], ['camBtns', 'camera']]) {
  const bar = el(group);
  bar.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    state[key] = b.dataset.v;
    [...bar.children].forEach(x => x.classList.toggle('active', x.dataset.v === b.dataset.v));
  };
}
for (const [id, key] of [['sneak', 'sneaking'], ['dig', 'digging'],
                         ['sil', 'silhouette'], ['stripToggle', 'showStrip']]) {
  const box = el(id);
  box.checked = !!state[key];
  box.onchange = e => {
    state[key] = e.target.checked;
    if (key === 'silhouette') badger.setFlatSilhouette(e.target.checked);
  };
}

el('speed-out').textContent = state.speed.toFixed(1);
el('ts-out').textContent = '1.00×';
requestAnimationFrame(loop);
