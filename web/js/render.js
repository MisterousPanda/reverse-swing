/**
 * Broadcast-style cricket canvas: full pitch, length map, players, stump smash.
 * Stylized arcade / dusk telecast — not licensed art.
 */
(function (global) {
  const { PITCH } = global.RSEngine;
  const HALF = 1.525;

  const KIT = {
    whites: "#efe6cf",
    crease: "#d8cbb0",
    shadow: "rgba(10, 8, 6, 0.38)",
    skin: "#c68642",
    skinDark: "#8d5524",
    maroon: "#7a1f24",
    navy: "#1c2a44",
    pad: "#e8eef6",
    padNavy: "#243552",
    willow: "#c9853a",
    grip: "#2a1a14",
    helmet: "#1a2740",
    leather: "#b42318",
    wood: "#d8b56a",
    bail: "#f0d48a",
  };

  class StudioRenderer {
    constructor(canvas, scene, camera, getState) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.scene = scene;
      this.camera = camera;
      this.getState = getState;
      this.dpr = 1;
      this.hawk = document.getElementById("hawkeye");
      this.hawkCtx = this.hawk?.getContext("2d") || null;
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
      camera.rebuildBasis();
      const w = camera.viewport.width;
      const h = camera.viewport.height;
      ctx.clearRect(0, 0, w, h);
      this._sky(w, h);
      this._stadium(w, h);
      this._outfield(w, h);
      this._pitch();
      this._lengthMap();
      this._creases();
      this._aim();
      this._wickets("bowler");
      this._umpire();
      this._fielders();
      this._bowler();
      this._batter();
      this._keeper();
      this._wickets("striker");
      this._trails();
      this._particles();
      this._ball(alpha);
      this._hawkeye();
    }

    proj(x, y, z) {
      return this.camera.worldToScreen(x, y, z);
    }

    _sky(w, h) {
      const g = this.ctx.createLinearGradient(0, 0, 0, h * 0.46);
      g.addColorStop(0, "#14101c");
      g.addColorStop(0.35, "#3a1c24");
      g.addColorStop(0.7, "#6a3a28");
      g.addColorStop(1, "#8a5340");
      this.ctx.fillStyle = g;
      this.ctx.fillRect(0, 0, w, h * 0.5);
      this.ctx.fillStyle = "rgba(255, 214, 150, 0.16)";
      this.ctx.beginPath();
      this.ctx.ellipse(w * 0.78, h * 0.12, 70, 70, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }

    _stadium(w, h) {
      const ctx = this.ctx;
      const stands = ctx.createLinearGradient(0, h * 0.18, 0, h * 0.46);
      stands.addColorStop(0, "#2a1c1c");
      stands.addColorStop(1, "#152018");
      ctx.fillStyle = stands;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.46);
      ctx.lineTo(0, h * 0.22);
      ctx.quadraticCurveTo(w * 0.5, h * 0.12, w, h * 0.22);
      ctx.lineTo(w, h * 0.46);
      ctx.fill();

      ctx.fillStyle = "#3a2220";
      ctx.fillRect(w * 0.36, h * 0.2, w * 0.28, h * 0.1);
      ctx.fillStyle = "#241616";
      for (let i = 0; i < 7; i += 1) {
        ctx.fillRect(w * 0.38 + i * w * 0.035, h * 0.215, w * 0.02, h * 0.055);
      }

      this._flood(w * 0.12, h * 0.2, h * 0.26);
      this._flood(w * 0.88, h * 0.2, h * 0.26);
    }

    _flood(x, y, h) {
      const ctx = this.ctx;
      ctx.strokeStyle = "#2a2a28";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 230, 170, 0.85)";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      const beam = ctx.createLinearGradient(x, y, x, y + h * 1.6);
      beam.addColorStop(0, "rgba(255, 220, 150, 0.18)");
      beam.addColorStop(1, "rgba(255, 220, 150, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x + 70, y + h * 1.5);
      ctx.lineTo(x - 70, y + h * 1.5);
      ctx.fill();
    }

    _outfield(w, h) {
      const ctx = this.ctx;
      const g = ctx.createLinearGradient(0, h * 0.38, 0, h);
      g.addColorStop(0, "#245334");
      g.addColorStop(0.45, "#1a3f28");
      g.addColorStop(1, "#0d2216");
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.38, w, h * 0.62);

      for (let i = 0; i < 14; i += 1) {
        const y0 = 3 + i * 1.7;
        this._quad(
          [-18, y0, 0],
          [18, y0, 0],
          [18, y0 + 0.85, 0],
          [-18, y0 + 0.85, 0],
          i % 2 ? "rgba(20, 70, 40, 0.18)" : "rgba(10, 40, 24, 0.12)"
        );
      }
    }

    _quad(a, b, c, d, fill, stroke, width) {
      const ctx = this.ctx;
      const A = this.proj(...a);
      const B = this.proj(...b);
      const C = this.proj(...c);
      const D = this.proj(...d);
      if (!A.visible && !B.visible && !C.visible && !D.visible) return;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.lineTo(C.x, C.y);
      ctx.lineTo(D.x, D.y);
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width || 1;
        ctx.stroke();
      }
    }

    _line(a, b, stroke, width) {
      const A = this.proj(...a);
      const B = this.proj(...b);
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width || 1.4;
      ctx.stroke();
    }

    _pitch() {
      this._quad(
        [-2.15, -2.4, 0],
        [2.15, -2.4, 0],
        [1.85, PITCH + 1.8, 0],
        [-1.85, PITCH + 1.8, 0],
        "#b8925a",
        "rgba(70, 42, 18, 0.4)",
        1
      );
      this._quad(
        [-HALF, -1.4, 0.002],
        [HALF, -1.4, 0.002],
        [HALF * 0.96, PITCH + 1.5, 0.002],
        [-HALF * 0.96, PITCH + 1.5, 0.002],
        "#d2ae72",
        "rgba(70, 42, 18, 0.45)",
        1.2
      );
      this._quad(
        [-0.42, 1.5, 0.005],
        [0.42, 1.5, 0.005],
        [0.34, PITCH - 1.2, 0.005],
        [-0.34, PITCH - 1.2, 0.005],
        "rgba(138, 96, 48, 0.42)"
      );
      for (let i = 0; i < 16; i += 1) {
        const y = i * (PITCH / 16);
        this._line([-HALF + 0.04, y, 0.01], [HALF - 0.04, y, 0.01], "rgba(90, 58, 24, 0.14)", 1);
      }
    }

    _lengthMap() {
      const zones = [
        { y0: PITCH - 1.2, y1: PITCH - 0.15, fill: "rgba(220, 70, 40, 0.28)", label: "YORKER" },
        { y0: PITCH - 4.0, y1: PITCH - 1.2, fill: "rgba(230, 170, 40, 0.22)", label: "FULL" },
        { y0: PITCH - 7.5, y1: PITCH - 4.0, fill: "rgba(50, 170, 80, 0.22)", label: "GOOD" },
        { y0: PITCH - 12.0, y1: PITCH - 7.5, fill: "rgba(70, 130, 210, 0.20)", label: "SHORT" },
      ];
      for (const z of zones) {
        this._quad(
          [-HALF + 0.08, z.y0, 0.012],
          [HALF - 0.08, z.y0, 0.012],
          [HALF - 0.08, z.y1, 0.012],
          [-HALF + 0.08, z.y1, 0.012],
          z.fill
        );
        const s = this.proj(-HALF + 0.18, (z.y0 + z.y1) * 0.5, 0.03);
        this.ctx.save();
        this.ctx.globalAlpha = 0.7;
        this.ctx.fillStyle = "rgba(255, 236, 200, 0.72)";
        this.ctx.font = "700 13px 'Barlow Condensed', sans-serif";
        this.ctx.fillText(z.label, s.x, s.y);
        this.ctx.restore();
      }
    }

    _creases() {
      const white = "rgba(250, 246, 232, 0.88)";
      this._line([-1.32, 0, 0.025], [1.32, 0, 0.025], white, 2);
      this._line([-1.32, 1.22, 0.025], [1.32, 1.22, 0.025], white, 2);
      this._line([-1.32, PITCH, 0.025], [1.32, PITCH, 0.025], white, 2);
      this._line([-1.32, PITCH - 1.22, 0.025], [1.32, PITCH - 1.22, 0.025], white, 2);
      this._line([-1.32, 0, 0.025], [-1.32, 1.22, 0.025], white, 1.6);
      this._line([1.32, 0, 0.025], [1.32, 1.22, 0.025], white, 1.6);
      this._line([-1.32, PITCH, 0.025], [-1.32, PITCH - 1.22, 0.025], white, 1.6);
      this._line([1.32, PITCH, 0.025], [1.32, PITCH - 1.22, 0.025], white, 1.6);
      this._line([-0.89, PITCH - 1.22, 0.02], [-0.89, PITCH + 0.3, 0.02], "rgba(250,246,232,0.35)", 1);
      this._line([0.89, PITCH - 1.22, 0.02], [0.89, PITCH + 0.3, 0.02], "rgba(250,246,232,0.35)", 1);
      this._line([-0.11, -0.02, 0.03], [-0.11, 0.18, 0.03], white, 2);
      this._line([0.11, -0.02, 0.03], [0.11, 0.18, 0.03], white, 2);
    }

    _aim() {
      const state = this.getState();
      const x = state.delivery.line_m;
      const y = PITCH - state.delivery.length_m;
      const s = this.proj(x, y, 0.04);
      const ctx = this.ctx;
      const pulse = Math.max(14, 0.22 * s.scale) + Math.sin(global.RSEngine.Time.unscaledTime * 6) * 3;
      ctx.save();
      ctx.fillStyle = "rgba(255, 214, 80, 0.38)";
      ctx.strokeStyle = "rgba(255, 244, 180, 0.98)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, pulse * 1.35, pulse * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x - pulse * 1.7, s.y);
      ctx.lineTo(s.x + pulse * 1.7, s.y);
      ctx.moveTo(s.x, s.y - pulse);
      ctx.lineTo(s.x, s.y + pulse);
      ctx.stroke();
      ctx.fillStyle = "#fff3b0";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (state.lastResult?.bounce) {
        const [bx, by] = state.lastResult.bounce;
        const p = this.proj(bx, by, 0.03);
        ctx.save();
        ctx.strokeStyle = "rgba(255, 90, 60, 0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    _capsule(a, b, widthM, color) {
      const A = this.proj(a[0], a[1], a[2]);
      const B = this.proj(b[0], b[1], b[2]);
      const sc = Math.max(42, (A.scale + B.scale) * 0.5);
      const w = Math.max(6, sc * widthM * 2.15);
      const ctx = this.ctx;
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(20, 12, 8, 0.75)";
      ctx.lineWidth = w + 2.4;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
    }

    _size(s, meters, minPx = 3) {
      return Math.max(minPx, meters * Math.max(42, s.scale));
    }

    _blob(x, y, z, rx, rz, color) {
      const s = this.proj(x, y, z);
      if (!s.visible) return s;
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, this._size(s, rx, 3), this._size(s, rz, 3), 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(20, 12, 8, 0.55)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      return s;
    }

    _torso(x, y, hipZ, shoulderZ, hipW, shoulderW, color) {
      this._quad(
        [x - hipW, y, hipZ],
        [x + hipW, y, hipZ],
        [x + shoulderW, y, shoulderZ],
        [x - shoulderW, y, shoulderZ],
        color,
        "rgba(20, 12, 8, 0.55)",
        1.6
      );
    }

    _shadow(x, y, w = 0.28) {
      const s = this.proj(x, y, 0.01);
      this.ctx.fillStyle = KIT.shadow;
      this.ctx.beginPath();
      this.ctx.ellipse(s.x, s.y, Math.max(6, w * s.scale * 0.7), Math.max(3, w * s.scale * 0.22), 0, 0, Math.PI * 2);
      this.ctx.fill();
    }

    _wickets(end) {
      const set =
        end === "bowler"
          ? this.scene.findWithTag("BowlerStumps")?.getComponent(global.RSPlay.WicketSet)
          : this.scene.findWithTag("Stumps")?.getComponent(global.RSPlay.WicketSet);
      if (!set) return;
      const ctx = this.ctx;
      for (const post of set.posts) {
        const bx = post.x + post.ox;
        const by = set.y + post.oy;
        const base = this.proj(bx, by, 0);
        const top = this.proj(bx + post.leanX, by + post.leanY, 0.71 + post.oz);
        const w = Math.max(5, base.scale * 0.038);
        const wood = ctx.createLinearGradient(base.x - w, base.y, base.x + w, top.y);
        wood.addColorStop(0, "#c49a4a");
        wood.addColorStop(0.5, "#f0d27a");
        wood.addColorStop(1, "#8a5a22");
        ctx.strokeStyle = wood;
        ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();
        ctx.fillStyle = "#6a4014";
        ctx.beginPath();
        ctx.arc(top.x, top.y, Math.max(2.2, w * 0.38), 0, Math.PI * 2);
        ctx.fill();
      }
      for (const bail of set.bails) {
        if (bail.hidden) continue;
        const a = this.proj(bail.x - 0.055 + bail.ox, set.y + bail.oy, bail.z);
        const b = this.proj(bail.x + 0.055 + bail.ox, set.y + bail.oy, bail.z);
        ctx.strokeStyle = KIT.bail;
        ctx.lineWidth = Math.max(3, a.scale * 0.028);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    _bowler() {
      const actor = this.scene.findWithTag("Bowler")?.getComponent(global.RSPlay.BowlerActor);
      if (!actor) return;
      const runCycle = Math.sin(actor.y * 3.4);
      const gather = actor.phase === "gather" || actor.phase === "release";
      const follow = actor.phase === "follow";
      const running = actor.phase === "run";
      const crouch = gather ? 0.16 : running ? 0.08 : 0.02;
      const hipZ = 0.92 - crouch;
      const shoulderZ = hipZ + 0.58;
      const headZ = shoulderZ + 0.27;
      const stride = running ? runCycle * 0.34 : gather ? 0.38 : 0.12;
      this._shadow(actor.x, actor.y, 0.42);
      this._capsule([actor.x - 0.1, actor.y - stride * 0.4, 0.05], [actor.x - 0.08, actor.y, hipZ], 0.13, KIT.whites);
      this._capsule([actor.x + 0.1, actor.y + stride * 0.55, 0.05], [actor.x + 0.08, actor.y + 0.04, hipZ], 0.13, KIT.whites);
      this._blob(actor.x - 0.1, actor.y - stride * 0.4, 0.05, 0.11, 0.055, "#2b2418");
      this._blob(actor.x + 0.11, actor.y + stride * 0.55, 0.05, 0.11, 0.055, "#2b2418");
      this._torso(actor.x, actor.y, hipZ, shoulderZ, 0.16, 0.2, KIT.whites);
      this._quad(
        [actor.x - 0.16, actor.y, hipZ + 0.02],
        [actor.x + 0.16, actor.y, hipZ + 0.02],
        [actor.x + 0.14, actor.y, hipZ + 0.14],
        [actor.x - 0.14, actor.y, hipZ + 0.14],
        KIT.maroon
      );
      const armHigh = gather ? 1 : follow ? 0.28 : running ? 0.42 + runCycle * 0.22 : 0.32;
      this._capsule(
        [actor.x + 0.16, actor.y + 0.02, shoulderZ],
        [actor.x + 0.22, actor.y + 0.08, shoulderZ + 0.62 * armHigh],
        0.09,
        KIT.whites
      );
      this._capsule(
        [actor.x + 0.22, actor.y + 0.08, shoulderZ + 0.62 * armHigh],
        [actor.x + 0.18, actor.y + 0.1, shoulderZ + 0.72 * armHigh + 0.08],
        0.08,
        KIT.skin
      );
      this._capsule(
        [actor.x - 0.16, actor.y, shoulderZ],
        [actor.x - 0.28, actor.y + 0.22, shoulderZ - 0.12],
        0.09,
        KIT.whites
      );
      this._blob(actor.x + 0.02, actor.y + 0.05, headZ, 0.12, 0.14, KIT.skin);
      this._blob(actor.x + 0.02, actor.y + 0.03, headZ + 0.08, 0.13, 0.07, "#1b1510");
      if (actor.hasBall) {
        const hand = this.proj(actor.x + 0.19, actor.y + 0.1, shoulderZ + 0.72 * armHigh + 0.08);
        this.ctx.fillStyle = KIT.leather;
        this.ctx.beginPath();
        this.ctx.arc(hand.x, hand.y, Math.max(4, this._size(hand, 0.036, 4)), 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    _batter() {
      const brain = this.scene.findWithTag("Batter")?.getComponent(global.RSPlay.BatterBrain);
      if (!brain) return;
      const x = brain.x;
      const y = brain.y;
      const crouch = 0.2 + brain.weight * 0.1;
      const hipZ = 0.86 - crouch;
      const shoulderZ = hipZ + 0.52;
      const headZ = shoulderZ + 0.26;
      this._shadow(x, y, 0.46);
      this._capsule([x + 0.12, y + 0.1, 0.05], [x + 0.08, y + 0.02, hipZ], 0.12, KIT.whites);
      this._capsule([x - 0.08, brain.footY, 0.05], [x - 0.02, y - 0.04, hipZ], 0.12, KIT.whites);
      this._quad([x + 0.02, y + 0.04, 0.02], [x + 0.2, y + 0.12, 0.02], [x + 0.18, y + 0.08, 0.52], [x + 0.04, y, 0.52], KIT.pad);
      this._quad(
        [x - 0.18, brain.footY - 0.05, 0.02],
        [x + 0.04, brain.footY + 0.07, 0.02],
        [x + 0.03, brain.footY, 0.52],
        [x - 0.16, brain.footY - 0.02, 0.52],
        KIT.pad
      );
      this._torso(x, y, hipZ, shoulderZ, 0.15, 0.19, KIT.whites);
      this._capsule([x + 0.14, y, shoulderZ], [x + 0.24, y + 0.06, shoulderZ - 0.2], 0.08, KIT.whites);
      this._capsule([x - 0.12, y, shoulderZ], [x - 0.02, y - 0.03, shoulderZ - 0.24], 0.08, KIT.whites);
      const batRoot = [x + 0.1, y + 0.03, shoulderZ - 0.3];
      const ang = brain.batAngle;
      const batTip = [
        batRoot[0] + Math.sin(ang) * 0.2 + 0.22,
        batRoot[1] + 0.16,
        Math.max(0.08, batRoot[2] - Math.cos(ang) * 0.8),
      ];
      this._quad(
        [batRoot[0] - 0.03, batRoot[1], batRoot[2]],
        [batRoot[0] + 0.05, batRoot[1] + 0.04, batRoot[2]],
        [batTip[0] + 0.07, batTip[1] + 0.05, batTip[2]],
        [batTip[0] - 0.05, batTip[1], batTip[2]],
        KIT.willow,
        "#6a3a12",
        1.2
      );
      this._capsule(batRoot, [batRoot[0] - 0.01, batRoot[1], batRoot[2] + 0.22], 0.06, KIT.grip);
      const hx = x + brain.headTurn * 0.1;
      const helm = this._blob(hx, y - 0.02, headZ, 0.14, 0.16, KIT.helmet);
      this.ctx.fillStyle = "#2a3a58";
      this.ctx.beginPath();
      this.ctx.ellipse(helm.x, helm.y + this._size(helm, 0.04, 3), this._size(helm, 0.1, 4), this._size(helm, 0.06, 3), 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = "rgba(230, 236, 245, 0.8)";
      this.ctx.lineWidth = 1.4;
      this.ctx.beginPath();
      this.ctx.arc(helm.x, helm.y + 3, this._size(helm, 0.07, 4), 0.2, Math.PI - 0.2);
      this.ctx.stroke();
    }

    _keeper() {
      const k = this.scene.findWithTag("Keeper")?.getComponent(global.RSPlay.KeeperActor);
      if (!k) return;
      const x = k.x;
      const y = PITCH + 1.55;
      this._shadow(x, y, 0.4);
      this._torso(x, y + 0.04, 0.38, 0.78, 0.16, 0.18, KIT.whites);
      this._quad([x - 0.14, y, 0.02], [x + 0.14, y + 0.08, 0.02], [x + 0.12, y, 0.45], [x - 0.12, y, 0.45], KIT.pad);
      this._blob(x, y + 0.06, 1.08, 0.13, 0.15, KIT.helmet);
      this._blob(x + 0.22, y + 0.12, 0.58, 0.13, 0.1, KIT.pad);
      this._blob(x - 0.22, y + 0.1, 0.55, 0.13, 0.1, KIT.pad);
    }

    _umpire() {
      const u = this.scene.findWithTag("Umpire")?.getComponent(global.RSPlay.UmpireActor);
      if (!u) return;
      const x = -0.85;
      const y = -1.6;
      this._shadow(x, y, 0.32);
      this._capsule([x - 0.08, y, 0.05], [x - 0.07, y, 0.88], 0.11, "#161616");
      this._capsule([x + 0.08, y, 0.05], [x + 0.07, y, 0.88], 0.11, "#161616");
      this._torso(x, y, 0.88, 1.42, 0.16, 0.2, "#f3f0e8");
      const armZ = u.finger ? 1.95 : 1.18;
      this._capsule([x + 0.16, y, 1.4], [x + 0.18, y, armZ], 0.08, "#f3f0e8");
      this._blob(x, y, 1.64, 0.12, 0.14, KIT.skin);
      this._blob(x, y, 1.76, 0.15, 0.06, "#f7f3e8");
    }

    _fielders() {
      const spots = [
        [1.2, PITCH + 0.4, 0.1],
        [-3.6, 12.2, 0],
        [4.4, 8.6, 0],
      ];
      for (const [x, y, crouch] of spots) {
        this._shadow(x, y, 0.3);
        this._torso(x, y, 0.82 - crouch, 1.36 - crouch, 0.13, 0.16, KIT.whites);
        this._blob(x, y, 1.58 - crouch, 0.11, 0.13, KIT.skin);
      }
    }

    _trails() {
      const ball = this.scene.findWithTag("Ball");
      if (!ball || !ball.active) return;
      const trail = ball.getComponent(global.RSEngine.TrailRenderer);
      if (!trail || trail.points.length < 2) return;
      const state = this.getState();
      const regime = state.lastResult?.aero.regime || state.preview?.aero.regime;
      const color =
        regime === "reverse"
          ? "210, 84, 52"
          : regime === "conventional"
            ? "232, 195, 106"
            : "180, 210, 190";
      const ctx = this.ctx;
      ctx.beginPath();
      trail.points.forEach((p, i) => {
        const s = this.proj(p.x, p.y, p.z);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.strokeStyle = `rgba(${color}, 0.88)`;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    _particles() {
      const fx = this.scene.findWithTag("FX");
      if (!fx) return;
      const system = fx.getComponent(global.RSEngine.ParticleSystem);
      const ctx = this.ctx;
      for (const p of system.particles) {
        const s = this.proj(p.x, p.y, p.z);
        const life = 1 - p.age / p.life;
        ctx.fillStyle =
          p.kind === "wood" ? `rgba(220, 180, 90, ${0.75 * life})` : `rgba(210, 170, 110, ${0.55 * life})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, p.size * life, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _ball(alpha) {
      const ball = this.scene.findWithTag("Ball");
      if (!ball || !ball.active) return;
      const body = ball.getComponent(global.RSEngine.Rigidbody);
      const pos = body ? body.renderPosition(alpha) : ball.transform.position;
      const s = this.proj(pos.x, pos.y, pos.z);
      if (!s.visible) return;
      const r = Math.max(3.4, 0.085 * s.scale);
      const ctx = this.ctx;
      const shadow = this.proj(pos.x, pos.y, 0);
      ctx.fillStyle = "rgba(12, 8, 6, 0.32)";
      ctx.beginPath();
      ctx.ellipse(shadow.x, shadow.y, r * 1.55, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();

      const state = this.getState();
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
      ctx.strokeStyle = "rgba(245, 236, 214, 0.92)";
      ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.quadraticCurveTo(r * 0.2, 0, 0, r * 0.85);
      ctx.stroke();
      ctx.restore();
    }

    _hawkeye() {
      if (!this.hawkCtx) return;
      const ctx = this.hawkCtx;
      const w = this.hawk.width;
      const h = this.hawk.height;
      ctx.fillStyle = "#16301c";
      ctx.fillRect(0, 0, w, h);
      const pad = 18;
      const map = (x, y) => ({
        x: w / 2 + (x / 1.2) * (w * 0.38),
        y: pad + (1 - y / (PITCH + 1.2)) * (h - pad * 2),
      });
      const a = map(-HALF, 0);
      const b = map(HALF, 0);
      const c = map(HALF, PITCH);
      const d = map(-HALF, PITCH);
      ctx.fillStyle = "#c4a36a";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.stroke();
      const state = this.getState();
      const aim = map(state.delivery.line_m, PITCH - state.delivery.length_m);
      ctx.strokeStyle = "#ffe08a";
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, 6, 0, Math.PI * 2);
      ctx.stroke();
      if (state.lastResult?.bounce) {
        const p = map(state.lastResult.bounce[0], state.lastResult.bounce[1]);
        ctx.fillStyle = "#e24a32";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (state.lastResult?.samples) {
        ctx.strokeStyle = "rgba(226, 74, 50, 0.7)";
        ctx.beginPath();
        state.lastResult.samples.forEach((s, i) => {
          const p = map(s.x, s.y);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }
    }
  }

  global.RSRender = { StudioRenderer, KIT };
})(window);
