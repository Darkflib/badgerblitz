// Procedural quadruped gait. Pure maths — no three.js, no DOM.
//
// The thing that makes a procedural gait read as natural is not easing, it's *asymmetry*.
// A sine wave is perfectly smooth and still looks like a pendulum, because swing and
// stance take equal time. Real legs spend most of the cycle planted:
//
//   stance (~65-70%)  foot on the ground, tracking backwards at exactly body speed.
//                     LINEAR on purpose — any easing here is the foot skating.
//   swing  (~30-35%)  foot in the air, returning forward. All the easing lives here.
//
// That ratio is the duty factor, and it's the single most important number below.

const TAU = Math.PI * 2;

export const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
export const frac = (x) => x - Math.floor(x);
export const lerp = (a, b, t) => a + (b - a) * t;

// Zero velocity AND zero acceleration at both ends, so the swing has no visible corner
// where it hands back over to stance.
export const smootherstep = (x) => { const t = clamp01(x); return t * t * t * (t * (t * 6 - 15) + 10); };

// Legs are indexed [LF, RF, LH, RH] — left fore, right fore, left hind, right hind.
export const LEGS = ['LF', 'RF', 'LH', 'RH'];

export const GAITS = {
  // A badger's default. Lateral-sequence footfalls with the pairs on each side landing
  // close together, a long duty factor and a pronounced roll — that rolling shuffle is
  // most of what makes a badger read as a badger from a distance.
  amble: {
    label: 'Amble', offsets: [0.10, 0.60, 0.00, 0.50], duty: 0.72,
    hipAmp: 0.36, lift: 0.075, kneeBend: 0.85, stride: 0.30,
    bob: 0.014, roll: 0.085, pitch: 0.020, minSpeed: 0.0,
  },
  // Textbook 4-beat lateral walk: LH, LF, RH, RF evenly spaced.
  walk: {
    label: 'Walk', offsets: [0.25, 0.75, 0.00, 0.50], duty: 0.65,
    hipAmp: 0.44, lift: 0.10, kneeBend: 0.95, stride: 0.38,
    bob: 0.020, roll: 0.055, pitch: 0.026, minSpeed: 0.9,
  },
  // Diagonal pairs together. Duty drops below 0.5, so there are moments of suspension.
  trot: {
    label: 'Trot', offsets: [0.00, 0.50, 0.50, 0.00], duty: 0.45,
    hipAmp: 0.58, lift: 0.17, kneeBend: 1.15, stride: 0.52,
    bob: 0.045, roll: 0.030, pitch: 0.040, minSpeed: 2.6,
  },
};

export function gaitForSpeed(speed, sneaking) {
  if (sneaking) return 'amble';
  if (speed >= GAITS.trot.minSpeed) return 'trot';
  if (speed >= GAITS.walk.minSpeed) return 'walk';
  return 'amble';
}

// Step frequency is derived from speed, never chosen independently. If the foot doesn't
// travel backwards at exactly the speed the body travels forwards, it skates — and
// skating is the single most obvious tell in a procedural gait.
//
//   foot travel per stance ≈ 2 · legLength · sin(hipAmp)     (chord of the hip arc)
//   stance duration        = duty / frequency
//   no slip requires        speed · duty / frequency = footTravel
//
export function strideFrequency(speed, g, legLength) {
  const footTravel = 2 * legLength * Math.sin(g.hipAmp);
  if (footTravel < 1e-4) return 0;
  return (speed * g.duty) / footTravel;
}

// Per-leg pose for one phase value. Angles in radians; `lift` in metres.
export function legPose(cyclePhase, legIndex, g) {
  const p = frac(cyclePhase + g.offsets[legIndex]);
  const A = g.hipAmp;

  if (p < g.duty) {
    // Stance. What has to be linear is the foot's HORIZONTAL POSITION, not the joint
    // angle — the paw is pinned to the ground while the body slides over it at constant
    // speed. Since that offset is L·sin(hip), sweeping the angle linearly makes the paw
    // creep forward at the extremes of the arc and back through the middle: 11.5% peak
    // slip at a trot. Interpolating in sin-space and taking the asin removes it exactly.
    const s = p / g.duty;
    const sinA = Math.sin(A);
    return {
      phase: p, stance: true,
      hip: Math.asin(lerp(sinA, -sinA, s)),
      knee: 0.10 + Math.sin(s * Math.PI) * 0.06,   // barely-there compression under load
      lift: 0,
    };
  }

  // Swing. Everything eased, and the knee folds so the paw clears the ground.
  const s = (p - g.duty) / (1 - g.duty);
  const e = smootherstep(s);
  return {
    phase: p, stance: false,
    hip: lerp(-A, A, e),
    knee: 0.10 + Math.sin(s * Math.PI) * g.kneeBend,
    lift: Math.sin(s * Math.PI) * g.lift,
  };
}

// Whole-body motion. Vertical bob and pitch run at twice the stride frequency (each
// diagonal support phase gives one rise and fall); lateral roll runs at once per cycle,
// which is what produces the side-to-side waddle.
export function bodyPose(cyclePhase, g, intensity = 1) {
  const t = cyclePhase * TAU;
  return {
    bob: Math.sin(t * 2) * g.bob * intensity,
    roll: Math.sin(t) * g.roll * intensity,
    pitch: Math.sin(t * 2 + Math.PI / 3) * g.pitch * intensity,
    yaw: Math.sin(t) * g.roll * 0.35 * intensity,
  };
}

// Idle: slow breathing, plus an occasional sniff. Badgers are nose-first animals, so
// even standing still the head should be working.
export function idlePose(time) {
  const breathe = Math.sin(time * 1.7) * 0.5 + 0.5;
  const sniffWindow = frac(time / 6.5);
  const sniffing = sniffWindow < 0.22;
  const sniff = sniffing ? Math.sin(frac(sniffWindow / 0.22) * Math.PI * 6) : 0;
  return {
    bob: breathe * 0.012,
    headPitch: -0.05 + (sniffing ? -0.22 : 0) + sniff * 0.05,
    headYaw: sniffing ? Math.sin(time * 2.3) * 0.18 : Math.sin(time * 0.4) * 0.06,
    sniffing,
  };
}

// A critically-damped spring, used for secondary motion (tail lag, head stabilisation)
// and for easing between gaits so nothing ever snaps.
export function spring(current, target, velocity, stiffness, dt) {
  const damping = 2 * Math.sqrt(stiffness);
  const accel = (target - current) * stiffness - velocity * damping;
  const v = velocity + accel * dt;
  return { value: current + v * dt, velocity: v };
}
