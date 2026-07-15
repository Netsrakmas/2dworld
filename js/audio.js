// Procedural sound: every noise in the game is synthesized — zero audio
// files, matching the zero-image-asset rule. Soft triangles and sines, pink
// noise, one feedback-delay "glade" tail, a compressor guarding the master
// bus, and an Eno-style generative ambient layer that never repeats.
// The AudioContext is created lazily on the first user gesture, so there is
// never an autoplay warning and the title keypress doubles as the unlock.
const AUDIO = Object.freeze({
  MASTER: 0.8, SFX_BUS: 1.0, MUSIC_BUS: 0.26,   // SFX are the protagonist; the compressor guards the sum
  COMP: Object.freeze({ threshold: -18, knee: 25, ratio: 6, attack: 0.003, release: 0.25 }),
  DELAYS: Object.freeze([0.27, 0.41]),   // two non-integer-ratio taps kill flutter
  FEEDBACK: 0.35, DELAY_LP: 2200, WET: 0.18,
  VOICE_CAP: 24,                   // simultaneous SFX voices (mobile-safe)
  RETRIGGER: 0.03,                 // s: identical SFX inside this window are skipped
  STEP_GAP: 0.12,                  // s: footsteps get a wider throttle
  // ambient voice timing (seconds, uniform random in range)
  MEL_T: Object.freeze([2, 8]), DRONE_T: Object.freeze([12, 25]), SPARK_T: Object.freeze([9, 20]),
  NIGHT_STRETCH: 1.6,              // night: sparser notes,
  NIGHT_LP: 900,                   // darker filter,
  DAY_LP: 1500,                    // vs the daytime patch
  DETUNE: 6,                       // cents; free chorus on ambient notes
});

// note pools share a C root so mood switches stay consonant mid-tail
const SCALE = Object.freeze({
  day: Object.freeze([261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 784.0, 880.0]),
  night: Object.freeze([523.25, 587.33, 659.25, 784.0, 880.0, 1046.5, 1174.7, 1318.5, 1568.0, 1760.0]),
  dungeon: Object.freeze([261.63, 311.13, 349.23, 392.0, 466.16, 523.25, 622.25, 698.46, 784.0, 932.33]),
  pip: Object.freeze([440.0, 523.25, 587.33, 659.25, 784.0, 880.0]),   // pentatonic around A4
});

const SND = {
  ctx: null, ready: false, muted: false,
  master: null, comp: null, sfxBus: null, musicBus: null, delayIn: null,
  white: null, pink: null,
  windGain: null, windFilter: null,
  voices: 0, played: 0, notes: 0,          // notes = ambient notes scheduled (debug/tests)
  last: {},                                 // name -> last trigger time (throttle)
  nextMel: 0, nextDrone: 0, nextSpark: 0,
  lastNoteIdx: -1,
};

/* ---------------- graph construction (once, on first gesture) ---------------- */

function buildAudioGraph() {
  try {
    SND.ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }
  const c = SND.ctx;

  SND.master = c.createGain();
  SND.comp = c.createDynamicsCompressor();
  SND.comp.threshold.value = AUDIO.COMP.threshold;
  SND.comp.knee.value = AUDIO.COMP.knee;
  SND.comp.ratio.value = AUDIO.COMP.ratio;
  SND.comp.attack.value = AUDIO.COMP.attack;
  SND.comp.release.value = AUDIO.COMP.release;
  SND.comp.connect(SND.master);
  SND.master.connect(c.destination);

  SND.sfxBus = c.createGain(); SND.sfxBus.gain.value = AUDIO.SFX_BUS;
  SND.musicBus = c.createGain(); SND.musicBus.gain.value = AUDIO.MUSIC_BUS;
  SND.sfxBus.connect(SND.comp);
  SND.musicBus.connect(SND.comp);

  // the glade: two parallel feedback delays, echoes darkening inside the loop
  SND.delayIn = c.createGain(); SND.delayIn.gain.value = 1;
  for (const t of AUDIO.DELAYS) {
    const d = c.createDelay(1); d.delayTime.value = t;
    const fb = c.createGain(); fb.gain.value = AUDIO.FEEDBACK;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = AUDIO.DELAY_LP;
    const wet = c.createGain(); wet.gain.value = AUDIO.WET;
    SND.delayIn.connect(d);
    d.connect(fb); fb.connect(lp); lp.connect(d);
    d.connect(wet); wet.connect(SND.comp);
  }

  // shared noise buffers (2 s, reused by every one-shot source)
  const len = c.sampleRate * 2;
  SND.white = c.createBuffer(1, len, c.sampleRate);
  {
    const d = SND.white.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  SND.pink = c.createBuffer(1, len, c.sampleRate);
  {
    // Paul Kellet's economy pink filter
    const d = SND.pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }

  // the wind bed: looping pink noise that breathes with the gust system
  {
    const src = c.createBufferSource();
    src.buffer = SND.pink; src.loop = true;
    SND.windFilter = c.createBiquadFilter();
    SND.windFilter.type = 'lowpass'; SND.windFilter.frequency.value = 400;
    SND.windGain = c.createGain(); SND.windGain.gain.value = 0;
    src.connect(SND.windFilter); SND.windFilter.connect(SND.windGain);
    SND.windGain.connect(SND.musicBus);
    src.start();
  }

  try { SND.muted = localStorage.getItem('twoworlds:muted') === '1'; } catch (e) { /* fine */ }
  SND.master.gain.value = SND.muted ? 0 : AUDIO.MASTER;
  SND.ready = true;
}

// autoplay unlock: first trusted gesture builds + resumes; iOS needs touchend
(function installAudioUnlock() {
  const boot = () => {
    if (!SND.ctx) buildAudioGraph();
    if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
    if (SND.ctx && SND.ctx.state === 'running') {
      for (const ev of ['pointerdown', 'keydown', 'touchend']) removeEventListener(ev, boot);
    }
  };
  for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, boot, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
  });
})();

