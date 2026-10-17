# Steelworks 3v3 — graybox notes

Playable one-site 3v3 steel fabrication map. Source: `examples/maps/steelworks-3v3.csmap.json`.

## Spatial design

- **A Yard (west):** exposed outdoor material storage; offset beam stacks create staggered angles, with a west entry to the fabrication chamber.
- **Forge (middle):** roofed welding hall; main T approach through a stepped equipment line, with a top CT approach and bottom site entrance.
- **Shipping (east):** enclosed freight loading wing; broken-up container aisles, right-side entry to the central site, and a lower rotation into Forge.
- **A site:** 7×5 central plant footprint in a fabrication room. Four gaps connect the chamber to north CT, south Forge, west Yard and east Shipping. Occupying any one opening does not cut all pushes.
- **CT deployment:** CT garage at north has short independent splits into Yard, Forge, and Shipping.
- **T deployment:** staging area at the south forks toward outdoor Yard, inside Forge, and Shipping. A stock rack breaks the direct mid run-up.

## Scale and automated timing

One character is 64 Hammer units. Grid is 56×70 (3584×4480 outer extent, including solid boundaries); walk routes use 8-direction Dijkstra with no corner cutting and repository constant 220 units/s. **These are shortest paths from the closest spawn tile, not measured CS2 running times**; acceleration, obstruction models, player choices, and utility are not simulated.

| Position | X,Y | CT arrival | T arrival | CT lead |
|---|---|---:|---:|---:|
| Yard early hold | 14,18 | 5.62s | 16.23s | 10.61s |
| Forge early hold | 28,21 | 4.36s | 13.23s | 8.87s |
| Shipping early hold | 41,19 | 5.45s | 14.76s | 9.31s |
| Yard-side site mouth | 18,28 | 8.26s | 11.85s | 3.59s |
| Shipping-side site mouth | 38,28 | 7.60s | 11.85s | 4.25s |
| Site center | 28,28 | 6.40s | 11.20s | 4.80s |

Fastest T entry to *any* A plant tile: approximately 10.66s; fastest CT entry: approximately 5.53s. Approximate first-contact graph metric: 8.73s. An exposed south-site entrance may be occupied by attackers earlier than defenders; a defensible CT hold is the northern site and upper lane positions, not the south threshold.

## Run in repository

```sh
npm ci
npm run --silent map -- validate examples/maps/steelworks-3v3.csmap.json --json
npm run --silent map -- evaluate examples/maps/steelworks-3v3.csmap.json --rounds 1000 --seed 42 --out map-artifacts/steelworks --json
npm run verify
```

Open **Agent tools → Flat v1 → Upload JSON → Apply JSON** to load the fixture, then **Evaluate map**. It is a v1 map deliberately: no overhead walkway is included until the ground-floor geometry plays well. Full-height boxes are placeholders for steel stacks, stamping machines, and freight containers. Export Hammer measurements after the layout is approved.

This iteration has analytical distance and reachability checks, **not yet a CS2 bot or human playtest**. Review sightlines, exploit angles, and smoke/molotov counterplay in-engine before treating it as balanced.
