// Three.js renderer: real geometry, real shadow-casting lights.
//
// Two camera modes (orthographic and perspective) and two badger modes (low-poly mesh
// or a billboard sprite card). The sprite card is the "HD-2D" middle ground — 2D art
// in a 3D lit scene — which is the option closest to the concept art's pipeline.

import * as THREE from './vendor/three.module.min.js';
import { BOXES, GROUND, LIGHTS, COLORS, WORLD, CAT } from './scene.js';

const HEX = (h) => new THREE.Color(h);

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = HEX('#070c16');
    this.scene.fog = new THREE.Fog('#070c16', 34, 70);

    this.buildStatic();
    this.buildLights();
    this.buildActors();

    const aspect = 16 / 10;
    this.ortho = new THREE.OrthographicCamera(-16 * aspect, 16 * aspect, 16, -16, 0.1, 200);
    this.persp = new THREE.PerspectiveCamera(42, aspect, 0.1, 200);
  }

  buildStatic() {
    // Grass
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.w, WORLD.h),
      new THREE.MeshStandardMaterial({ color: HEX(COLORS.grass), roughness: 0.95 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(WORLD.w / 2, 0, WORLD.h / 2);
    grass.receiveShadow = true;
    this.scene.add(grass);

    for (const g of GROUND) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(g.w, g.h),
        new THREE.MeshStandardMaterial({ color: HEX(COLORS[g.kind]), roughness: 0.9 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(g.x + g.w / 2, 0.012, g.y + g.h / 2);
      m.receiveShadow = true;
      this.scene.add(m);
    }

    for (const b of BOXES) {
      const isGlass = b.kind === 'window';
      const mat = isGlass
        ? new THREE.MeshStandardMaterial({ color: HEX('#9fd4ff'), transparent: true,
            opacity: 0.28, emissive: HEX('#ffd9a0'), emissiveIntensity: 0.5, roughness: 0.1 })
        : new THREE.MeshStandardMaterial({ color: HEX(COLORS[b.kind] || '#888'),
            roughness: b.kind === 'fridge' ? 0.35 : 0.88 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.height, b.h), mat);
      m.position.set(b.x + b.w / 2, b.height / 2, b.y + b.h / 2);
      m.castShadow = !isGlass;
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  buildLights() {
    this.scene.add(new THREE.AmbientLight(HEX('#2c3c58'), 0.85));
    const moon = new THREE.DirectionalLight(HEX('#8fa8d8'), 0.5);
    moon.position.set(-14, 22, -8);
    this.scene.add(moon);

    this.lights = {};
    for (const L of LIGHTS) {
      let light;
      if (L.cone) {
        light = new THREE.SpotLight(HEX(L.color), L.intensity * 55, L.r * 1.6, L.cone[1] * 1.5, 0.45, 1.4);
        light.position.set(L.x, L.z, L.y);
        light.target.position.set(L.x + Math.cos(L.cone[0]) * 5, 0, L.y + Math.sin(L.cone[0]) * 5);
        this.scene.add(light.target);
      } else {
        light = new THREE.PointLight(HEX(L.color), L.intensity * 45, L.r * 1.5, 1.6);
        light.position.set(L.x, L.z, L.y);
      }
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0035;
      this.scene.add(light);
      this.lights[L.id] = light;
    }
  }

  makeBadgerMesh() {
    const g = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color: HEX('#4c4c54'), roughness: 0.92 });
    const pale = new THREE.MeshStandardMaterial({ color: HEX('#e9e7e1'), roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: HEX('#141418'), roughness: 0.85 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), fur);
    body.scale.set(1.5, 0.78, 1.0); body.position.y = 0.34;
    g.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), pale);
    head.scale.set(1.35, 0.9, 1.0); head.position.set(0.62, 0.36, 0);
    g.add(head);

    for (const z of [-0.1, 0.1]) {                      // the two face stripes
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.075), dark);
      s.position.set(0.66, 0.40, z);
      g.add(s);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), pale);
      ear.position.set(0.42, 0.52, z * 1.7);
      g.add(ear);
    }
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), dark);
    snout.position.set(0.90, 0.32, 0);
    g.add(snout);

    for (const [x, z] of [[0.32, 0.22], [0.32, -0.22], [-0.30, 0.22], [-0.30, -0.22]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.3, 8), dark);
      leg.position.set(x, 0.15, z);
      g.add(leg);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  // The HD-2D option: a painted badger on a card, standing in a real lit 3D scene.
  makeBadgerSprite() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 160;
    const x = c.getContext('2d');
    const S = 150;
    x.translate(128, 84);
    x.fillStyle = '#4c4c54';
    x.beginPath(); x.ellipse(-8, 0, S * 0.42, S * 0.26, 0, 0, 7); x.fill();
    x.fillStyle = '#e9e7e1';
    x.beginPath(); x.ellipse(S * 0.34, -4, S * 0.21, S * 0.17, 0, 0, 7); x.fill();
    x.fillStyle = '#141418';
    x.beginPath(); x.ellipse(S * 0.37, -S * 0.11, S * 0.185, S * 0.045, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(S * 0.37, S * 0.04, S * 0.185, S * 0.045, 0, 0, 7); x.fill();
    x.beginPath(); x.arc(S * 0.53, -4, S * 0.045, 0, 7); x.fill();
    x.fillStyle = '#e9e7e1';
    x.beginPath(); x.arc(S * 0.20, -S * 0.19, S * 0.055, 0, 7); x.fill();
    for (const px of [S * 0.28, -S * 0.24]) {
      x.fillStyle = '#141418';
      x.fillRect(px, S * 0.16, S * 0.09, S * 0.12);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 1.31),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5,
        roughness: 0.9, side: THREE.DoubleSide }));
    plane.castShadow = true;
    const g = new THREE.Group();
    // Laid almost flat on the ground. An upright billboard (Octopath-style) collapses to a
    // sliver under a steep camera, because a badger is horizontal — so the card has to lie
    // down, and once it does it barely catches directional light. That trade-off is the
    // whole point of this toggle.
    plane.position.y = 0.22;
    plane.rotation.x = -Math.PI * 0.44;
    g.add(plane);
    return g;
  }

  buildActors() {
    this.badgerMesh = this.makeBadgerMesh();
    this.badgerSprite = this.makeBadgerSprite();
    this.badgerSprite.visible = false;
    this.scene.add(this.badgerMesh, this.badgerSprite);

    const cat = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color: HEX('#3a3238'), roughness: 0.9 });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), fur);
    b.scale.set(1.5, 0.8, 0.9); b.position.y = 0.30; cat.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), fur);
    h.position.set(0.42, 0.40, 0); cat.add(h);
    for (const z of [-0.09, 0.09]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 6), fur);
      ear.position.set(0.42, 0.55, z); cat.add(ear);
    }
    cat.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    cat.position.set(CAT.x, 0, CAT.y);
    cat.rotation.y = -CAT.facing;
    this.scene.add(cat);
    this.cat = cat;

    // Vision cone as flat geometry on the ground. Not occluded by walls in 3D —
    // that limitation is itself part of what this test is showing.
    const seg = 24, verts = [0, 0, 0];
    for (let i = 0; i <= seg; i++) {
      const a = -CAT.coneHalf + (i / seg) * CAT.coneHalf * 2;
      verts.push(Math.cos(a) * CAT.coneRange, 0, Math.sin(a) * CAT.coneRange);
    }
    const idx = [];
    for (let i = 1; i < seg + 1; i++) idx.push(0, i, i + 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    this.cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: HEX('#ffe18c'), transparent: true, opacity: 0.17,
      side: THREE.DoubleSide, depthWrite: false }));
    this.cone.position.set(CAT.x, 0.05, CAT.y);
    this.cone.rotation.y = -CAT.facing;
    this.scene.add(this.cone);
  }

  render(mode, state) {
    const useSprite = !!state.spriteBadger;
    this.badgerMesh.visible = !useSprite;
    this.badgerSprite.visible = useSprite;
    const actor = useSprite ? this.badgerSprite : this.badgerMesh;
    actor.position.set(state.badger.x, 0, state.badger.y);
    actor.rotation.y = -state.badger.facing;

    this.cone.material.color.set(state.spotted ? '#ff6a4a' : '#ffe18c');
    this.cone.material.opacity = state.spotted ? 0.3 : 0.17;
    if (this.lights.pir) this.lights.pir.visible = !!state.pirOn;

    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, rect.width), h = Math.max(240, rect.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
    }
    const aspect = w / h;

    let cam;
    if (mode === 'ortho3d') {
      cam = this.ortho;
      const z = 6.4;                                   // ~20m across, matching the 2D zoom
      cam.left = -z * aspect; cam.right = z * aspect; cam.top = z; cam.bottom = -z;
      cam.position.set(state.badger.x - 13, 20, state.badger.y + 16);
      cam.lookAt(state.badger.x, 0, state.badger.y);
      cam.updateProjectionMatrix();
    } else {
      cam = this.persp;
      cam.aspect = aspect;
      cam.position.set(state.badger.x - 0.5, 7.0, state.badger.y + 6.0);
      cam.lookAt(state.badger.x, 0.4, state.badger.y - 1.0);
      cam.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, cam);
  }
}