function toggleMute(game) {
  if (!SND.ctx) return;
  SND.muted = !SND.muted;
  SND.master.gain.setTargetAtTime(SND.muted ? 0 : AUDIO.MASTER, SND.ctx.currentTime, 0.05);
  try { localStorage.setItem('twoworlds:muted', SND.muted ? '1' : '0'); } catch (e) { /* fine */ }
  if (game && game.floatText) game.floatText(game.player.x, game.player.y - 44, SND.muted ? 'sound off' : 'sound on');
}

/* ---------------- the two primitives: blip + noise ---------------- */

function _canVoice() {
  return SND.ready && !SND.muted && SND.ctx.state === 'running' && SND.voices < AUDIO.VOICE_CAP;
}

function _spend(node) {
  SND.voices++; SND.played++;
  node.onended = () => { SND.voices--; };
}

// tone: attack >= 3ms (no clicks), exponential decay (never to true zero)
function blip(f0, f1, dur, peak, type, o) {
  if (!_canVoice()) return;
  o = o || {};
  const c = SND.ctx;
  const t = c.currentTime + (o.at || 0);
  const osc = c.createOscillator();
  osc.type = type || 'sine';
  const jit = o.exact ? 1 : 1 + (Math.random() - 0.5) * 0.08;
  osc.frequency.setValueAtTime(Math.max(20, f0 * jit), t);
  if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * jit), t + dur * 0.8);
  if (o.detune) osc.detune.value = o.detune;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak * (1 + (Math.random() - 0.5) * 0.2), t + (o.attack || 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = o.lp || 3000;
  osc.connect(g); g.connect(lp);
  lp.connect(o.bus || SND.sfxBus);
  if (o.send) {
    const s = c.createGain(); s.gain.value = o.send;
    lp.connect(s); s.connect(SND.delayIn);
  }
  osc.start(t); osc.stop(t + dur + 0.1);
  _spend(osc);
}

// texture: shared buffer, per-shot filter (optionally swept)
function grain(dur, peak, o) {
  if (!_canVoice()) return;
  o = o || {};
  const c = SND.ctx;
  const t = c.currentTime + (o.at || 0);
  const src = c.createBufferSource();
  src.buffer = o.pink ? SND.pink : SND.white;
  src.loop = true;   // loops so long grains (fuse) outlive the 2s buffer
  const f = c.createBiquadFilter();
  f.type = o.ftype || 'lowpass';
  f.frequency.setValueAtTime(o.f0 || 1000, t);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.sweepT || dur));
  f.Q.value = o.q || 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak * (1 + (Math.random() - 0.5) * 0.2), t + (o.attack || 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g);
  g.connect(o.bus || SND.sfxBus);
  if (o.send) {
    const s = c.createGain(); s.gain.value = o.send;
    g.connect(s); s.connect(SND.delayIn);
  }
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.1);
  _spend(src);
}

