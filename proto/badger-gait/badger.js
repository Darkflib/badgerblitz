// Procedural badger: low-poly mesh, two-bone legs, no IK solver.
//
// Every joint angle is written directly from gait.js. There is nothing to solve — a
// "solid leg" rig is enough at this poly count, and it stays cheap enough to run a
// whole sett of them.
//
// Hierarchy:
//   root            world position + facing
//     body          bob / roll / pitch
//       torso, rump
//       neck → head → snout, stripes, ears
//       tailBase → tail          (lags behind the body — free secondary motion)
//       hip ×4 → thigh → knee → shin → paw

import * as THREE from '../vendor/three.module.min.js';
import { GAITS, LEGS, legPose, bodyPose, idlePose, strideFrequency, gaitForSpeed,
         spring, frac, lerp, clamp01 } from './gait.js';

const HEX = (h) => new THREE.Color(h);

// Hip sockets, in body space. x is forward, z is left/right.
const HIPS = [
  [ 0.30,  0.17],   // LF
  [ 0.30, -0.17],   // RF
  [-0.28,  0.19],   // LH
  [-0.28, -0.19],   // RH
];

// A real badger is about 75cm nose to rump and about 30cm at the shoulder — roughly
// 2.5:1 long to tall. Getting that ratio right matters more than any detail, because it
// is the whole silhouette.
export const THIGH_LEN = 0.16;
export const SHIN_LEN = 0.15;
export const LEG_LEN = THIGH_LEN + SHIN_LEN;
const STAND_Y = 0.345;             // body height with legs at rest
const HIP_Y = -0.04;               // hip socket, relative to body centre

