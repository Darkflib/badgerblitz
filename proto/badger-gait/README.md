# Gait lab

Procedural quadruped locomotion for the badger. Two-bone legs, scripted joint angles,
no IK solver.

## Run it

```sh
cd proto
python3 -m http.server 8849
# then open http://localhost:8849/badger-gait/
```

## Files

| File | |
| --- | --- |
| `gait.js` | The gait maths. Pure functions, no three.js, no DOM. |
| `badger.js` | The rig: mesh hierarchy plus `update(dt, state)`. Reusable in the game. |
| `main.js` | The lab: camera modes, controls, phase strip, slip probe. |

`gait.js` deliberately has no engine dependency, so the walk cycle can be unit-tested and
reasoned about without a canvas — the same sim/render split the tech plan calls for.

## The idea

What makes a procedural gait look fake is not a lack of easing — a sine wave is perfectly
smooth and still looks like a pendulum. The problem is **symmetry**. Real legs spend most
of the cycle planted:

```
stance  ~65-70%   foot on the ground, tracking backwards at exactly body speed
swing   ~30-35%   foot in the air, returning forward
```

That ratio is the **duty factor**, and it is the single most important number in the file.
The phase strip in the lab draws it directly: solid bar = stance, hollow = swing.

Two consequences that are easy to get backwards:

**Stance must be linear, not eased.** The foot is pinned to the ground while the body
slides over it at constant speed. Any easing there is the paw skating.

**Linear in what, though.** Sweeping the *joint angle* linearly is wrong, because the paw's
horizontal offset from the hip is `L·sin(hip)` — so a linear angle sweep makes the paw
creep forward at the extremes of the arc and back through the middle. That measured 11.5%
peak slip at a trot. Interpolating in sin-space and taking the `asin` makes the *foot
position* linear instead, which is what actually needs to be, and drops slip to zero:

```js
hip = Math.asin(lerp(Math.sin(A), -Math.sin(A), s))
```

**Stride rate is derived from speed, never chosen.** `strideFrequency()` solves for the
frequency at which the foot's backward travel during stance exactly cancels the body's
forward travel. Pick the frequency independently and the feet skate at every speed.

## Gaits

| | Pattern | Duty | Used at |
| --- | --- | --- | --- |
| **Amble** | Lateral sequence, side pairs close together | 0.72 | Below 0.9 m/s, and whenever sneaking |
| **Walk** | Even 4-beat lateral: LH, LF, RH, RF | 0.65 | 0.9–2.6 m/s |
| **Trot** | Diagonal pairs together | 0.45 | Above 2.6 m/s |

The amble is the default and the characteristic one — a badger's rolling shuffle is mostly
what identifies it at distance, which is why it carries the largest lateral roll.

Sneaking and digging reuse the same rig rather than adding animation sets: sneaking lowers
the body and shortens the stride, digging plants the hind legs and alternates the front paws.

## Details that matter more than they look

- **Head stabilisation.** The neck counter-rotates against body roll via a spring. Animals
  hold their heads level; skipping this is why naive procedural quadrupeds look drunk.
- **Tail lag.** A critically-damped spring chasing the body. Free secondary motion.
- **Stride blending.** The whole cycle springs in and out against an idle pose, so starting
  and stopping never snaps.
- **Turn lean.** Driven by rate of change of facing, not by input, so it works for AI too.

## Reading the lab

- **Foot slip** is the headline number. Under a few percent is fine; anything higher means
  stride rate has drifted out of step with speed. It reads `frame too long` when the
  framerate is too low to sample honestly — comparing paw positions between frames is
  meaningless if a leg can cross from stance to swing inside one frame.
- Drop **time scale** to ~0.2× and watch one leg against the phase strip.
- **Silhouette only** on the **Game** camera is the real test: the face stripes are the
  badger's identity and they vanish when it is backlit or occluded, so the gait has to
  carry the character on its own.

## Status

The gait system is the deliverable here. **The mesh is a placeholder** — proportions are
roughly right (a badger is about 2.5:1 long to tall, wedge-shaped, heavy at the rump) but
it is stand-in geometry, not final art.
