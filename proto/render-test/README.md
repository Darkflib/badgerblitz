# Render test

Five ways of drawing the same garden, driven by one shared world definition.

## Run it

No build step — it's plain ES modules.

```sh
cd proto/render-test
python3 -m http.server 8848
# then open http://localhost:8848
```

`WASD` to move, `Shift` to sneak. Walk the gravel path on the right to trip the security
light. The south fence has a loose panel and the back door has a cat flap.

## What's here

| File | |
| --- | --- |
| `scene.js` | The world — boxes, ground patches, lights, the cat. Shared by every renderer. |
| `r2d.js` | Canvas2D: straight-down, 3/4 and isometric, plus the 2D shadow-cast lighting. |
| `r3d.js` | Three.js: orthographic and perspective, with a billboard-sprite toggle. |
| `main.js` | Input, the night simulation, sneak score, detection, HUD. |
| `vendor/` | Three.js r185, vendored so this runs offline. |

The point of the shared `scene.js` is that the five modes differ *only* in drawing. Same
collision, same lighting, same sneak score, same detection — so anything that looks
different is attributable to the rendering approach.

## Notes

The lighting is real: visibility polygons cast from each light against the same wall
segments used for collision. The cat's vision cone uses the same routine, which is why it
cannot see through the shed.

Findings and the resulting recommendation are in [`docs/RENDER-OPTIONS.md`](../../docs/RENDER-OPTIONS.md).

This is a throwaway comparison harness, not the start of the game's codebase — it doesn't
follow the sim/render split described in the tech plan.
