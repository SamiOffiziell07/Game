// Input.js - unified joystick + keyboard input for mobile-first soccer
export class Input {
  constructor() {
    this.move = { x: 0, y: 0 }; // -1..1
    this.shootPressed = false;
    this.passPressed = false;
    this._keys = new Set();

    this._setupJoystick();
    this._setupButtons();
    this._setupKeyboard();
  }

  _setupJoystick() {
    const pad = document.getElementById('joystick');
    const stick = document.getElementById('stick');
    if (!pad || !stick) return;

    let active = false;
    let pointerId = null;
    let cx = 0, cy = 0;
    const radius = 50; // visible travel radius

    const updateRect = () => {
      const r = pad.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    };

    const setStick = (dx, dy) => {
      const len = Math.hypot(dx, dy);
      const max = radius;
      let nx = dx, ny = dy;
      if (len > max) {
        nx = (dx / len) * max;
        ny = (dy / len) * max;
      }
      stick.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
      // Normalized input (-1..1), Y is screen-down -> we'll flip later for world Z
      const normLen = Math.min(len / max, 1);
      const ang = Math.atan2(dy, dx);
      this.move.x = Math.cos(ang) * normLen;
      this.move.y = Math.sin(ang) * normLen;
    };

    const reset = () => {
      stick.style.transform = 'translate(-50%, -50%)';
      this.move.x = 0; this.move.y = 0;
      active = false; pointerId = null;
    };

    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      updateRect();
      active = true;
      pointerId = e.pointerId;
      pad.setPointerCapture(pointerId);
      setStick(e.clientX - cx, e.clientY - cy);
    });
    pad.addEventListener('pointermove', (e) => {
      if (!active || e.pointerId !== pointerId) return;
      setStick(e.clientX - cx, e.clientY - cy);
    });
    const end = (e) => {
      if (e.pointerId !== pointerId) return;
      reset();
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('lostpointercapture', reset);
  }

  _setupButtons() {
    const shoot = document.getElementById('btn-shoot');
    const pass = document.getElementById('btn-pass');
    const bind = (el, key) => {
      if (!el) return;
      const press = (e) => {
        e.preventDefault();
        this[key] = true;
        el.classList.add('pressed');
      };
      const release = () => el.classList.remove('pressed');
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    };
    bind(shoot, 'shootPressed');
    bind(pass, 'passPressed');
  }

  _setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      const isRepeat = this._keys.has(e.code);
      this._keys.add(e.code);
      if (e.code === 'Space' && !isRepeat) this.shootPressed = true;
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !isRepeat) this.passPressed = true;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this._keys.delete(e.code);
    });
  }

  // Call each frame; merges keyboard arrows into move if joystick idle
  poll() {
    const k = this._keys;
    let kx = 0, ky = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) kx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) kx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) ky -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) ky += 1;
    if (kx !== 0 || ky !== 0) {
      const l = Math.hypot(kx, ky);
      this.move.x = kx / l;
      this.move.y = ky / l;
    }
  }

  consumeShoot() {
    const v = this.shootPressed;
    this.shootPressed = false;
    return v;
  }
  consumePass() {
    const v = this.passPressed;
    this.passPressed = false;
    return v;
  }
}
