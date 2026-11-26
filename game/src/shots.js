// The screenshot scenes behind ?shot=start|play|land|complete. Each one flies the real rules
// forward from a fresh valley for a fixed stretch, steered by a simple autopilot (bank toward
// the next ring's bearing, pitch toward its height, throttle to hold speed, then a gentle
// glide slope onto runway 09), so the frame is what a real sortie looks like and the same
// seed always gives the same frame.

import { STEP } from './config.js';
import { RUNWAY, RUNWAY_ALT } from './terrain.js';
import { EVENT_LANDED, EVENT_OVER, PHASE_DONE } from './world.js';
import { SCREEN_DONE, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 16;
const STEP_SECONDS = STEP;
const MAX_SECONDS = 420;

/** Wrap an angle to -PI..PI. */
function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/** Where the autopilot is aiming: the next ring, or the runway once they are done. */
function autopilotTarget(world) {
  const state = world.state;
  if (state.ringIndex >= state.rings.length) {
    const plane = world.plane;
    // A go-around: overshot the runway without landing, so climb out, fly back south
    // and re-enter the final from the corridor's start instead of turning low.
    if (world.goAround) {
      if (plane.z < 3500) world.goAround = false;
      else return { x: RUNWAY.x, z: 3300, alt: 80, final: false };
    }
    if (plane.z > RUNWAY.zEnd + 30) {
      world.goAround = true;
      return { x: RUNWAY.x, z: 3300, alt: 80, final: false };
    }
    return { x: RUNWAY.x, z: RUNWAY.zStart + 200, alt: RUNWAY_ALT + 8, final: true };
  }
  const ring = state.rings[state.ringIndex];
  return { x: ring.x, z: ring.z, alt: ring.alt, final: false };
}

/** Steer, pitch and throttle for one step toward the target. */
function autopilot(world) {
  const plane = world.plane;
  const target = autopilotTarget(world);
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const wantHeading = Math.atan2(dx, dz);
  const steer = clamp(wrapAngle(wantHeading - plane.heading) * 1.6, -1, 1);
  // Stay clear of the ground under and ahead of the plane: the valley's hills can rise
  // above a ring's height, and the final glide must clear them before the flat corridor.
  const groundNear = Math.max(
    world.terrain.heightAt(plane.x, plane.z),
    world.terrain.heightAt(plane.x, plane.z + 150),
  );
  let wantAlt = target.alt;
  if (target.final) {
    // A glide slope onto the runway (7 m up for every 100 m out, bottoming below the
    // touchdown height so the plane actually sets down instead of floating past the
    // threshold), with the terrain floor fading out as the flat corridor takes over.
    const floorWeight = clamp((3600 - plane.z) / 200, 0, 1);
    wantAlt = Math.max(RUNWAY_ALT - 1.5 + Math.max(0, dist - 150) * 0.07, (groundNear + 25) * floorWeight);
  } else {
    wantAlt = Math.max(target.alt, groundNear + 25);
  }
  const elevator = clamp((wantAlt - plane.alt) / 22, -1, 1);
  const wantSpeed = target.final && dist < 900 ? 44 : 62;
  const throttle = plane.speed < wantSpeed - 3 ? 1 : plane.speed > wantSpeed + 3 ? -1 : 0;
  return { steer, elevator, throttle };
}

function fly(world, seconds, until, attract) {
  let events = 0;
  const steps = Math.ceil(seconds / STEP_SECONDS);
  for (let i = 0; i < steps; i += 1) {
    const pilot = autopilot(world);
    events = world.step(STEP_SECONDS, pilot.steer, pilot.elevator, pilot.throttle, attract);
    if (until !== null && until(world, events)) break;
    if (world.state.phase !== 'fly') break;
  }
  return events;
}

/**
 * Set `world` to the named scene (start, play, land or complete; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  if (name === 'play') {
    world.startMission(0);
    fly(world, MAX_SECONDS, (w) => w.state.ringIndex >= 5, false);
    fly(world, 6, null, false);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'land') {
    world.startMission(0);
    fly(world, MAX_SECONDS, (w) => w.state.ringIndex >= w.state.rings.length && w.plane.z > 3420 && w.plane.alt < 42, false);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'complete') {
    world.startMission(0);
    fly(world, MAX_SECONDS, (w, e) => w.state.phase === PHASE_DONE || (e & EVENT_OVER) !== 0, false);
    if (world.state.phase === PHASE_DONE) return { screen: SCREEN_DONE, best: world.state.score };
    if (world.state.phase === 'over') return { screen: SCREEN_OVER, best: world.state.score };
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  world.startMission(0);
  fly(world, START_SECONDS, null, true);
  return { screen: SCREEN_TITLE, best: 0 };
}
