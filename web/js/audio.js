/**
 * Procedural Web Audio cues. No binary assets.
 * Unlocks on the first bowl / click so browsers allow playback.
 */
(function (global) {
  let ctx = null;
  let muted = false;
  let unlocked = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    unlocked = true;
    return ctx;
  }

  function env(gain, t, a, d, peak = 0.2) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function noise(duration) {
    const n = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = n;
    return src;
  }

  function play(kind) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    if (kind === "whoosh") {
      const src = noise(0.28);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.setValueAtTime(420, t);
      f.frequency.exponentialRampToValueAtTime(1800, t + 0.18);
      f.Q.value = 0.9;
      const g = ctx.createGain();
      env(g, t, 0.03, 0.22, 0.16);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + 0.3);
    } else if (kind === "bounce") {
      const src = noise(0.12);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 380;
      const g = ctx.createGain();
      env(g, t, 0.005, 0.1, 0.22);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + 0.14);
    } else if (kind === "bat") {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(340, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      const g = ctx.createGain();
      env(g, t, 0.004, 0.09, 0.2);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 0.12);
    } else if (kind === "pad") {
      const src = noise(0.16);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 220;
      const g = ctx.createGain();
      env(g, t, 0.006, 0.14, 0.24);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + 0.18);
    } else if (kind === "stumps") {
      const src = noise(0.2);
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 900;
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.16);
      const g = ctx.createGain();
      env(g, t, 0.003, 0.18, 0.28);
      src.connect(f);
      f.connect(g);
      o.connect(g);
      g.connect(master);
      src.start(t);
      o.start(t);
      src.stop(t + 0.22);
      o.stop(t + 0.2);
    } else if (kind === "crowd") {
      const src = noise(1.4);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 520;
      f.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + 1.4);
    }
  }

  function setMuted(v) {
    muted = v;
    const btn = document.getElementById("mute");
    if (btn) {
      btn.textContent = muted ? "SOUND OFF" : "SOUND ON";
      btn.classList.toggle("off", muted);
    }
  }

  global.RSAudio = {
    unlock: ensure,
    play,
    setMuted,
    isMuted: () => muted,
    toggle() {
      setMuted(!muted);
      ensure();
    },
  };
})(window);
