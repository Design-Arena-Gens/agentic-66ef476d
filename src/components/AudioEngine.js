import { useEffect, useRef } from "react";

export default function AudioEngine({ isRunning, tension, pulse, reverb, volume }) {
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const timersRef = useRef([]);

  useEffect(() => {
    if (!isRunning) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();

    const masterGain = ctx.createGain();
    masterGain.gain.value = dbToGain(scale(volume, 0, 100, -36, -3));

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 20;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    // Simple feedback reverb (lightweight pseudo-reverb)
    const reverbBus = createSimpleReverb(ctx);
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = scale(reverb, 0, 100, 0.05, 0.5);

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1.0;

    // Routing: (sources) -> [dryGain -> master] and [reverbBus.in -> reverbWet -> master]
    reverbBus.output.connect(reverbWet);
    reverbWet.connect(compressor);
    dryGain.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    // DRONE LAYER
    const drone = createDrone(ctx, reverbBus.input, dryGain, { tension });

    // PULSE / HEARTBEAT
    const pulseNode = createPulse(ctx, reverbBus.input, dryGain);

    // TEXTURE: noise swells
    const texture = createTexture(ctx, reverbBus.input, dryGain);

    // Intervals / scheduling
    const pulseMs = scale(pulse, 0, 100, 1600, 420); // faster with higher pulse
    const noiseEveryMs = scale(tension, 0, 100, 4200, 1300);

    const pulseTimer = setInterval(() => pulseNode.trigger(ctx.currentTime), pulseMs);
    const noiseTimer = setInterval(() => texture.trigger(ctx.currentTime, tension), noiseEveryMs);

    // Occasional high pluck for tension
    const pluck = createPluck(ctx, reverbBus.input, dryGain);
    const pluckTimer = setInterval(() => {
      if (Math.random() < scale(tension, 0, 100, 0.15, 0.55)) {
        pluck.trigger(ctx.currentTime, tension);
      }
    }, 2000);

    // Keep refs
    ctxRef.current = ctx;
    nodesRef.current = { masterGain, reverbWet, dryGain, drone, pulseNode, texture, pluck };
    timersRef.current = [pulseTimer, noiseTimer, pluckTimer];

    // Start continuous sources
    drone.start();

    return () => {
      timersRef.current.forEach((t) => clearInterval(t));
      timersRef.current = [];
      try { drone.stop(); } catch {}
      try { ctx.close(); } catch {}
      ctxRef.current = null;
      nodesRef.current = null;
    };
  }, [isRunning]);

  // Reactive parameter updates
  useEffect(() => {
    if (!nodesRef.current) return;
    const { masterGain, reverbWet, drone } = nodesRef.current;
    masterGain.gain.setTargetAtTime(dbToGain(scale(volume, 0, 100, -36, -3)), ctxRef.current.currentTime, 0.05);
    reverbWet.gain.setTargetAtTime(scale(reverb, 0, 100, 0.05, 0.5), ctxRef.current.currentTime, 0.1);
    if (drone && drone.setTension) drone.setTension(tension);
  }, [tension, reverb, volume]);

  return null;
}

// UTILITIES
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function scale(v, inMin, inMax, outMin, outMax) {
  const t = (clamp(v, inMin, inMax) - inMin) / (inMax - inMin || 1);
  return outMin + t * (outMax - outMin);
}
function dbToGain(db) { return Math.pow(10, db / 20); }

// REVERB: simple multi-tap feedback network (cheap, musical)
function createSimpleReverb(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();

  const delays = [0.011, 0.017, 0.019, 0.029].map((t) => ctx.createDelay(0.25));
  delays.forEach((d, i) => { d.delayTime.value = delays[i].delayTime.maxValue ? Math.min(0.25, [0.011,0.017,0.019,0.029][i]) : [0.011,0.017,0.019,0.029][i]; });

  const feedbacks = delays.map(() => ctx.createGain());
  feedbacks.forEach((g) => g.gain.value = 0.35);

  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 4500;

  // Wire a small FDN-ish structure
  input.connect(delays[0]);
  input.connect(delays[1]);
  input.connect(delays[2]);
  input.connect(delays[3]);

  delays.forEach((d, i) => {
    d.connect(damp);
    d.connect(feedbacks[i]);
    feedbacks[i].connect(d);
  });

  damp.connect(output);
  return { input, output };
}

