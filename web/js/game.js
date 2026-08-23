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
  } = window.RSEngine;

  const PITCH = 20.12;
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
    spell: { balls: 0, wickets: 0, runs: 0 },
    unlocked: new Set(),
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

  class StudioRenderer {
    constructor(canvas, scene, camera) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.scene = scene;
      this.camera = camera;
      this.dpr = 1;
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(rect.width * this.dpr);
      this.canvas.height = Math.round(rect.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.camera.viewport.width = rect.width;
      this.camera.viewport.height = rect.height;
    }
    draw(alpha) {
      const { ctx, camera } = this;
      const w = camera.viewport.width;
      const h = camera.viewport.height;
      ctx.clearRect(0, 0, w, h);
      this._sky(w, h);
      this._outfield(w, h);
      this._pitch();
      this._stumps();
      this._batter();
      this._creaseMarks();
      this._trails(alpha);
      this._particles();
      this._ball(alpha);
      this._aimGhost();
    }
    _project(x, y, z) {
      return this.camera.worldToScreen(x, y, z);
    }
    _sky(w, h) {
      const g = this.ctx.createLinearGradient(0, 0, 0, h * 0.55);
      g.addColorStop(0, "#1a0f18");
      g.addColorStop(0.45, "#3d1d22");
      g.addColorStop(1, "#6b3a28");
      this.ctx.fillStyle = g;
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.fillStyle = "rgba(255, 210, 140, 0.09)";
      this.ctx.beginPath();
      this.ctx.ellipse(w * 0.82, h * 0.16, 90, 90, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }
    _outfield(w, h) {
      const g = this.ctx.createLinearGradient(0, h * 0.42, 0, h);
      g.addColorStop(0, "#1c3a28");
      g.addColorStop(1, "#0c1c14");
      this.ctx.fillStyle = g;
      this.ctx.beginPath();
      this.ctx.moveTo(0, h * 0.46);
      this.ctx.lineTo(w, h * 0.46);
      this.ctx.lineTo(w, h);
      this.ctx.lineTo(0, h);
      this.ctx.fill();
    }
    _poly(points, fill, stroke, width = 1) {
      const ctx = this.ctx;
      ctx.beginPath();
      points.forEach((p, i) => {
        const s = this._project(p[0], p[1], p[2]);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.stroke();
      }
    }
    _pitch() {
      const half = 1.52;
      this._poly(
        [
          [-half, 0, 0],
          [half, 0, 0],
          [half * 0.72, PITCH, 0],
          [-half * 0.72, PITCH, 0],
        ],
        "#c4a36a",
        "rgba(80, 50, 20, 0.35)",
        1
      );
      this._poly(
        [
          [-0.15, 0, 0.01],
          [0.15, 0, 0.01],
          [0.1, PITCH, 0.01],
          [-0.1, PITCH, 0.01],
        ],
        "rgba(150, 110, 55, 0.35)"
      );
      this.ctx.save();
      this.ctx.globalAlpha = 0.55;
      for (let i = 0; i < 9; i += 1) {
        const y = 2 + i * 2;
        this._poly(
          [
            [-1.4, y, 0.015],
            [1.4, y, 0.015],
          ],
          null,
          "rgba(90, 60, 25, 0.25)",
          1
        );
      }
      this.ctx.restore();
    }
    _creaseMarks() {
      const lines = [
        [
          [-1.32, 1.22, 0.02],
          [1.32, 1.22, 0.02],
        ],
        [
          [-1.32, PITCH - 1.22, 0.02],
          [1.32, PITCH - 1.22, 0.02],
        ],
        [
          [-0.12, 0, 0.03],
          [-0.12, 0.2, 0.03],
        ],
        [
          [0.12, 0, 0.03],
          [0.12, 0.2, 0.03],
        ],
      ];
      for (const line of lines) {
        this._poly(line, null, "rgba(250, 244, 230, 0.7)", 1.4);
      }
    }
    _stumps() {
      const xs = [-0.1, 0, 0.1];
      for (const x of xs) {
        const a = this._project(x, PITCH, 0);
        const b = this._project(x, PITCH, 0.71);
        this.ctx.strokeStyle = "#f0d7a0";
        this.ctx.lineWidth = 3.2;
        this.ctx.beginPath();
        this.ctx.moveTo(a.x, a.y);
        this.ctx.lineTo(b.x, b.y);
        this.ctx.stroke();
      }
      const l = this._project(-0.11, PITCH, 0.715);
      const r = this._project(0.11, PITCH, 0.715);
      this.ctx.strokeStyle = "#e8c56a";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(l.x, l.y);
      this.ctx.lineTo(r.x, r.y);
      this.ctx.stroke();
    }
    _batter() {
      const x = 0.28;
      const y = PITCH - 1.35;
      const feet = this._project(x, y, 0);
      const hip = this._project(x - 0.05, y, 0.85);
      const shoulder = this._project(x - 0.02, y, 1.45);
      const head = this._project(x, y, 1.72);
      const batTip = this._project(x + 0.42, y + 0.1, 0.15);
      const handle = this._project(x + 0.08, y, 1.15);
      const ctx = this.ctx;
      ctx.strokeStyle = "rgba(20, 12, 10, 0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(feet.x, feet.y);
      ctx.lineTo(hip.x, hip.y);
      ctx.lineTo(shoulder.x, shoulder.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(head.x, head.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#8b5a2b";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(handle.x, handle.y);
      ctx.lineTo(batTip.x, batTip.y);
      ctx.stroke();
    }
    _trails(alpha) {
      const ball = this.scene.findWithTag("Ball");
      if (!ball) return;
      const trail = ball.getComponent(TrailRenderer);
      if (!trail || trail.points.length < 2) return;
      const ctx = this.ctx;
      const regime = state.lastResult?.aero.regime || state.preview?.aero.regime;
      const color =
        regime === "reverse"
          ? "210, 84, 52"
          : regime === "conventional"
            ? "232, 195, 106"
            : "180, 210, 190";
      ctx.beginPath();
      trail.points.forEach((p, i) => {
        const s = this._project(p.x, p.y, p.z);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.strokeStyle = `rgba(${color}, 0.85)`;
      ctx.lineWidth = trail.width;
      ctx.lineJoin = "round";
      ctx.stroke();
      void alpha;
    }
    _particles() {
      const fx = this.scene.findWithTag("FX");
      if (!fx) return;
      const system = fx.getComponent(ParticleSystem);
      const ctx = this.ctx;
      for (const p of system.particles) {
        const s = this._project(p.x, p.y, p.z);
        const life = 1 - p.age / p.life;
        ctx.fillStyle = `rgba(210, 170, 110, ${0.55 * life})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.size * life, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    _ball(alpha) {
      const ball = this.scene.findWithTag("Ball");
      if (!ball || !ball.active) return;
      const body = ball.getComponent(Rigidbody);
      const pos = body ? body.renderPosition(alpha) : ball.transform.position;
      const s = this._project(pos.x, pos.y, pos.z);
      if (s.scale <= 0) return;
      const r = Math.max(3.2, 7.4 * (s.scale / 80));
      const ctx = this.ctx;
      const shadow = this._project(pos.x, pos.y, 0);
      ctx.fillStyle = "rgba(20, 12, 8, 0.28)";
      ctx.beginPath();
      ctx.ellipse(shadow.x, shadow.y, r * 1.4, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      const shine = ctx.createRadialGradient(s.x - r * 0.3, s.y - r * 0.35, 1, s.x, s.y, r);
      const roughOff = state.delivery.rough_side === "off";
      shine.addColorStop(0, roughOff ? "#9a3a32" : "#f0b2a0");
      shine.addColorStop(0.45, "#b42318");
      shine.addColorStop(1, "#4a0d0c");
      ctx.fillStyle = shine;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate((state.delivery.seam_angle_deg * Math.PI) / 180 + ball.transform.rotation.x * 0.15);
      ctx.strokeStyle = "rgba(245, 236, 214, 0.9)";
      ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.quadraticCurveTo(r * 0.2, 0, 0, r * 0.85);
      ctx.stroke();
      ctx.restore();
    }
    _aimGhost() {
      if (state.bowling) return;
      const y = PITCH - state.delivery.length_m;
      const x = state.delivery.line_m;
      const s = this._project(x, y, 0.02);
      this.ctx.strokeStyle = "rgba(255, 230, 170, 0.55)";
      this.ctx.setLineDash([4, 4]);
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

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
        schedulePreview();
        paintBall();
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
      document.getElementById("rough-out").textContent = formatControl(
        "roughness",
        state.delivery.roughness,
        2
      );
      document.getElementById("shine-out").textContent = formatControl("shine", state.delivery.shine, 2);
      schedulePreview();
      paintBall();
    });
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

  let previewTimer = 0;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 140);
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
    document.getElementById("regime").textContent = aero.regime.replaceAll("_", " ");
    document.getElementById("regime").dataset.kind = aero.regime;
    document.getElementById("re").textContent = `${(aero.reynolds / 1000).toFixed(0)}k`;
    document.getElementById("mph").textContent = `${aero.speed_mph.toFixed(0)} mph`;
    document.getElementById("onset").textContent = `reverses ≥ ${aero.reverse_onset_mph.toFixed(0)} mph`;
    document.getElementById("lsb").textContent = aero.laminar_separation_bubble ? "LSB live" : "no bubble";
    document.getElementById("sep").textContent = `${aero.seam_separation_deg.toFixed(0)}° / ${aero.non_seam_separation_deg.toFixed(0)}°`;
    document.getElementById("dev").textContent = `${(aero.late_deviation_m * 100).toFixed(0)} cm late`;
    document.getElementById("copy").textContent = aero.commentary;
    if (!previewOnly) {
      document.getElementById("outcome").textContent = result.outcome;
      document.getElementById("score").textContent = `+${result.score}`;
    }
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
    if (input.pointer.down && input.pointer.dx) {
      d.line_m = clamp(d.line_m + input.pointer.dx * 0.0012, -0.7, 0.7);
      d.length_m = clamp(d.length_m + input.pointer.dy * 0.012, 0.2, 12);
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
    Time.paused = false;
    Time.timeScale = 1;
    const ball = loop.scene.findWithTag("Ball");
    const trail = ball.getComponent(TrailRenderer);
    const motor = ball.getComponent(TrajectoryMotor);
    trail.clear();
    document.getElementById("bowl").classList.add("hot");
    try {
      const result = await api("/bowl", { method: "POST", body: JSON.stringify(payload()) });
      state.lastResult = result;
      paintTelemetry(result, false);
      state.spell.balls += 1;
      if (result.wickets) state.spell.wickets += 1;
      state.spell.runs += result.score;
      paintSpell();
      checkChallenge(result);
      loop.timeline.begin();
      motor.onBounce = (origin) => {
        loop.scene.findWithTag("FX").getComponent(ParticleSystem).emit(18, origin);
      };
      motor.onFinish = () => {
        state.bowling = false;
        loop.timeline.stop();
        document.getElementById("bowl").classList.remove("hot");
        document.getElementById("replay-wrap").hidden = false;
        const slider = document.getElementById("replay");
        slider.max = String(motor.elapsed || result.samples.at(-1)?.t || 1);
        slider.value = slider.max;
      };
      motor.load(result.samples);
      const recorder = () => {
        if (!loop.timeline.recording) return;
        const p = ball.transform.position;
        loop.timeline.push(motor.elapsed, { x: p.x, y: p.y, z: p.z });
      };
      const hook = setInterval(recorder, 16);
      setTimeout(() => clearInterval(hook), 2200);
    } catch (err) {
      console.error(err);
      state.bowling = false;
      document.getElementById("bowl").classList.remove("hot");
    }
  }

  function replayLast(loop) {
    const result = state.lastResult;
    if (!result) return;
    Time.paused = false;
    Time.timeScale = 0.55;
    const ball = loop.scene.findWithTag("Ball");
    ball.getComponent(TrailRenderer).clear();
    const motor = ball.getComponent(TrajectoryMotor);
    state.bowling = true;
    motor.onFinish = () => {
      state.bowling = false;
      Time.timeScale = 1;
    };
    motor.load(result.samples);
    loop.timeline.play();
  }

  function paintSpell() {
    document.getElementById("spell").textContent =
      `${state.spell.wickets}/${state.spell.balls}  ·  ${state.spell.runs} pts`;
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
    document.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => applyPreset(btn.dataset.preset));
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
      d.line_m = 0.18;
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

    const camObj = new GameObject("Main Camera", { tag: "MainCamera", layer: Layers.Default });
    const camera = camObj.addComponent(new Camera());
    camera.eye.set(0.2, -7.8, 4.05);
    camera.lookAt(0, 16.8, 0.35);
    camera.fov = 36;
    scene.add(camObj);

    const pitch = new GameObject("Pitch", { tag: "Pitch", layer: Layers.Pitch });
    pitch.addComponent(new PlaneCollider(0));
    scene.add(pitch);

    const stumps = new GameObject("Stumps", { tag: "Stumps", layer: Layers.Stumps });
    stumps.transform.position.set(0, PITCH, 0);
    stumps.addComponent(
      new BoxCollider(
        { x: -0.13, y: PITCH - 0.04, z: 0 },
        { x: 0.13, y: PITCH + 0.04, z: 0.72 }
      )
    );
    scene.add(stumps);

    const batter = new GameObject("Batter", { tag: "Batter", layer: Layers.Batter });
    batter.transform.position.set(0.28, PITCH - 1.32, 0);
    scene.add(batter);

    const ball = new GameObject("Ball", { tag: "Ball", layer: Layers.Ball });
    ball.transform.position.set(0.05, 0.2, 2.08);
    const body = ball.addComponent(new Rigidbody());
    body.interpolate = Interpolate.Interpolate;
    body.mass = 0.16;
    ball.addComponent(new TrajectoryMotor());
    ball.addComponent(new WristSpinner());
    ball.addComponent(new TrailRenderer({ maxPoints: 90, width: 2.4, color: "#e8c36a" }));
    scene.add(ball);

    const fx = new GameObject("Dust", { tag: "FX", layer: Layers.FX });
    fx.addComponent(new ParticleSystem());
    scene.add(fx);

    const renderer = new StudioRenderer(canvas, scene, camera);
    const loop = new PlayerLoop(scene, {
      onRender: (alpha) => {
        applyInput(loop);
        renderer.draw(alpha);
        document.getElementById("clock").textContent = Time.paused
          ? "paused"
          : `${Time.timeScale.toFixed(2)}×`;
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
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