export class Badger {
  constructor({ flat = false } = {}) {
    const M = (color, rough = 0.9) => flat
      ? new THREE.MeshBasicMaterial({ color: HEX(color) })
      : new THREE.MeshStandardMaterial({ color: HEX(color), roughness: rough });

    this.mat = {
      fur: M('#54545c'), pale: M('#eceae4', 0.8), dark: M('#17171c'), claw: M('#b9b2a4', 0.6),
    };

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = STAND_Y;
    this.root.add(this.body);

    // --- torso: long, low and wedge-shaped, narrow at the shoulder and heavy at the
    // rump. Three overlapping ellipsoids get the taper cheaply. ---
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.20, 16, 12), this.mat.fur);
    shoulder.scale.set(1.15, 0.80, 0.92);
    shoulder.position.set(0.20, 0.005, 0);
    this.body.add(shoulder);

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.235, 18, 12), this.mat.fur);
    torso.scale.set(1.55, 0.76, 1.02);
    torso.position.set(-0.04, 0, 0);
    this.body.add(torso);

    const rump = new THREE.Mesh(new THREE.SphereGeometry(0.225, 16, 12), this.mat.fur);
    rump.scale.set(1.0, 0.88, 1.12);
    rump.position.set(-0.34, 0.01, 0);
    this.body.add(rump);

    // --- neck and head. The head is a long tapering wedge carried low and forward,
    // which is most of what separates a badger from any other lump at this poly count. ---
    this.neck = new THREE.Group();
    this.neck.position.set(0.355, -0.015, 0);
    this.body.add(this.neck);

    this.head = new THREE.Group();
    this.head.position.set(0.125, -0.028, 0);
    this.neck.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), this.mat.pale);
    skull.scale.set(1.30, 0.92, 1.0);
    this.head.add(skull);

    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.080, 0.145, 10), this.mat.pale);
    snout.rotation.z = -Math.PI / 2;
    snout.position.set(0.145, -0.016, 0);
    this.head.add(snout);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), this.mat.dark);
    nose.position.set(0.222, -0.020, 0);
    this.head.add(nose);

    // The two face stripes. In silhouette these vanish, which is exactly why the gait
    // has to carry the character on its own.
    for (const side of [1, -1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.05, 0.05), this.mat.dark);
      stripe.position.set(0.075, 0.026, side * 0.053);
      stripe.rotation.z = 0.09;
      this.head.add(stripe);

      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), this.mat.pale);
      ear.scale.set(0.6, 1, 1);
      ear.position.set(-0.06, 0.095, side * 0.072);
      this.head.add(ear);
    }

    // --- tail: short and held low ---
    this.tailBase = new THREE.Group();
    this.tailBase.position.set(-0.47, 0.05, 0);
    this.body.add(this.tailBase);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.22, 8), this.mat.fur);
    tail.rotation.z = Math.PI / 2 + 0.5;
    tail.position.set(-0.09, 0.02, 0);
    this.tailBase.add(tail);

    // --- legs: hip pivot → thigh → knee pivot → shin → paw ---
    this.legs = HIPS.map(([x, z], i) => {
      const hip = new THREE.Group();
      hip.position.set(x, HIP_Y, z);
      this.body.add(hip);

      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.050, THIGH_LEN, 7), this.mat.fur);
      thigh.position.y = -THIGH_LEN / 2;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -THIGH_LEN;
      hip.add(knee);

      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.041, SHIN_LEN, 7), this.mat.dark);
      shin.position.y = -SHIN_LEN / 2;
      knee.add(shin);

      // Badgers are plantigrade — they walk on the whole foot, not on toes. The flat
      // paw is a big part of the low, shuffling read.
      const paw = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.040, 0.085), this.mat.dark);
      paw.position.set(0.020, -SHIN_LEN - 0.018, 0);
      knee.add(paw);

      // Front claws — comically large on a real badger, and the digging tool.
      if (i < 2) {
        const claws = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.026, 0.078), this.mat.claw);
        claws.position.set(0.088, -SHIN_LEN - 0.022, 0);
        knee.add(claws);
      }
      return { hip, knee, thigh, shin, paw, index: i };
    });

    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    // Animation state
    this.phase = 0;
    this.gaitName = 'amble';
    this.blend = 0;                 // 0 = idle, 1 = full stride
    this.blendVel = 0;
    this.tailAngle = 0; this.tailVel = 0;
    this.headStab = 0; this.headStabVel = 0;
    this.time = 0;
    this.lastYaw = 0;
    this.turnLean = 0; this.turnLeanVel = 0;
  }

  get object3D() { return this.root; }

  /**
   * @param dt      seconds
   * @param state   { speed, facing, sneaking, digging, x, y, gait? , freqScale? }
   */
  update(dt, state) {
    this.time += dt;
    const speed = Math.max(0, state.speed || 0);
    const sneaking = !!state.sneaking;

    const name = state.gait || gaitForSpeed(speed, sneaking);
    this.gaitName = name;
    const g = GAITS[name];

    // Legs are shorter and the body lower when sneaking, so the same rig reads as a
    // different intent without a second animation set.
    const crouch = sneaking ? 0.055 : 0;

    const freq = strideFrequency(speed, g, LEG_LEN * 0.92) * (state.freqScale ?? 1);
    this.phase = frac(this.phase + freq * dt);

    // Blend the whole stride in and out rather than snapping between idle and walking.
    const targetBlend = speed > 0.05 ? 1 : 0;
    const b = spring(this.blend, targetBlend, this.blendVel, 90, dt);
    this.blend = clamp01(b.value); this.blendVel = b.velocity;

    const idle = idlePose(this.time);
    const body = bodyPose(this.phase, g, this.blend);

    // --- body ---
    this.body.position.y = STAND_Y - crouch + body.bob + idle.bob * (1 - this.blend);
    this.body.rotation.z = body.pitch;
    this.body.rotation.x = body.roll;
    this.body.rotation.y = body.yaw;

    // Lean into turns, driven by how fast the facing is changing.
    let dYaw = (state.facing ?? 0) - this.lastYaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    this.lastYaw = state.facing ?? 0;
    const leanTarget = dt > 0 ? clamp01(Math.abs(dYaw / dt) / 6) * Math.sign(dYaw) * 0.28 : 0;
    const lean = spring(this.turnLean, leanTarget, this.turnLeanVel, 55, dt);
    this.turnLean = lean.value; this.turnLeanVel = lean.velocity;
    this.body.rotation.x += this.turnLean;

    // --- head: animals stabilise the head against body roll, so counter-rotate it.
    // Skipping this is why naive procedural quadrupeds look drunk. ---
    const stab = spring(this.headStab, -this.body.rotation.x * 0.8, this.headStabVel, 120, dt);
    this.headStab = stab.value; this.headStabVel = stab.velocity;
    this.neck.rotation.x = this.headStab;
    this.neck.rotation.z = lerp(idle.headPitch, sneaking ? 0.16 : 0.04, this.blend) - body.pitch * 0.6;
    this.neck.rotation.y = lerp(idle.headYaw, 0, this.blend);

    // --- tail: springs toward level, lagging the body. Pure secondary motion. ---
    const tailTarget = -0.25 - speed * 0.06 + Math.sin(this.phase * Math.PI * 2) * 0.10 * this.blend;
    const tl = spring(this.tailAngle, tailTarget, this.tailVel, 40, dt);
    this.tailAngle = tl.value; this.tailVel = tl.velocity;
    this.tailBase.rotation.z = this.tailAngle;
    this.tailBase.rotation.y = Math.sin(this.time * 1.3) * 0.05;

    // --- legs ---
    this.poses = this.legs.map((leg) => {
      const p = legPose(this.phase, leg.index, g);
      const blend = this.blend;
      leg.hip.rotation.z = p.hip * blend;
      leg.knee.rotation.z = p.knee * blend;
      leg.hip.position.y = HIP_Y + p.lift * blend;
      return p;
    });

    if (state.digging) this.applyDig(dt);

    this.root.position.set(state.x ?? 0, 0, state.y ?? 0);
    this.root.rotation.y = -(state.facing ?? 0);
    return this.poses;
  }

  // Digging reuses the same rig: rump up, front paws alternating fast, head low.
  applyDig(dt) {
    const t = this.time * 7.5;
    this.body.position.y = STAND_Y - 0.075;
    this.body.rotation.z = -0.16;
    this.neck.rotation.z = 0.42;
    for (const leg of this.legs) {
      if (leg.index < 2) {
        const s = Math.sin(t + leg.index * Math.PI);
        leg.hip.rotation.z = 0.55 + s * 0.75;
        leg.knee.rotation.z = 0.55 - s * 0.35;
        leg.hip.position.y = HIP_Y + Math.max(0, s) * 0.06;
      } else {
        leg.hip.rotation.z = -0.20;
        leg.knee.rotation.z = 0.30;
        leg.hip.position.y = HIP_Y;
      }
    }
  }

  setFlatSilhouette(on, color = '#8fd8a8') {
    this.root.traverse(o => {
      if (!o.isMesh) return;
      if (on) {
        if (!o.userData.realMat) o.userData.realMat = o.material;
        o.material = o.userData.silMat ||= new THREE.MeshBasicMaterial({ color: HEX(color) });
      } else if (o.userData.realMat) {
        o.material = o.userData.realMat;
      }
    });
  }
}
