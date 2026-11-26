// Drawing only: the world's state and the current screen in, pixels out. The chase camera
// sits behind and above the Kestrel-7 and looks down the valley; the ground is drawn as a
// grid of projected quads in camera space (near rows first out of the painter's way, far
// rows first on the page), so the river, the town, the runway and the ridges are all real
// terrain, not a backdrop. The plane, the rings and the HUD are drawn over it.

import { FIELD, FONT, PALETTE } from './config.js';
import { RUNWAY, RUNWAY_ALT, WATER_LEVEL } from './terrain.js';
import { PHASE_DONE, PHASE_OVER } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_DONE = 'done';

/** Camera: metres behind the plane, metres above it, and how far ahead it looks. */
const CAM_BACK = 26;
const CAM_UP = 7;
const CAM_LOOK = 80;
/** Focal length in logical pixels for a ~60 degree vertical field of view. */
const FOCAL = 620;
/** The horizon sits just above the middle of the frame. */
const HORIZON_Y = FIELD.height * 0.5;

/** Terrain grid: 26 depth rows, 28 columns, from 28 m to 900 m ahead. */
const ROWS = 26;
const COLS = 28;
const ROW_DEPTH = [];
for (let i = 0; i < ROWS; i += 1) ROW_DEPTH.push(28 * Math.pow(900 / 28, i / (ROWS - 1)));
const RING_POINTS = 22;

const COVER_COLOR = {
  water: PALETTE.water,
  sand: PALETTE.sand,
  grass: PALETTE.grassLow,
  high: PALETTE.grassHigh,
  rock: PALETTE.rock,
  snow: PALETTE.snow,
};