// DRONE
function createDrone(ctx, reverbIn, dry) {
  const root = 55; // A1
  const minorSecond = root * Math.pow(2, 1/12); // tense interval
  const fifth = root * Math.pow(2, 7/12);

  const osc1 = ctx.createOscillator(); osc1.type = "sawtooth"; osc1.frequency.value = root;
  const osc2 = ctx.createOscillator(); osc2.type = "triangle"; osc2.frequency.value = minorSecond;
  const osc3 = ctx.createOscillator(); osc3.type = "sawtooth"; osc3.frequency.value = fifth;
  osc1.detune.value = -7; osc2.detune.value = 3; osc3.detune.value = 7;

  const lpf = ctx.createBiquadFilter(); lpf.type = "lowpass"; lpf.frequency.value = 400;
  const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain(); lfoGain.gain.value = 220; // sweep amount
  lfo.connect(lfoGain); lfoGain.connect(lpf.frequency);

  const gain = ctx.createGain(); gain.gain.value = 0.14;

  osc1.connect(lpf); osc2.connect(lpf); osc3.connect(lpf);
  lpf.connect(gain);
  gain.connect(dry);
  gain.connect(reverbIn);

  let running = false;
  function start() { if (running) return; running = true; osc1.start(); osc2.start(); osc3.start(); lfo.start(); }
  function stop() { if (!running) return; running = false; try { osc1.stop(); osc2.stop(); osc3.stop(); lfo.stop(); } catch {} }

  function setTension(tension) {
    const cutoff = scale(tension, 0, 100, 260, 1800);
    lpf.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.5);
    gain.gain.setTargetAtTime(scale(tension, 0, 100, 0.1, 0.2), ctx.currentTime, 0.5);
  }

  return { start, stop, setTension };
}

// PULSE (heartbeat / thump)
function createPulse(ctx, reverbIn, dry) {
  const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 50;
  const gain = ctx.createGain(); gain.gain.value = 0.0;
  const shaper = ctx.createWaveShaper(); // subtle saturation
  shaper.curve = makeSaturationCurve(400);

  osc.connect(shaper);
  shaper.connect(gain);
  gain.connect(dry);
  gain.connect(reverbIn);
  osc.start();

  function trigger(time) {
    const now = time || ctx.currentTime;
    osc.frequency.cancelScheduledValues(now);
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.09);

    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.6, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  }

  return { trigger };
}

// TEXTURE: filtered noise bursts
function createTexture(ctx, reverbIn, dry) {
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.8;

  function trigger(time, tension) {
    const now = time || ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer;

    const bp = ctx.createBiquadFilter(); bp.type = "bandpass";
    const center = scale(tension, 0, 100, 400, 3200) * (1 + (Math.random() - 0.5) * 0.3);
    bp.frequency.value = center;
    bp.Q.value = scale(tension, 0, 100, 2, 8);

    const env = ctx.createGain(); env.gain.value = 0.0;

    src.connect(bp); bp.connect(env); env.connect(reverbIn); env.connect(dry);

    env.gain.setValueAtTime(0.0, now);
    env.gain.linearRampToValueAtTime(scale(tension, 0, 100, 0.12, 0.35), now + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, now + scale(tension, 0, 100, 1.6, 0.6));

    src.start(now);
    src.stop(now + 2.0);
  }

  return { trigger };
}

// PLUCK: sparse high alarm-like pings
function createPluck(ctx, reverbIn, dry) {
  function trigger(time, tension) {
    const now = time || ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = Math.random() < 0.5 ? "square" : "triangle";
    const base = 440 * Math.pow(2, Math.floor(Math.random() * 3));
    const intervalSemis = [1, 2, 6, 10][Math.floor(Math.random() * 4)];
    const freq = base * Math.pow(2, intervalSemis / 12);
    osc.frequency.value = freq;

    const env = ctx.createGain(); env.gain.value = 0.0;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 600;

    osc.connect(hp); hp.connect(env); env.connect(reverbIn); env.connect(dry);

    env.gain.setValueAtTime(0.0, now);
    env.gain.linearRampToValueAtTime(scale(tension, 0, 100, 0.06, 0.18), now + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, now + scale(tension, 0, 100, 1.2, 0.45));

    osc.start(now);
    osc.stop(now + 2.0);
  }

  return { trigger };
}

function makeSaturationCurve(amount = 400) {
  const k = typeof amount === "number" ? amount : 50;
  const nSamples = 44100;
  const curve = new Float32Array(nSamples);
  const deg = Math.PI / 180;
  for (let i = 0; i < nSamples; ++i) {
    const x = (i * 2) / nSamples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}
