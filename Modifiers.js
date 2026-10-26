// Modifiers.js - Chaos game modifiers (speed boost, icy field, scared ball, black hole, frost ball, etc.)
// Each modifier is a pure data object. The Modifiers manager picks a random one every N seconds during
// play, broadcasts it to main.js via callbacks, and applies per-frame effects via apply().

import * as THREE from 'three';

// Reused world-up vector for black-hole spin axis (cheaper than allocating each frame).
const _BH_UP = new THREE.Vector3(0, 1, 0);

// Tunable timing
const FIRST_MODIFIER_AT = 18;     // seconds into the match before the first modifier rolls
const MIN_INTERVAL = 14;          // min seconds between modifiers
const MAX_INTERVAL = 22;          // max seconds between modifiers

// Each modifier is { id, name, sub, emoji, duration, color }.
// The actual gameplay effect lives in Modifiers.apply(); the descriptor only carries metadata.
export const MODIFIER_DEFS = [
  { id: 'speed',     name: 'SPEED BOOST!',  sub: 'Everyone runs faster',         emoji: '⚡', duration: 12, color: 0xffd23f },
  { id: 'slow',      name: 'SLOW MOTION',   sub: 'Everything slows down',        emoji: '🐌', duration: 12, color: 0xb380ff },
  { id: 'ice',       name: 'ICY FIELD!',    sub: 'No grip — drift everywhere',   emoji: '❄️', duration: 15, color: 0x9ee5ff },
  { id: 'scared',    name: 'SCARED BALL!',  sub: 'Ball flees from players',      emoji: '😱', duration: 12, color: 0xff8b3d },
  { id: 'blackhole', name: 'BLACK HOLE!',   sub: 'Beware the pull',              emoji: '🌀', duration: 14, color: 0x6b3dff },
  { id: 'frost',     name: 'FROST BALL!',   sub: 'Touch the ball — get frozen',  emoji: '🧊', duration: 14, color: 0x4cd8ff },
];

export class Modifiers {
  constructor({ scene, players, ballState, ball, fx, ui, getControlled, freezePlayer }) {
    this.scene = scene;
    this.players = players;
    this.ballState = ballState;
    this.ball = ball;
    this.fx = fx;
    this.ui = ui;                   // { banner, bannerTitle, bannerSub, bannerEmoji, chip, chipEmoji, chipText, chipTime }
    this.getControlled = getControlled;
    this.freezePlayer = freezePlayer; // (player, seconds) => void

    this.active = null;
    this.timeLeft = 0;
    this.nextRollIn = FIRST_MODIFIER_AT;
    this.announceTimer = 0;
    this.recent = [];               // recent modifier ids to avoid immediate repeats

    // Visuals owned by the modifier system
    this.blackHole = this._makeBlackHole();
    this.blackHole.visible = false;
    scene.add(this.blackHole);

    this.iceOverlay = this._makeIceOverlay();
    this.iceOverlay.visible = false;
    scene.add(this.iceOverlay);

    // Ball glow / frost ring (toggled when frost modifier active)
    this.frostRing = this._makeFrostRing();
    this.frostRing.visible = false;
    this.ball.add(this.frostRing);

    // Track which players are frozen by the frost ball this tick
    this._frozenByFrost = new WeakSet();
  }

  reset() {
    this.active = null;
    this.timeLeft = 0;
    this.nextRollIn = FIRST_MODIFIER_AT;
    this.announceTimer = 0;
    this.recent = [];
    this.blackHole.visible = false;
    this.iceOverlay.visible = false;
    this.frostRing.visible = false;
    if (this.ui.banner) this.ui.banner.classList.add('hidden');
    if (this.ui.chip) this.ui.chip.classList.add('hidden');
  }

  // Returns the per-player speed multiplier currently in effect (1.0 = normal).
  // Keepers are intentionally EXEMPT from Speed Boost / Slow Motion modifiers — their movement is
  // already tuned around precise save lunges and angle-blocking positioning, so a 1.6× boost causes
  // them to over-run shots into their own goal, and a 0.55× nerf makes saves impossible.
  getSpeedMultiplier(player) {
    if (!this.active) return 1.0;
    if (player && player.userData && player.userData.role === 'keeper') return 1.0;
    if (this.active.id === 'speed') return 1.6;
    if (this.active.id === 'slow') return 0.55;
    return 1.0;
  }

