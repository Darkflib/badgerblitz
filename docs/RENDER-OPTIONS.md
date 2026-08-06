# Rendering approach — options and findings

> Draft 0.1. Written after building the prototype in `proto/render-test/`, not before.
> Where the prototype contradicted an assumption, the assumption lost.

## The two axes

"2D vs fake 3D vs isometric vs true 3D" mixes two independent decisions:

- **Projection** — straight down · 3/4 tilted · isometric · free perspective
- **Substance** — 2D sprites · sprites in a lit 3D scene · real 3D geometry

Isometric is a *camera*, not a technology: Diablo 2 was isometric sprites, Diablo 4 is
isometric 3D. Deciding these separately is what makes the choice tractable.

## What was built

`proto/render-test/` renders one garden — a house with a lit kitchen and a cat flap,
fences with a loose panel, bins, a shed, a gravel path with a PIR floodlight, and a cat
with a vision cone — five ways, from a single shared world definition in `scene.js`.

All five run the same simulation: the same collision, the same 2D shadow-cast lighting,
the same sneak score, the same cone-and-line-of-sight detection. Only the drawing changes,
so differences are attributable to the rendering approach and nothing else.

## Findings

**1. Isometric and 3D-orthographic converge visually.** At a shared camera angle the two
are near-indistinguishable in a screenshot. The choice between them is not a look — it's
an asset pipeline decision. That reframes the whole question.

**2. Straight-down loses the architecture, not the badger.** I expected a badger from
directly above to be an unreadable grey blob. It isn't — the face stripes run along the
top of the head, so it reads fine. What actually breaks is the *world*: walls, fences and
hedges all flatten into coloured rectangles with no sense of height, and a suburban garden
is mostly vertical structure. This is the opposite of what I assumed going in.

**3. 3/4 is the weakest of the five.** Extruded fences and walls become tall slabs that
occlude the garden behind them, and it inherits the 8-directions-per-animation sprite cost
without isometric's payoff in legible architecture.

**4. Perspective 3D looks the best and plays the worst.** The badger reads beautifully, the
warm doorway spill is exactly the concept art. But at a height where the badger looks good
you cannot see the cat, so you cannot plan a route — fatal for a stealth game. Pull back far
enough to restore the tactical read and you have arrived at the orthographic view.

**5. Billboard sprites in 3D (HD-2D) do not transfer to this game.** Octopath-style upright
cards work because people are vertical. A badger is horizontal, so under a steep camera the
card collapses to a sliver. Lay it flat enough to read and it stops catching directional
light — at which point it is a top-down 2D sprite with extra steps. Worth ruling out
explicitly, because it initially looked like the ideal compromise: 2D art, 3D lighting.

**6. Occlusion is the real cost of every tilted view.** Isometric, 3D-ortho and perspective
all hide meaningful playfield behind foreground walls. In 3D this is cheap to fix per-object
(fade or cull the material). In 2D sprites it means authoring wall-fade variants by hand.
That is a genuine argument for 3D geometry that has nothing to do with how it looks.

**7. 2D shadow casting is not the risk the tech plan assumed.** Visibility polygons against
the collision segments took roughly 80 lines, and the same routine drives the light shapes
*and* the cat's cone — so what you see and what the AI uses are guaranteed to agree. One
gotcha: box corners that touch exactly let rays slip through the seam and leak light in a
spike. Growing each occluder by ~3cm fixes it.

**8. No performance conclusion is available yet.** The prototype reports 20–25fps in every
mode including pure-GPU 3D, which means the cap is headless software rendering, not the
renderers. Needs re-measuring on real hardware before anyone treats it as data.

## Where that leaves the decision

The four candidates reduce to two, because 3/4 is dominated and perspective collapses into
orthographic once the camera is far enough back to play.

| | Isometric 2D sprites | Orthographic 3D |
| --- | --- | --- |
| Looks like | Effectively identical at the same angle | Effectively identical at the same angle |
| Art pipeline | 2D images — the pipeline that made the concept art | Modelling, rigging, animating a quadruped |
| Lighting | Custom 2D pass, built and working | Free, and better |
| Occlusion fix | Hand-authored fade variants | Per-object, trivial |
| Digging / terrain change | Edit a mask — easy | Real geometry — harder |
| Content cost per prop | 8 directions × animation frames | One model |
| Mobile | Comfortable | Needs care |

**The tension is asset pipeline versus engineering.** The concept art was generated as a
2D image, and that pipeline produces sprites, not rigged quadrupeds. Isometric 2D plays to
it. But a game whose core mechanic is light and shadow gets that free in 3D, and pays for
it in custom code in 2D.

**Recommendation: orthographic 3D, low-poly and untextured.** Not because it looks better —
it doesn't, they converge — but because every mechanic in the design document is cheaper in
it. Lighting is free. Occlusion fading is per-object. Persistent digging is real geometry.
Cat flaps, roof-fade and interiors are just objects. One model replaces eight sprite
directions, which matters a lot across 10–12 houses. *Untitled Goose Game* proves the flat-
shaded look works for exactly this tone without a texture artist.

The one real cost is the badger: a rigged, animated quadruped is the single largest asset
item in the project, and it is not a thing the current pipeline produces.

**Therefore the next test should be that badger, not another renderer.** Model, rig and
animate one badger with a walk, a sneak and a dig. If that is achievable, the 3D route is
open and everything else follows. If it stalls, isometric 2D is a proven fallback — the
lighting already works, and `scene.js` is shared, so switching costs a renderer rather than
a rewrite.

## Open

- Re-measure framerate on real hardware, including a mid-range phone.
- Prototype wall-fade in orthographic 3D — how intrusive is it in motion?
- Decide camera pitch. Everything above assumed roughly 45°; shallower reads architecture
  better, steeper reads the ground plane and cones better.
