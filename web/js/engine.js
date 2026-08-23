/**
 * A tiny Unity-inspired runtime: PlayerLoop, Time, GameObjects,
 * components, camera, rigidbodies, trails, particles, input, timeline.
 * Built so a cricket ball can be bowled and watched, not as a generic demo.
 */
(function (global) {
  const TAU = Math.PI * 2;

  class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    copy(v) {
      return this.set(v.x, v.y, v.z);
    }
    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
    add(v) {
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }
    scale(s) {
      this.x *= s;
      this.y *= s;
      this.z *= s;
      return this;
    }
    lerp(a, b, t) {
      this.x = a.x + (b.x - a.x) * t;
      this.y = a.y + (b.y - a.y) * t;
      this.z = a.z + (b.z - a.z) * t;
      return this;
    }
    length() {
      return Math.hypot(this.x, this.y, this.z);
    }
  }

  class Time {
    static time = 0;
    static unscaledTime = 0;
    static deltaTime = 0;
    static unscaledDeltaTime = 0;
    static fixedDeltaTime = 1 / 50;
    static fixedTime = 0;
    static timeScale = 1;
    static frameCount = 0;
    static maximumDeltaTime = 0.1;
    static paused = false;
  }

  const Layers = Object.freeze({
    Default: 0,
    Pitch: 1,
    Ball: 2,
    Stumps: 3,
    Batter: 4,
    FX: 5,
    UI: 6,
  });

  class Transform {
    constructor() {
      this.position = new Vector3();
      this.rotation = new Vector3();
      this.scale = new Vector3(1, 1, 1);
      this.parent = null;
    }
    get worldPosition() {
      if (!this.parent) return this.position.clone();
      const p = this.parent.worldPosition;
      return new Vector3(p.x + this.position.x, p.y + this.position.y, p.z + this.position.z);
    }
  }

  class Component {
    constructor() {
      this.gameObject = null;
      this.enabled = true;
      this._awoken = false;
      this._started = false;
    }
    get transform() {
      return this.gameObject.transform;
    }
    awake() {}
    start() {}
    update(_dt) {}
    lateUpdate(_dt) {}
    fixedUpdate(_dt) {}
    onDisable() {}
    onDestroy() {}
  }

  class GameObject {
    constructor(name, { tag = "Untagged", layer = Layers.Default } = {}) {
      this.name = name;
      this.tag = tag;
      this.layer = layer;
      this.active = true;
      this.transform = new Transform();
      this.components = [];
      this.scene = null;
    }
    addComponent(component) {
      component.gameObject = this;
      this.components.push(component);
      return component;
    }
    getComponent(Ctor) {
      return this.components.find((c) => c instanceof Ctor) || null;
    }
    getComponents(Ctor) {
      return this.components.filter((c) => c instanceof Ctor);
    }
    setActive(value) {
      this.active = value;
    }
  }

  class Scene {
    constructor(name = "Scene") {
      this.name = name;
      this.objects = [];
    }
    add(object) {
      object.scene = this;
      this.objects.push(object);
      return object;
    }
    find(name) {
      return this.objects.find((o) => o.name === name) || null;
    }
    findWithTag(tag) {
      return this.objects.find((o) => o.tag === tag) || null;
    }
    findObjectsWithTag(tag) {
      return this.objects.filter((o) => o.tag === tag);
    }
    findObjectsWithLayer(layer) {
      return this.objects.filter((o) => o.layer === layer);
    }
  }

  class Camera extends Component {
    constructor() {
      super();
      this.fov = 38;
      this.near = 0.4;
      this.lookTarget = new Vector3(0, 16.4, 0.4);
      this.eye = new Vector3(0.15, -7.6, 3.9);
      this.viewport = { width: 800, height: 480 };
    }
    lookAt(x, y, z) {
      this.lookTarget.set(x, y, z);
    }
    worldToScreen(x, y, z) {
      const eye = this.eye;
      const fx = x - eye.x;
      const fy = y - eye.y;
      const fz = z - eye.z;
      const depth = fy;
      if (depth < this.near) return { x: -999, y: -999, depth, scale: 0 };
      const focal =
        (0.5 * this.viewport.height) / Math.tan((this.fov * Math.PI) / 360);
      const scale = focal / depth;
      return {
        x: this.viewport.width * 0.5 + fx * scale * 1.12,
        y: this.viewport.height * 0.62 - fz * scale,
        depth,
        scale,
      };
    }
  }

  const Interpolate = Object.freeze({ None: 0, Interpolate: 1 });

  class Rigidbody extends Component {
    constructor() {
      super();
      this.mass = 0.16;
      this.drag = 0.12;
      this.velocity = new Vector3();
      this.angularVelocity = new Vector3();
      this.interpolate = Interpolate.Interpolate;
      this.previousPosition = new Vector3();
      this.currentPosition = new Vector3();
      this.useGravity = false;
      this.kinematic = true;
    }
    awake() {
      this.previousPosition.copy(this.transform.position);
      this.currentPosition.copy(this.transform.position);
    }
    captureFixed() {
      this.previousPosition.copy(this.currentPosition);
      this.currentPosition.copy(this.transform.position);
    }
    renderPosition(alpha) {
      if (this.interpolate === Interpolate.None) return this.currentPosition;
      return new Vector3().lerp(this.previousPosition, this.currentPosition, alpha);
    }
  }

  class Collider extends Component {
    constructor(kind) {
      super();
      this.kind = kind;
    }
  }

  class PlaneCollider extends Collider {
    constructor(height = 0) {
      super("plane");
      this.height = height;
    }
  }

  class BoxCollider extends Collider {
    constructor(min, max) {
      super("box");
      this.min = min;
      this.max = max;
    }
    contains(p) {
      return (
        p.x >= this.min.x &&
        p.x <= this.max.x &&
        p.y >= this.min.y &&
        p.y <= this.max.y &&
        p.z >= this.min.z &&
        p.z <= this.max.z
      );
    }
  }

  class TrailRenderer extends Component {
    constructor({ maxPoints = 64, width = 3, color = "#e8c36a" } = {}) {
      super();
      this.maxPoints = maxPoints;
      this.width = width;
      this.color = color;
      this.points = [];
    }
    clear() {
      this.points.length = 0;
    }
    lateUpdate() {
      if (!this.enabled || !this.gameObject.active) return;
      const p = this.transform.worldPosition;
      const last = this.points[this.points.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) > 0.04) {
        this.points.push(p.clone());
        if (this.points.length > this.maxPoints) this.points.shift();
      }
    }
  }

  class Particle {
    constructor(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.vx = (Math.random() - 0.5) * 2.4;
      this.vy = (Math.random() - 0.5) * 1.2;
      this.vz = 1.4 + Math.random() * 2.2;
      this.life = 0.45 + Math.random() * 0.35;
      this.age = 0;
      this.size = 1.6 + Math.random() * 2.4;
    }
  }

  class ParticleSystem extends Component {
    constructor() {
      super();
      this.particles = [];
      this.emitting = false;
    }
    emit(count, origin) {
      for (let i = 0; i < count; i += 1) {
        this.particles.push(new Particle(origin.x, origin.y, origin.z));
      }
    }
    update(dt) {
      for (const p of this.particles) {
        p.age += dt;
        p.vz -= 9.8 * dt * 0.55;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
      this.particles = this.particles.filter((p) => p.age < p.life && p.z > 0);
    }
  }

  class Input {
    constructor() {
      this._held = new Set();
      this._down = new Set();
      this._up = new Set();
      this.pointer = { x: 0, y: 0, down: false, dx: 0, dy: 0 };
      this.actions = {
        Bowl: ["Space", "Enter"],
        WristIn: ["KeyQ", "KeyA"],
        WristOut: ["KeyE", "KeyD"],
        PaceUp: ["KeyR", "Equal"],
        PaceDown: ["KeyF", "Minus"],
        LineIn: ["ArrowLeft"],
        LineOut: ["ArrowRight"],
        LengthUp: ["ArrowUp"],
        LengthDown: ["ArrowDown"],
        Pause: ["KeyP"],
        Replay: ["KeyT"],
        TimeSlow: ["Digit1"],
        TimeNormal: ["Digit2"],
        TimeFast: ["Digit3"],
      };
    }
    bind(target) {
      target.addEventListener("keydown", (e) => {
        if (e.repeat) return;
        if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
          e.preventDefault();
        }
        this._held.add(e.code);
        this._down.add(e.code);
      });
      target.addEventListener("keyup", (e) => {
        this._held.delete(e.code);
        this._up.add(e.code);
      });
      target.addEventListener("pointermove", (e) => {
        const rect = target.getBoundingClientRect?.() || { left: 0, top: 0 };
        const nx = e.clientX - rect.left;
        const ny = e.clientY - rect.top;
        this.pointer.dx = nx - this.pointer.x;
        this.pointer.dy = ny - this.pointer.y;
        this.pointer.x = nx;
        this.pointer.y = ny;
      });
      target.addEventListener("pointerdown", () => {
        this.pointer.down = true;
      });
      target.addEventListener("pointerup", () => {
        this.pointer.down = false;
      });
    }
    getButton(action) {
      return this.actions[action]?.some((c) => this._held.has(c)) ?? false;
    }
    getButtonDown(action) {
      return this.actions[action]?.some((c) => this._down.has(c)) ?? false;
    }
    getAxis(neg, pos) {
      return (this.getButton(pos) ? 1 : 0) - (this.getButton(neg) ? 1 : 0);
    }
    endFrame() {
      this._down.clear();
      this._up.clear();
      this.pointer.dx = 0;
      this.pointer.dy = 0;
    }
  }

  class Timeline {
    constructor() {
      this.frames = [];
      this.recording = false;
      this.playing = false;
      this.cursor = 0;
      this.duration = 0;
    }
    begin() {
      this.frames = [];
      this.recording = true;
      this.playing = false;
      this.cursor = 0;
      this.duration = 0;
    }
    push(time, payload) {
      if (!this.recording) return;
      this.frames.push({ time, payload });
      this.duration = time;
    }
    stop() {
      this.recording = false;
    }
    play() {
      if (!this.frames.length) return;
      this.playing = true;
      this.recording = false;
      this.cursor = 0;
    }
    scrub(t) {
      this.playing = false;
      this.recording = false;
      this.cursor = Math.max(0, Math.min(t, this.duration));
    }
    sample(t = this.cursor) {
      if (!this.frames.length) return null;
      if (t <= this.frames[0].time) return this.frames[0].payload;
      for (let i = 1; i < this.frames.length; i += 1) {
        if (this.frames[i].time >= t) {
          const a = this.frames[i - 1];
          const b = this.frames[i];
          const u = (t - a.time) / Math.max(1e-6, b.time - a.time);
          return { a: a.payload, b: b.payload, u, time: t };
        }
      }
      return this.frames[this.frames.length - 1].payload;
    }
  }

  class PlayerLoop {
    constructor(scene, { onRender } = {}) {
      this.scene = scene;
      this.input = new Input();
      this.timeline = new Timeline();
      this.onRender = onRender || (() => {});
      this._acc = 0;
      this._last = 0;
      this._raf = 0;
      this.running = false;
    }
    start(bindTarget) {
      this.input.bind(bindTarget || window);
      this._forEachComponent((c) => {
        if (!c._awoken) {
          c.awake();
          c._awoken = true;
        }
      });
      this.running = true;
      this._last = performance.now();
      this._raf = requestAnimationFrame((t) => this._tick(t));
    }
    stop() {
      this.running = false;
      cancelAnimationFrame(this._raf);
    }
    _components() {
      const list = [];
      for (const obj of this.scene.objects) {
        if (!obj.active) continue;
        for (const c of obj.components) {
          if (c.enabled) list.push(c);
        }
      }
      return list;
    }
    _forEachComponent(fn) {
      for (const c of this._components()) fn(c);
    }
    _tick(now) {
      if (!this.running) return;
      let unscaled = (now - this._last) / 1000;
      this._last = now;
      unscaled = Math.min(unscaled, Time.maximumDeltaTime);
      Time.unscaledDeltaTime = unscaled;
      Time.unscaledTime += unscaled;
      const scale = Time.paused ? 0 : Time.timeScale;
      Time.deltaTime = unscaled * scale;
      Time.time += Time.deltaTime;
      Time.frameCount += 1;

      this._forEachComponent((c) => {
        if (!c._started) {
          c.start();
          c._started = true;
        }
      });

      this._acc += Time.deltaTime;
      const fixed = Time.fixedDeltaTime;
      let steps = 0;
      while (this._acc >= fixed && steps < 8) {
        this._forEachComponent((c) => c.fixedUpdate(fixed));
        this._forEachComponent((c) => {
          if (c instanceof Rigidbody) c.captureFixed();
        });
        Time.fixedTime += fixed;
        this._acc -= fixed;
        steps += 1;
      }
      const alpha = fixed > 0 ? this._acc / fixed : 1;

      this._forEachComponent((c) => c.update(Time.deltaTime));
      this._forEachComponent((c) => c.lateUpdate(Time.deltaTime));
      this.onRender(alpha);
      this.input.endFrame();
      this._raf = requestAnimationFrame((t) => this._tick(t));
    }
  }

  global.RSEngine = {
    Vector3,
    Time,
    Layers,
    Transform,
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
    Input,
    Timeline,
    PlayerLoop,
    TAU,
  };
})(window);
