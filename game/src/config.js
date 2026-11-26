// Skyhaven Rally — every tuning number and colour in one place. The world is a valley
// measured in metres: the Lumen river winds down its middle, the town of Skyhaven sits
// mid-valley, and Skyhaven Field's runway waits at the far end. The renderer draws a fixed
// 1280x720 logical frame and scales it to the window, so no rule here depends on screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'skyhaven-rally.best';

/** The Kestrel-7's flight model: arcade, but throttle and turn discipline matter. */
export const PLANE = {
  maxSpeed: 92,
  minSpeed: 18,
  cruiseSpeed: 55,
  /** m/s gained per second at full throttle, before drag. */
  accel: 26,
  drag: 0.55,
  /** Radians of bank per second of steering input. */
  bankRate: 1.9,
  maxBank: 1.05,
  /** Heading turns with bank and speed; a slow plane turns wide. */
  turnFactor: 0.55,
  /** Radians of pitch per second of steering input. */
  pitchRate: 0.62,
  maxPitch: 0.42,
  /** Below this speed the wings stop answering and the plane sinks. */
  stallSpeed: 24,
  sinkRate: 9,
};

export const FUEL = {
  max: 100,
  /** Percent burned per second at full throttle; half that at idle. */
  burnFull: 0.55,
  burnIdle: 0.22,
  /** Fuel a ring gives back when flown through. */
  ringBonus: 7,
};

export const HULL = {
  max: 100,
  /** Hull lost in one terrain crash. */
  crashDamage: 34,
  /** Hull lost in a hard touchdown. */
  hardLandingDamage: 18,
};

export const RING = {
  /** How close the plane's centre must pass to a ring's centre to count. */
  radius: 20,
  /** Points for flying a ring, plus its low-pass bonus when one applies. */
  points: 100,
  lowPassBonus: 50,
  /** A ring counts as low when passed below this altitude. */
  lowCeiling: 60,
};

export const LANDING = {
  /** A touchdown counts when the vertical speed is below this (m/s) and the speed below maxSpeed. */
  maxSink: 7,
  maxSpeed: 58,
  basePoints: 300,
  /** Bonus for touching down slow and near the centreline. */
  qualityBonus: 200,
};

export const MISSIONS = [
  {
    id: 1,
    name: 'Ring Run',
    brief: 'Thread six rings down the valley, then put her down on runway 09.',
    rings: 6,
    ringAltMin: 70,
    ringAltMax: 140,
    fuelStart: 100,
    parSeconds: 150,
  },
  {
    id: 2,
    name: 'River Run',
    brief: 'Six rings low over the Lumen — stay under 60 m for the low-pass bonus.',
    rings: 6,
    ringAltMin: 24,
    ringAltMax: 52,
    fuelStart: 100,
    parSeconds: 150,
  },
  {
    id: 3,
    name: 'Storm Ridge',
    brief: 'Eight rings over the high ridge, half a tank of fuel. Fly clean.',
    rings: 8,
    ringAltMin: 80,
    ringAltMax: 150,
    fuelStart: 55,
    parSeconds: 190,
  },
];

export const PALETTE = {
  backdrop: '#0b1020',
  skyTop: '#2f6fb4',
  skyMid: '#7db4dd',
  skyLow: '#cfe8f2',
  sun: '#fff3c4',
  cloud: 'rgba(255,255,255,0.85)',
  grassLow: '#5d9b3f',
  grassMid: '#4c8a37',
  grassHigh: '#7a8a4a',
  rock: '#8a7a68',
  snow: '#e8eef2',
  water: '#2f7fb8',
  waterDeep: '#1f5f92',
  sand: '#c9b078',
  cityGround: '#7e858e',
  cityRoof: '#6b7280',
  building: '#7d838d',
  buildingSide: '#5d636d',
  runway: '#33373d',
  runwayMark: '#f2f2e8',
  ringNext: '#ffc93c',
  ringLater: '#e8f2f8',
  planeBody: '#e8590c',
  planeCream: '#f8ead0',
  planeGlass: '#1e5f8a',
  panel: 'rgba(12,18,32,0.88)',
  panelEdge: '#3a4a63',
  text: '#f2f5f8',
  muted: '#aab6c6',
  gold: '#ffc93c',
  danger: '#ff5a4e',
  good: '#7ddb6a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
