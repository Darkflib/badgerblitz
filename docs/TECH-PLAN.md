# Badger Blitz — Technical Plan

> Companion to `GAME-DESIGN.md`. Draft 0.1.

## 1. Constraints

- Runs in a browser, no install, no login, no backend for v1.
- Static hosting. Deployable from a push.
- 60fps on a mid-range laptop and a recent phone.
- Real-time 2D lighting with shadow casting, because light is a mechanic (GDD §5).
- Small team. Prefer boring, well-documented tools.

## 2. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, strict | The sim has enough state that types pay for themselves by week two |
| Build | Vite | Fast, zero-config, first-class TS |
| Engine | **Phaser 3** | Tilemaps, Tiled import, arcade physics, scenes, input, cameras, audio — all free on day one |
| Map authoring | Tiled (`.tmj`) | Handcrafted map is core to the design; needs a real editor |
| Audio | Howler.js | Spatial panning, sprite sheets, sane mobile unlock behaviour |
| Pathfinding | Grid A*, hand-rolled | Small maps, few agents. A library is more integration than code |
| Save | `localStorage`, versioned JSON | Migrate to IndexedDB only if saves outgrow ~5MB |
| Tests | Vitest | Only the pure sim is unit-tested — see §3 |
| CI/CD | GitHub Actions → GitHub Pages | Static site, push to deploy |

**On Phaser vs. PixiJS + custom.** Phaser gets a playable slice in days rather than weeks,
and the parts of it we lean on (tilemaps, cameras, input, scene lifecycle) are exactly the
parts that are solid. Where it won't help is lighting — Phaser's `Light2D` pipeline is
normal-map based and won't do shadow casting, so that's a custom pass either way. If Phaser
ever becomes the bottleneck, §3's architecture means we'd be replacing a render layer, not
the game.

## 3. Architecture — the one rule

**The simulation must not import Phaser.**

```
src/
  sim/            # pure TypeScript. No engine, no DOM, no rendering.
    world.ts        # world state, tick()
    detection.ts    # sneak score, vision cones, hearing propagation
    ai/             # NPC state machines
    economy.ts      # loot tables, hunger, heat & notoriety decay
    save.ts         # serialise / deserialise / migrate
  render/         # Phaser scenes, sprites, the lighting pass, HUD
  data/           # loot tables, house schedules, night modifiers (JSON)
  assets/
```

`sim` takes input and a delta, returns new state. `render` draws it. Everything that
decides whether the dog notices you lives in `sim` and is unit-testable without a canvas.

This is the difference between "we can test the detection rules" and "we can only find
out by playing", and it's also what keeps co-op or replays possible later without a rewrite.

## 4. Lighting and shadows

The one genuinely custom system.

**Visuals, per frame:**
1. Gather occluder segments (walls, fences, sheds) within each light's radius. Occluders
   come from a dedicated object layer in Tiled.
2. Build a visibility polygon per light by casting rays to segment endpoints ±ε.
3. Render each polygon into an additive light buffer, masked by a radial falloff gradient.
4. Composite the buffer over the scene: ambient night colour, then multiply the lights in.

**Gameplay, per NPC check:** do *not* read pixels back from the light buffer — it stalls
the GPU. Compute illumination analytically: for each light in range, one segment raycast to
test occlusion, sum the contributions. With <15 lights on screen this is trivially cheap
and gives the same answer the visuals show.

**Budget:** ~15 dynamic lights on screen. Sweeping car headlights, torches and PIR
floodlights are dynamic; street lamps and window spill are static and can cache their
polygon until an occluder changes (a fence panel breaking invalidates it).

**Art implication:** paint sprites and tiles as flat albedo with lighting *removed*. Baked
highlights will fight the runtime pass and look wrong in the dark. This is the biggest
practical difference from the concept art, which has all its lighting painted in. Optional
upgrade: generate normal maps for props so they catch a passing torch beam properly.

## 5. Detection