// duck the music under important sounds: down fast, back up slow
function duckMusic(mult, dur) {
  if (!SND.ready) return;
  const t = SND.ctx.currentTime;
  SND.musicBus.gain.cancelScheduledValues(t);
  SND.musicBus.gain.setTargetAtTime(AUDIO.MUSIC_BUS * mult, t, 0.05);
  SND.musicBus.gain.setTargetAtTime(AUDIO.MUSIC_BUS, t + dur, 0.3);
}

/* ---------------- the SFX cookbook ---------------- */

const SFX_DEFS = {
  // combat — every impact carries a MID-frequency layer (300-900 Hz) so it
  // still reads on laptop speakers, which can't reproduce the sub-150Hz body.
  // Peaks here run hotter than other categories: filters eat most of a
  // grain's energy (the old 0.22 swing measured 0.06 at the master bus).
  swing() {
    grain(0.17, 0.8, { ftype: 'bandpass', f0: 400, f1: 1500, q: 1, sweepT: 0.13, attack: 0.012 });
    grain(0.14, 0.2, { f0: 2400, attack: 0.015 });   // broadband air under the sweep
  },
  hit() {
    blip(160, 60, 0.1, 0.6, 'sine', { attack: 0.003, lp: 1500 });
    blip(330, 140, 0.1, 0.45, 'triangle', { attack: 0.003, lp: 2000 });
    grain(0.05, 0.4, { ftype: 'bandpass', f0: 700, q: 4, attack: 0.002 });
    duckMusic(0.6, 0.2);   // hits punch through the ambient layer
  },
  finisher() {
    blip(200, 45, 0.18, 0.75, 'sine', { attack: 0.003 });
    blip(380, 160, 0.15, 0.5, 'triangle', { attack: 0.003, lp: 2200 });
    blip(55, 55, 0.22, 0.3, 'triangle', { attack: 0.005, lp: 900 });
    grain(0.06, 0.42, { ftype: 'bandpass', f0: 320, q: 6 });
    duckMusic(0.45, 0.35);
  },
  slam() {
    blip(120, 45, 0.5, 0.6, 'sine', { attack: 0.005, lp: 700 });
    blip(260, 90, 0.3, 0.45, 'triangle', { attack: 0.004, lp: 1400 });
    grain(0.4, 0.38, { pink: true, f0: 600, f1: 200, sweepT: 0.35 });
    duckMusic(0.55, 0.4);
  },
  alert() { blip(523.25, 784, 0.09, 0.2, 'triangle', { attack: 0.005, lp: 2500 }); },
  spit() { blip(620, 260, 0.08, 0.2, 'triangle', { attack: 0.004, lp: 2200 }); },
  swoon() {
    blip(392, 0, 0.28, 0.22, 'triangle', { lp: 1400, exact: true });
    blip(329.63, 0, 0.28, 0.2, 'triangle', { at: 0.22, lp: 1200, exact: true });
    blip(261.63, 0, 0.6, 0.2, 'triangle', { at: 0.44, lp: 1000, exact: true, send: 0.3 });
    duckMusic(0.4, 1.4);
  },
  tink() { blip(1244, 1244, 0.07, 0.26, 'triangle', { attack: 0.003, lp: 4000 }); },
  hurt() { blip(392, 196, 0.22, 0.5, 'triangle', { attack: 0.005, lp: 1200 }); },
  poof() {
    grain(0.26, 0.5, { pink: true, f0: 900, f1: 250, sweepT: 0.22 });
    blip(660, 330, 0.12, 0.2, 'triangle', { attack: 0.004, lp: 1800 });
    blip(523, 1046, 0.12, 0.12, 'sine', { attack: 0.02, at: 0.06 });
  },
  pot() {
    grain(0.05, 0.25, { f0: 1600, ftype: 'bandpass', q: 2 });
    grain(0.12, 0.18, { pink: true, f0: 700, f1: 300 });
  },
  // pickups + ceremonies
  trinket() {
    blip(1318.5, 0, 0.07, 0.22, 'sine', { send: 0.2 });
    blip(1760, 0, 0.07, 0.22, 'sine', { at: 0.045, send: 0.2 });
  },
  heart() {
    blip(523.25, 0, 0.09, 0.25, 'triangle', { lp: 3000 });
    blip(784, 0, 0.14, 0.25, 'triangle', { at: 0.12, lp: 3000 });
  },
  letter() {
    blip(392, 0, 0.12, 0.28, 'triangle', { lp: 2800, send: 0.25, exact: true });
    blip(523.25, 0, 0.12, 0.28, 'triangle', { at: 0.12, lp: 2800, send: 0.25, exact: true });
    blip(659.25, 0, 0.32, 0.28, 'triangle', { at: 0.24, lp: 2800, send: 0.25, exact: true });
    duckMusic(0.5, 0.7);
  },
  chest() {
    const notes = [523.25, 659.25, 784, 1046.5];
    notes.forEach((f, i) => blip(f, 0, 0.4, 0.22, 'triangle', { at: i * 0.11, send: 0.3, exact: true }));
    blip(1046.5, 0, 0.55, 0.18, 'triangle', { at: 0.44, send: 0.3, exact: true });
    blip(2093, 0, 0.5, 0.06, 'sine', { at: 0.44, send: 0.3, exact: true });
    duckMusic(0.5, 1.0);
  },
  fanfare() {
    const notes = [523.25, 659.25, 784, 1046.5];
    notes.forEach((f, i) => blip(f, 0, 0.3, 0.2, 'triangle', { at: i * 0.095, send: 0.35, exact: true }));
    notes.forEach((f) => blip(f, 0, 0.65, 0.13, 'triangle', { at: 0.42, attack: 0.015, send: 0.35, exact: true }));
    blip(1318.5, 0, 0.6, 0.06, 'sine', { at: 0.42, send: 0.35, exact: true });
    duckMusic(0.35, 1.2);
  },
  // dungeon furniture
  unlock() {
    grain(0.04, 0.28, { f0: 600 });
    blip(90, 90, 0.11, 0.4, 'sine', { at: 0.08, attack: 0.003, lp: 500 });
    blip(1568, 0, 0.25, 0.14, 'sine', { at: 0.25, attack: 0.01, send: 0.4, exact: true });
  },
  shut() {
    grain(0.04, 0.28, { f0: 600 });
    blip(80, 80, 0.12, 0.4, 'sine', { at: 0.05, attack: 0.003, lp: 400 });
  },
  chime() { blip(1568, 0, 0.25, 0.14, 'sine', { attack: 0.01, send: 0.4, exact: true }); },
  latch() {
    blip(220, 220, 0.035, 0.22, 'sine', { attack: 0.003 });
    grain(0.02, 0.15, { f0: 1400 });
  },
  fuse() { grain(1.25, 0.05, { ftype: 'bandpass', f0: 2400, q: 10, attack: 0.05 }); },
  boom() {
    blip(110, 40, 0.6, 0.55, 'sine', { attack: 0.006, lp: 600 });
    grain(0.6, 0.35, { pink: true, f0: 500, f1: 120, sweepT: 0.5 });
    [1568, 1318.5, 1046.5].forEach((f, i) =>
      blip(f, 0, 0.08, 0.06, 'sine', { at: 0.12 + i * 0.06, send: 0.35, exact: true }));
    duckMusic(0.5, 0.8);
  },
  rumble() { grain(0.5, 0.3, { pink: true, f0: 350, f1: 150, sweepT: 0.45, attack: 0.03 }); },
  pomf() {
    blip(190, 65, 0.18, 0.45, 'sine', { attack: 0.005, lp: 700 });
    grain(0.09, 0.18, { pink: true, f0: 650 });
  },
  // UI + world
  blipUI() { blip(880, 0, 0.05, 0.12, 'sine', { attack: 0.004, lp: 2500 }); },
  page() {
    blip(660, 0, 0.05, 0.15, 'sine', { attack: 0.004 });
    blip(880, 0, 0.05, 0.15, 'sine', { at: 0.04, attack: 0.004 });
  },
  buy() {
    blip(987.77, 0, 0.08, 0.2, 'triangle', { exact: true });
    blip(1318.5, 0, 0.18, 0.22, 'triangle', { at: 0.07, exact: true, send: 0.2 });
    grain(0.07, 0.04, { ftype: 'highpass', f0: 5000, at: 0.07 });
  },
  refuse() {
    blip(311.13, 0, 0.11, 0.18, 'triangle', { attack: 0.008, lp: 900, exact: true });
    blip(311.13, 0, 0.11, 0.18, 'triangle', { at: 0.17, attack: 0.008, lp: 900, exact: true });
  },
  title() {
    [392, 523.25, 659.25, 784].forEach((f, i) =>
      blip(f, 0, 0.35, 0.2, 'triangle', { at: i * 0.085, send: 0.35, exact: true }));
    blip(261.63, 0, 1.1, 0.12, 'sine', { attack: 0.25, send: 0.35, exact: true });
    blip(392, 0, 1.1, 0.12, 'sine', { attack: 0.25, send: 0.35, exact: true, detune: AUDIO.DETUNE });
  },
  step(bl) {
    if (bl < 0.5) {  // sand: soft double scuff
      grain(0.09, 0.07, { pink: true, f0: 450, attack: 0.005 });
      grain(0.04, 0.04, { pink: true, f0: 400, at: 0.03 });
    } else {         // grass: brighter single swish
      grain(0.06, 0.06, { pink: true, ftype: 'bandpass', f0: 500 + Math.random() * 400, q: 1, attack: 0.005 });
    }
  },
  pipNote() {
    const f = SCALE.pip[(Math.random() * SCALE.pip.length) | 0];
    blip(f, 0, 0.35, 0.16, 'triangle', { attack: 0.004, lp: 1800, send: 0.4, exact: true });
  },
};

