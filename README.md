# Skyhaven Rally

[![make.fun bounty](https://img.shields.io/badge/make.fun-bounty-blue)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Node.js 22](https://img.shields.io/badge/node-%3E%3D22.18-green)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Fly the Kestrel-7 down the Aurelia valley: thread the rings, mind your fuel, and put her
down gentle on runway 09 at Skyhaven Field.

## The game

A complete chase-view flight game in vanilla JavaScript and canvas — no libraries, no
network, no build step. The valley is real terrain: the Lumen river winds down its middle,
the town of Skyhaven sits mid-valley, and the ridge closes in at the far end. The camera
rides behind and above the plane; the instruments stay lit; the next ring and the runway
are always ahead of you.

Three sorties, picked with keys 1, 2 and 3 on the title screen:

- **Ring Run** — six rings down the valley, then land on runway 09.
- **River Run** — six rings low over the Lumen; pass under 60 m for a low-pass bonus.
- **Storm Ridge** — eight rings over the high ridge on half a tank of fuel.

Fuel burns with the throttle and every ring tops the tank back up. Terrain strikes cost
hull; lose it all and the sortie is over. A gentle touchdown on the runway after the last
ring completes the sortie, with bonuses for a slow, centred landing and a quick time.

## How to play

| Control | Action |
| --- | --- |
| ← → or A D | Bank and turn |
| ↑ ↓ or W S | Climb and dive |
| Q / E | Throttle down / up |
| Mouse | Steer by pointer position |
| Space / click | Start, restart |
| P or Esc | Pause |
| 1 / 2 / 3 | Pick a sortie |

The HUD shows altitude (feet), speed (knots), heading with a compass tape, throttle, fuel
and hull, the score, the rings flown, and the distance and bearing to the next ring. The
attitude ball at the bottom left shows bank and pitch.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored make.fun library.

## Layout

- `game/index.html` — the page, one canvas
- `game/src/main.js` — boot, the fixed-step loop, the five screens
- `game/src/config.js` — every tuning number and colour
- `game/src/terrain.js` — the valley: river, hills, town, runway
- `game/src/world.js` — the flight model, rings, fuel, hull, score, landings
- `game/src/render.js` — chase camera, terrain projection, plane, rings, HUD
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised engine hum, chimes and warnings (WebAudio)
- `game/src/shots.js` — the staged screenshot scenes and their autopilot
- `game/src/random.js` — the seeded generator behind the valley
- `vendor/makefun-game.ts` — make.fun's dossier library, unchanged from the kit

## License

MIT — see `LICENSE`. SPDX-License-Identifier: MIT