  // Returns the friction-decay multiplier for player movement (1.0 normal; <1 = icy / drifty).
  getFrictionMultiplier() {
    if (this.active && this.active.id === 'ice') return 0.15; // very low deceleration => slidey
    return 1.0;
  }

  // Returns the ball drag multiplier (1.0 normal; <1 = ball keeps rolling more).
  getBallDragMultiplier() {
    if (this.active && this.active.id === 'ice') return 0.35; // ball slides more
    return 1.0;
  }

  isFrostActive() {
    return this.active && this.active.id === 'frost';
  }

  // Called every frame during play. Updates timing, applies forces, returns the active modifier id (or null).
  update(dt, matchState) {
    // No modifiers during set-pieces / kickoff / goal celebrations.
    if (matchState !== 'play') {
      if (this.announceTimer > 0) {
        this.announceTimer -= dt;
        if (this.announceTimer <= 0 && this.ui.banner) {
          this.ui.banner.classList.add('hidden');
        }
      }
      return this.active ? this.active.id : null;
    }

    // Tick down the active one.
    if (this.active) {
      this.timeLeft -= dt;
      if (this.ui.chipTime) {
        this.ui.chipTime.textContent = Math.max(0, Math.ceil(this.timeLeft));
      }
      this._applyActive(dt);
      if (this.timeLeft <= 0) {
        this._endActive();
      }
    } else {
      // Roll for next modifier.
      this.nextRollIn -= dt;
      if (this.nextRollIn <= 0) {
        this._pickAndStart();
        this.nextRollIn = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
      }
    }

    if (this.announceTimer > 0) {
      this.announceTimer -= dt;
      if (this.announceTimer <= 0 && this.ui.banner) {
        this.ui.banner.classList.add('hidden');
      }
    }

    return this.active ? this.active.id : null;
  }

  // ----- internal -----

  _pickAndStart() {
    // Avoid the most recent 2 modifiers to keep variety.
    const pool = MODIFIER_DEFS.filter(m => !this.recent.includes(m.id));
    const def = pool[Math.floor(Math.random() * pool.length)] || MODIFIER_DEFS[0];
    this.recent.push(def.id);
    if (this.recent.length > 2) this.recent.shift();

    this.active = def;
    this.timeLeft = def.duration;

    // UI announce
    if (this.ui.bannerEmoji) this.ui.bannerEmoji.textContent = def.emoji;
    if (this.ui.bannerTitle) this.ui.bannerTitle.textContent = def.name;
    if (this.ui.bannerSub) this.ui.bannerSub.textContent = def.sub;
    if (this.ui.banner) {
      this.ui.banner.classList.remove('hidden');
      // Force animation restart by re-adding the class
      this.ui.banner.style.animation = 'none';
      // eslint-disable-next-line no-unused-expressions
      this.ui.banner.offsetHeight;
      this.ui.banner.style.animation = '';
    }
    this.announceTimer = 2.0;

    if (this.ui.chip) this.ui.chip.classList.remove('hidden');
    if (this.ui.chipEmoji) this.ui.chipEmoji.textContent = def.emoji;
    if (this.ui.chipText) this.ui.chipText.textContent = def.name.replace(/!$/, '');
    if (this.ui.chipTime) this.ui.chipTime.textContent = Math.ceil(def.duration);

    // Per-modifier setup
    if (def.id === 'blackhole') {
      // Random spot away from goalmouths
      const x = (Math.random() - 0.5) * 32;
      const z = (Math.random() - 0.5) * 18;
      this.blackHole.position.set(x, 0.1, z);
      // Reset internal layer rotations so each activation starts clean.
      ['swirl', 'ring', 'halo'].forEach(k => {
        const m = this.blackHole.userData[k];
        if (m) {
          m.rotation.set(-Math.PI / 2, 0, 0);
          m.scale.set(1, 1, 1);
        }
      });
      this.blackHole.visible = true;
    }
    if (def.id === 'ice') {
      this.iceOverlay.visible = true;
    }
    if (def.id === 'frost') {
      this.frostRing.visible = true;
    }

    // Audio cue
    if (this.fx) this.fx.modifier && this.fx.modifier(def.id);
  }

  _endActive() {
    if (!this.active) return;
    if (this.active.id === 'blackhole') this.blackHole.visible = false;
    if (this.active.id === 'ice') this.iceOverlay.visible = false;
    if (this.active.id === 'frost') this.frostRing.visible = false;
    this.active = null;
    this.timeLeft = 0;
    if (this.ui.chip) this.ui.chip.classList.add('hidden');
  }

