// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, mission complete and
// game over.
//
// ?seed=N fixes the valley. ?shot=start|play|land|complete (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CRASH, EVENT_FUEL_EMPTY, EVENT_LANDED, EVENT_LOW_FUEL, EVENT_OVER, EVENT_RING, EVENT_TOUCH_GO } from './world.js';
import { ACTION_CONFIRM, ACTION_MISSION_1, ACTION_MISSION_2, ACTION_MISSION_3, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_DONE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, scene.best, performance.now());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let warnedFuel = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each event.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(missionIndex) {
    world.startMission(missionIndex);
    accumulator = 0;
    warnedFuel = false;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(`Flying ${world.state.mission.name}. ${world.state.mission.brief}`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Sortie over. Score ${world.state.score}. Best ${best}.`);
  }

  function missionDone() {
    screen = SCREEN_DONE;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Sortie complete. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MISSION_1 && screen !== SCREEN_PLAY) startGame(0);
    else if (actions & ACTION_MISSION_2 && screen !== SCREEN_PLAY) startGame(1);
    else if (actions & ACTION_MISSION_3 && screen !== SCREEN_PLAY) startGame(2);
    else if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame(world.state.missionIndex);
    else if (actions & ACTION_CONFIRM && (screen === SCREEN_OVER || screen === SCREEN_DONE)) startGame(world.state.missionIndex);
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Flying.');
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The title screen flies itself over the valley.
      const pilot = { steer: 0, elevator: 0, throttle: 0 };
      const target = world.state.rings[world.state.ringIndex];
      if (target) {
        const dx = target.x - world.plane.x;
        const dz = target.z - world.plane.z;
        const want = Math.atan2(dx, dz);
        let err = want - world.plane.heading;
        while (err > Math.PI) err -= Math.PI * 2;
        while (err < -Math.PI) err += Math.PI * 2;
        pilot.steer = Math.max(-1, Math.min(1, err * 1.6));
        // Keep clear of the hills ahead on the title screen's backdrop flight.
        const groundAhead = world.terrain.heightAt(world.plane.x, world.plane.z + 150);
        const wantAlt = Math.max(target.alt, groundAhead + 25);
        pilot.elevator = Math.max(-1, Math.min(1, (wantAlt - world.plane.alt) / 22));
        pilot.throttle = world.plane.speed < 58 ? 1 : world.plane.speed > 66 ? -1 : 0;
      }
      world.step(STEP, pilot.steer, pilot.elevator, pilot.throttle, true);
      if (world.state.phase !== 'fly') world.startMission(world.state.missionIndex);
      return;
    }
    const events = world.step(STEP, input.steer(), input.elevator(), input.throttleDelta(), false);
    if (events & EVENT_RING) {
      audio.ring();
      announce(world.state.message);
    }
    if (events & EVENT_TOUCH_GO) announce(world.state.message);
    if (events & EVENT_LANDED) {
      audio.landed();
      missionDone();
    } else if (events & EVENT_OVER) {
      audio.crash();
      endGame();
    } else if (events & EVENT_CRASH) {
      audio.crash();
      announce(world.state.message);
    }
    if ((events & EVENT_LOW_FUEL) && !warnedFuel) {
      warnedFuel = true;
      audio.warning();
      announce('Low fuel.');
    }
    if (events & EVENT_FUEL_EMPTY) {
      audio.warning();
      announce('Fuel empty.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    audio.engine(world.plane.throttle, world.plane.speed, screen === SCREEN_PLAY);
    renderer.draw(world, screen, best, now);
  }

  // Leaving the tab pauses a running game rather than letting the valley pass unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Skyhaven Rally. Press Space or click to fly Ring Run. Keys 1, 2 and 3 pick a sortie.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
