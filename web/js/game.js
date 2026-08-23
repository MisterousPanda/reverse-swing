(function () {
  const {
    Vector3,
    Time,
    Layers,
    Component,
    GameObject,
    Scene,
    Camera,
    Rigidbody,
    Interpolate,
    PlaneCollider,
    BoxCollider,
    TrailRenderer,
    ParticleSystem,
    PlayerLoop,
    PITCH,
  } = window.RSEngine;
  const { StudioRenderer } = window.RSRender;

  const API = "";

  const defaultDelivery = () => ({
    pace_kph: 144,
    line_m: 0.16,
    length_m: 0.7,
    seam_angle_deg: 18,
    seam_upright: 0.88,
    wrist_behind: 0.86,
    roughness: 0.72,
    shine: 0.84,
    rough_side: "off",
    seam_prominence: 0.9,
    backspin_rps: 11,
    overs: 42,
  });

  const state = {
    delivery: defaultDelivery(),
    preview: null,
    lastResult: null,
    challenge: null,
    challenges: [],
    lore: [],
    bowling: false,
    releasing: false,
    holdClimax: false,
    spell: { balls: 0, wickets: 0, runs: 0 },
    unlocked: new Set(),
    proof: [],
  };

  class TrajectoryMotor extends Component {
    constructor() {
      super();
      this.samples = [];
      this.elapsed = 0;
      this.playing = false;
      this.finished = false;
      this.onBounce = null;
      this.onFinish = null;
      this._bounced = false;
    }
    load(samples) {
      this.samples = samples || [];
      this.elapsed = 0;
      this.playing = this.samples.length > 1;
      this.finished = false;
      this._bounced = false;
      if (this.samples[0]) {
        this.transform.position.set(this.samples[0].x, this.samples[0].y, this.samples[0].z);
      }
    }
    scrub(t) {
      this.elapsed = t;
      this.playing = false;
      this._apply(t);
    }
    fixedUpdate(dt) {
      if (!this.playing || this.samples.length < 2) return;
      this.elapsed += dt;
      this._apply(this.elapsed);
    }
    _apply(t) {
      const samples = this.samples;
      if (!samples.length) return;
      const lastT = samples[samples.length - 1].t;
      if (t >= lastT) {
        const s = samples[samples.length - 1];
        this.transform.position.set(s.x, s.y, s.z);
        if (!this.finished) {
          this.finished = true;
          this.playing = false;
          this.onFinish?.();
        }
        return;
      }
      let i = 1;
      while (i < samples.length && samples[i].t < t) i += 1;
      const a = samples[i - 1];
      const b = samples[i];
      const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
      this.transform.position.set(
        a.x + (b.x - a.x) * u,
        a.y + (b.y - a.y) * u,
        a.z + (b.z - a.z) * u
      );
      const body = this.gameObject.getComponent(Rigidbody);
      if (body) {
        body.velocity.set(a.vx + (b.vx - a.vx) * u, a.vy + (b.vy - a.vy) * u, a.vz + (b.vz - a.vz) * u);
        body.angularVelocity.set(18, 0, 40);
      }
      if (!this._bounced && a.z <= 0.08 && a.vz < 0) {
        this._bounced = true;
        this.onBounce?.(this.transform.position.clone());
      }
    }
  }

  class WristSpinner extends Component {
    update(dt) {
      const body = this.gameObject.getComponent(Rigidbody);
      if (!body) return;
      this.transform.rotation.x += body.angularVelocity.x * dt;
      this.transform.rotation.z += (state.delivery.seam_angle_deg / 20) * dt * 2;
    }
  }

  class WicketSet extends Component {
    constructor(y) {
      super();
      this.y = y;
      this.reset();
    }
    reset() {
      this.smashed = false;
      this.posts = [-0.11, 0, 0.11].map((x) => ({
        x,
        ox: 0,
        oy: 0,
        oz: 0,
        leanX: 0,
        leanY: 0,
        vx: 0,
        vy: 0,
        vz: 0,
      }));
      this.bails = [-0.055, 0.055].map((x) => ({
        x,
        z: 0.715,
        ox: 0,
        oy: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        hidden: false,
      }));
    }
    smash(impactX, speed) {
      if (this.smashed) return;
      this.smashed = true;
      const dir = impactX >= 0 ? 1 : -1;
      this.posts.forEach((p, i) => {
        const near = 1.35 - Math.abs(p.x - impactX) * 5;
        p.vx = (0.9 + Math.random() * 1.8) * dir * near;
        p.vy = 0.6 + Math.random() * 1.4;
        p.vz = 2.4 + Math.random() * 2.6 + (i === 1 ? 1.1 : 0);
        p.spin = (Math.random() - 0.5) * 8;
      });
      this.bails.forEach((b) => {
        b.vx = (Math.random() - 0.35) * 3.4;
        b.vy = 1.1 + Math.random() * 1.2;
        b.vz = 3.2 + Math.random() * 2.4;
        b.spin = (Math.random() - 0.5) * 10;
      });
      void speed;
    }
    update(dt) {
      if (!this.smashed) return;
      for (const p of this.posts) {
        p.vz -= 12 * dt;
        p.ox += p.vx * dt;
        p.oy += p.vy * dt;
        p.oz += p.vz * dt;
        p.leanX += (p.vx + (p.spin || 0)) * dt * 0.55;
        p.leanY += p.vy * dt * 0.45;
        if (p.oz < -0.2) {
          p.oz = -0.2;
          p.vz *= -0.12;
        }
      }
      for (const b of this.bails) {
        b.vz -= 13 * dt;
        b.ox += b.vx * dt;
        b.oy += b.vy * dt;
        b.z += b.vz * dt;
        b.spin = (b.spin || 0) + dt * 6;
        if (b.z < 0.03) {
          b.z = 0.03;
          b.vz *= -0.18;
        }
      }
    }
  }

  class BowlerActor extends Component {
    constructor() {
      super();
      this.reset();
      this.onRelease = null;
    }
    reset() {
      this.phase = "mark";
      this.x = 0.22;
      this.y = -6.2;
      this.t = 0;
      this.cycle = 0;
      this.hasBall = true;
    }
    startSpell() {
      this.phase = "run";
      this.t = 0;
      this.cycle = 0;
      this.y = -7.6;
      this.hasBall = true;
    }
    update(dt) {
      this.cycle += dt * (this.phase === "run" ? 15.5 : 5);
      if (this.phase === "run") {
        this.y += 9.6 * dt;
        this.t += dt;
        if (this.y >= -0.38) {
          this.phase = "gather";
          this.t = 0;
        }
      } else if (this.phase === "gather") {
        this.t += dt;
        if (this.t > 0.16) {
          this.phase = "load";
          this.t = 0;
        }
      } else if (this.phase === "load") {
        this.t += dt;
        if (this.t > 0.14) {
          this.phase = "release";
          this.hasBall = false;
          this.onRelease?.();
          this.t = 0;
        }
      } else if (this.phase === "release") {
        this.t += dt;
        this.y += 2.4 * dt;
        if (this.t > 0.15) this.phase = "follow";
      } else if (this.phase === "follow") {
        this.y += 1.15 * dt;
        this.t += dt;
      }
    }
  }

  class BatterBrain extends Component {
    constructor() {
      super();
      this.reset();
    }
    reset() {
      this.x = 0.18;
      this.y = PITCH - 1.32;
      this.commitX = 0.18;
      this.footY = PITCH - 1.32;
      this.targetFootY = PITCH - 1.32;
      this.phase = "stance";
      this.batAngle = -0.55;
      this.weight = 0;
      this.headTurn = 0;
      this.outcome = null;
      this.padFlash = 0;
      this.tap = 0;
      this.swing = 0;
    }
    prepare(result) {
      this.commitX = result.batter_commit_x ?? 0.18;
      this.targetFootY = result.batter_foot_y ?? PITCH - 1.32;
      this.outcome = result.outcome;
      this.phase = "ready";
      this.weight = 0;
      this.headTurn = 0;
      this.padFlash = 0;
      this.swing = 0;
    }
    track(ball) {
      this.tap += 0.05;
      this.padFlash = Math.max(0, this.padFlash - 0.035);
      if (this.phase === "stance" || !ball) {
        this.x += (0.18 - this.x) * 0.04;
        this.batAngle += (-0.58 + Math.sin(this.tap) * 0.05 - this.batAngle) * 0.1;
        this.footY += (PITCH - 1.32 - this.footY) * 0.06;
        this.swing += (0 - this.swing) * 0.12;
        return;
      }
      const by = ball.y;
      if (by > 6.2) {
        this.phase = "backlift";
        this.x += (this.commitX - this.x) * 0.1;
        this.batAngle += (-1.12 - this.batAngle) * 0.14;
        this.swing += (0.15 - this.swing) * 0.1;
      }
      if (by > 10) {
        this.phase = "stride";
        this.x += (this.commitX - this.x) * 0.18;
        this.footY += (this.targetFootY - this.footY) * 0.18;
        this.weight = Math.min(1, this.weight + 0.08);
      }
      if (by > 14.6) {
        const miss = ["bowled", "lbw", "beaten", "left", "wide"].includes(this.outcome);
        this.phase = miss ? "play_miss" : "play";
        this.batAngle += ((miss ? 0.22 : 0.82) - this.batAngle) * 0.3;
        this.swing += ((miss ? 0.45 : 1) - this.swing) * 0.22;
        if (this.outcome === "lbw") {
          this.x += (this.commitX - this.x) * 0.26;
          if (this.padFlash <= 0) {
            this.padFlash = 1;
            window.RSAudio?.play("pad");
          }
        }
        if (this.outcome === "defended" || this.outcome === "edged") {
          if (this.padFlash <= 0) window.RSAudio?.play("bat");
          this.padFlash = Math.max(this.padFlash, 0.28);
        }
      }
      if (by > PITCH - 0.35) {
        if (this.phase === "play" || this.phase === "play_miss") this.phase = "follow";
        this.batAngle += ((this.outcome === "defended" ? 1.05 : 0.38) - this.batAngle) * 0.12;
        if (this.outcome === "bowled") this.headTurn += (1 - this.headTurn) * 0.22;
      }
    }
  }

  class KeeperActor extends Component {
    constructor() {
      super();
      this.x = 0.12;
      this.react = 0;
    }
    track(ball) {
      const tx = ball ? ball.x * 0.5 : 0.12;
      this.x += (tx - this.x) * 0.1;
      this.react += ((ball ? 1 : 0.15) - this.react) * 0.08;
    }
  }

  class UmpireActor extends Component {
    constructor() {
      super();
      this.finger = false;
      this.fingerT = 0;
    }
    update(dt) {
      const goal = this.finger ? 1 : 0;
      this.fingerT += (goal - this.fingerT) * Math.min(1, dt * 8);
    }
  }

  class CameraRig extends Component {
    constructor(camera) {
      super();
      this.cam = camera;
      this.shake = 0;
      this.impact = 0;
    }
    punch(n = 1) {
      this.shake = Math.max(this.shake, n);
    }
    update(dt) {
      const ball = this.gameObject.scene.findWithTag("Ball");
      const result = state.lastResult;
      const flying = state.bowling && state.releasing && ball?.active;
      let eye = [1.18, -13.35, 4.42];
      let look = [0.03, 12.55, 0.3];
      let fov = 41;
      if (flying && ball) {
        const y = ball.transform.position.y;
        eye = [1.08, -13.05 + y * 0.035, 4.28];
        look = [ball.transform.position.x * 0.22, 12.0 + y * 0.11, 0.34];
        fov = 39.5;
      }
      const wicket = result && (result.outcome === "bowled" || result.outcome === "lbw");
      if (wicket && (state.releasing || state.holdClimax)) {
        this.impact = Math.min(1, this.impact + dt * 2.4);
      } else if (!state.holdClimax) {
        this.impact = Math.max(0, this.impact - dt * 0.75);
      }
      if (this.impact > 0.05) {
        const u = this.impact;
        eye = [1.18 + (0.92 - 1.18) * u, -13.35 + (11.8 + 13.35) * u, 4.42 + (2.85 - 4.42) * u];
        look = [0.03 * (1 - u) + 0.04 * u, 12.55 + (19.85 - 12.55) * u, 0.3 + (0.46 - 0.3) * u];
        fov = 41 - 6 * u;
      }
      const k = this.impact > 0.18 ? 0.2 : 0.085;
      this.cam.eye.x += (eye[0] - this.cam.eye.x) * k;
      this.cam.eye.y += (eye[1] - this.cam.eye.y) * k;
      this.cam.eye.z += (eye[2] - this.cam.eye.z) * k;
      this.cam.lookTarget.x += (look[0] - this.cam.lookTarget.x) * (k + 0.02);
      this.cam.lookTarget.y += (look[1] - this.cam.lookTarget.y) * (k + 0.02);
      this.cam.lookTarget.z += (look[2] - this.cam.lookTarget.z) * (k + 0.02);
      this.cam.fov += (fov - this.cam.fov) * k;
      this.shake *= 0.86;
      this.cam.shakeX = (Math.random() - 0.5) * this.shake * 10;
      this.cam.shakeY = (Math.random() - 0.5) * this.shake * 7;
    }
  }

  window.RSPlay = { WicketSet, BowlerActor, BatterBrain, KeeperActor, UmpireActor, CameraRig };

  async function api(path, options) {
    const res = await fetch(`${API}/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) throw new Error(`${path} failed`);
    return res.json();
  }

  function payload() {
    const d = state.delivery;
    return {
      pace_kph: d.pace_kph,
      line_m: d.line_m,
      length_m: d.length_m,
      seam_angle_deg: d.seam_angle_deg,
      seam_upright: d.seam_upright,
      wrist_behind: d.wrist_behind,
      roughness: d.roughness,
      shine: d.shine,
      rough_side: d.rough_side,
      seam_prominence: d.seam_prominence,
      backspin_rps: d.backspin_rps,
    };
  }

  function formatControl(key, value, digits) {
    if (key === "pace_kph") return `${value.toFixed(0)} kph`;
    if (key === "line_m") return `${value >= 0 ? "off" : "leg"} ${Math.abs(value * 100).toFixed(0)}cm`;
    if (key === "length_m") {
      if (value < 1.2) return `yorker ${value.toFixed(1)}m`;
      if (value < 4) return `full ${value.toFixed(1)}m`;
      if (value < 7.5) return `good ${value.toFixed(1)}m`;
      return `short ${value.toFixed(1)}m`;
    }
    if (key === "seam_angle_deg") return `${value.toFixed(0)}°`;
    return value.toFixed(digits);
  }

  function bindSliders() {
    const map = [
      ["pace", "pace_kph", 1],
      ["line", "line_m", 2],
      ["length", "length_m", 2],
      ["seam", "seam_angle_deg", 1],
      ["wrist", "wrist_behind", 2],
      ["upright", "seam_upright", 2],
      ["rough", "roughness", 2],
      ["shine", "shine", 2],
    ];
    for (const [id, key, digits] of map) {
      const el = document.getElementById(id);
      const out = document.getElementById(`${id}-out`);
      const sync = () => {
        state.delivery[key] = Number(el.value);
        out.textContent = formatControl(key, state.delivery[key], digits);
        if (key === "pace_kph") document.getElementById("bug-pace").textContent = state.delivery.pace_kph.toFixed(0);
        schedulePreview();
        paintBall();
        markChips();
      };
      el.addEventListener("input", sync);
      sync();
    }
    document.getElementById("rough-side").addEventListener("change", (e) => {
      state.delivery.rough_side = e.target.value;
      schedulePreview();
      paintBall();
    });
    document.getElementById("overs").addEventListener("input", (e) => {
      const overs = Number(e.target.value);
      state.delivery.overs = overs;
      document.getElementById("overs-out").textContent = `${overs.toFixed(0)} ov`;
      state.delivery.roughness = Math.min(0.95, (overs / 48) * 0.9);
      state.delivery.shine = Math.max(0.18, 1 - overs / 85);
      document.getElementById("rough").value = state.delivery.roughness;
      document.getElementById("shine").value = state.delivery.shine;
      document.getElementById("rough-out").textContent = formatControl("roughness", state.delivery.roughness, 2);
      document.getElementById("shine-out").textContent = formatControl("shine", state.delivery.shine, 2);
      schedulePreview();
      paintBall();
    });
    document.querySelectorAll("[data-length]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.delivery.length_m = Number(btn.dataset.length);
        syncSlider("length", state.delivery.length_m);
      });
    });
    document.querySelectorAll("[data-line]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.delivery.line_m = Number(btn.dataset.line);
        syncSlider("line", state.delivery.line_m);
      });
    });
  }

  function markChips() {
    document.querySelectorAll("[data-length]").forEach((btn) => {
      btn.classList.toggle("on", Math.abs(Number(btn.dataset.length) - state.delivery.length_m) < 0.15);
    });
    document.querySelectorAll("[data-line]").forEach((btn) => {
      btn.classList.toggle("on", Math.abs(Number(btn.dataset.line) - state.delivery.line_m) < 0.04);
    });
  }

  let previewTimer = 0;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 120);
  }

  async function refreshPreview() {
    try {
      const data = await api("/preview", { method: "POST", body: JSON.stringify(payload()) });
      state.preview = data.result;
      paintTelemetry(data.result, true);
    } catch (err) {
      console.warn(err);
    }
  }

  function paintTelemetry(result, previewOnly) {
    const aero = result.aero;
    const label = aero.regime.replaceAll("_", " ").toUpperCase();
    document.getElementById("regime").textContent = label;
    document.getElementById("regime").dataset.kind = aero.regime;
    document.getElementById("re").textContent = `${(aero.reynolds / 1000).toFixed(0)}k Re`;
    document.getElementById("mph").textContent = `${aero.speed_mph.toFixed(0)} mph`;
    document.getElementById("onset").textContent = `reverses ≥ ${aero.reverse_onset_mph.toFixed(0)} mph`;
    document.getElementById("lsb").textContent = aero.laminar_separation_bubble ? "LSB live" : "no bubble";
    document.getElementById("sep").textContent = `${aero.seam_separation_deg.toFixed(0)}° / ${aero.non_seam_separation_deg.toFixed(0)}°`;
    document.getElementById("dev").textContent = `${(aero.late_deviation_m * 100).toFixed(0)} cm late`;
    document.getElementById("copy").textContent = aero.commentary;
    void previewOnly;
  }

  function showCall(result) {
    const el = document.getElementById("call");
    const kind = result.outcome;
    const lines = {
      bowled: "Timber. Stumps gone.",
      lbw: "Pad in line. Would have hit.",
      beaten: "Played the original line.",
      defended: "Bat on ball.",
      edged: "Thick edge.",
      left: "Left alone.",
      wide: "Down the leg / too wide.",
    };
    document.getElementById("call-kind").textContent = kind.replaceAll("_", " ").toUpperCase();
    document.getElementById("call-sub").textContent = lines[kind] || result.aero.commentary;
    el.dataset.kind = kind;
    el.hidden = false;
    setTimeout(() => {
      if (!state.bowling) el.hidden = true;
    }, 2600);
  }

  function paintBall() {
    const el = document.getElementById("ball-viz");
    el.style.setProperty("--shine", state.delivery.shine);
    el.style.setProperty("--rough", state.delivery.roughness);
    el.dataset.side = state.delivery.rough_side;
    el.style.transform = `rotate(${state.delivery.seam_angle_deg}deg)`;
  }

  function applyInput(loop) {
    const d = state.delivery;
    const input = loop.input;
    const dt = Time.unscaledDeltaTime;
    d.seam_angle_deg = clamp(d.seam_angle_deg + input.getAxis("WristIn", "WristOut") * 42 * dt, -32, 32);
    d.pace_kph = clamp(d.pace_kph + input.getAxis("PaceDown", "PaceUp") * 28 * dt, 110, 156);
    d.line_m = clamp(d.line_m + input.getAxis("LineIn", "LineOut") * 0.55 * dt, -0.7, 0.7);
    d.length_m = clamp(d.length_m + input.getAxis("LengthUp", "LengthDown") * 4.2 * dt, 0.2, 12);
    if (input.getButtonDown("Pause")) Time.paused = !Time.paused;
    if (input.getButtonDown("TimeSlow")) Time.timeScale = 0.35;
    if (input.getButtonDown("TimeNormal")) Time.timeScale = 1;
    if (input.getButtonDown("TimeFast")) Time.timeScale = 1.7;
    if (input.getButtonDown("Replay")) replayLast(loop);
    if (input.getButtonDown("Bowl") && !state.bowling) bowl(loop);
    syncSlider("pace", d.pace_kph);
    syncSlider("seam", d.seam_angle_deg);
    syncSlider("line", d.line_m);
    syncSlider("length", d.length_m);
    if (input.pointer.down && (input.pointer.dx || input.pointer.dy)) {
      const canvas = document.getElementById("stage");
      const rect = canvas.getBoundingClientRect();
      if (
        input.pointer.x >= 0 &&
        input.pointer.y >= 0 &&
        input.pointer.x <= rect.width &&
        input.pointer.y <= rect.height
      ) {
        d.line_m = clamp(d.line_m + input.pointer.dx * 0.0014, -0.7, 0.7);
        d.length_m = clamp(d.length_m - input.pointer.dy * 0.014, 0.2, 12);
      }
    }
  }

  function syncSlider(id, value) {
    const el = document.getElementById(id);
    if (Math.abs(Number(el.value) - value) > 0.01) {
      el.value = String(value);
      el.dispatchEvent(new Event("input"));
    }
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  async function bowl(loop) {
    state.bowling = true;
    state.releasing = false;
    state.holdClimax = false;
    Time.paused = false;
    Time.timeScale = 1;
    document.getElementById("call").hidden = true;
    document.getElementById("bowl").classList.add("hot");
    document.querySelector(".coach")?.classList.add("spent");
    const ball = loop.scene.findWithTag("Ball");
    const trail = ball.getComponent(TrailRenderer);
    const motor = ball.getComponent(TrajectoryMotor);
    const bowler = loop.scene.findWithTag("Bowler").getComponent(BowlerActor);
    const batter = loop.scene.findWithTag("Batter").getComponent(BatterBrain);
    const stumps = loop.scene.findWithTag("Stumps").getComponent(WicketSet);
    const umpire = loop.scene.findWithTag("Umpire").getComponent(UmpireActor);
    trail.clear();
    stumps.reset();
    umpire.finger = false;
    ball.active = false;
    let result = null;
    try {
      result = await api("/bowl", { method: "POST", body: JSON.stringify(payload()) });
    } catch (err) {
      console.error(err);
      state.bowling = false;
      document.getElementById("bowl").classList.remove("hot");
      return;
    }
    state.lastResult = result;
    batter.prepare(result);
    paintTelemetry(result, false);
    recordProof(result);

    const release = () => {
      if (state.releasing) return;
      state.releasing = true;
      ball.active = true;
      motor.onBounce = (origin) => {
        loop.scene.findWithTag("FX").getComponent(ParticleSystem).emit(16, origin, "dust");
        window.RSAudio?.play("bounce");
      };
      window.RSAudio?.play("whoosh");
      motor.onFinish = () => finishBall(loop, result, motor);
      motor.load(result.samples);
      loop.timeline.begin();
    };
    bowler.onRelease = release;
    bowler.startSpell();
  }

  function finishBall(loop, result, motor) {
    state.bowling = false;
    loop.timeline.stop();
    document.getElementById("bowl").classList.remove("hot");
    document.getElementById("replay-wrap").hidden = false;
    const slider = document.getElementById("replay");
    slider.max = String(motor.elapsed || result.samples.at(-1)?.t || 1);
    slider.value = slider.max;
    state.spell.balls += 1;
    if (result.wickets) state.spell.wickets += 1;
    state.spell.runs += result.score;
    paintSpell();
    checkChallenge(result);
    const stumps = loop.scene.findWithTag("Stumps").getComponent(WicketSet);
    const umpire = loop.scene.findWithTag("Umpire").getComponent(UmpireActor);
    state.holdClimax = true;
    if (result.outcome === "bowled") {
      const pass = result.stump_pass || [0, PITCH, 0.3];
      stumps.smash(pass[0], 8);
      loop.scene.findWithTag("FX").getComponent(ParticleSystem).emit(22, new Vector3(pass[0], PITCH, 0.4), "wood");
      umpire.finger = true;
      loop.scene.findWithTag("MainCamera")?.getComponent(CameraRig)?.punch(1.4);
      window.RSAudio?.play("stumps");
      window.RSAudio?.play("crowd");
    }
    if (result.outcome === "lbw") {
      umpire.finger = true;
      const pad = result.stump_pass || [0.08, PITCH - 0.9, 0.32];
      loop.scene.findWithTag("FX").getComponent(ParticleSystem).emit(10, new Vector3(pad[0], PITCH - 0.85, 0.38), "dust");
      window.RSAudio?.play("crowd");
    }
    if (result.outcome === "defended" || result.outcome === "edged") window.RSAudio?.play("bat");
    showCall(result);
  }

  function recordProof(result) {
    const bounce = result.bounce || [0, 0, 0];
    const row = {
      line: result.input.line_m,
      length: result.input.length_m,
      bounceX: bounce[0],
      bounceY: bounce[1],
      outcome: result.outcome,
    };
    state.proof.push(row);
    const aimedY = PITCH - result.input.length_m;
    document.getElementById("proof").textContent =
      `Aimed ${result.input.line_m >= 0 ? "off" : "leg"} ${(Math.abs(result.input.line_m) * 100).toFixed(0)}cm / ${formatControl("length_m", result.input.length_m, 1)} → pitched x=${bounce[0].toFixed(2)} y=${bounce[1].toFixed(2)} (aim y ${aimedY.toFixed(2)}) · ${result.outcome}`;
  }

  function replayLast(loop) {
    const result = state.lastResult;
    if (!result) return;
    Time.paused = false;
    Time.timeScale = 0.55;
    const ball = loop.scene.findWithTag("Ball");
    ball.active = true;
    ball.getComponent(TrailRenderer).clear();
    const motor = ball.getComponent(TrajectoryMotor);
    const stumps = loop.scene.findWithTag("Stumps").getComponent(WicketSet);
    stumps.reset();
    loop.scene.findWithTag("Batter").getComponent(BatterBrain).prepare(result);
    state.bowling = true;
    motor.onFinish = () => {
      state.bowling = false;
      Time.timeScale = 1;
      if (result.outcome === "bowled") stumps.smash(result.stump_pass?.[0] || 0, 8);
    };
    motor.load(result.samples);
    loop.timeline.play();
  }

  function paintSpell() {
    document.getElementById("spell").textContent = `${state.spell.wickets}–${state.spell.balls}`;
    document.getElementById("pts").textContent = String(state.spell.runs);
  }

  function renderChallenges() {
    const root = document.getElementById("challenges");
    root.innerHTML = "";
    for (const ch of state.challenges) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "challenge" + (state.challenge?.id === ch.id ? " on" : "");
      if (state.unlocked.has(ch.id)) btn.classList.add("done");
      btn.innerHTML = `<strong>${ch.title}</strong><span>${ch.patron}</span>`;
      btn.addEventListener("click", () => {
        state.challenge = ch;
        document.getElementById("challenge-blurb").textContent = `${ch.blurb} ${ch.hint}`;
        const obj = document.getElementById("objective");
        if (obj) obj.textContent = ch.title;
        renderChallenges();
      });
      root.appendChild(btn);
    }
  }

  function checkChallenge(result) {
    const ch = state.challenge;
    if (!ch) return;
    const okRegime =
      result.aero.regime === ch.target_regime ||
      (ch.id === "contrast" &&
        (result.aero.regime === "contrast_shine" || result.aero.regime === "contrast_rough"));
    const okPace = result.input.pace_kph >= ch.min_pace_kph;
    const okLength = result.input.length_m <= ch.max_length_m;
    const okDev = Math.abs(result.aero.late_deviation_m) >= ch.min_deviation_m;
    const okWicket = !ch.require_wicket || result.wickets;
    if (okRegime && okPace && okLength && okDev && okWicket) {
      state.unlocked.add(ch.id);
      document.getElementById("challenge-blurb").textContent = `Unlocked — ${ch.title}. ${result.aero.commentary}`;
      renderChallenges();
    }
  }

  function wireUi(loop) {
    document.getElementById("bowl").addEventListener("click", () => {
      if (!state.bowling) bowl(loop);
    });
    document.getElementById("replay-btn").addEventListener("click", () => replayLast(loop));
    document.getElementById("replay").addEventListener("input", (e) => {
      const t = Number(e.target.value);
      const motor = loop.scene.findWithTag("Ball").getComponent(TrajectoryMotor);
      if (state.lastResult) {
        Time.paused = true;
        motor.scrub(t);
        loop.timeline.scrub(t);
      }
    });
    document.getElementById("pause").addEventListener("click", () => {
      Time.paused = !Time.paused;
    });
    document.getElementById("mute")?.addEventListener("click", () => window.RSAudio?.toggle());
    document.getElementById("bowl").addEventListener("pointerdown", () => window.RSAudio?.unlock());
    document.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-preset]").forEach((b) => b.classList.remove("on"));
        btn.classList.add("on");
        applyPreset(btn.dataset.preset);
      });
    });
  }

  function applyPreset(name) {
    const d = state.delivery;
    if (name === "new") {
      d.overs = 2;
      d.roughness = 0.08;
      d.shine = 0.96;
      d.pace_kph = 128;
      d.seam_angle_deg = 18;
    } else if (name === "karachi") {
      d.overs = 42;
      d.roughness = 0.78;
      d.shine = 0.86;
      d.pace_kph = 146;
      d.seam_angle_deg = 20;
      d.length_m = 0.55;
      d.line_m = 0.06;
      d.wrist_behind = 0.92;
      d.seam_upright = 0.9;
    } else if (name === "contrast") {
      d.overs = 35;
      d.roughness = 0.8;
      d.shine = 0.9;
      d.seam_angle_deg = 0;
      d.pace_kph = 132;
    }
    document.getElementById("overs").value = d.overs;
    document.getElementById("overs-out").textContent = `${d.overs} ov`;
    ["pace", "line", "length", "seam", "wrist", "upright", "rough", "shine"].forEach((id) => {
      const key = {
        pace: "pace_kph",
        line: "line_m",
        length: "length_m",
        seam: "seam_angle_deg",
        wrist: "wrist_behind",
        upright: "seam_upright",
        rough: "roughness",
        shine: "shine",
      }[id];
      document.getElementById(id).value = d[key];
      document.getElementById(id).dispatchEvent(new Event("input"));
    });
  }

  async function boot() {
    const canvas = document.getElementById("stage");
    const scene = new Scene("Gaddafi Dusk");

    const camObj = new GameObject("Main Camera", { tag: "MainCamera" });
    const camera = camObj.addComponent(new Camera());
    camera.eye.set(1.18, -13.35, 4.42);
    camera.lookAt(0.03, 12.55, 0.3);
    camera.fov = 41;
    camObj.addComponent(new CameraRig(camera));
    scene.add(camObj);

    const pitch = new GameObject("Pitch", { tag: "Pitch", layer: Layers.Pitch });
    pitch.addComponent(new PlaneCollider(0));
    scene.add(pitch);

    const stumps = new GameObject("Stumps", { tag: "Stumps", layer: Layers.Stumps });
    stumps.transform.position.set(0, PITCH, 0);
    stumps.addComponent(new WicketSet(PITCH));
    stumps.addComponent(
      new BoxCollider({ x: -0.13, y: PITCH - 0.04, z: 0 }, { x: 0.13, y: PITCH + 0.04, z: 0.72 })
    );
    scene.add(stumps);

    const near = new GameObject("BowlerStumps", { tag: "BowlerStumps", layer: Layers.Stumps });
    near.addComponent(new WicketSet(0));
    scene.add(near);

    const batter = new GameObject("Batter", { tag: "Batter", layer: Layers.Batter });
    batter.addComponent(new BatterBrain());
    scene.add(batter);

    const bowler = new GameObject("Bowler", { tag: "Bowler" });
    bowler.addComponent(new BowlerActor());
    scene.add(bowler);

    const keeper = new GameObject("Keeper", { tag: "Keeper" });
    keeper.addComponent(new KeeperActor());
    scene.add(keeper);

    const umpire = new GameObject("Umpire", { tag: "Umpire" });
    umpire.addComponent(new UmpireActor());
    scene.add(umpire);

    const ball = new GameObject("Ball", { tag: "Ball", layer: Layers.Ball });
    ball.transform.position.set(0.2, 0.18, 2.08);
    ball.active = false;
    const body = ball.addComponent(new Rigidbody());
    body.interpolate = Interpolate.Interpolate;
    body.mass = 0.16;
    ball.addComponent(new TrajectoryMotor());
    ball.addComponent(new WristSpinner());
    ball.addComponent(new TrailRenderer({ maxPoints: 110, width: 2.8, color: "#e8c36a" }));
    scene.add(ball);

    const fx = new GameObject("Dust", { tag: "FX", layer: Layers.FX });
    fx.addComponent(new ParticleSystem());
    scene.add(fx);

    const renderer = new StudioRenderer(canvas, scene, camera, () => state);
    const loop = new PlayerLoop(scene, {
      onRender: (alpha) => {
        applyInput(loop);
        const bpos = ball.transform.position;
        batter.getComponent(BatterBrain).track(state.bowling ? bpos : null);
        keeper.getComponent(KeeperActor).track(state.bowling && ball.active ? bpos : null);
        if (state.bowling && ball.active && state.lastResult?.outcome === "bowled" && bpos.y >= PITCH - 0.05) {
          const wk = stumps.getComponent(WicketSet);
          if (!wk.smashed) {
            wk.smash(bpos.x, 8);
            fx.getComponent(ParticleSystem).emit(18, new Vector3(bpos.x, PITCH, 0.4), "wood");
            camObj.getComponent(CameraRig)?.punch(1.5);
            renderer.punch(1);
            window.RSAudio?.play("stumps");
          }
        }
        renderer.draw(alpha);
        document.getElementById("clock").textContent = Time.paused ? "PAUSE" : `${Time.timeScale.toFixed(2)}×`;
      },
    });
    renderer.resize();
    window.addEventListener("resize", () => renderer.resize());
    loop.start(window);

    bindSliders();
    wireUi(loop);
    paintBall();
    paintSpell();

    try {
      state.challenges = await api("/challenges");
      state.lore = await api("/lore");
      renderChallenges();
      const origin = state.lore.find((l) => l.id === "origin");
      if (origin) document.getElementById("lore").textContent = origin.text;
    } catch (err) {
      document.getElementById("lore").textContent =
        "Reverse swing was honed on dry Pakistani pitches by Sarfraz, Imran, Wasim and Waqar.";
      console.warn(err);
    }
    schedulePreview();

    const params = new URLSearchParams(location.search);
    const demo = params.get("demo");
      if (demo === "lbw") {
      applyPreset("karachi");
      state.delivery.line_m = 0.16;
      state.delivery.length_m = 3.2;
      state.delivery.pace_kph = 146;
      syncSlider("line", 0.16);
      syncSlider("length", 3.2);
      syncSlider("pace", 146);
      setTimeout(() => bowl(loop), 280);
    } else if (demo === "yorker") {
      applyPreset("karachi");
      state.delivery.line_m = 0.02;
      state.delivery.length_m = 0.55;
      syncSlider("line", 0.02);
      syncSlider("length", 0.55);
      setTimeout(() => bowl(loop), 280);
    } else if (demo === "short") {
      applyPreset("karachi");
      state.delivery.line_m = 0.42;
      state.delivery.length_m = 9.2;
      syncSlider("line", 0.42);
      syncSlider("length", 9.2);
      setTimeout(() => bowl(loop), 280);
    } else if (demo === "leg") {
      applyPreset("karachi");
      state.delivery.line_m = -0.3;
      state.delivery.length_m = 2.6;
      syncSlider("line", -0.3);
      syncSlider("length", 2.6);
      setTimeout(() => bowl(loop), 280);
    }
    if (params.get("shot") === "end") {
      applyPreset("karachi");
      state.delivery.line_m = Number(params.get("line") || 0.02);
      state.delivery.length_m = Number(params.get("length") || 0.55);
      syncSlider("line", state.delivery.line_m);
      syncSlider("length", state.delivery.length_m);
      setTimeout(async () => {
        const result = await api("/bowl", { method: "POST", body: JSON.stringify(payload()) });
        state.lastResult = result;
        const ball = loop.scene.findWithTag("Ball");
        ball.active = true;
        const last = result.samples.at(-1);
        if (last) ball.transform.position.set(last.x, last.y, last.z);
        loop.scene.findWithTag("Batter").getComponent(BatterBrain).prepare(result);
        const batter = loop.scene.findWithTag("Batter").getComponent(BatterBrain);
        batter.x = result.batter_commit_x;
        batter.footY = result.batter_foot_y;
        batter.batAngle = ["bowled", "lbw", "beaten"].includes(result.outcome) ? 0.22 : 0.82;
        batter.weight = 1;
        batter.swing = ["bowled", "lbw", "beaten"].includes(result.outcome) ? 0.45 : 1;
        batter.phase = "follow";
        if (result.outcome === "lbw") batter.padFlash = 1;
        if (result.outcome === "bowled") {
          batter.headTurn = 1;
          loop.scene.findWithTag("Stumps").getComponent(WicketSet).smash(result.stump_pass?.[0] || 0, 10);
          for (let i = 0; i < 18; i += 1) {
            loop.scene.findWithTag("Stumps").getComponent(WicketSet).update(0.016);
          }
        }
        loop.scene.findWithTag("Umpire").getComponent(UmpireActor).finger = result.wickets;
        loop.scene.findWithTag("Bowler").getComponent(BowlerActor).phase = "follow";
        loop.scene.findWithTag("Bowler").getComponent(BowlerActor).y = 1.1;
        loop.scene.findWithTag("Bowler").getComponent(BowlerActor).hasBall = false;
        state.holdClimax = true;
        state.releasing = true;
        document.querySelector(".coach")?.classList.add("spent");
        loop.scene.findWithTag("MainCamera").getComponent(CameraRig).impact = 1;
        recordProof(result);
        showCall(result);
        paintTelemetry(result, true);
      }, 200);
    }
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
