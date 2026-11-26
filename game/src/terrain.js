// The valley of Aurelia: one pure height function, the Lumen river that carves it, the town
// of Skyhaven and its runway. Everything here is a function of (x, z) plus the seed, so the
// terrain never changes under the plane and the renderer can ask for any point's height.

import { createRandom, hash1 } from './random.js';

/** Water level: ground below this is river or lake. */
export const WATER_LEVEL = 3;
/** The runway's flat ground height. */
export const RUNWAY_ALT = 6;

export const RUNWAY = { x: 60, zStart: 3800, zEnd: 4240, halfWidth: 17 };
export const CITY = { x: 150, zStart: 2550, zEnd: 3350, halfWidth: 190 };
export const VALLEY_START_Z = 120;
export const VALLEY_END_Z = 4400;

/** Smooth 0..1 ramp between two edges. */
export function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Where the Lumen river runs at this distance down the valley. */
export function riverCenter(z, phases) {
  return (
    90 * Math.sin(z * 0.0011 + phases[0]) +
    55 * Math.sin(z * 0.0029 + phases[1]) +
    22 * Math.sin(z * 0.0073 + phases[2])
  );
}

/**
 * Build the valley from a seed: the river's phase, the rolling hills' phase, the town's
 * buildings and the drifting clouds. All of it is fixed once built.
 */
export function createTerrain(seed) {
  const random = createRandom(seed);
  const phases = [random() * 6.283, random() * 6.283, random() * 6.283, random() * 6.283, random() * 6.283, random() * 6.283];

  const buildings = [];
  for (let i = 0; i < 46; i += 1) {
    const bx = CITY.x + (random() * 2 - 1) * (CITY.halfWidth - 24);
    const bz = CITY.zStart + 30 + random() * (CITY.zEnd - CITY.zStart - 60);
    // Keep the main street clear so the town reads as a town, not a block.
    if (Math.abs(bx - CITY.x) < 14) continue;
    buildings.push({
      x: bx,
      z: bz,
      w: 12 + random() * 18,
      d: 12 + random() * 18,
      h: 10 + random() * 26,
      shade: 0.82 + random() * 0.3,
    });
  }

  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({
      x: (random() * 2 - 1) * 700,
      z: VALLEY_START_Z + random() * (VALLEY_END_Z - VALLEY_START_Z),
      y: 190 + random() * 130,
      rx: 55 + random() * 90,
      ry: 12 + random() * 14,
      drift: 1.5 + random() * 2.5,
    });
  }

  /** Rolling hills: a few long sine waves, seeded by phase. */
  function hills(x, z) {
    return (
      13 +
      15 * Math.sin(x * 0.004 + phases[3]) * Math.sin(z * 0.0031 + phases[4]) +
      8 * Math.sin(x * 0.012 + phases[5]) * Math.sin(z * 0.0087 + phases[0]) +
      4 * Math.sin(x * 0.031 + phases[1]) * Math.sin(z * 0.021 + phases[2])
    );
  }

  /** Height of the ground at (x, z), in metres above the valley floor's zero. */
  function heightAt(x, z) {
    const rc = riverCenter(z, phases);
    const dx = Math.abs(x - rc);
    let h = hills(x, z);
    // The river carves a channel: ground dips below the water level near its centre.
    h -= 15 * Math.exp(-((dx * dx) / (2 * 20 * 20)));
    // The valley walls rise away from the river; the rise is capped so the ridge
    // stays a ridge, never a wall that swallows the sky.
    const wall = Math.max(0, (dx - 240) / 140);
    h += wall * wall * 34;
    // Far down-valley, past the airfield, the ridge closes in.
    h += 14 * smoothstep(4250, 4400, z);
    // A soft shoulder, not a hard cap: the ridge keeps rising gently past 100 m,
    // so its top is never a flat white table.
    if (h > 100) h = 100 + (h - 100) * 0.2;
    // Skyhaven's streets are graded flat.
    const inCity = Math.abs(x - CITY.x) < CITY.halfWidth && z > CITY.zStart && z < CITY.zEnd;
    if (inCity) {
      const edge = smoothstep(CITY.halfWidth, CITY.halfWidth - 40, Math.abs(x - CITY.x));
      h = h * (1 - edge) + 10 * edge;
    }
    // The airfield and its approach corridor are graded flat to the runway's height,
    // so the final glide never has to clear a hill: flat within 63 m of the centreline,
    // fading out to 109 m, from 300 m before the threshold to the far end.
    const inCorridor = Math.abs(x - RUNWAY.x) < 109 && z > RUNWAY.zStart - 300 && z < RUNWAY.zEnd + 40;
    if (inCorridor) {
      const edge = smoothstep(109, 63, Math.abs(x - RUNWAY.x));
      h = h * (1 - edge) + RUNWAY_ALT * edge;
    }
    return h;
  }

  /** Which ground cover a height belongs to: water, sand, grass, rock or snow. Snow lies
   * in patches above the high line, never as one flat sheet. */
  function coverAt(x, z) {
    const h = heightAt(x, z);
    if (h < WATER_LEVEL) return 'water';
    if (h < WATER_LEVEL + 1.6 && Math.abs(x - riverCenter(z, phases)) < 34) return 'sand';
    if (h > 92) {
      const patch = hash1(Math.floor(x / 70) * 73856093 + Math.floor(z / 70) * 19349663);
      return patch > 0.4 ? 'snow' : 'rock';
    }
    if (h > 52) return 'rock';
    if (h > 34) return 'high';
    return 'grass';
  }

  /** True when (x, z) is paved runway. */
  function isRunway(x, z) {
    return Math.abs(x - RUNWAY.x) <= RUNWAY.halfWidth && z >= RUNWAY.zStart && z <= RUNWAY.zEnd;
  }

  /** True when (x, z) is a graded city street block. */
  function isCity(x, z) {
    return Math.abs(x - CITY.x) < CITY.halfWidth && z > CITY.zStart && z < CITY.zEnd;
  }

  return { phases, buildings, clouds, heightAt, coverAt, isRunway, isCity };
}