  _applyActive(dt) {
    const def = this.active;
    if (!def) return;

    if (def.id === 'scared') {
      // Ball flees from nearest player when one gets close (and no one currently owns it via stickiness).
      // We push the ball away gently from any player within 3.5 units; combined push from all nearby players.
      const flee = new THREE.Vector3();
      this.players.forEach(p => {
        const dx = this.ballState.pos.x - p.position.x;
        const dz = this.ballState.pos.z - p.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 3.5 * 3.5 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const strength = (3.5 - d) * 4; // closer = stronger
          flee.x += (dx / d) * strength;
          flee.z += (dz / d) * strength;
        }
      });
      // Apply as acceleration to the ball.
      this.ballState.vel.x += flee.x * dt;
      this.ballState.vel.z += flee.z * dt;
      // Random nervous jitter
      this.ballState.vel.x += (Math.random() - 0.5) * 6 * dt;
      this.ballState.vel.z += (Math.random() - 0.5) * 6 * dt;
    }

    if (def.id === 'blackhole') {
      // Pull ball strongly, players weakly.
      const hx = this.blackHole.position.x;
      const hz = this.blackHole.position.z;
      // Ball pull
      const bdx = hx - this.ballState.pos.x;
      const bdz = hz - this.ballState.pos.z;
      const bd2 = bdx * bdx + bdz * bdz + 0.5;
      const bf = 18 / bd2;
      this.ballState.vel.x += bdx * bf * dt;
      this.ballState.vel.z += bdz * bf * dt;
      // Player pull (subtle, so players can still escape with effort)
      this.players.forEach(p => {
        const pdx = hx - p.position.x;
        const pdz = hz - p.position.z;
        const pd2 = pdx * pdx + pdz * pdz + 1.0;
        const pf = 5 / pd2;
        p.userData.vel.x += pdx * pf * dt;
        p.userData.vel.z += pdz * pf * dt;
      });
      // Animate the visual: spin each layer around the WORLD vertical axis so the disc stays flat.
      const upAxis = _BH_UP;
      const swirl = this.blackHole.userData.swirl;
      const ring  = this.blackHole.userData.ring;
      const halo  = this.blackHole.userData.halo;
      if (swirl) swirl.rotateOnWorldAxis(upAxis,  dt * 1.8);
      if (ring)  ring.rotateOnWorldAxis(upAxis,  -dt * 3.0);
      if (halo) {
        // Subtle breathing scale
        const s = 1 + Math.sin(performance.now() * 0.004) * 0.08;
        halo.scale.set(s, s, 1);
      }
    }