// public entry: throttled, safe before the graph exists
function sfx(name, arg) {
  if (!SND.ready || SND.muted) return;
  const now = SND.ctx.currentTime;
  const gap = name === 'step' ? AUDIO.STEP_GAP : AUDIO.RETRIGGER;
  if (SND.last[name] && now - SND.last[name] < gap) return;
  SND.last[name] = now;
  const def = SFX_DEFS[name];
  if (def) def(arg);
}

/* ---------------- generative ambient (Eno with a wind vane) ---------------- */

function _ambientNote(freq, lpFreq, gain) {
  if (!_canVoice()) return;
  const c = SND.ctx, t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.15);
  g.gain.setValueAtTime(gain, t + 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = lpFreq;
  g.connect(lp); lp.connect(SND.musicBus);
  const s = c.createGain(); s.gain.value = 0.45;
  lp.connect(s); s.connect(SND.delayIn);
  for (const [type, det] of [['sine', AUDIO.DETUNE], ['triangle', -AUDIO.DETUNE]]) {
    const o = c.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = det;
    o.connect(g);
    o.start(t); o.stop(t + 3);
    _spend(o);
  }
  SND.notes++;
}

function updateAudio(game) {
  if (!SND.ready || SND.muted || SND.ctx.state !== 'running') return;
  const now = SND.ctx.currentTime;
  const night = game.nightFactor ? game.nightFactor() : 0;
  const inDungeon = typeof Dungeon !== 'undefined' && Dungeon.active;
  const gust = typeof Atmos !== 'undefined' ? Atmos.gust : 0.5;
  const wind01 = clamp((gust - 0.4) / 1.6, 0, 1);

  // the wind bed breathes with the gusts; silent underground
  SND.windGain.gain.setTargetAtTime(inDungeon ? 0 : 0.02 + wind01 * 0.05, now, 0.5);
  SND.windFilter.frequency.setTargetAtTime(400 + wind01 * 900, now, 0.5);

  const pool = inDungeon ? SCALE.dungeon : night > 0.5 ? SCALE.night : SCALE.day;
  const stretch = night > 0.5 ? AUDIO.NIGHT_STRETCH : 1;
  const lpF = night > 0.5 ? AUDIO.NIGHT_LP : AUDIO.DAY_LP;

  if (now >= SND.nextMel) {
    const base = AUDIO.MEL_T[0] + Math.random() * (AUDIO.MEL_T[1] - AUDIO.MEL_T[0]);
    SND.nextMel = now + Math.max(1.2, (base - wind01 * 3) * stretch);
    if (Math.random() > 0.15) {   // 15% chance of a thoughtful rest
      let idx;
      do { idx = (Math.random() * pool.length) | 0; } while (idx === SND.lastNoteIdx);
      SND.lastNoteIdx = idx;
      _ambientNote(pool[idx], lpF, 0.12);
    }
  }
  if (now >= SND.nextDrone) {
    SND.nextDrone = now + AUDIO.DRONE_T[0] + Math.random() * (AUDIO.DRONE_T[1] - AUDIO.DRONE_T[0]);
    _ambientNote(inDungeon || Math.random() < 0.5 ? 130.81 : 196, 800, night > 0.5 ? 0.06 : 0.1);
  }
  if (now >= SND.nextSpark) {
    SND.nextSpark = now + AUDIO.SPARK_T[0] + Math.random() * (AUDIO.SPARK_T[1] - AUDIO.SPARK_T[0]);
    if (night > 0.5 || Math.random() < 0.5) {
      _ambientNote(pool[pool.length - 1 - ((Math.random() * 3) | 0)] * 2, lpF + 600, 0.05 + wind01 * 0.05);
    }
  }
}
