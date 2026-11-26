// The flight rules and the sortie state, with no drawing and no browser in it: the
// Kestrel-7's position, speed, throttle and pitch, the rings of the current mission, fuel,
// hull, score and landings. step() advances one fixed step and returns what happened as bit
// flags, so the caller can react without the world knowing about screens or sound.

import { FUEL, HULL, LANDING, MISSIONS, PLANE, RING } from './config.js';
import { CITY, RUNWAY, RUNWAY_ALT, VALLEY_END_Z, VALLEY_START_Z, createTerrain, riverCenter } from './terrain.js';
import { createRandom } from './random.js';

export const EVENT_RING = 1;
export const EVENT_CRASH = 2;
export const EVENT_LANDED = 4;
export const EVENT_FUEL_EMPTY = 8;
export const EVENT_LOW_FUEL = 16;
export const EVENT_OVER = 32;
export const EVENT_TOUCH_GO = 64;

export const PHASE_FLY = 'fly';
export const PHASE_DONE = 'done';
export const PHASE_OVER = 'over';

const START = { x: 0, z: 170, alt: 95, heading: 0, speed: 46, throttle: 0.7 };

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function createWorld(seed) {
  const terrain = createTerrain(seed);
  const random = createRandom(seed ^ 0x5f3759df);

  const plane = {
    x: START.x,
    z: START.z,
    alt: START.alt,
    heading: START.heading,
    pitch: 0,
    bank: 0,
    speed: START.speed,
    throttle: START.throttle,
    verticalSpeed: 0,
  };
  const state = {
    missionIndex: 0,
    mission: MISSIONS[0],
    rings: [],
    ringIndex: 0,
    score: 0,
    fuel: MISSIONS[0].fuelStart,
    hull: HULL.max,
    elapsed: 0,
    phase: PHASE_FLY,
    message: '',
    messageTimer: 0,
    lowFuelWarned: false,
    landed: false,
    landingQuality: 0,
    best: 0,
  };
  /** The screenshot autopilot's go-around flag: set when the plane overshoots the runway. */
  let goAround = false;

  /** Lay the mission's rings along the valley: down the river, over the town, to the field.
   * The river run keeps its rings close to the water, where the ground is low. */
  function placeRings(mission) {
    const rings = [];
    const count = mission.rings;
    const firstZ = 650;
    const lastZ = RUNWAY.zStart - 420;
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : i / (count - 1);
      const z = firstZ + t * (lastZ - firstZ);
      const side = i % 2 === 0 ? -1 : 1;
      const spread = mission.id === 2 ? 15 + random() * 45 : 60 + random() * 110;
      const x = riverCenter(z, terrain.phases) + side * spread * (0.4 + random() * 0.6);
      const alt = mission.ringAltMin + random() * (mission.ringAltMax - mission.ringAltMin);
      rings.push({ x, z, alt, radius: RING.radius, passed: false });
    }
    return rings;
  }

  function startMission(index) {
    state.missionIndex = index;
    state.mission = MISSIONS[index];
    state.rings = placeRings(state.mission);
    state.ringIndex = 0;
    state.score = 0;
    state.fuel = state.mission.fuelStart;
    state.hull = HULL.max;
    state.elapsed = 0;
    state.phase = PHASE_FLY;
    state.landed = false;
    state.landingQuality = 0;
    state.lowFuelWarned = false;
    goAround = false;
    resetPlane();
  }

  function resetPlane() {
    plane.x = START.x;
    plane.z = START.z;
    plane.alt = START.alt;
    plane.heading = START.heading;
    plane.pitch = 0;
    plane.bank = 0;
    plane.speed = START.speed;
    plane.throttle = START.throttle;
    plane.verticalSpeed = 0;
  }

  /** Back to the last ring passed (or the start), after a crash costs hull. */
  function respawn() {
    const anchor = state.ringIndex === 0 ? null : state.rings[state.ringIndex - 1];
    if (anchor === null) {
      resetPlane();
    } else {
      plane.x = anchor.x;
      plane.z = anchor.z - 260;
      // Relaunch at a modest height above the valley, not a dive from the clouds.
      plane.alt = Math.max(Math.min(anchor.alt + 45, 80), terrain.heightAt(anchor.x, anchor.z - 260) + 45);
      plane.heading = 0;
      plane.pitch = 0;
      plane.bank = 0;
      plane.speed = 42;
      plane.throttle = 0.65;
      plane.verticalSpeed = 0;
    }
    state.message = 'Back in the air — hull patched, watch the ridge.';
    state.messageTimer = 3;
  }

  function flash(message, seconds) {
    state.message = message;
    state.messageTimer = seconds;
  }

  /**
   * One fixed step. `steer` is -1..1 (bank left/right), `elevator` is -1..1 (pitch down/up),
   * `throttleDelta` is -1..1 (slower/faster). With `attract` set the plane flies itself and
   * nothing scores, for the title screen's backdrop.
   */
  function step(dt, steer, elevator, throttleDelta, attract) {
    let events = 0;
    if (state.phase !== PHASE_FLY) return events;
    state.elapsed += dt;
    if (state.messageTimer > 0) state.messageTimer -= dt;

    // Throttle, then speed: thrust fights drag, and a stalled wing stops answering.
    plane.throttle = clamp(plane.throttle + throttleDelta * dt * 0.55, 0, 1);
    if (state.fuel <= 0) plane.throttle = 0;
    const target = PLANE.minSpeed + plane.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
    plane.speed += (target - plane.speed) * (1 - Math.exp(-PLANE.drag * dt)) + PLANE.accel * plane.throttle * dt * 0.12;
    plane.speed = clamp(plane.speed, 0, PLANE.maxSpeed);

    // Bank and pitch ease toward the pilot's input; the wings level themselves when let go.
    const bankTarget = steer * PLANE.maxBank;
    plane.bank += (bankTarget - plane.bank) * Math.min(1, PLANE.bankRate * dt * 2.2);
    const pitchTarget = elevator * PLANE.maxPitch;
    plane.pitch += (pitchTarget - plane.pitch) * Math.min(1, PLANE.pitchRate * dt * 2.4);

    const stalled = plane.speed < PLANE.stallSpeed;
    const turnRate = plane.bank * PLANE.turnFactor * (0.35 + 0.65 * (plane.speed / PLANE.maxSpeed));
    plane.heading += turnRate * dt;
    const forwardX = Math.sin(plane.heading);
    const forwardZ = Math.cos(plane.heading);
    plane.x += forwardX * plane.speed * dt;
    plane.z += forwardZ * plane.speed * dt;
    let climb = Math.sin(plane.pitch) * plane.speed;
    if (stalled) climb -= PLANE.sinkRate * (1 - plane.speed / PLANE.stallSpeed);
    plane.verticalSpeed = climb;
    plane.alt += climb * dt;

    // Fuel burns with the throttle; rings top the tank back up.
    const burn = FUEL.burnIdle + (FUEL.burnFull - FUEL.burnIdle) * plane.throttle;
    state.fuel = Math.max(0, state.fuel - burn * dt);
    if (state.fuel <= 0 && !state.lowFuelWarned) {
      state.lowFuelWarned = true;
      events |= EVENT_FUEL_EMPTY;
      flash('FUEL EMPTY — glide her down!', 4);
    } else if (state.fuel < 20 && !state.lowFuelWarned) {
      state.lowFuelWarned = true;
      events |= EVENT_LOW_FUEL;
      flash('LOW FUEL — a ring refuels you', 3);
    }

    // Rings: pass within the hoop and it counts, with a bonus for a low pass.
    const ring = state.rings[state.ringIndex];
    if (ring && !ring.passed) {
      const dx = plane.x - ring.x;
      const dy = plane.alt - ring.alt;
      const dz = plane.z - ring.z;
      if (dx * dx + dy * dy + dz * dz < ring.radius * ring.radius) {
        ring.passed = true;
        state.ringIndex += 1;
        let points = RING.points;
        if (plane.alt < RING.lowCeiling) points += RING.lowPassBonus;
        if (!attract) state.score += points;
        events |= EVENT_RING;
        if (!attract) state.fuel = Math.min(FUEL.max, state.fuel + FUEL.ringBonus);
        flash(
          state.ringIndex >= state.rings.length
            ? 'All rings! Bring her home to runway 09.'
            : `Ring ${state.ringIndex} of ${state.rings.length} — +${points}`,
          2.5,
        );
      }
    }

    // The valley ends: turn the plane gently back toward the field instead of flying off the map.
    if (plane.z > VALLEY_END_Z - 60 || plane.z < VALLEY_START_Z - 40 || Math.abs(plane.x) > 900) {
      plane.heading = Math.atan2(-plane.x * 0.2 + (RUNWAY.x - plane.x) * 0.001, 1);
      if (plane.z > VALLEY_END_Z - 60) plane.heading = Math.PI;
      flash('Edge of the valley — turning back', 2);
    }

    // Ground contact: the runway forgives a gentle touchdown, the valley does not.
    const ground = terrain.heightAt(plane.x, plane.z);
    if (plane.alt <= ground + 1.5) {
      const onRunway = terrain.isRunway(plane.x, plane.z);
      const gentle = plane.verticalSpeed > -LANDING.maxSink && plane.speed < LANDING.maxSpeed;
      if (onRunway && gentle) {
        plane.alt = RUNWAY_ALT + 1.5;
        if (state.ringIndex >= state.rings.length) {
          state.phase = PHASE_DONE;
          state.landed = true;
          const centreBonus = Math.max(0, 1 - Math.abs(plane.x - RUNWAY.x) / RUNWAY.halfWidth);
          const speedBonus = Math.max(0, 1 - plane.speed / LANDING.maxSpeed);
          state.landingQuality = Math.round((centreBonus * 0.6 + speedBonus * 0.4) * LANDING.qualityBonus);
          const timeBonus = Math.max(0, Math.round((state.mission.parSeconds - state.elapsed) * 5));
          if (!attract) state.score += LANDING.basePoints + state.landingQuality + timeBonus;
          events |= EVENT_LANDED;
          flash(`Down safe on runway 09! Landing +${LANDING.basePoints + state.landingQuality}`, 5);
        } else {
          // A touch-and-go before the rings are done: a small bonus, then back up.
          if (!attract) state.score += 50;
          events |= EVENT_TOUCH_GO;
          plane.alt = RUNWAY_ALT + 26;
          plane.speed = Math.max(plane.speed, 52);
          plane.pitch = 0.18;
          flash('Touch-and-go! +50 — rings first, then land.', 2.5);
        }
      } else if (attract) {
        // The title screen's backdrop flight never ends the sortie: relaunch silently.
        respawn();
      } else {
        // A crash: hull takes the hit, and the sortie ends when it runs out.
        state.hull -= gentle ? HULL.hardLandingDamage : HULL.crashDamage;
        events |= EVENT_CRASH;
        if (state.hull <= 0) {
          state.hull = 0;
          state.phase = PHASE_OVER;
          events |= EVENT_OVER;
          flash('Kestrel down. Sortie over.', 5);
        } else {
          flash(`Terrain strike! Hull ${Math.round(state.hull)}% — patched and relaunched.`, 3);
          respawn();
        }
      }
    }
    return events;
  }

  function reset() {
    startMission(0);
  }

  startMission(0);
  return {
    state,
    plane,
    terrain,
    startMission,
    reset,
    step,
    flash,
    get goAround() {
      return goAround;
    },
    set goAround(value) {
      goAround = value;
    },
  };
}