    if (def.id === 'frost') {
      // Any player currently in the "near ball" capture radius gets frozen briefly.
      // We only freeze players who are NOT the current owner (so the carrier isn't frozen by their own ball).
      const ballOwner = this._getOwnerHint();
      this.players.forEach(p => {
        if (p === ballOwner) return;
        const dx = p.position.x - this.ballState.pos.x;
        const dz = p.position.z - this.ballState.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.3 * 1.3 && this.ballState.pos.y < 1.5) {
          if (!this._frozenByFrost.has(p)) {
            this._frozenByFrost.add(p);
            this.freezePlayer(p, 1.6);
            if (this.fx && this.fx.bounce) this.fx.bounce();
            // Clear after a delay so the same player can be re-frozen later
            setTimeout(() => this._frozenByFrost.delete(p), 1800);
          }
        }
      });
      // Animate frost ring
      this.frostRing.rotation.z += dt * 3;
    }
  }

  // The Modifiers system doesn't directly track ownership; main.js passes a current-owner hint via setOwnerHint().
  setOwnerHint(p) { this._ownerHint = p; }
  _getOwnerHint() { return this._ownerHint || null; }

  // ----- visual objects -----
  _makeBlackHole() {
    // The black hole is a flat decal on the pitch. We build each layer already lying on the ground
    // (rotated -PI/2 around X) and then animate by rotating each layer around its LOCAL Y axis (which,
    // after the -PI/2 X rotation, is the world Y axis — i.e. spinning around the vertical).
    const g = new THREE.Group();

    // Outer glow halo
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 256; haloCanvas.height = 256;
    {
      const hx = haloCanvas.getContext('2d');
      const grad = hx.createRadialGradient(128, 128, 40, 128, 128, 128);
      grad.addColorStop(0.0, 'rgba(160,90,255,0.0)');
      grad.addColorStop(0.55, 'rgba(160,90,255,0.35)');
      grad.addColorStop(0.85, 'rgba(255,90,200,0.25)');
      grad.addColorStop(1.0, 'rgba(0,0,30,0.0)');
      hx.fillStyle = grad;
      hx.fillRect(0, 0, 256, 256);
    }
    const haloTex = new THREE.CanvasTexture(haloCanvas);
    haloTex.colorSpace = THREE.SRGBColorSpace;
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 7.5),
      new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.04;
    g.add(halo);

    // Swirl: a spiral texture that rotates around the vertical axis
    const swirlCanvas = document.createElement('canvas');
    swirlCanvas.width = 256; swirlCanvas.height = 256;
    {
      const sctx = swirlCanvas.getContext('2d');
      // Transparent base
      sctx.clearRect(0, 0, 256, 256);
      // Soft radial darkening toward center
      const grad = sctx.createRadialGradient(128, 128, 10, 128, 128, 110);
      grad.addColorStop(0.0, 'rgba(20,5,40,0.0)');
      grad.addColorStop(0.5, 'rgba(80,40,160,0.45)');
      grad.addColorStop(1.0, 'rgba(20,5,40,0.0)');
      sctx.fillStyle = grad;
      sctx.beginPath(); sctx.arc(128, 128, 110, 0, Math.PI * 2); sctx.fill();
      // Spiral arms
      sctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const phase = (i / 4) * Math.PI * 2;
        sctx.strokeStyle = `rgba(${230 + Math.random()*20|0},${180 + Math.random()*60|0},255,0.85)`;
        sctx.lineWidth = 3;
        sctx.beginPath();
        let first = true;
        for (let t = 0.2; t < Math.PI * 2.4; t += 0.08) {
          const r = 14 + t * 16;
          if (r > 118) break;
          const x = 128 + Math.cos(t + phase) * r;
          const y = 128 + Math.sin(t + phase) * r;
          if (first) { sctx.moveTo(x, y); first = false; } else sctx.lineTo(x, y);
        }
        sctx.stroke();
      }
    }
    const swirlTex = new THREE.CanvasTexture(swirlCanvas);
    swirlTex.colorSpace = THREE.SRGBColorSpace;
    const swirl = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 5.5),
      new THREE.MeshBasicMaterial({ map: swirlTex, transparent: true, depthWrite: false })
    );
    swirl.rotation.x = -Math.PI / 2;
    swirl.position.y = 0.07;
    g.add(swirl);

    // Inner accretion ring (counter-rotates for visual interest)
    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = 128; ringCanvas.height = 128;
    {
      const rx = ringCanvas.getContext('2d');
      const grad = rx.createRadialGradient(64, 64, 28, 64, 64, 60);
      grad.addColorStop(0.0, 'rgba(255,150,255,0.0)');
      grad.addColorStop(0.55, 'rgba(255,170,255,0.85)');
      grad.addColorStop(0.75, 'rgba(180,90,255,0.7)');
      grad.addColorStop(1.0, 'rgba(60,20,100,0.0)');
      rx.fillStyle = grad;
      rx.fillRect(0, 0, 128, 128);
    }
    const ringTex = new THREE.CanvasTexture(ringCanvas);
    ringTex.colorSpace = THREE.SRGBColorSpace;
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 3.6),
      new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.09;
    g.add(ring);

    // Pure-black core
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.11;
    g.add(core);

    // Store handles for the update loop
    g.userData.swirl = swirl;
    g.userData.ring = ring;
    g.userData.halo = halo;
    return g;
  }

  _makeIceOverlay() {
    // A translucent bluish plane just above the pitch
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(256, 256, 80, 256, 256, 280);
    grd.addColorStop(0, 'rgba(180,235,255,0.55)');
    grd.addColorStop(1, 'rgba(180,235,255,0.15)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 512, 512);
    // Frosty cracks
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      let x = Math.random() * 512, y = Math.random() * 512;
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (Math.random() - 0.5) * 80;
        y += (Math.random() - 0.5) * 80;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 40),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.7, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.03;
    return mesh;
  }

  _makeFrostRing() {
    const g = new THREE.Group();
    // Two glowing rings around the ball
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.55 + i * 0.12, 0.04, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0x9ee5ff, transparent: true, opacity: 0.85 })
      );
      ring.rotation.x = Math.PI / 2 + i * 0.4;
      g.add(ring);
    }
    return g;
  }
}