```
sneakScore = base
           - speedPenalty(velocity, isSneaking)
           - surfaceNoise(tileUnderfoot)      // grass 0 … bin lid 1.0
           - illumination(position)           // §4, analytical
           - carryPenalty(jawsSlot)
           + coverBonus(inHedge, behindShed)
```

That single number drives the HUD's Sneak bar (GDD §4) *and* feeds every NPC check, so what
the player sees is literally what the AI uses. No hidden second system.

- **Sight:** target in cone ∧ line of sight unblocked ∧ illumination > threshold.
- **Hearing:** discrete noise events with a radius, attenuated per wall crossed. NPCs within
  radius go Suspicious and path to the origin.
- **Smell:** dogs only. They follow your scent trail — a decaying breadcrumb of recent
  positions — which is why rain nights matter (GDD §12).

Awareness is the three-state machine in GDD §9, implemented as a plain state machine in
`sim/ai/`, one file per NPC archetype.

## 6. Persistence

One save object, versioned, written at the end of each night:

```ts
type Save = {
  version: number
  night: number
  notoriety: number
  houses: Record<HouseId, { heat: number; robbed: number; countermeasures: string[] }>
  terrain: { digs: Point[]; brokenFences: FenceId[] }
  caches: { at: Point; contents: ItemId[] }[]
  sett: { stash: Record<ItemId, number>; upgrades: string[]; cubHunger: number }
  known: { locations: LocationId[]; smelled: ItemId[] }
  badger: { traits: string[] }
}
```

Write a `migrate(save)` from day one. The schema will change every week during development
and losing test saves constantly is a real tax.

## 7. Milestones

Each one should end in something playable.

| # | Deliverable | Proves |
| --- | --- | --- |
| **M0** | Move a badger around a hand-made Tiled map with collision, camera follow | The tooling works end to end |
| **M1** | Lighting + shadow pass, sneak score, one cat with a vision cone and 3-state awareness | **The core feel.** Stop here and playtest before building anything else |
| **M2** | Interactables: bins, cat flap, fridge, carryables, jaws slot, drop, roof-fade on entry | The heist |
| **M3** | Night clock, sett hub, dawn timer, return-to-sett, run summary | The loop closes |
| **M4** | Dig (persistent), scent pulse, caches, save/load between nights | The map becomes yours |
| **M5** | House heat, notoriety, countermeasures escalating over nights | The difficulty curve |
| **M6** | Dog, fox, humans on schedules, the Magpie, sett upgrades and traits | The cast |
| **M7** | Full 10–12 house map, 30-night campaign, night modifiers, audio pass, juice | The game |

**M1 is the gate.** The vertical slice in GDD §16 is roughly M1–M3 scoped to three houses.
If sneaking into a kitchen and walking home slowly with a tart isn't fun at M3, the answer
is not M4.

## 8. Performance

- Target 60fps; budget 16ms with ~6ms for the lighting pass.
- Cull aggressively — the map is much larger than the viewport.
- Static light polygons cached and invalidated on occluder change.
- AI ticks at 10Hz, not per frame. Nothing in this game needs 60Hz decisions.
- Texture atlases per zone; lazy-load house interiors.
- Test on a mid-range Android phone from M1, not at M7.

## 9. Repo layout

```
/docs           GAME-DESIGN.md, TECH-PLAN.md, ADRs
/src            sim/, render/, data/, assets/
/maps           Tiled project + .tmj sources
/public         static, favicon, og image
/tests          Vitest, sim only
```

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Lighting pass is the hardest system and it's needed at M1 | Prototype it standalone first, off to one side, before wiring it into the game |
| Art direction is unproven top-down — the concept art is side-on and photoreal | Produce three top-down test tiles + a badger sprite *before* M1 and check they read at night under a dynamic light |
| Stealth failure feels punishing rather than exciting | Design chases as escapes-using-your-own-tunnels (GDD §9); no reloads, only bad nights |
| Handcrafted map is a large content cost | It's also the whole point. Budget for it; build the Tiled workflow properly at M0 |
| Scope — the GDD describes a much larger game than the slice | Milestone gate at M1 and again at M3. Nothing past M3 is committed |
