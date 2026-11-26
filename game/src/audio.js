// Sound, synthesised live with WebAudio — no audio files, no network. The engine hum
// follows the throttle, a chime marks each ring, a low beep warns of low fuel and a thud
// marks a crash. Everything is created lazily on the first user gesture; silent when the
// browser refuses audio (headless screenshots, muted tabs).

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(context.destination);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(frequency, duration, type, volume, when) {
    if (context === null || muted) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      const start = context.currentTime + (when ?? 0);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    } catch {
      // Audio is decoration; a failure never stops the game.
    }
  }

  return {
    /** Call from a user gesture so the browser lets audio start. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    /** Engine hum follows throttle and speed; call every frame while flying. */
    engine(throttle, speed, flying) {
      if (!ensure() || muted || !flying) {
        if (engineGain !== null) engineGain.gain.value = 0;
        return;
      }
      engineOsc.frequency.value = 46 + throttle * 44 + speed * 0.35;
      engineGain.gain.value = 0.028 + throttle * 0.035;
    },
    ring() {
      blip(880, 0.28, 'sine', 0.16);
      blip(1318, 0.4, 'sine', 0.12, 0.09);
    },
    landed() {
      blip(523, 0.3, 'sine', 0.16);
      blip(659, 0.3, 'sine', 0.16, 0.12);
      blip(784, 0.5, 'sine', 0.16, 0.24);
    },
    crash() {
      blip(90, 0.5, 'triangle', 0.3);
      blip(55, 0.7, 'sine', 0.25, 0.05);
    },
    warning() {
      blip(440, 0.18, 'square', 0.07);
    },
    toggleMute() {
      muted = !muted;
      if (engineGain !== null && muted) engineGain.gain.value = 0;
      return muted;
    },
  };
}