function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `600 ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline ?? 'alphabetic';
    context.fillText(value, x, y);
  }

  function headingDegrees(heading) {
    let deg = Math.round(((heading * 180) / Math.PI) % 360);
    if (deg < 0) deg += 360;
    return deg;
  }

  /** Camera frame for this plane position: origin, axes, pitch and focal length. */
  function cameraFor(plane) {
    const fx = Math.sin(plane.heading);
    const fz = Math.cos(plane.heading);
    const rx = Math.cos(plane.heading);
    const rz = -Math.sin(plane.heading);
    const camX = plane.x - fx * CAM_BACK;
    const camZ = plane.z - fz * CAM_BACK;
    const camY = plane.alt + CAM_UP;
    const lookY = plane.alt - 4;
    const pitch = Math.atan2(camY - lookY, CAM_LOOK);
    return { x: camX, y: camY, z: camZ, fx, fz, rx, rz, pitch, cos: Math.cos(pitch), sin: Math.sin(pitch) };
  }

  /** Project a world point to logical screen coordinates; null when behind the camera. */
  function project(wx, wy, wz, cam) {
    const dx = wx - cam.x;
    const dy = wy - cam.y;
    const dz = wz - cam.z;
    const cx = dx * cam.rx + dz * cam.rz;
    const cy = dy;
    const cz = dx * cam.fx + dz * cam.fz;
    const y2 = cy * cam.cos + cz * cam.sin;
    const z2 = -cy * cam.sin + cz * cam.cos;
    if (z2 < 2) return null;
    return {
      x: FIELD.width / 2 + (FOCAL * cx) / z2,
      y: HORIZON_Y - (FOCAL * y2) / z2,
      z: z2,
    };
  }

  function drawSky(now) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height * 0.62);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.55, PALETTE.skyMid);
    gradient.addColorStop(1, PALETTE.skyLow);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height * 0.62);
    // The sun, high over the ridge.
    const sunX = FIELD.width * 0.82;
    const sunY = FIELD.height * 0.1;
    const glow = context.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    glow.addColorStop(0, 'rgba(255,243,196,0.95)');
    glow.addColorStop(0.25, 'rgba(255,243,196,0.55)');
    glow.addColorStop(1, 'rgba(255,243,196,0)');
    context.fillStyle = glow;
    context.fillRect(sunX - 90, sunY - 90, 180, 180);
    context.fillStyle = PALETTE.sun;
    context.beginPath();
    context.arc(sunX, sunY, 22, 0, Math.PI * 2);
    context.fill();
    void now;
  }

  function drawClouds(terrain, cam, now) {
    for (const cloud of terrain.clouds) {
      const driftedX = cloud.x + ((now / 1000) * cloud.drift) % 1400;
      const p = project(driftedX - 700, cloud.y, cloud.z, cam);
      if (p === null || p.z > 1100) continue;
      const scale = Math.min(1.6, FOCAL / p.z);
      context.fillStyle = PALETTE.cloud;
      context.globalAlpha = Math.max(0.25, Math.min(0.9, 420 / p.z));
      context.beginPath();
      context.ellipse(p.x, p.y, cloud.rx * scale, cloud.ry * scale, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(p.x + cloud.rx * scale * 0.4, p.y - cloud.ry * scale * 0.4, cloud.rx * scale * 0.55, cloud.ry * scale * 0.7, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
    }
  }

  /** The far ridge: a silhouette band beyond the grid, so the valley never ends in flat sky. */
  function drawRidge(terrain, cam) {
    const farZ = cam.z + 1350;
    context.beginPath();
    let started = false;
    for (let x = -900; x <= 900; x += 60) {
      const wx = cam.x + x;
      const h = terrain.heightAt(wx, farZ) + 8;
      const p = project(wx, h, farZ, cam);
      if (p === null) continue;
      if (!started) {
        context.moveTo(p.x, p.y);
        started = true;
      } else context.lineTo(p.x, p.y);
    }
    if (!started) return;
    context.lineTo(FIELD.width, HORIZON_Y);
    context.lineTo(0, HORIZON_Y);
    context.closePath();
    context.fillStyle = shade(PALETTE.rock, 0.72);
    context.fill();
  }

  /** One quad of ground, coloured by what the valley holds there. The stroke in the same
   * colour closes the hairline seams the antialiaser leaves between neighbours. */
  function drawGroundQuad(p00, p10, p11, p01, color) {
    if (p00 === null || p10 === null || p11 === null || p01 === null) return;
    context.fillStyle = color;
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(p00.x, p00.y);
    context.lineTo(p10.x, p10.y);
    context.lineTo(p11.x, p11.y);
    context.lineTo(p01.x, p01.y);
    context.closePath();
    context.fill();
    context.stroke();
  }

  function drawGround(world, cam) {
    const terrain = world.terrain;
    // Project the grid into a table first: rows far to near, columns left to right.
    const grid = [];
    for (let r = 0; r < ROWS; r += 1) {
      const d = ROW_DEPTH[r];
      const halfWidth = 60 + d * 0.75;
      const row = [];
      for (let c = 0; c <= COLS; c += 1) {
        const lat = -halfWidth + (2 * halfWidth * c) / COLS;
        const wx = cam.x + cam.fx * d + cam.rx * lat;
        const wz = cam.z + cam.fz * d + cam.rz * lat;
        const wy = terrain.heightAt(wx, wz);
        row.push({ p: project(wx, wy, wz, cam), wx, wz, wy });
      }
      grid.push(row);
    }
    // Paint far rows first so near ground covers them.
    for (let r = ROWS - 1; r > 0; r -= 1) {
      const near = grid[r - 1];
      const far = grid[r];
      const d = ROW_DEPTH[r];
      const fade = Math.min(1, 320 / d);
      for (let c = 0; c < COLS; c += 1) {
        const cell = far[c];
        let color;
        if (terrain.isRunway(cell.wx, cell.wz)) {
          color = shade(PALETTE.runway, 0.9 + fade * 0.1);
        } else if (terrain.isCity(cell.wx, cell.wz)) {
          // Streets read as blocks: alternate the shade by city block.
          const block = (Math.floor(cell.wx / 34) + Math.floor(cell.wz / 34)) % 2 === 0 ? 0.94 : 1.06;
          color = shade(PALETTE.cityGround, (0.85 + fade * 0.15) * block);
        } else {
          const cover = terrain.coverAt(cell.wx, cell.wz);
          color = shade(COVER_COLOR[cover], 0.72 + fade * 0.28);
          if (cover === 'water') color = shade(cell.wy < 1 ? PALETTE.waterDeep : PALETTE.water, 0.8 + fade * 0.2);
        }
        drawGroundQuad(near[c].p, near[c + 1].p, far[c + 1].p, far[c].p, color);
      }
    }
    drawRunwayMarkings(world, cam);
  }

  /** Centreline dashes, threshold bars and edge lights on the runway strip. */
  function drawRunwayMarkings(world, cam) {
    const terrain = world.terrain;
    if (!terrain.isRunway(cam.x, cam.z + 200) && cam.z < RUNWAY.zStart - 500) return;
    for (let z = RUNWAY.zStart + 12; z < RUNWAY.zEnd - 8; z += 44) {
      const a = project(RUNWAY.x, RUNWAY_ALT + 0.4, z, cam);
      const b = project(RUNWAY.x, RUNWAY_ALT + 0.4, z + 20, cam);
      if (a === null || b === null) continue;
      context.strokeStyle = PALETTE.runwayMark;
      context.lineWidth = Math.max(1, 260 / a.z);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    // Threshold bars at both ends.
    for (const z of [RUNWAY.zStart + 6, RUNWAY.zEnd - 6]) {
      for (let k = -2; k <= 2; k += 1) {
        const a = project(RUNWAY.x + k * 6 - 3, RUNWAY_ALT + 0.4, z, cam);
        const b = project(RUNWAY.x + k * 6 + 3, RUNWAY_ALT + 0.4, z, cam);
        if (a === null || b === null) continue;
        context.strokeStyle = PALETTE.runwayMark;
        context.lineWidth = Math.max(1, 200 / a.z);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }
    // The big 09 on the threshold, facing the approach.
    const num = project(RUNWAY.x, RUNWAY_ALT + 0.6, RUNWAY.zStart + 34, cam);
    if (num !== null && num.z < 700) {
      text('09', num.x, num.y, Math.max(10, 9000 / num.z), PALETTE.runwayMark, 'center', 'middle');
    }
  }

  /** Skyhaven's buildings as shaded boxes, nearest first within the draw list. */
  function drawBuildings(terrain, cam) {
    const boxes = [];
    for (const b of terrain.buildings) {
      const centre = project(b.x, b.h, b.z, cam);
      if (centre === null || centre.z > 900 || centre.x < -120 || centre.x > FIELD.width + 120) continue;
      boxes.push({ b, centre });
    }
    boxes.sort((a, b) => b.centre.z - a.centre.z);
    for (const { b } of boxes) {
      const hw = b.w / 2;
      const hd = b.d / 2;
      const base = terrain.heightAt(b.x, b.z);
      const corners = [
        project(b.x - hw, base, b.z - hd, cam),
        project(b.x + hw, base, b.z - hd, cam),
        project(b.x + hw, base, b.z + hd, cam),
        project(b.x - hw, base, b.z + hd, cam),
        project(b.x - hw, base + b.h, b.z - hd, cam),
        project(b.x + hw, base + b.h, b.z - hd, cam),
        project(b.x + hw, base + b.h, b.z + hd, cam),
        project(b.x - hw, base + b.h, b.z + hd, cam),
      ];
      if (corners.some((p) => p === null)) continue;
      const poly = (indices, fill) => {
        context.fillStyle = fill;
        context.beginPath();
        context.moveTo(corners[indices[0]].x, corners[indices[0]].y);
        for (let i = 1; i < indices.length; i += 1) context.lineTo(corners[indices[i]].x, corners[indices[i]].y);
        context.closePath();
        context.fill();
      };
      poly([1, 2, 6, 5], shade(PALETTE.buildingSide, b.shade));
      poly([2, 3, 7, 6], shade(PALETTE.building, b.shade * 1.05));
      poly([4, 5, 6, 7], shade(PALETTE.cityRoof, b.shade * 1.1));
    }
  }

  /** The mission's rings: gold for the next one, pale for the rest, each a hoop in the sky. */
  function drawRings(world, cam) {
    const plane = world.plane;
    for (let i = world.state.ringIndex; i < world.state.rings.length; i += 1) {
      const ring = world.state.rings[i];
      const centre = project(ring.x, ring.alt, ring.z, cam);
      if (centre === null || centre.z > 1300) continue;
      const next = i === world.state.ringIndex;
      const rx = Math.cos(plane.heading);
      const rz = -Math.sin(plane.heading);
      context.beginPath();
      for (let k = 0; k <= RING_POINTS; k += 1) {
        const a = (k / RING_POINTS) * Math.PI * 2;
        const wx = ring.x + rx * Math.cos(a) * ring.radius;
        const wy = ring.alt + Math.sin(a) * ring.radius;
        const wz = ring.z + rz * Math.cos(a) * ring.radius;
        const p = project(wx, wy, wz, cam);
        if (p === null) continue;
        if (k === 0) context.moveTo(p.x, p.y);
        else context.lineTo(p.x, p.y);
      }
      context.closePath();
      context.fillStyle = next ? 'rgba(255,201,60,0.16)' : 'rgba(232,242,248,0.07)';
      context.fill();
      context.strokeStyle = next ? PALETTE.ringNext : PALETTE.ringLater;
      context.lineWidth = next ? Math.max(2, 900 / centre.z) : Math.max(1, 500 / centre.z);
      context.stroke();
      if (next) {
        const dx = ring.x - plane.x;
        const dy = ring.alt - plane.alt;
        const dz = ring.z - plane.z;
        const dist = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
        const label = `RING ${i + 1}/${world.state.rings.length}  ·  ${dist} m`;
        text(label, centre.x, centre.y - (FOCAL * ring.radius) / centre.z - 14, 20, PALETTE.ringNext, 'center', 'alphabetic');
      }
    }
  }

  /** The Kestrel-7 from behind and above, banked with the turn, prop spinning. */
  function drawPlane(world, now) {
    const plane = world.plane;
    const cam = cameraFor(plane);
    const ground = world.terrain.heightAt(plane.x, plane.z);
    const shadow = project(plane.x, ground + 1, plane.z, cam);
    if (shadow !== null) {
      const size = Math.max(6, 5200 / Math.max(40, plane.alt - ground));
      context.fillStyle = 'rgba(10,14,24,0.28)';
      context.beginPath();
      context.ellipse(shadow.x, shadow.y, size, size * 0.32, 0, 0, Math.PI * 2);
      context.fill();
    }
    const px = FIELD.width / 2;
    const py = FIELD.height * 0.66;
    const scale = 1 + Math.max(0, (90 - plane.alt) / 300);
    context.save();
    context.translate(px, py);
    context.rotate(-plane.bank * 0.85);
    context.scale(scale, scale);
    // Prop blur and blades, at the nose (top of the sprite, away from the camera).
    const spin = (now / 90) % (Math.PI * 2);
    context.fillStyle = 'rgba(200,215,230,0.28)';
    context.beginPath();
    context.ellipse(0, -58, 34, 8, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(40,48,60,0.75)';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(-Math.cos(spin) * 30, -58 - Math.sin(spin) * 7);
    context.lineTo(Math.cos(spin) * 30, -58 + Math.sin(spin) * 7);
    context.stroke();
    // Tail fin and stabilisers.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(0, 62);
    context.lineTo(-10, 34);
    context.lineTo(10, 34);
    context.closePath();
    context.fill();
    context.fillRect(-34, 44, 68, 9);
    // Wings, swept back, cream-tipped.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(-14, -6);
    context.lineTo(-96, 26);
    context.lineTo(-96, 38);
    context.lineTo(-12, 22);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(14, -6);
    context.lineTo(96, 26);
    context.lineTo(96, 38);
    context.lineTo(12, 22);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.planeCream;
    context.fillRect(-96, 26, 14, 12);
    context.fillRect(82, 26, 14, 12);
    // Fuselage: orange over cream, nose to tail.
    context.fillStyle = PALETTE.planeBody;
    context.beginPath();
    context.moveTo(0, -62);
    context.quadraticCurveTo(15, -30, 13, 6);
    context.quadraticCurveTo(12, 40, 7, 62);
    context.lineTo(-7, 62);
    context.quadraticCurveTo(-12, 40, -13, 6);
    context.quadraticCurveTo(-15, -30, 0, -62);
    context.fill();
    context.fillStyle = PALETTE.planeCream;
    context.beginPath();
    context.moveTo(0, -62);
    context.quadraticCurveTo(6, -30, 5, 6);
    context.lineTo(-5, 6);
    context.quadraticCurveTo(-6, -30, 0, -62);
    context.fill();
    // Canopy glass and the pilot's helmet.
    context.fillStyle = PALETTE.planeGlass;
    context.beginPath();
    context.ellipse(0, -18, 8, 15, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.55)';
    context.beginPath();
    context.ellipse(-3, -24, 3, 6, -0.4, 0, Math.PI * 2);
    context.fill();
    // Nav lights: red port, green starboard, blinking with the clock.
    const blink = Math.floor(now / 500) % 2 === 0;
    if (blink) {
      context.fillStyle = '#ff4d4d';
      context.beginPath();
      context.arc(-97, 32, 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#4dff88';
      context.beginPath();
      context.arc(97, 32, 4, 0, Math.PI * 2);
      context.fill();
    }
    // Wheels down when she is low.
    if (plane.alt - ground < 45) {
      context.fillStyle = '#22262c';
      context.beginPath();
      context.arc(-9, 52, 5, 0, Math.PI * 2);
      context.arc(9, 52, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  /** The lit instruments: altitude, speed, heading, throttle, fuel, hull and the horizon ball. */
  function drawHud(world, now) {
    const plane = world.plane;
    const state = world.state;
    const ground = world.terrain.heightAt(plane.x, plane.z);
    const agl = Math.max(0, plane.alt - ground);
    context.fillStyle = 'rgba(10,16,28,0.72)';
    context.fillRect(0, 0, FIELD.width, 64);
    text(`ALT ${Math.round(plane.alt * 3.281)} ft`, 22, 26, 26, PALETTE.text, 'left', 'middle');
    text(`AGL ${Math.round(agl * 3.281)} ft`, 22, 50, 16, PALETTE.muted, 'left', 'middle');
    text(`SPD ${Math.round(plane.speed * 1.944)} kt`, 250, 26, 26, PALETTE.text, 'left', 'middle');
    text(`THR ${Math.round(plane.throttle * 100)}%`, 250, 50, 16, PALETTE.muted, 'left', 'middle');
    const hdg = headingDegrees(plane.heading);
    text(`HDG ${String(hdg).padStart(3, '0')}°`, 480, 26, 26, PALETTE.text, 'left', 'middle');
    // Compass tape under the heading.
    const marks = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let k = -2; k <= 2; k += 1) {
      const idx = ((Math.round(hdg / 45) + k) % 8 + 8) % 8;
      const x = 560 + k * 44;
      text(marks[idx], x, 50, 15, k === 0 ? PALETTE.gold : PALETTE.muted, 'center', 'middle');
    }
    text(`${state.mission.name.toUpperCase()}`, FIELD.width - 22, 22, 22, PALETTE.text, 'right', 'middle');
    text(
      `SCORE ${state.score}   RINGS ${state.ringIndex}/${state.rings.length}   ${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}`,
      FIELD.width - 22,
      48,
      16,
      PALETTE.muted,
      'right',
      'middle',
    );

    // Fuel and hull bars, bottom right.
    const barX = FIELD.width - 252;
    const barY = FIELD.height - 58;
    context.fillStyle = 'rgba(10,16,28,0.55)';
    context.fillRect(barX - 12, barY - 14, 240, 66);
    text('FUEL', barX, barY + 4, 15, state.fuel < 20 ? PALETTE.danger : PALETTE.muted, 'left', 'middle');
    context.fillStyle = '#222a38';
    context.fillRect(barX + 56, barY - 4, 160, 14);
    context.fillStyle = state.fuel < 20 ? PALETTE.danger : state.fuel < 45 ? PALETTE.gold : PALETTE.good;
    context.fillRect(barX + 56, barY - 4, 160 * (state.fuel / 100), 14);
    text('HULL', barX, barY + 30, 15, state.hull < 35 ? PALETTE.danger : PALETTE.muted, 'left', 'middle');
    context.fillStyle = '#222a38';
    context.fillRect(barX + 56, barY + 22, 160, 14);
    context.fillStyle = state.hull < 35 ? PALETTE.danger : PALETTE.good;
    context.fillRect(barX + 56, barY + 22, 160 * (state.hull / 100), 14);

    drawAttitude(world);
    drawRingPointer(world);

    // Warnings, flashing at the top centre.
    const warnings = [];
    if (state.fuel < 20 && state.fuel > 0) warnings.push('LOW FUEL');
    if (state.fuel <= 0) warnings.push('FUEL EMPTY — GLIDE!');
    if (plane.speed < 24 && plane.alt - ground > 8) warnings.push('STALL — NOSE DOWN, THROTTLE UP');
    if (agl < 14 && plane.verticalSpeed < -4) warnings.push('TERRAIN!');
    if (warnings.length > 0 && Math.floor(now / 450) % 2 === 0) {
      text(warnings.join('  •  '), FIELD.width / 2, 96, 24, PALETTE.danger, 'center', 'middle');
    }
    if (state.messageTimer > 0) {
      context.fillStyle = 'rgba(10,16,28,0.6)';
      const w = context.measureText(state.message).width + 36;
      context.fillRect(FIELD.width / 2 - w / 2, FIELD.height - 118, w, 36);
      text(state.message, FIELD.width / 2, FIELD.height - 100, 19, PALETTE.gold, 'center', 'middle');
    }
  }

  /** The attitude ball: sky and ground split by the horizon, rolled with the bank. */
  function drawAttitude(world) {
    const plane = world.plane;
    const cx = 72;
    const cy = FIELD.height - 72;
    const r = 46;
    context.save();
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.clip();
    context.translate(cx, cy);
    context.rotate(-plane.bank);
    context.translate(0, plane.pitch * 220);
    context.fillStyle = '#4a90c4';
    context.fillRect(-r - 4, -r * 2 - 4, r * 2 + 8, r * 2 + 4);
    context.fillStyle = '#7a5a34';
    context.fillRect(-r - 4, 0, r * 2 + 8, r * 2 + 4);
    context.fillStyle = '#f2f5f8';
    context.fillRect(-r - 4, -1.5, r * 2 + 8, 3);
    context.restore();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.gold;
    context.beginPath();
    context.moveTo(cx, cy - 4);
    context.lineTo(cx - 12, cy + 6);
    context.lineTo(cx + 12, cy + 6);
    context.closePath();
    context.fill();
    text('ATT', cx, cy + r + 18, 13, PALETTE.muted, 'center', 'middle');
  }

  /** A chevron pointing at the next ring, for when the hoop itself is off-frame. */
  function drawRingPointer(world) {
    const ring = world.state.rings[world.state.ringIndex];
    if (!ring) return;
    // The ring itself is the pointer when it is in frame: no chevron on top of its label.
    const cam = cameraFor(world.plane);
    const centre = project(ring.x, ring.alt, ring.z, cam);
    if (centre !== null && centre.x > 40 && centre.x < FIELD.width - 40 && centre.y > 70 && centre.y < FIELD.height - 60) return;
    const plane = world.plane;
    const dx = ring.x - plane.x;
    const dz = ring.z - plane.z;
    const bearing = Math.atan2(dx, dz) - plane.heading;
    const rel = Math.atan2(Math.sin(bearing), Math.cos(bearing));
    const ahead = Math.abs(rel) < 0.6;
    const px = FIELD.width / 2 + Math.sin(rel) * 260;
    const py = FIELD.height * 0.3 + (ahead ? 0 : 60);
    context.save();
    context.translate(Math.max(60, Math.min(FIELD.width - 60, px)), py);
    context.rotate(rel);
    context.fillStyle = PALETTE.ringNext;
    context.beginPath();
    context.moveTo(0, -14);
    context.lineTo(12, 10);
    context.lineTo(-12, 10);
    context.closePath();
    context.fill();
    context.restore();
  }

  /** Wind streaks at the frame's edges when she is fast. */
  function drawSpeedLines(world, now) {
    const speed = world.plane.speed;
    if (speed < 58) return;
    const strength = Math.min(1, (speed - 58) / 30);
    context.strokeStyle = `rgba(255,255,255,${0.35 * strength})`;
    context.lineWidth = 2;
    for (let i = 0; i < 7; i += 1) {
      const seed = (i * 173 + Math.floor(now / 90)) % 97;
      const y = 60 + ((seed * 53) % (FIELD.height - 140));
      const x = seed % 2 === 0 ? 14 + (seed % 30) : FIELD.width - 44 + (seed % 30);
      const len = 26 + (speed - 58) * 1.1;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (seed % 2 === 0 ? len : -len), y);
      context.stroke();
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 720;
    const lineHeight = 32;
    const height = 150 + lines.length * lineHeight + 66;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, FIELD.width / 2, y + 66, 44, accent ?? PALETTE.text, 'center', 'alphabetic');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 122 + i * lineHeight, 21, PALETTE.muted, 'center', 'alphabetic');
    }
    text(prompt, FIELD.width / 2, y + height - 34, 22, PALETTE.gold, 'center', 'alphabetic');
  }

  /** Paint one frame: sky, ridge, ground, town, rings, plane, HUD, then the screen's panel. */
  function draw(world, screen, best, now) {
    const plane = world.plane;
    const cam = cameraFor(plane);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawSky(now);
    drawRidge(world.terrain, cam);
    drawGround(world, cam);
    drawBuildings(world.terrain, cam);
    drawClouds(world.terrain, cam, now);
    drawRings(world, cam);
    drawPlane(world, now);
    drawSpeedLines(world, now);
    if (screen === SCREEN_TITLE) {
      const state = world.state;
      drawPanel(
        'SKYHAVEN RALLY',
        [
          'Fly the Kestrel-7 down the valley — rings first, runway last.',
          '1  Ring Run    2  River Run    3  Storm Ridge',
          'Steer ← → or A D, climb and dive ↑ ↓ or W S, throttle Q E.',
          'Mouse steers too. Rings refuel you. Land gentle on runway 09.',
          `Best score: ${best}`,
        ],
        state.missionIndex === 0 ? 'Press Space or click — Ring Run' : `Press Space — ${state.mission.name}`,
        PALETTE.gold,
      );
      return;
    }
    drawHud(world, now);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The valley will wait for you.'], 'Press P to keep flying');
    } else if (screen === SCREEN_DONE) {
      const state = world.state;
      drawPanel(
        'SORTIE COMPLETE',
        [
          `${state.mission.name} — landed on runway 09.`,
          `Score ${state.score}   Best ${Math.max(best, state.score)}`,
          `Time ${Math.floor(state.elapsed / 60)}:${String(Math.floor(state.elapsed % 60)).padStart(2, '0')}   Hull ${Math.round(state.hull)}%   Fuel ${Math.round(state.fuel)}%`,
          'Press 2 or 3 to fly the next sortie.',
        ],
        'Press Space to fly it again',
        PALETTE.good,
      );
    } else if (screen === SCREEN_OVER) {
      const state = world.state;
      drawPanel(
        'KESTREL DOWN',
        [
          `${state.mission.name} — the sortie is over.`,
          `Score ${state.score}   Best ${Math.max(best, state.score)}`,
          `Rings ${state.ringIndex}/${state.rings.length}`,
        ],
        'Press Space or click to fly again',
        PALETTE.danger,
      );
    }
    void PHASE_DONE;
    void PHASE_OVER;
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, cameraFor, project };
}
