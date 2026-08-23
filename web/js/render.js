/**
 * Broadcast-style cricket canvas with articulated athletes.
 * Procedural arcade / dusk telecast — no licensed art.
 */
(function (global) {
  const { PITCH } = global.RSEngine;
  const HALF = 1.525;

  const KIT = {
    whites: "#efe4c8",
    whitesShade: "#c9b89a",
    crease: "#d8cbb0",
    shadow: "rgba(8, 6, 4, 0.42)",
    skin: "#c68642",
    skinDark: "#8d5524",
    maroon: "#7a1f24",
    navy: "#1c2a44",
    pad: "#eef2f8",
    padStrap: "#9aa6b8",
    willow: "#d4923e",
    willowEdge: "#7a4a16",
    grip: "#2a1a14",
    helmet: "#1a2740",
    leather: "#b42318",
    wood: "#d8b56a",
    bail: "#f0d48a",
    coat: "#f4f0e6",
    trouser: "#1a1a1c",
  };

  function ease(t) {
    return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  }

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
      this.flash = 0;
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

    punch(n = 1) {
      this.flash = Math.max(this.flash, n);
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
      this._lbwGhost();
      this._trails();
      this._particles();
      this._ball(alpha);
      this._callStamp();
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255, 230, 160, ${0.18 * this.flash})`;
        ctx.fillRect(0, 0, w, h);
        this.flash *= 0.82;
        if (this.flash < 0.02) this.flash = 0;
      }
      this._hawkeye();
    }

    proj(x, y, z) {
      return this.camera.worldToScreen(x, y, z);
    }

    _sky(w, h) {
      const g = this.ctx.createLinearGradient(0, 0, 0, h * 0.48);
      g.addColorStop(0, "#0e0c18");
      g.addColorStop(0.28, "#2c1624");
      g.addColorStop(0.62, "#6a3428");
      g.addColorStop(1, "#9a5a3a");
      this.ctx.fillStyle = g;
      this.ctx.fillRect(0, 0, w, h * 0.52);
      this.ctx.fillStyle = "rgba(255, 210, 140, 0.2)";
      this.ctx.beginPath();
      this.ctx.ellipse(w * 0.8, h * 0.11, 78, 78, 0, 0, Math.PI * 2);
      this.ctx.fill();
    }

    _stadium(w, h) {
      const ctx = this.ctx;
      const stands = ctx.createLinearGradient(0, h * 0.14, 0, h * 0.48);
      stands.addColorStop(0, "#24141a");
      stands.addColorStop(0.55, "#1a1416");
      stands.addColorStop(1, "#102016");
      ctx.fillStyle = stands;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.48);
      ctx.lineTo(0, h * 0.2);
      ctx.quadraticCurveTo(w * 0.5, h * 0.08, w, h * 0.2);
      ctx.lineTo(w, h * 0.48);
      ctx.fill();

      const crowd = ["#4a201c", "#6a2a20", "#2a1814", "#8a3a28", "#1c1410", "#3a2218"];
      for (let row = 0; row < 7; row += 1) {
        for (let i = 0; i < 90; i += 1) {
          const jitter = ((i * 17 + row * 9) % 5) - 2;
          ctx.fillStyle = crowd[(i + row * 3) % crowd.length];
          ctx.globalAlpha = 0.55 + ((i + row) % 4) * 0.08;
          ctx.fillRect(
            w * 0.02 + i * (w * 0.011) + jitter,
            h * 0.195 + row * h * 0.018,
            w * 0.007,
            h * 0.012
          );
        }
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#3a2220";
      ctx.fillRect(w * 0.33, h * 0.168, w * 0.34, h * 0.125);
      ctx.fillStyle = "#120c0c";
      ctx.fillRect(w * 0.345, h * 0.18, w * 0.31, h * 0.07);
      ctx.fillStyle = "rgba(255, 210, 140, 0.16)";
      for (let i = 0; i < 10; i += 1) {
        ctx.fillRect(w * 0.355 + i * w * 0.03, h * 0.188, w * 0.018, h * 0.05);
      }
      ctx.fillStyle = "#2a1816";
      ctx.fillRect(w * 0.36, h * 0.255, w * 0.28, h * 0.028);
      this._flood(w * 0.09, h * 0.165, h * 0.3);
      this._flood(w * 0.91, h * 0.165, h * 0.3);
      ctx.fillStyle = "rgba(12, 8, 10, 0.28)";
      ctx.fillRect(0, h * 0.42, w, h * 0.08);
    }

    _flood(x, y, h) {
      const ctx = this.ctx;
      ctx.strokeStyle = "#2a2a28";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = "#1a1814";
      ctx.fillRect(x - 16, y - 10, 32, 14);
      ctx.fillStyle = "rgba(255, 232, 160, 0.95)";
      for (let i = 0; i < 3; i += 1) {
        for (let j = 0; j < 2; j += 1) {
          ctx.beginPath();
          ctx.arc(x - 10 + i * 10, y - 6 + j * 6, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const beam = ctx.createLinearGradient(x, y, x, y + h * 1.75);
      beam.addColorStop(0, "rgba(255, 220, 150, 0.22)");
      beam.addColorStop(1, "rgba(255, 220, 150, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x + 10, y);
      ctx.lineTo(x + 92, y + h * 1.55);
      ctx.lineTo(x - 92, y + h * 1.55);
      ctx.fill();
    }

    _outfield(w, h) {
      const ctx = this.ctx;
      const g = ctx.createLinearGradient(0, h * 0.36, 0, h);
      g.addColorStop(0, "#2a5a38");
      g.addColorStop(0.5, "#1a4028");
      g.addColorStop(1, "#0c2014");
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.36, w, h * 0.64);
      for (let i = 0; i < 16; i += 1) {
        const y0 = 2.2 + i * 1.55;
        this._quad(
          [-20, y0, 0],
          [20, y0, 0],
          [20, y0 + 0.78, 0],
          [-20, y0 + 0.78, 0],
          i % 2 ? "rgba(18, 72, 40, 0.2)" : "rgba(8, 36, 20, 0.14)"
        );
      }
      ctx.strokeStyle = "rgba(240, 236, 210, 0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const rope = this.proj(0, 26, 0);
      ctx.ellipse(w * 0.5, h * 0.62, w * 0.62, h * 0.34, 0, 0, Math.PI * 2);
      void rope;
      ctx.stroke();
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
      this._quad([-2.35, -2.8, 0], [2.35, -2.8, 0], [2.05, PITCH + 2.1, 0], [-2.05, PITCH + 2.1, 0], "#8a6a38");
      this._quad(
        [-HALF, -1.5, 0.002],
        [HALF, -1.5, 0.002],
        [HALF * 0.96, PITCH + 1.5, 0.002],
        [-HALF * 0.96, PITCH + 1.5, 0.002],
        "#d8b57a",
        "rgba(70, 42, 18, 0.45)",
        1.3
      );
      for (let i = 0; i < 10; i += 1) {
        const y0 = -1.2 + i * 2.2;
        this._quad(
          [-HALF + 0.04, y0, 0.004],
          [HALF - 0.04, y0, 0.004],
          [HALF - 0.04, y0 + 1.05, 0.004],
          [-HALF + 0.04, y0 + 1.05, 0.004],
          i % 2 ? "rgba(210, 168, 104, 0.22)" : "rgba(150, 102, 52, 0.16)"
        );
      }
      this._quad([-0.55, -0.2, 0.008], [0.55, -0.2, 0.008], [0.48, 1.6, 0.008], [-0.48, 1.6, 0.008], "rgba(110, 72, 32, 0.42)");
      this._quad(
        [-0.5, PITCH - 1.7, 0.008],
        [0.5, PITCH - 1.7, 0.008],
        [0.42, PITCH + 0.15, 0.008],
        [-0.42, PITCH + 0.15, 0.008],
        "rgba(118, 76, 36, 0.4)"
      );
      this._quad(
        [-0.38, 2.2, 0.006],
        [0.38, 2.2, 0.006],
        [0.3, PITCH - 1.2, 0.006],
        [-0.3, PITCH - 1.2, 0.006],
        "rgba(130, 88, 42, 0.28)"
      );
    }

    _lengthMap() {
      const state = this.getState();
      const fade = (state.bowling && state.releasing) || state.holdClimax ? 0.18 : 1;
      const zones = [
        { y0: PITCH - 1.2, y1: PITCH - 0.15, fill: `rgba(220, 70, 40, ${0.26 * fade})`, label: "YORKER" },
        { y0: PITCH - 4.0, y1: PITCH - 1.2, fill: `rgba(230, 170, 40, ${0.2 * fade})`, label: "FULL" },
        { y0: PITCH - 7.5, y1: PITCH - 4.0, fill: `rgba(50, 170, 80, ${0.2 * fade})`, label: "GOOD" },
        { y0: PITCH - 12.0, y1: PITCH - 7.5, fill: `rgba(70, 130, 210, ${0.18 * fade})`, label: "SHORT" },
      ];
      for (const z of zones) {
        this._quad(
          [-HALF + 0.08, z.y0, 0.012],
          [HALF - 0.08, z.y0, 0.012],
          [HALF - 0.08, z.y1, 0.012],
          [-HALF + 0.08, z.y1, 0.012],
          z.fill
        );
        if (fade > 0.4) {
          const s = this.proj(-HALF + 0.16, (z.y0 + z.y1) * 0.5, 0.03);
          this.ctx.fillStyle = "rgba(255, 236, 200, 0.78)";
          this.ctx.font = "700 12px 'Barlow Condensed', sans-serif";
          this.ctx.fillText(z.label, s.x, s.y);
        }
      }
    }

    _creases() {
      const white = "rgba(250, 246, 232, 0.9)";
      this._line([-1.32, 0, 0.025], [1.32, 0, 0.025], white, 2.2);
      this._line([-1.32, 1.22, 0.025], [1.32, 1.22, 0.025], white, 2.2);
      this._line([-1.32, PITCH, 0.025], [1.32, PITCH, 0.025], white, 2.2);
      this._line([-1.32, PITCH - 1.22, 0.025], [1.32, PITCH - 1.22, 0.025], white, 2.2);
      this._line([-1.32, 0, 0.025], [-1.32, 1.22, 0.025], white, 1.6);
      this._line([1.32, 0, 0.025], [1.32, 1.22, 0.025], white, 1.6);
      this._line([-1.32, PITCH, 0.025], [-1.32, PITCH - 1.22, 0.025], white, 1.6);
      this._line([1.32, PITCH, 0.025], [1.32, PITCH - 1.22, 0.025], white, 1.6);
      this._line([-0.89, PITCH - 1.22, 0.02], [-0.89, PITCH + 0.3, 0.02], "rgba(250,246,232,0.35)", 1);
      this._line([0.89, PITCH - 1.22, 0.02], [0.89, PITCH + 0.3, 0.02], "rgba(250,246,232,0.35)", 1);
    }

    _aim() {
      const state = this.getState();
      if ((state.bowling && state.releasing) || state.holdClimax) return;
      const x = state.delivery.line_m;
      const y = PITCH - state.delivery.length_m;
      const s = this.proj(x, y, 0.04);
      const ctx = this.ctx;
      const pulse = Math.max(13, 0.2 * s.scale) + Math.sin(global.RSEngine.Time.unscaledTime * 6) * 2.4;
      ctx.save();
      ctx.fillStyle = "rgba(255, 214, 80, 0.34)";
      ctx.strokeStyle = "rgba(255, 244, 180, 0.98)";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, pulse * 1.35, pulse * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x - pulse * 1.6, s.y);
      ctx.lineTo(s.x + pulse * 1.6, s.y);
      ctx.moveTo(s.x, s.y - pulse * 0.9);
      ctx.lineTo(s.x, s.y + pulse * 0.9);
      ctx.stroke();
      ctx.restore();
    }

    _taper(a, b, wa, wb, fill, hi) {
      const A = this.proj(a[0], a[1], a[2]);
      const B = this.proj(b[0], b[1], b[2]);
      if (!A.visible && !B.visible) return;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L;
      const ny = dx / L;
      const ra = Math.max(3.4, wa * Math.max(40, A.scale));
      const rb = Math.max(2.8, wb * Math.max(40, B.scale));
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(A.x + nx * ra, A.y + ny * ra);
      ctx.lineTo(B.x + nx * rb, B.y + ny * rb);
      ctx.lineTo(B.x - nx * rb, B.y - ny * rb);
      ctx.lineTo(A.x - nx * ra, A.y - ny * ra);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (hi) {
        ctx.beginPath();
        ctx.moveTo(A.x + nx * ra * 0.35, A.y + ny * ra * 0.35);
        ctx.lineTo(B.x + nx * rb * 0.35, B.y + ny * rb * 0.35);
        ctx.strokeStyle = hi;
        ctx.lineWidth = Math.max(1.4, ra * 0.28);
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(18, 10, 6, 0.5)";
      ctx.lineWidth = 1.15;
      ctx.stroke();
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(A.x, A.y, ra, ra * 0.84, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(B.x, B.y, rb, rb * 0.84, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    _blob(x, y, z, rx, rz, color) {
      const s = this.proj(x, y, z);
      if (!s.visible) return s;
      const ctx = this.ctx;
      const sx = Math.max(2.6, rx * Math.max(38, s.scale));
      const sy = Math.max(2.6, rz * Math.max(38, s.scale));
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, sx, sy, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(20, 12, 8, 0.5)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      return s;
    }

    _shadow(x, y, w = 0.3) {
      const s = this.proj(x, y, 0.01);
      this.ctx.fillStyle = KIT.shadow;
      this.ctx.beginPath();
      this.ctx.ellipse(s.x, s.y + 2, Math.max(8, w * s.scale * 0.85), Math.max(3, w * s.scale * 0.24), 0, 0, Math.PI * 2);
      this.ctx.fill();
    }

    _head(x, y, z, kind, look = 0) {
      const neck = this.proj(x, y, z - 0.08);
      this.ctx.fillStyle = KIT.skinDark;
      this.ctx.beginPath();
      this.ctx.ellipse(neck.x, neck.y, Math.max(3, 0.04 * neck.scale), Math.max(4, 0.055 * neck.scale), 0, 0, Math.PI * 2);
      this.ctx.fill();
      const face = this._blob(x + look * 0.04, y, z, 0.11, 0.13, KIT.skin);
      this.ctx.fillStyle = "rgba(255, 220, 180, 0.28)";
      this.ctx.beginPath();
      this.ctx.ellipse(face.x - 3, face.y - 2, Math.max(3, 0.04 * face.scale), Math.max(4, 0.06 * face.scale), 0, 0, Math.PI * 2);
      this.ctx.fill();
      if (kind === "helmet") {
        const helm = this._blob(x + look * 0.03, y - 0.02, z + 0.02, 0.135, 0.155, KIT.helmet);
        this.ctx.fillStyle = "#0e1828";
        this.ctx.beginPath();
        this.ctx.ellipse(helm.x, helm.y + 6, Math.max(6, 0.1 * helm.scale), Math.max(3.4, 0.06 * helm.scale), 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = "rgba(230, 236, 245, 0.9)";
        this.ctx.lineWidth = 1.35;
        for (let i = -1; i <= 1; i += 1) {
          this.ctx.beginPath();
          this.ctx.arc(helm.x + i * 3, helm.y + 5, Math.max(4.2, 0.07 * helm.scale), 0.15, Math.PI - 0.15);
          this.ctx.stroke();
        }
        this.ctx.fillStyle = "#c9a24a";
        this.ctx.fillRect(helm.x - 4, helm.y - Math.max(8, 0.1 * helm.scale), 8, 3);
      } else if (kind === "hat") {
        this._blob(x, y, z + 0.1, 0.16, 0.05, KIT.coat);
        this._blob(x, y, z + 0.08, 0.11, 0.07, KIT.coat);
      } else {
        this._blob(x + 0.01, y - 0.01, z + 0.07, 0.12, 0.06, "#1b1510");
      }
      return face;
    }

    _hand(x, y, z, glove) {
      this._blob(x, y, z, glove ? 0.09 : 0.055, glove ? 0.07 : 0.045, glove ? KIT.pad : KIT.skin);
    }

    _shoe(p, long = 0.12) {
      const s = this.proj(p[0], p[1] + 0.04, p[2]);
      this.ctx.fillStyle = "#1a1612";
      this.ctx.beginPath();
      this.ctx.ellipse(s.x, s.y, Math.max(5, long * s.scale), Math.max(2.4, 0.045 * s.scale), 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = "rgba(240, 236, 220, 0.55)";
      this.ctx.lineWidth = 1.1;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x - 4, s.y);
      this.ctx.lineTo(s.x + 5, s.y);
      this.ctx.stroke();
    }

    _padBox(a, b, c, d, flash) {
      this._quad(a, b, c, d, flash ? "rgba(255, 214, 96, 0.9)" : KIT.pad, "rgba(90, 100, 120, 0.55)", 1.1);
    }

    _torso(x, y, hipZ, shZ, fill) {
      this._quad(
        [x - 0.15, y, hipZ],
        [x + 0.15, y + 0.02, hipZ],
        [x + 0.21, y + 0.03, shZ],
        [x - 0.2, y - 0.03, shZ],
        fill,
        "rgba(20,12,8,0.4)",
        1.15
      );
      this._quad(
        [x - 0.2, y - 0.03, shZ],
        [x + 0.21, y + 0.03, shZ],
        [x + 0.17, y + 0.02, shZ - 0.08],
        [x - 0.16, y - 0.02, shZ - 0.08],
        "rgba(255, 246, 220, 0.18)"
      );
      this._blob(x - 0.18, y - 0.02, shZ, 0.055, 0.045, fill);
      this._blob(x + 0.19, y + 0.03, shZ, 0.055, 0.045, fill);
    }

    _shinPad(ankle, knee, flash) {
      const fill = flash ? "rgba(255, 214, 96, 0.92)" : KIT.pad;
      this._taper(ankle, knee, 0.09, 0.1, fill, "rgba(255,255,255,0.35)");
      this._blob(knee[0], knee[1], knee[2] + 0.02, 0.095, 0.08, flash ? "#ffe08a" : "#e8eef6");
      this._line(
        [ankle[0] - 0.02, ankle[1], (ankle[2] + knee[2]) * 0.5],
        [knee[0] + 0.02, knee[1], (ankle[2] + knee[2]) * 0.5],
        KIT.padStrap,
        2
      );
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
        const mid = this.proj(bx + post.leanX * 0.5, by + post.leanY * 0.5, 0.36 + post.oz * 0.5);
        const top = this.proj(bx + post.leanX, by + post.leanY, 0.71 + post.oz);
        const w = Math.max(5.8, base.scale * 0.045);
        const wood = ctx.createLinearGradient(base.x - w, base.y, base.x + w, top.y);
        wood.addColorStop(0, "#8a5820");
        wood.addColorStop(0.4, "#f4d58a");
        wood.addColorStop(1, "#6a3c14");
        ctx.strokeStyle = wood;
        ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(mid.x, mid.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();
        ctx.strokeStyle = "rgba(250, 244, 220, 0.7)";
        ctx.lineWidth = Math.max(1.4, w * 0.28);
        ctx.beginPath();
        ctx.moveTo(this.proj(bx, by, 0.18).x, this.proj(bx, by, 0.18).y);
        ctx.lineTo(this.proj(bx + post.leanX * 0.25, by, 0.22 + post.oz * 0.25).x, this.proj(bx, by, 0.22).y);
        ctx.stroke();
      }
      for (const bail of set.bails) {
        if (bail.hidden) continue;
        const spin = bail.spin || 0;
        const a = this.proj(bail.x - 0.055 + bail.ox, set.y + bail.oy, bail.z);
        const b = this.proj(bail.x + 0.055 + bail.ox + spin * 0.05, set.y + bail.oy + spin * 0.02, bail.z + Math.sin(spin) * 0.02);
        ctx.strokeStyle = KIT.bail;
        ctx.lineWidth = Math.max(3.4, a.scale * 0.034);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = "#f6e6b0";
        ctx.beginPath();
        ctx.arc(a.x, a.y, Math.max(2.2, a.scale * 0.02), 0, Math.PI * 2);
        ctx.arc(b.x, b.y, Math.max(2.2, b.scale * 0.02), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _bowler() {
      const actor = this.scene.findWithTag("Bowler")?.getComponent(global.RSPlay.BowlerActor);
      if (!actor) return;
      const run = Math.sin(actor.cycle);
      const runC = Math.cos(actor.cycle);
      const t = actor.t || 0;
      const phase = actor.phase;
      let bowl = 0.2;
      let front = 0.22;
      let plant = 0.1;
      let jump = 0;
      let coil = 0;
      if (phase === "run") {
        plant = run * 0.4;
        bowl = 0.16 + Math.max(0, run) * 0.24;
        front = 0.34 - run * 0.2;
        jump = Math.max(0, -runC) * 0.05;
      } else if (phase === "gather") {
        const u = ease(t / 0.16);
        plant = 0.22 + u * 0.28;
        bowl = 0.38 + u * 0.42;
        front = 0.42 + u * 0.42;
        jump = u * 0.2;
        coil = u * 0.45;
      } else if (phase === "load") {
        const u = ease(t / 0.14);
        plant = 0.5;
        bowl = 0.8 + u * 0.22;
        front = 0.88;
        jump = 0.16 - u * 0.05;
        coil = 0.45 + u * 0.55;
      } else if (phase === "release") {
        const u = ease(t / 0.15);
        plant = 0.48 - u * 0.08;
        bowl = 1.02 - u * 0.58;
        front = 0.86 - u * 0.52;
        jump = 0.09;
        coil = 1 - u;
      } else if (phase === "follow") {
        const u = Math.min(1, t / 0.45);
        plant = 0.24;
        bowl = 0.22 + u * 0.06;
        front = 0.12;
        coil = 0;
      } else {
        plant = 0.12;
        bowl = 0.24;
        front = 0.28;
      }
      const x = actor.x;
      const y = actor.y;
      const hipZ = 0.9 - (phase === "run" ? 0.05 : 0) + jump;
      const shZ = hipZ + 0.55;
      this._shadow(x, y + plant * 0.1, 0.46);
      const lHip = [x - 0.1, y - 0.03, hipZ];
      const rHip = [x + 0.1, y + 0.03, hipZ];
      const lKnee = [x - 0.2 - plant * 0.05, y - plant * 0.48, hipZ * 0.5 + jump * 0.08];
      const rKnee = [x + 0.22 + plant * 0.05, y + plant * 0.42, hipZ * 0.5];
      const lFoot = [x - 0.22, y - plant * 0.7, 0.04 + jump * 0.16];
      const rFoot = [x + 0.24, y + plant * 0.62, 0.04];
      this._taper(lHip, lKnee, 0.08, 0.062, KIT.whites, "rgba(255,246,220,0.28)");
      this._taper(lKnee, lFoot, 0.056, 0.044, KIT.whitesShade);
      this._shoe(lFoot, 0.13);
      this._quad(
        [x - 0.17, y, hipZ],
        [x + 0.17, y, hipZ],
        [x + 0.22, y + 0.02, shZ],
        [x - 0.21, y - 0.04, shZ],
        KIT.whites,
        "rgba(20,12,8,0.42)",
        1.2
      );
      this._quad(
        [x - 0.08, y, shZ - 0.02],
        [x + 0.08, y, shZ - 0.02],
        [x + 0.05, y, hipZ + 0.18],
        [x - 0.05, y, hipZ + 0.18],
        KIT.maroon
      );
      this._quad(
        [x - 0.16, y, hipZ + 0.01],
        [x + 0.16, y, hipZ + 0.01],
        [x + 0.15, y, hipZ + 0.12],
        [x - 0.15, y, hipZ + 0.12],
        KIT.maroon
      );
      this._taper(rHip, rKnee, 0.08, 0.062, KIT.whites, "rgba(255,246,220,0.32)");
      this._taper(rKnee, rFoot, 0.056, 0.044, KIT.whitesShade);
      this._shoe(rFoot, 0.14);
      const lShoulder = [x - 0.22, y - 0.05 - coil * 0.05, shZ];
      const rShoulder = [x + 0.24, y + 0.05, shZ + coil * 0.03];
      const rElbow = [x + 0.42 + bowl * 0.05, y - 0.06, shZ + bowl * 0.4];
      const rHand = [x + 0.14 + bowl * 0.1, y + 0.1, shZ + bowl * 0.74 + 0.05];
      const lElbow = [x - 0.4, y + 0.14 + front * 0.08, shZ + front * 0.1];
      const lHand = [x - 0.2, y + 0.32 + front * 0.2, shZ - 0.06 + front * 0.44];
      this._taper(lShoulder, lElbow, 0.058, 0.046, KIT.whites, "rgba(255,246,220,0.25)");
      this._taper(lElbow, lHand, 0.042, 0.034, KIT.skin, "rgba(255,210,160,0.3)");
      this._hand(...lHand, false);
      this._taper(rShoulder, rElbow, 0.06, 0.048, KIT.whites, "rgba(255,246,220,0.3)");
      this._taper(rElbow, rHand, 0.044, 0.034, KIT.skin, "rgba(255,210,160,0.32)");
      this._hand(...rHand, false);
      this._head(x + 0.02, y + 0.05, shZ + 0.28, "hair", coil * 0.2);
      if (actor.hasBall) {
        const hand = this.proj(...rHand);
        const g = this.ctx.createRadialGradient(hand.x - 2, hand.y - 2, 1, hand.x, hand.y, 7);
        g.addColorStop(0, "#f0a090");
        g.addColorStop(1, KIT.leather);
        this.ctx.fillStyle = g;
        this.ctx.beginPath();
        this.ctx.arc(hand.x, hand.y, Math.max(4.6, 0.042 * hand.scale), 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    _batter() {
      const brain = this.scene.findWithTag("Batter")?.getComponent(global.RSPlay.BatterBrain);
      if (!brain) return;
      const x = brain.x;
      const y = brain.y;
      const crouch = 0.14 + brain.weight * 0.13;
      const hipZ = 0.88 - crouch;
      const shZ = hipZ + 0.54;
      const swing = brain.swing || 0;
      const flash = brain.padFlash > 0.2;
      this._shadow(x, y, 0.52);
      const backFoot = [x + 0.18, y + 0.16, 0.05];
      const frontFoot = [x - 0.14, brain.footY, 0.05];
      const backKnee = [x + 0.16, y + 0.09, hipZ * 0.5];
      const frontKnee = [x - 0.12, (y + brain.footY) * 0.5, hipZ * 0.48];
      this._taper([x + 0.09, y + 0.02, hipZ], backKnee, 0.078, 0.06, KIT.whites, "rgba(255,246,220,0.3)");
      this._taper(backKnee, backFoot, 0.05, 0.04, KIT.whitesShade);
      this._taper([x - 0.07, y, hipZ], frontKnee, 0.078, 0.06, KIT.whites, "rgba(255,246,220,0.3)");
      this._taper(frontKnee, frontFoot, 0.05, 0.04, KIT.whitesShade);
      this._shinPad(backFoot, [backKnee[0] + 0.02, backKnee[1], backKnee[2] + 0.04], flash);
      this._shinPad(frontFoot, [frontKnee[0] - 0.02, frontKnee[1], frontKnee[2] + 0.04], flash);
      this._shoe(backFoot, 0.14);
      this._shoe(frontFoot, 0.14);
      this._torso(x, y, hipZ, shZ, KIT.whites);
      this._taper([x + 0.2, y + 0.03, shZ], [x + 0.34, y + 0.1, shZ - 0.16], 0.055, 0.044, KIT.whites, "rgba(255,246,220,0.28)");
      this._taper([x + 0.34, y + 0.1, shZ - 0.16], [x + 0.22, y + 0.05, shZ - 0.33], 0.042, 0.034, KIT.skin);
      this._hand(x + 0.22, y + 0.05, shZ - 0.33, true);
      this._taper(
        [x - 0.18, y - 0.03, shZ],
        [x - 0.04, y - 0.05, shZ - 0.16 + swing * 0.1],
        0.055,
        0.044,
        KIT.whites,
        "rgba(255,246,220,0.28)"
      );
      const ang = brain.batAngle;
      const handle = [x + 0.12, y + 0.04, shZ - 0.18];
      const splice = [handle[0] + Math.sin(ang) * 0.14, handle[1] + 0.09, handle[2] - Math.cos(ang) * 0.3];
      const tip = [
        handle[0] + Math.sin(ang) * 0.38 + 0.24,
        handle[1] + 0.22,
        Math.max(0.07, handle[2] - Math.cos(ang) * 1.08),
      ];
      this._taper(handle, [handle[0] - 0.01, handle[1], handle[2] + 0.24], 0.034, 0.03, KIT.grip);
      this._quad(
        [splice[0] - 0.055, splice[1], splice[2]],
        [splice[0] + 0.08, splice[1] + 0.055, splice[2]],
        [tip[0] + 0.11, tip[1] + 0.07, tip[2]],
        [tip[0] - 0.08, tip[1], tip[2]],
        KIT.willow,
        KIT.willowEdge,
        1.45
      );
      this._line(splice, tip, "rgba(255, 226, 160, 0.4)", 2.2);
      this._blob(tip[0], tip[1], tip[2], 0.05, 0.03, KIT.willow);
      this._head(x + brain.headTurn * 0.1, y - 0.03, shZ + 0.28, "helmet", brain.headTurn);
      if (flash) {
        const pad = this.proj(frontKnee[0], frontKnee[1], 0.34);
        this.ctx.strokeStyle = "rgba(255, 220, 90, 0.9)";
        this.ctx.lineWidth = 3.2;
        this.ctx.beginPath();
        this.ctx.arc(pad.x, pad.y, Math.max(12, 0.18 * pad.scale), 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }

    _keeper() {
      const k = this.scene.findWithTag("Keeper")?.getComponent(global.RSPlay.KeeperActor);
      if (!k) return;
      const x = k.x;
      const y = PITCH + 1.55;
      const crouch = 0.32 + (k.react || 0) * 0.12;
      const hipZ = 0.64 - crouch * 0.38;
      const shZ = hipZ + 0.4;
      this._shadow(x, y, 0.48);
      const lKnee = [x - 0.14, y - 0.04, hipZ * 0.45];
      const rKnee = [x + 0.14, y + 0.04, hipZ * 0.45];
      this._taper([x - 0.09, y, hipZ], lKnee, 0.06, 0.048, KIT.whites);
      this._taper([x + 0.09, y, hipZ], rKnee, 0.06, 0.048, KIT.whites);
      this._shinPad([x - 0.16, y - 0.05, 0.05], lKnee, false);
      this._shinPad([x + 0.16, y + 0.05, 0.05], rKnee, false);
      this._torso(x, y, hipZ, shZ, KIT.whites);
      this._taper([x - 0.19, y, shZ], [x - 0.34, y + 0.1, hipZ + 0.08], 0.05, 0.042, KIT.whites);
      this._taper([x + 0.19, y, shZ], [x + 0.34, y + 0.12, hipZ + 0.1], 0.05, 0.042, KIT.whites);
      this._hand(x + 0.36, y + 0.13, hipZ + 0.08, true);
      this._hand(x - 0.36, y + 0.11, hipZ + 0.06, true);
      this._head(x, y + 0.04, shZ + 0.26, "helmet", 0);
    }

    _drawUmpire(x, y, finger) {
      this._shadow(x, y, 0.34);
      this._taper([x - 0.08, y, 0.9], [x - 0.1, y - 0.02, 0.05], 0.062, 0.046, KIT.trouser, "rgba(80,80,86,0.35)");
      this._taper([x + 0.08, y, 0.9], [x + 0.1, y + 0.02, 0.05], 0.062, 0.046, KIT.trouser, "rgba(80,80,86,0.35)");
      this._shoe([x - 0.1, y - 0.02, 0.05], 0.11);
      this._shoe([x + 0.1, y + 0.02, 0.05], 0.11);
      this._torso(x, y, 0.9, 1.44, KIT.coat);
      this._taper([x - 0.2, y, 1.38], [x - 0.28, y + 0.04, 1.05], 0.046, 0.036, KIT.coat);
      this._hand(x - 0.28, y + 0.04, 1.03, false);
      const armZ = 1.2 + finger * 0.86;
      this._taper([x + 0.2, y, 1.4], [x + 0.14 + finger * 0.05, y, armZ], 0.05, 0.036, KIT.coat);
      this._hand(x + 0.14 + finger * 0.05, y, armZ + 0.05, false);
      this._head(x, y, 1.68, "hat", 0);
    }

    _umpire() {
      const u = this.scene.findWithTag("Umpire")?.getComponent(global.RSPlay.UmpireActor);
      if (!u) return;
      const finger = ease(u.fingerT || (u.finger ? 1 : 0));
      this._drawUmpire(-0.98, -1.62, finger);
      this._drawUmpire(-2.55, PITCH - 0.35, finger);
    }

    _fielders() {
      const spots = [
        [1.32, PITCH + 0.5, 0.1],
        [-3.8, 12.2, 0],
        [4.6, 8.6, 0],
      ];
      for (const [x, y, crouch] of spots) {
        this._shadow(x, y, 0.3);
        this._taper([x - 0.05, y, 0.84 - crouch], [x - 0.1, y - 0.03, 0.05], 0.052, 0.04, KIT.whites);
        this._taper([x + 0.05, y, 0.84 - crouch], [x + 0.1, y + 0.03, 0.05], 0.052, 0.04, KIT.whites);
        this._quad(
          [x - 0.13, y, 0.82 - crouch],
          [x + 0.13, y, 0.82 - crouch],
          [x + 0.15, y, 1.34 - crouch],
          [x - 0.15, y, 1.34 - crouch],
          KIT.whites,
          "rgba(20,12,8,0.35)",
          1
        );
        this._taper([x + 0.14, y, 1.28 - crouch], [x + 0.22, y + 0.04, 1.02 - crouch], 0.04, 0.032, KIT.whites);
        this._head(x, y, 1.58 - crouch, "hair", 0);
      }
    }

    _lbwGhost() {
      const state = this.getState();
      if (state.lastResult?.outcome !== "lbw" || !state.lastResult.stump_pass) return;
      const pass = state.lastResult.stump_pass;
      const bounce = state.lastResult.bounce || [pass[0], PITCH - 3, 0];
      this._line([bounce[0], bounce[1], 0.08], [pass[0], PITCH - 1.05, 0.28], "rgba(255, 214, 80, 0.55)", 2);
      this._line([pass[0], PITCH - 1.05, 0.28], [0.02, PITCH, 0.36], "rgba(255, 214, 80, 0.92)", 2.6);
      const hit = this.proj(0.02, PITCH, 0.36);
      this.ctx.fillStyle = "rgba(255, 220, 90, 0.9)";
      this.ctx.font = "700 13px 'Barlow Condensed', sans-serif";
      this.ctx.fillText("WOULD HIT", hit.x + 10, hit.y - 8);
    }

    _trails() {
      const ball = this.scene.findWithTag("Ball");
      if (!ball || !ball.active) return;
      const trail = ball.getComponent(global.RSEngine.TrailRenderer);
      if (!trail || trail.points.length < 2) return;
      const state = this.getState();
      const regime = state.lastResult?.aero.regime || state.preview?.aero.regime;
      const color =
        regime === "reverse" ? "210, 84, 52" : regime === "conventional" ? "232, 195, 106" : "180, 210, 190";
      const ctx = this.ctx;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (let i = 1; i < trail.points.length; i += 1) {
        const a = this.proj(trail.points[i - 1].x, trail.points[i - 1].y, trail.points[i - 1].z);
        const b = this.proj(trail.points[i].x, trail.points[i].y, trail.points[i].z);
        const u = i / trail.points.length;
        ctx.strokeStyle = `rgba(${color}, ${0.15 + 0.75 * u})`;
        ctx.lineWidth = 1.6 + 3.2 * u;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
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
          p.kind === "wood" ? `rgba(220, 180, 90, ${0.8 * life})` : `rgba(210, 170, 110, ${0.55 * life})`;
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
      const speed = body ? Math.hypot(body.velocity.x, body.velocity.y, body.velocity.z) : 30;
      const r = Math.max(6.2, 0.145 * s.scale);
      if (speed > 8) {
        const prev = this.proj(pos.x, pos.y - 0.35, pos.z + 0.02);
        const streak = this.ctx.createLinearGradient(prev.x, prev.y, s.x, s.y);
        streak.addColorStop(0, "rgba(226, 74, 50, 0)");
        streak.addColorStop(1, "rgba(255, 180, 140, 0.45)");
        this.ctx.strokeStyle = streak;
        this.ctx.lineWidth = r * 0.7;
        this.ctx.beginPath();
        this.ctx.moveTo(prev.x, prev.y);
        this.ctx.lineTo(s.x, s.y);
        this.ctx.stroke();
      }
      const ctx = this.ctx;
      const shadow = this.proj(pos.x, pos.y, 0);
      const lift = Math.max(0.35, 1 - pos.z * 0.18);
      ctx.fillStyle = `rgba(12, 8, 6, ${0.34 * lift})`;
      ctx.beginPath();
      ctx.ellipse(shadow.x, shadow.y, r * (1.3 + pos.z * 0.15), r * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      const state = this.getState();
      const shine = ctx.createRadialGradient(s.x - r * 0.32, s.y - r * 0.38, 1, s.x, s.y, r);
      const roughOff = state.delivery.rough_side === "off";
      shine.addColorStop(0, roughOff ? "#c45a48" : "#f3c2b0");
      shine.addColorStop(0.4, "#c4281c");
      shine.addColorStop(1, "#4a0d0c");
      ctx.fillStyle = shine;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate((state.delivery.seam_angle_deg * Math.PI) / 180 + ball.transform.rotation.x * 0.15);
      ctx.strokeStyle = "rgba(245, 236, 214, 0.95)";
      ctx.lineWidth = Math.max(1.2, r * 0.16);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.quadraticCurveTo(r * 0.22, 0, 0, r * 0.85);
      ctx.stroke();
      ctx.restore();
    }

    _callStamp() {
      const state = this.getState();
      if (!state.lastResult || !state.holdClimax) return;
      const kind = String(state.lastResult.outcome || "").toUpperCase();
      if (!kind) return;
      const ctx = this.ctx;
      const w = this.camera.viewport.width;
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "800 52px 'Barlow Condensed', sans-serif";
      ctx.fillStyle = "rgba(8, 4, 4, 0.4)";
      const tw = Math.max(220, ctx.measureText(kind).width + 48);
      ctx.fillRect(w * 0.5 - tw * 0.5, 22, tw, 64);
      ctx.fillStyle = kind === "BOWLED" || kind === "LBW" ? "#ffd36a" : "#fff4d8";
      ctx.fillText(kind, w * 0.5, 68);
      ctx.restore();
    }

    _hawkeye() {
      if (!this.hawkCtx) return;
      const ctx = this.hawkCtx;
      const w = this.hawk.width;
      const h = this.hawk.height;
      ctx.fillStyle = "#13281a";
      ctx.fillRect(0, 0, w, h);
      const pad = 16;
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
        ctx.strokeStyle = "rgba(226, 74, 50, 0.75)";
        ctx.beginPath();
        state.lastResult.samples.forEach((s, i) => {
          const p = map(s.x, s.y);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }
      if (state.lastResult?.outcome === "lbw") {
        const st = map(0, PITCH);
        ctx.strokeStyle = "rgba(255, 210, 80, 0.85)";
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(map(state.lastResult.stump_pass?.[0] || 0, PITCH - 1.1).x, map(0, PITCH - 1.1).y);
        ctx.lineTo(st.x, st.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  global.RSRender = { StudioRenderer, KIT };
})(window);
