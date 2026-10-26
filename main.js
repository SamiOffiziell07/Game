// main.js - Kicko! Pocket Soccer - Nintendo-esque mobile soccer game
import * as THREE from 'three';
import { Input } from './Input.js';
import { AudioFX } from './Audio.js';
import { Modifiers } from './Modifiers.js';

// ============== Constants ==============
const PITCH = {
  W: 30,       // half-width (x)
  H: 20,       // half-length (z)
  GOAL_W: 7,   // goal half-width
  GOAL_H: 3.2, // goal height
  GOAL_D: 2,   // goal depth
};

const MATCH_DURATION = 120; // seconds

// Team 1 (Pink) attacks +Z, Team 2 (Cyan) attacks -Z
const TEAM = {
  1: { color: 0xff3b6b, dark: 0xc41945, sign: +1, name: 'PLAYERS' },
  2: { color: 0x2ec3ff, dark: 0x1773a8, sign: -1, name: 'COMPUTER' },
};

// ============== Engine setup ==============
const renderDiv = document.getElementById('renderDiv');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderDiv.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Gradient sky via a canvas texture — more atmospheric than a flat color.
{
  const skyC = document.createElement('canvas');
  skyC.width = 32; skyC.height = 256;
  const sctx = skyC.getContext('2d');
  const grd = sctx.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0.0, '#4ea8ff');
  grd.addColorStop(0.55, '#a9d8ff');
  grd.addColorStop(1.0, '#ffd9a8');
  sctx.fillStyle = grd;
  sctx.fillRect(0, 0, 32, 256);
  const skyTex = new THREE.CanvasTexture(skyC);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
}
scene.fog = new THREE.Fog(0xa9d8ff, 70, 150);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 22, -34);
camera.lookAt(0, 0, 0);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = (h > w) ? 62 : 50;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ============== Lighting ==============
scene.add(new THREE.HemisphereLight(0xbfe6ff, 0x4cc26a, 0.55));
const sun = new THREE.DirectionalLight(0xfff2c0, 1.6);
sun.position.set(20, 40, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 100;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

// Toon-ish material
function toonMat(color, opts={}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0.02,
    flatShading: opts.flat ?? false,
  });
}

// ============== Pitch ==============
function makePitchTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const ctx = c.getContext('2d');
  const stripes = 12;
  const sw = c.width / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#5fd47b' : '#4cc26a';
    ctx.fillRect(i * sw, 0, sw, c.height);
  }
  // pitch lines
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  const pad = 60;
  ctx.strokeRect(pad, pad, c.width - pad * 2, c.height - pad * 2);
  ctx.beginPath();
  ctx.moveTo(pad, c.height / 2);
  ctx.lineTo(c.width - pad, c.height / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c.width / 2, c.height / 2, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(c.width / 2, c.height / 2, 8, 0, Math.PI * 2);
  ctx.fill();
  const boxW = 380, boxH = 140;
  ctx.strokeRect((c.width - boxW) / 2, pad, boxW, boxH);
  ctx.strokeRect((c.width - boxW) / 2, c.height - pad - boxH, boxW, boxH);
  // goal area
  const gW = 220, gH = 60;
  ctx.strokeRect((c.width - gW) / 2, pad, gW, gH);
  ctx.strokeRect((c.width - gW) / 2, c.height - pad - gH, gW, gH);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
const pitch = new THREE.Mesh(
  new THREE.PlaneGeometry(PITCH.W * 2, PITCH.H * 2),
  new THREE.MeshStandardMaterial({ map: makePitchTexture(), roughness: 0.95, metalness: 0 })
);
pitch.rotation.x = -Math.PI / 2;
pitch.receiveShadow = true;
scene.add(pitch);

// Grass surround
const surround = new THREE.Mesh(
  new THREE.PlaneGeometry(140, 140),
  toonMat(0x3a8f4d, { roughness: 1 })
);
surround.rotation.x = -Math.PI / 2;
surround.position.y = -0.02;
surround.receiveShadow = true;
scene.add(surround);

// Stadium ring
function makeStadiumRing() {
  const g = new THREE.Group();
  const ringMat = toonMat(0xe9edf5, { roughness: 0.6 });
  const segs = [
    { w: PITCH.W * 2 + 8, h: 1.6, d: 1.4, x: 0, z: PITCH.H + 4, c: 0xff3b6b },
    { w: PITCH.W * 2 + 8, h: 1.6, d: 1.4, x: 0, z: -PITCH.H - 4, c: 0x2ec3ff },
    { w: 1.4, h: 1.6, d: PITCH.H * 2 + 8, x: PITCH.W + 4, z: 0, c: 0xffd23f },
    { w: 1.4, h: 1.6, d: PITCH.H * 2 + 8, x: -PITCH.W - 4, z: 0, c: 0xffd23f },
  ];
  segs.forEach(s => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), ringMat);
    m.position.set(s.x, s.h / 2, s.z);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(s.w * 0.98, 0.18, s.d * 0.98),
      toonMat(s.c)
    );
    stripe.position.set(s.x, s.h + 0.05, s.z);
    g.add(stripe);
  });
  return g;
}
scene.add(makeStadiumRing());

// Crowd
function makeCrowd() {
  const g = new THREE.Group();
  const palette = [0xff3b6b, 0x2ec3ff, 0xffd23f, 0x5fe0a8, 0xff8b3d, 0xb380ff];
  const rows = 3;
  for (let side = 0; side < 4; side++) {
    const isLong = side < 2;
    const count = isLong ? 32 : 22;
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        let x, z;
        const off = 5.5 + row * 1.5;
        if (side === 0) {
          x = THREE.MathUtils.lerp(-PITCH.W - 2, PITCH.W + 2, t);
          z = PITCH.H + off;
        } else if (side === 1) {
          x = THREE.MathUtils.lerp(-PITCH.W - 2, PITCH.W + 2, t);
          z = -PITCH.H - off;
        } else if (side === 2) {
          x = PITCH.W + off; z = THREE.MathUtils.lerp(-PITCH.H - 2, PITCH.H + 2, t);
        } else {
          x = -PITCH.W - off; z = THREE.MathUtils.lerp(-PITCH.H - 2, PITCH.H + 2, t);
        }
        const color = palette[Math.floor(Math.random() * palette.length)];
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.32, 0.5, 4, 6),
          toonMat(color, { roughness: 0.8 })
        );
        body.position.set(x + (Math.random()-0.5)*0.3, 1.6 + row * 0.6, z);
        body.userData.basY = body.position.y;
        body.userData.phase = Math.random() * Math.PI * 2;
        g.add(body);
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 8, 6),
          toonMat(0xf4c089, { roughness: 0.7 })
        );
        head.position.set(body.position.x, body.position.y + 0.55, body.position.z);
        head.userData.parent = body;
        g.add(head);
      }
    }
  }
  return g;
}
const crowd = makeCrowd();
scene.add(crowd);

// ============== Goals ==============
function makeGoal(teamSign) {
  const g = new THREE.Group();
  const postMat = toonMat(0xffffff, { roughness: 0.5 });
  const netMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.35,
    side: THREE.DoubleSide, roughness: 1,
  });
  const w = PITCH.GOAL_W, h = PITCH.GOAL_H, d = PITCH.GOAL_D;
  const postR = 0.13;
  const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, h, 12), postMat);
  leftPost.position.set(-w, h / 2, 0);
  const rightPost = leftPost.clone();
  rightPost.position.set(w, h / 2, 0);
  const cross = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, w * 2, 12), postMat);
  cross.rotation.z = Math.PI / 2;
  cross.position.set(0, h, 0);
  const backLeft = leftPost.clone();
  backLeft.position.set(-w, h / 2, -d * teamSign);
  const backRight = leftPost.clone();
  backRight.position.set(w, h / 2, -d * teamSign);
  const topBack = new THREE.Mesh(new THREE.CylinderGeometry(postR*0.7, postR*0.7, w * 2, 8), postMat);
  topBack.rotation.z = Math.PI / 2;
  topBack.position.set(0, h, -d * teamSign);
  const sideL = new THREE.Mesh(new THREE.CylinderGeometry(postR*0.7, postR*0.7, d, 8), postMat);
  sideL.rotation.x = Math.PI / 2;
  sideL.position.set(-w, h, -d * teamSign / 2);
  const sideR = sideL.clone();
  sideR.position.x = w;
  [leftPost, rightPost, cross, backLeft, backRight, topBack, sideL, sideR].forEach(p => {
    p.castShadow = true; g.add(p);
  });
  const backNet = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, h), netMat);
  backNet.position.set(0, h / 2, -d * teamSign);
  g.add(backNet);
  const topNet = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, d), netMat);
  topNet.rotation.x = Math.PI / 2;
  topNet.position.set(0, h, -d * teamSign / 2);
  g.add(topNet);
  const sideNetL = new THREE.Mesh(new THREE.PlaneGeometry(d, h), netMat);
  sideNetL.rotation.y = Math.PI / 2;
  sideNetL.position.set(-w, h / 2, -d * teamSign / 2);
  g.add(sideNetL);
  const sideNetR = sideNetL.clone();
  sideNetR.position.x = w;
  g.add(sideNetR);

  // colored disc behind goal
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 24),
    toonMat(teamSign > 0 ? TEAM[2].color : TEAM[1].color)
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0, 0.02, -d * teamSign / 2);
  g.add(disc);
  return g;
}
const goalPlus = makeGoal(+1);
goalPlus.position.z = PITCH.H;
scene.add(goalPlus);
const goalMinus = makeGoal(-1);
goalMinus.position.z = -PITCH.H;
scene.add(goalMinus);

// ============== Ball ==============
const BALL_RADIUS = 0.4;
function makeBall() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,256,256);
  ctx.fillStyle = '#1b1d2a';
  const drawPent = (cx, cy, r) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI/2 + i * (Math.PI*2/5);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    }
    ctx.closePath(); ctx.fill();
  };
  for (let i = 0; i < 8; i++) {
    drawPent(30 + (i%4)*70, 40 + Math.floor(i/4)*120, 20);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 24, 18),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.0 })
  );
  ball.castShadow = true; ball.receiveShadow = true;
  const wrap = new THREE.Group();
  wrap.add(ball);
  return wrap;
}
const ball = makeBall();
ball.position.set(0, BALL_RADIUS, 0);
scene.add(ball);
const ballState = {
  pos: new THREE.Vector3(0, BALL_RADIUS, 0),
  vel: new THREE.Vector3(),
};

// ----- Ball trail: a small pool of fading sprites that drop behind the ball when it moves fast. -----
const TRAIL_COUNT = 12;
const ballTrail = [];
{
  const trailGeo = new THREE.SphereGeometry(BALL_RADIUS * 0.85, 10, 8);
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const m = new THREE.Mesh(
      trailGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false
      })
    );
    m.visible = false;
    scene.add(m);
    ballTrail.push({ mesh: m, life: 0 });
  }
}
let trailIdx = 0;
let trailEmitAccum = 0;

function updateBallVisuals(dt) {
  // Emit a trail puff each ~0.04s if the ball is moving fast enough.
  const speed = Math.hypot(ballState.vel.x, ballState.vel.z);
  trailEmitAccum += dt;
  if (speed > 10 && trailEmitAccum > 0.035) {
    trailEmitAccum = 0;
    const t = ballTrail[trailIdx];
    trailIdx = (trailIdx + 1) % TRAIL_COUNT;
    t.mesh.position.copy(ballState.pos);
    t.mesh.visible = true;
    t.life = 0.35;
    // Color tint: frost ball is icy blue, otherwise white-ish gold.
    if (modifiers.isFrostActive()) {
      t.mesh.material.color.setHex(0x9ee5ff);
    } else {
      t.mesh.material.color.setHex(0xffe9a8);
    }
  }
  // Fade & shrink existing trail puffs.
  for (const t of ballTrail) {
    if (!t.mesh.visible) continue;
    t.life -= dt;
    if (t.life <= 0) { t.mesh.visible = false; t.mesh.material.opacity = 0; continue; }
    const k = t.life / 0.35;
    t.mesh.material.opacity = k * 0.55;
    t.mesh.scale.setScalar(0.4 + k * 0.8);
  }

  // Ball glows slightly when frost ball or scared modifier is active.
  const ballMesh = ball.children[0];
  if (ballMesh && ballMesh.material) {
    if (modifiers.isFrostActive()) {
      ballMesh.material.emissive = ballMesh.material.emissive || new THREE.Color();
      ballMesh.material.emissive.setHex(0x4cd8ff);
      ballMesh.material.emissiveIntensity = 0.5;
    } else {
      if (ballMesh.material.emissive) {
        ballMesh.material.emissiveIntensity = 0;
      }
    }
  }
}

// ============== Players ==============
function makePlayer(team) {
  const t = TEAM[team];
  const g = new THREE.Group();
  const shorts = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.45, 0.55),
    toonMat(0x1b1d2a, { roughness: 0.6 })
  );
  shorts.position.y = 0.55;
  shorts.castShadow = true;
  g.add(shorts);
  const jersey = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.7, 0.6),
    toonMat(t.color, { roughness: 0.65 })
  );
  jersey.position.y = 1.15;
  jersey.castShadow = true;
  g.add(jersey);
  const armGeo = new THREE.BoxGeometry(0.22, 0.6, 0.22);
  const armMat = toonMat(t.color, { roughness: 0.65 });
  const lArm = new THREE.Mesh(armGeo, armMat);
  lArm.position.set(-0.5, 1.15, 0);
  lArm.castShadow = true;
  g.add(lArm);
  const rArm = lArm.clone();
  rArm.position.x = 0.5;
  g.add(rArm);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.55, 0.55),
    toonMat(0xf4c089, { roughness: 0.7 })
  );
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.18, 0.58),
    toonMat(t.dark, { roughness: 0.6 })
  );
  hair.position.y = 2.05;
  g.add(hair);
  const eyeMat = toonMat(0x1b1d2a, { roughness: 0.3 });
  const eyeGeo = new THREE.BoxGeometry(0.08, 0.1, 0.05);
  const eL = new THREE.Mesh(eyeGeo, eyeMat);
  eL.position.set(-0.12, 1.82, 0.3);
  g.add(eL);
  const eR = eL.clone();
  eR.position.x = 0.12;
  g.add(eR);
  // number on back
  const number = new THREE.Mesh(
    new THREE.PlaneGeometry(0.35, 0.4),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
  );
  number.position.set(0, 1.2, -0.31);
  number.rotation.y = Math.PI;
  g.add(number);
  const legGeo = new THREE.BoxGeometry(0.3, 0.55, 0.3);
  const legMat = toonMat(0xf4c089, { roughness: 0.7 });
  const lLeg = new THREE.Mesh(legGeo, legMat);
  lLeg.position.set(-0.18, 0.25, 0);
  lLeg.castShadow = true;
  g.add(lLeg);
  const rLeg = lLeg.clone();
  rLeg.position.x = 0.18;
  g.add(rLeg);
  const shoeGeo = new THREE.BoxGeometry(0.34, 0.16, 0.5);
  const shoeMat = toonMat(0x1b1d2a, { roughness: 0.4 });
  const lShoe = new THREE.Mesh(shoeGeo, shoeMat);
  lShoe.position.set(-0.18, 0.04, 0.08);
  g.add(lShoe);
  const rShoe = lShoe.clone();
  rShoe.position.x = 0.18;
  g.add(rShoe);
  // ring under feet (team marker)
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.78, 28),
    new THREE.MeshBasicMaterial({ color: t.color, transparent: true, opacity: 0.0, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);

  // Frost overlay (toggled when frozen by frost ball) — a translucent icy box around the player
  const frostBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 2.3, 0.95),
    new THREE.MeshStandardMaterial({
      color: 0x9ee5ff, transparent: true, opacity: 0.0,
      roughness: 0.2, metalness: 0.1, emissive: 0x4cd8ff, emissiveIntensity: 0.4
    })
  );
  frostBox.position.y = 1.1;
  g.add(frostBox);

  g.userData = {
    team,
    teamData: t,
    parts: { lLeg, rLeg, lArm, rArm, head, body: jersey, shorts },
    ring,
    frostBox,
    walkPhase: 0,
    kickPhase: 0,
    targetYaw: 0,
    stagger: 0,         // seconds remaining where player is stunned after being tackled
    tackleCooldown: 0,  // seconds before this player can attempt another tackle
    frozen: 0,          // seconds remaining frozen (from frost ball)
    postPossessGrace: 0,// seconds the player just got the ball and can't be tackled immediately
    keeperHoldTimer: 0, // keeper-only: how long they've held the ball this possession (drives quick clearance)
    savingShot: false,  // keeper-only: true while lunging to intercept a predicted shot
  };
  return g;
}

const players = [];
function spawnPlayer(team, x, z, role='field') {
  const p = makePlayer(team);
  p.position.set(x, 0, z);
  p.userData.role = role;
  p.userData.homeX = x;
  p.userData.homeZ = z;
  p.userData.vel = new THREE.Vector3();
  scene.add(p);
  players.push(p);
  return p;
}

// 4v4: 1 keeper + 3 outfield per team
function setupFormation() {
  // Team 1 (pink, attacks +Z)
  spawnPlayer(1, 0, -PITCH.H + 1.5, 'keeper');
  spawnPlayer(1, -7, -7, 'field');
  spawnPlayer(1, 7, -7, 'field');
  spawnPlayer(1, 0, -3, 'field');
  // Team 2 (cyan, attacks -Z)
  spawnPlayer(2, 0, PITCH.H - 1.5, 'keeper');
  spawnPlayer(2, -7, 7, 'field');
  spawnPlayer(2, 7, 7, 'field');
  spawnPlayer(2, 0, 3, 'field');
}

// ============== Game state ==============
const game = {
  state: 'title',
  controlled: null,
  score: { 1: 0, 2: 0 },
  time: MATCH_DURATION,
  goalCelebrate: 0,
  ballOwner: null,
  ballOwnerCooldown: 0,
  ballOwnerStickTime: 0,    // how long current owner has held the ball (controls tackle resistance)
  lastTouchTeam: null,      // last team to touch the ball, persists after a kick (used for throw-ins / goal kicks)
  lastTackleTime: 0,        // global cooldown to keep scrums from chain-tackling every frame
  shake: 0,                 // camera shake on tackle / impact
  setpiece: null,           // { type:'throwin'|'goalkick', team, x, z, timer }
};

const input = new Input();
const fx = new AudioFX();

// ============== UI bindings ==============
const uiScore1 = document.getElementById('score1');
const uiScore2 = document.getElementById('score2');
const uiTimer = document.getElementById('timer');
const titleScreen = document.getElementById('title-screen');
const goalScreen = document.getElementById('goal-screen');
const goalText = document.getElementById('goal-text');
const endScreen = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const endSub = document.getElementById('end-sub');
const setpieceBanner = document.getElementById('setpiece-banner');
const setpieceText = document.getElementById('setpiece-text');

// Modifier UI references
const modUI = {
  banner: document.getElementById('modifier-banner'),
  bannerTitle: document.getElementById('mod-title'),
  bannerSub: document.getElementById('mod-sub'),
  bannerEmoji: document.getElementById('mod-emoji'),
  chip: document.getElementById('modifier-chip'),
  chipEmoji: document.getElementById('modifier-chip-emoji'),
  chipText: document.getElementById('modifier-chip-text'),
  chipTime: document.getElementById('modifier-chip-time'),
};

// Modifiers manager — created here, used in the main loop. Players list reference is shared (mutated, not reassigned).
const modifiers = new Modifiers({
  scene, players, ballState, ball, fx, ui: modUI,
  getControlled: () => game.controlled,
  freezePlayer: (p, secs) => {
    p.userData.frozen = Math.max(p.userData.frozen, secs);
    p.userData.vel.set(0, 0, 0);
    if (fx.freeze) fx.freeze();
  },
});

function updateScoreUI() {
  uiScore1.textContent = game.score[1];
  uiScore2.textContent = game.score[2];
}
function updateTimerUI() {
  const t = Math.max(0, Math.ceil(game.time));
  const m = Math.floor(t / 60);
  const s = t % 60;
  uiTimer.textContent = `${m}:${s.toString().padStart(2,'0')}`;
}
updateScoreUI(); updateTimerUI();

document.getElementById('play-btn').addEventListener('click', () => {
  fx.resume(); fx.click();
  titleScreen.classList.add('hidden');
  startMatch();
});
document.getElementById('rematch-btn').addEventListener('click', () => {
  fx.click();
  endScreen.classList.add('hidden');
  game.score[1] = 0; game.score[2] = 0;
  updateScoreUI();
  startMatch();
});

// ============== Match lifecycle ==============
function startMatch() {
  players.forEach(p => scene.remove(p));
  players.length = 0;
  setupFormation();
  resetPositions();
  game.time = MATCH_DURATION;
  game.state = 'kickoff';
  modifiers.reset();
  setTimeout(() => {
    if (game.state === 'kickoff') {
      game.state = 'play';
      fx.whistle();
    }
  }, 800);
}

function resetPositions() {
  ballState.pos.set(0, BALL_RADIUS, 0);
  ballState.vel.set(0,0,0);
  ball.position.copy(ballState.pos);
  players.forEach(p => {
    p.position.set(p.userData.homeX, 0, p.userData.homeZ);
    p.userData.vel.set(0,0,0);
    p.userData.stagger = 0;
    p.userData.tackleCooldown = 0;
    p.userData.frozen = 0;
    p.userData.postPossessGrace = 0;
    p.userData.keeperHoldTimer = 0;
    p.userData.savingShot = false;
    if (p.userData.frostBox) p.userData.frostBox.material.opacity = 0;
    p.rotation.y = p.userData.team === 1 ? 0 : Math.PI;
  });
  selectClosestControlled(1);
  game.ballOwner = null;
  game.ballOwnerCooldown = 0;
  game.ballOwnerStickTime = 0;
  game.lastTouchTeam = null;
  game.setpiece = null;
}

function selectClosestControlled(team) {
  let best = null, bestD = Infinity;
  players.forEach(p => {
    if (p.userData.team !== team || p.userData.role === 'keeper') return;
    const d = p.position.distanceTo(ballState.pos);
    if (d < bestD) { bestD = d; best = p; }
  });
  game.controlled = best;
}

// ============== AI ==============
// Per-team role assignment.
//
// Big idea: supporters don't sit on static slots. They actively look for OPEN SPACE in their assigned
// "zone" (left wing / right wing relative to ball) by sampling several candidate points and picking
// the one furthest from any opponent. This produces real passing lanes — defenders can't camp because
// the supporters keep finding new gaps.
function assignRoles(team) {
  const sign = TEAM[team].sign;
  const oppSign = -sign;
  const field = players.filter(p => p.userData.team === team && p.userData.role !== 'keeper');
  if (field.length === 0) return { chaser: null, assignments: new Map() };

  const ourTeamHasBall = game.ballOwner && game.ballOwner.userData.team === team;

  // Pick chaser: human if it's our team and it's a field player; else closest field player to ball.
  let chaser = null;
  if (game.controlled && game.controlled.userData.team === team && game.controlled.userData.role !== 'keeper') {
    chaser = game.controlled;
  } else {
    let bestD = Infinity;
    field.forEach(p => {
      const d = p.position.distanceTo(ballState.pos);
      if (d < bestD) { bestD = d; chaser = p; }
    });
  }

  const supporters = field.filter(p => p !== chaser);
  const ballX = ballState.pos.x;
  const ballZ = ballState.pos.z;

  // Define two "zones" — left side and right side of the field, ahead of (or behind) the ball depending on possession.
  // Each supporter searches its assigned zone for the most-open point.
  const isLeft = (p) => p.userData.homeX < 0;
  const leftSup = supporters.find(isLeft);
  const rightSup = supporters.find(p => !isLeft(p));

  // Helper: score a candidate point. Higher = better passing target / defensive position.
  // - Far from opponents = good (openness)
  // - Far from teammates = good (spread)
  // - For attacking: ahead of the ball + within shooting / passing range
  // - For defending: between ball and own goal, near the ball-side
  const opponents = players.filter(p => p.userData.team !== team);
  const teammates = field;
  const scoreCandidate = (x, z, opts) => {
    // Opponent distance (clamped)
    let minOpp = Infinity;
    for (const o of opponents) {
      const d = Math.hypot(o.position.x - x, o.position.z - z);
      if (d < minOpp) minOpp = d;
    }
    minOpp = Math.min(minOpp, 10);

    // Teammate spread (don't bunch up)
    let minTm = Infinity;
    for (const t of teammates) {
      if (t === opts.self) continue;
      const d = Math.hypot(t.position.x - x, t.position.z - z);
      if (d < minTm) minTm = d;
    }
    minTm = Math.min(minTm, 8);

    // Distance from passer (ball) — penalise too close AND too far
    const passDist = Math.hypot(ballX - x, ballZ - z);
    const idealPassDist = ourTeamHasBall ? 11 : 9;
    const passPenalty = Math.abs(passDist - idealPassDist) * 0.4;

    // Forwardness (encourage being ahead of ball when we have it; behind ball when defending)
    const forward = (z - ballZ) * sign;
    const forwardBonus = ourTeamHasBall ? Math.max(-2, Math.min(8, forward)) * 0.8 : -Math.min(4, Math.max(0, -forward)) * 0.5;

    // Channel pass lane bonus: if a straight line from ball to (x,z) is clear of opponents, big bonus.
    let laneBonus = 0;
    if (ourTeamHasBall) {
      const dx = x - ballX, dz = z - ballZ;
      const L = Math.hypot(dx, dz) || 1;
      const nx = dx / L, nz = dz / L;
      let minLaneD = Infinity;
      for (const o of opponents) {
        // perpendicular distance from opponent to the segment
        const ox = o.position.x - ballX, oz = o.position.z - ballZ;
        const proj = ox * nx + oz * nz;
        if (proj < 0 || proj > L) continue;
        const perp = Math.abs(ox * (-nz) + oz * (nx));
        if (perp < minLaneD) minLaneD = perp;
      }
      laneBonus = Math.min(5, minLaneD) * 1.5;
    }

    return minOpp * 1.4 + minTm * 0.6 - passPenalty + forwardBonus + laneBonus;
  };

  // Special outlet behavior: if our own keeper has the ball, the field players sprint to wider,
  // further-upfield positions to give the keeper a clear pass and break the press.
  const keeperHasBall = game.ballOwner &&
    game.ballOwner.userData.team === team &&
    game.ballOwner.userData.role === 'keeper';

  // Sample a small ring of candidate points within a zone and pick the best.
  const findOpenSpot = (self, zoneSide) => {
    // zoneSide: -1 for left of pitch, +1 for right.
    // Anchor depends on possession:
    //   - Keeper has ball → wide outlet position, further upfield to break the press
    //   - With ball (field carrier) → anchor ahead of ball, on this side.
    //   - Without ball → anchor goal-side of ball, on this side.
    let anchorZ, anchorX;
    if (keeperHasBall) {
      // Outlet: push to halfway line in front of the keeper, hugging the touchline.
      anchorZ = ballZ + sign * 12;       // ~12 units upfield from keeper
      anchorX = zoneSide * 12;            // very wide, near the touchline
    } else if (ourTeamHasBall) {
      anchorZ = ballZ + sign * 7;
      anchorX = zoneSide * 9;
    } else {
      anchorZ = ballZ + oppSign * 4;
      anchorX = zoneSide * 9;
    }
    const anchorXClamped = THREE.MathUtils.clamp(anchorX, -PITCH.W + 4, PITCH.W - 4);
    const anchorZClamped = THREE.MathUtils.clamp(anchorZ, -PITCH.H + 4, PITCH.H - 4);

    // Sample candidates
    let bestPt = { x: anchorXClamped, z: anchorZClamped };
    let bestScore = -Infinity;
    const samples = 9;
    for (let i = 0; i < samples; i++) {
      // First sample is the pure anchor; rest are jittered offsets.
      let cx, cz;
      if (i === 0) { cx = anchorXClamped; cz = anchorZClamped; }
      else {
        const r = 3 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2;
        cx = THREE.MathUtils.clamp(anchorXClamped + Math.cos(a) * r, -PITCH.W + 3, PITCH.W - 3);
        cz = THREE.MathUtils.clamp(anchorZClamped + Math.sin(a) * r, -PITCH.H + 3, PITCH.H - 3);
      }
      const s = scoreCandidate(cx, cz, { self });
      if (s > bestScore) { bestScore = s; bestPt = { x: cx, z: cz }; }
    }
    // Also include the player's CURRENT spot so they don't oscillate every frame when already in good space.
    {
      const s = scoreCandidate(self.position.x, self.position.z, { self }) + 1.5; // hysteresis bonus
      if (s > bestScore) { bestScore = s; bestPt = { x: self.position.x, z: self.position.z }; }
    }
    return bestPt;
  };

  const assignments = new Map();
  if (leftSup)  assignments.set(leftSup,  findOpenSpot(leftSup,  -1));
  if (rightSup) assignments.set(rightSup, findOpenSpot(rightSup, +1));

  return { chaser, assignments, keeperHasBall };
}

function aiUpdate(dt) {
  // Compute team roles once per frame.
  const roles1 = assignRoles(1);
  const roles2 = assignRoles(2);

  players.forEach(p => {
    const ud = p.userData;

    // tick down stagger / cooldowns regardless
    if (ud.stagger > 0) ud.stagger -= dt;
    if (ud.tackleCooldown > 0) ud.tackleCooldown -= dt;

    if (p === game.controlled) return;
    if (ud.stagger > 0 || ud.frozen > 0) {
      // staggered or frozen: bleed velocity to a stop, no AI decisions
      ud.vel.x *= 0.85;
      ud.vel.z *= 0.85;
      return;
    }

    const team = ud.team;
    const sign = TEAM[team].sign;
    const roles = team === 1 ? roles1 : roles2;
    let targetX = ud.homeX;
    let targetZ = ud.homeZ;
    const distToBall = p.position.distanceTo(ballState.pos);

    if (ud.role === 'keeper') {
      // Keeper AI with three behaviors:
      //   A. SHOT INCOMING — predict where the ball crosses the goal line and lunge there.
      //   B. THREAT IN BOX — pounce on loose balls or step out to challenge an inbox carrier.
      //   C. POSITION — stand on the shot-blocking line between ball and goal center, slightly off the line.
      const ownGoalZ = ud.homeZ;
      const sign = TEAM[team].sign;

      // (A) Predict shot trajectory: if ball is moving toward our goal, find where it crosses the goal line.
      let predictedSave = false;
      let predictX = 0;
      const bvz = ballState.vel.z;
      const towardGoal = (sign === +1) ? (bvz > 0.5) : (bvz < -0.5);
      if (towardGoal) {
        const tToGoal = (ownGoalZ - ballState.pos.z) / bvz;
        if (tToGoal > 0 && tToGoal < 1.8) {
          predictX = ballState.pos.x + ballState.vel.x * tToGoal;
          // Only count as a save target if it's roughly going on-goal or close-side.
          if (Math.abs(predictX) < PITCH.GOAL_W + 1.5) {
            predictedSave = true;
          }
        }
      }

      // (B) In-box pounce: loose ball or opponent carrier inside our box → keeper closes the distance.
      const inOurBox = Math.abs(ballState.pos.z - ownGoalZ) < 5 && Math.abs(ballState.pos.x) < PITCH.GOAL_W + 2;
      const oppCarrierInBox = game.ballOwner && game.ballOwner.userData.team !== team && inOurBox;
      const looseInBox = !game.ballOwner && inOurBox;

      if (predictedSave) {
        // Lunge to the predicted crossing point on a line just in front of the goal line.
        targetX = THREE.MathUtils.clamp(predictX, -PITCH.GOAL_W + 0.4, PITCH.GOAL_W - 0.4);
        targetZ = ownGoalZ + sign * 0.6;
        ud.savingShot = true;
      } else if (looseInBox || oppCarrierInBox) {
        // Direct pursuit inside the box.
        targetX = ballState.pos.x;
        targetZ = ballState.pos.z;
        ud.savingShot = false;
      } else {
        // (C) Stand on the angle-blocking line.
        const ballToGoalDx = ballState.pos.x - 0;
        const ballToGoalDz = ballState.pos.z - ownGoalZ;
        const ballToGoalLen = Math.hypot(ballToGoalDx, ballToGoalDz) || 1;
        const approach = THREE.MathUtils.clamp(1 - (Math.abs(ballState.pos.z - ownGoalZ) / 18), 0, 1);
        const stepOut = approach * 2.8;   // step out a bit more aggressively than before
        const ux = ballToGoalDx / ballToGoalLen;
        const uz = ballToGoalDz / ballToGoalLen;
        targetX = THREE.MathUtils.clamp(ux * stepOut, -PITCH.GOAL_W + 0.5, PITCH.GOAL_W - 0.5);
        targetZ = ownGoalZ + uz * stepOut;
        ud.savingShot = false;
      }
    } else if (roles.chaser === p) {
      // Chaser: pursue the ball, lead it a little based on its velocity.
      targetX = ballState.pos.x + ballState.vel.x * 0.18;
      targetZ = ballState.pos.z + ballState.vel.z * 0.18;
    } else {
      // Supporter: go to assigned slot, but keep some home-position pull so we don't collapse to the ball.
      const slot = roles.assignments && roles.assignments.get(p);
      if (slot) {
        targetX = slot.x * 0.7 + ud.homeX * 0.3;
        targetZ = slot.z * 0.75 + ud.homeZ * 0.25;
      } else {
        targetX = ud.homeX * 0.6 + ballState.pos.x * 0.25;
        targetZ = ud.homeZ * 0.6 + ballState.pos.z * 0.2;
      }
    }

    const dx = targetX - p.position.x;
    const dz = targetZ - p.position.z;
    const dist = Math.hypot(dx, dz);
    let speed = (ud.role === 'keeper') ? 6.5 : 6.5;
    // Keeper diving for a predicted save → big speed boost so they can actually reach the corner.
    if (ud.role === 'keeper' && ud.savingShot) speed = 11.5;
    // Chasers move a hair faster than supporters so they actually reach the ball.
    if (roles.chaser === p && ud.role !== 'keeper') speed = 7.2;
    // Outlet run: when our keeper has the ball, field players sprint to their open positions.
    if (roles.keeperHasBall && ud.role !== 'keeper' && roles.chaser !== p) speed = 8.5;
    if (dist > 0.3) {
      const nx = dx / dist, nz = dz / dist;
      ud.vel.x = nx * speed;
      ud.vel.z = nz * speed;
      ud.targetYaw = Math.atan2(nx, nz);
    } else {
      ud.vel.x *= 0.6; ud.vel.z *= 0.6;
    }

    // AI keeper possession (either team): clear the ball QUICKLY before pressure arrives.
    // Track a per-keeper hold timer that counts up while they have the ball. After ~0.4–0.8s they
    // commit to a release (smart pass to an open teammate if possible, otherwise a long punt upfield).
    if (ud.role === 'keeper' && game.ballOwner === p) {
      ud.keeperHoldTimer = (ud.keeperHoldTimer || 0) + dt;

      // If an opponent is dangerously close, release IMMEDIATELY.
      let nearestOppD = Infinity;
      players.forEach(o => {
        if (o.userData.team === team) return;
        const d = Math.hypot(o.position.x - p.position.x, o.position.z - p.position.z);
        if (d < nearestOppD) nearestOppD = d;
      });
      const urgent = nearestOppD < 3.5;
      const releaseAt = urgent ? 0.15 : 0.55;   // panicked clears go almost instantly

      if (ud.keeperHoldTimer >= releaseAt) {
        // Find the best open teammate using lane-clearance + openness + forward progress.
        let best = null, bestScore = -Infinity;
        players.forEach(q => {
          if (q.userData.team !== team || q === p || q.userData.role === 'keeper') return;
          const forward = (q.position.z - p.position.z) * sign;
          if (forward < -1) return;             // keeper always plays forward

          // Openness
          let openness = Infinity;
          players.forEach(o => {
            if (o.userData.team === team) return;
            const d = Math.hypot(o.position.x - q.position.x, o.position.z - q.position.z);
            if (d < openness) openness = d;
          });
          openness = Math.min(openness, 12);

          // Lane clearance
          const dx = q.position.x - p.position.x, dz = q.position.z - p.position.z;
          const L = Math.hypot(dx, dz) || 1;
          if (L < 4 || L > 30) return;
          const nx = dx / L, nz = dz / L;
          let laneClear = Infinity;
          for (const o of players) {
            if (o.userData.team === team) continue;
            const ox = o.position.x - p.position.x, oz = o.position.z - p.position.z;
            const proj = ox * nx + oz * nz;
            if (proj < 0 || proj > L) continue;
            const perp = Math.abs(ox * (-nz) + oz * nx);
            if (perp < laneClear) laneClear = perp;
          }
          laneClear = Math.min(laneClear, 6);
          if (laneClear < 1.0) return;          // skip blocked lanes

          const score = forward * 1.1 + openness * 1.5 + laneClear * 1.8 - L * 0.05;
          if (score > bestScore) { bestScore = score; best = q; }
        });

        if (best && bestScore > 3) {
          // Smart outlet pass — lead receiver based on flight time.
          const flatDist0 = best.position.distanceTo(p.position);
          const passSpeed = THREE.MathUtils.clamp(flatDist0 * 1.6 + 6, 14, 26);
          const eta = flatDist0 / Math.max(8, passSpeed * 0.65);
          const tx = best.position.x + best.userData.vel.x * eta;
          const tz = best.position.z + best.userData.vel.z * eta;
          const dir = new THREE.Vector3(tx - p.position.x, 0.22, tz - p.position.z).normalize();
          const flatDist = Math.hypot(tx - p.position.x, tz - p.position.z);
          kickBall(dir, THREE.MathUtils.clamp(flatDist * 1.6 + 6, 14, 26));
          ud.kickPhase = 0.3;
          fx.pass();
          // Predict-switch control: when our team's keeper passes to a teammate, immediately
          // hand the human control of the intended receiver so they can collect and continue.
          if (team === 1 && best.userData.role !== 'keeper') {
            game.controlled = best;
          }
        } else {
          // No good outlet → long punt straight upfield, slight randomization.
          const dir = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            0.55,
            sign
          ).normalize();
          kickBall(dir, 28);
          ud.kickPhase = 0.4;
          fx.kick();
          // Long punt has no clear receiver — instead, hand control to the most-forward team-1 field
          // player who's roughly under the flight path so the human can fight for the ball.
          if (team === 1) {
            let target = null, bestZ = -Infinity;
            players.forEach(q => {
              if (q.userData.team !== 1 || q.userData.role === 'keeper') return;
              // sign === +1 for team1 (attacks +Z), so most-forward = highest z
              if (q.position.z > bestZ) { bestZ = q.position.z; target = q; }
            });
            if (target) game.controlled = target;
          }
        }
        ud.keeperHoldTimer = 0;
      }
    } else if (ud.role === 'keeper') {
      // Keeper doesn't have ball → reset hold timer so the next save starts fresh.
      ud.keeperHoldTimer = 0;
    }

    // AI possession (team 2): decide each frame to shoot, pass, or dribble.
    if (team === 2 && game.ballOwner === p) {
      const aimZ = PITCH.H * sign;
      const distGoal = Math.hypot(p.position.x, p.position.z - aimZ);
      // Is an opponent right on top of us? Then pass is much more attractive.
      let nearestOppD = Infinity;
      players.forEach(o => {
        if (o.userData.team === team) return;
        const d = Math.hypot(o.position.x - p.position.x, o.position.z - p.position.z);
        if (d < nearestOppD) nearestOppD = d;
      });
      const pressured = nearestOppD < 2.5;

      // Shoot when in range AND not blocked by a defender on the line.
      let shotLaneClear = true;
      if (distGoal < 15 && Math.abs(p.position.x) < 11) {
        const sdx = 0 - p.position.x, sdz = aimZ - p.position.z;
        const sL = Math.hypot(sdx, sdz) || 1;
        const sx = sdx / sL, sz = sdz / sL;
        for (const o of players) {
          if (o.userData.team === team) continue;
          if (o.userData.role === 'keeper') continue; // keeper is the shot challenge, allow shot
          const ox = o.position.x - p.position.x, oz = o.position.z - p.position.z;
          const proj = ox * sx + oz * sz;
          if (proj < 0 || proj > sL) continue;
          const perp = Math.abs(ox * (-sz) + oz * sx);
          if (perp < 1.4) { shotLaneClear = false; break; }
        }
      } else {
        shotLaneClear = false;
      }

      if (distGoal < 15 && Math.abs(p.position.x) < 11 && shotLaneClear) {
        const dir = new THREE.Vector3(
          (Math.random()-0.5)*3 - p.position.x,
          1.2,
          aimZ - p.position.z
        ).normalize();
        kickBall(dir, 24);
        ud.kickPhase = 0.35;
        fx.kick();
      } else {
        // Evaluate pass candidates using lane clearance + openness + forward progress.
        let best = null, bestScore = -Infinity;
        players.forEach(q => {
          if (q.userData.team !== team || q === p || q.userData.role === 'keeper') return;
          const forward = (q.position.z - p.position.z) * sign;
          if (forward < -2) return; // avoid heavy backward passes

          // Openness around the receiver
          let openness = Infinity;
          players.forEach(o => {
            if (o.userData.team === team) return;
            const d = Math.hypot(o.position.x - q.position.x, o.position.z - q.position.z);
            if (d < openness) openness = d;
          });
          openness = Math.min(openness, 10);

          // Pass lane: perpendicular distance of any opponent from the pass segment
          const dx = q.position.x - p.position.x, dz = q.position.z - p.position.z;
          const L = Math.hypot(dx, dz) || 1;
          if (L < 3 || L > 26) return;
          const nx = dx / L, nz = dz / L;
          let laneClear = Infinity;
          for (const o of players) {
            if (o.userData.team === team) continue;
            const ox = o.position.x - p.position.x, oz = o.position.z - p.position.z;
            const proj = ox * nx + oz * nz;
            if (proj < 0 || proj > L) continue;
            const perp = Math.abs(ox * (-nz) + oz * nx);
            if (perp < laneClear) laneClear = perp;
          }
          laneClear = Math.min(laneClear, 6);
          // Reject passes whose lane is clearly blocked
          if (laneClear < 0.9) return;

          const score = forward * 1.2 + openness * 1.4 + laneClear * 1.5 - L * 0.1;
          if (score > bestScore) { bestScore = score; best = q; }
        });

        // Pass probability rises with how good the option is and how pressured we are.
        // Threshold lowered a lot from the old version so passing is genuinely an option.
        const passChance = (pressured ? 0.18 : 0.06) * Math.min(1, bestScore / 12);
        if (best && Math.random() < passChance && bestScore > 4) {
          // Lead the receiver based on velocity AND a fraction of expected travel time.
          // Pass speed is roughly proportional to distance; ETA ≈ flatDist / (power * 0.5)
          const flatDist0 = best.position.distanceTo(p.position);
          const eta = THREE.MathUtils.clamp(flatDist0 / 16, 0.18, 0.6);
          const tx = best.position.x + best.userData.vel.x * eta;
          const tz = best.position.z + best.userData.vel.z * eta;
          const dir = new THREE.Vector3(tx - p.position.x, 0.2, tz - p.position.z).normalize();
          const flatDist = Math.hypot(tx - p.position.x, tz - p.position.z);
          kickBall(dir, THREE.MathUtils.clamp(flatDist * 1.6 + 4, 12, 24));
          ud.kickPhase = 0.25;
          fx.pass();
          // Slight cooldown so we don't immediately re-pass
          ud.tackleCooldown = Math.max(ud.tackleCooldown, 0.4);
        }
      }
    }
  });
}

// ============== Ball interactions ==============
function kickBall(dir, power) {
  ballState.vel.copy(dir).multiplyScalar(power);
  if (ballState.vel.y < 0) ballState.vel.y = Math.abs(ballState.vel.y);
  // The team that just kicked is the last to touch the ball — used to decide throw-in / goal-kick awards.
  if (game.ballOwner) game.lastTouchTeam = game.ballOwner.userData.team;
  game.ballOwner = null;
  game.ballOwnerCooldown = 0.3;
}

function tryKick(power = 24) {
  if (!game.controlled) return;
  const p = game.controlled;
  const sign = TEAM[p.userData.team].sign;
  const goalPos = new THREE.Vector3(0, 1.2, PITCH.H * sign);
  const toGoal = new THREE.Vector3().subVectors(goalPos, p.position);
  const distGoal = toGoal.length();
  const facing = new THREE.Vector3(Math.sin(p.rotation.y), 0, Math.cos(p.rotation.y));
  const goalBias = THREE.MathUtils.clamp(1 - distGoal / 16, 0, 0.55);
  const dir = new THREE.Vector3()
    .addScaledVector(facing, 1 - goalBias)
    .addScaledVector(toGoal.normalize(), goalBias);
  dir.y = 0.35;
  dir.normalize();
  kickBall(dir, power);
  p.userData.kickPhase = 0.35;
  fx.kick();
}

function tryPass() {
  if (!game.controlled) return;
  const p = game.controlled;
  const team = p.userData.team;
  const sign = TEAM[team].sign;

  // Score each teammate by: forwardness + openness + clear pass lane. Reject lane-blocked passes outright.
  let best = null, bestScore = -Infinity;
  players.forEach(q => {
    if (q.userData.team !== team || q === p) return;
    // Allow passing to the keeper too — but heavily penalise so it only happens when no field option exists.
    const isKeeper = q.userData.role === 'keeper';
    const dist = q.position.distanceTo(p.position);
    if (dist < 2 || dist > 28) return;
    const forward = (q.position.z - p.position.z) * sign;

    // Openness around receiver
    let openness = Infinity;
    players.forEach(o => {
      if (o.userData.team === team) return;
      const d = Math.hypot(o.position.x - q.position.x, o.position.z - q.position.z);
      if (d < openness) openness = d;
    });
    openness = Math.min(openness, 12);

    // Pass lane clearance — perpendicular distance of nearest opponent to ball→receiver segment
    const dx = q.position.x - p.position.x, dz = q.position.z - p.position.z;
    const L = Math.hypot(dx, dz) || 1;
    const nx = dx / L, nz = dz / L;
    let laneClear = Infinity;
    for (const o of players) {
      if (o.userData.team === team) continue;
      const ox = o.position.x - p.position.x, oz = o.position.z - p.position.z;
      const proj = ox * nx + oz * nz;
      if (proj < 0.3 || proj > L - 0.3) continue;
      const perp = Math.abs(ox * (-nz) + oz * nx);
      if (perp < laneClear) laneClear = perp;
    }
    laneClear = Math.min(laneClear, 6);

    let score = forward * 1.4 + openness * 1.6 + laneClear * 1.8 - dist * 0.1;
    if (isKeeper) score -= 8;            // strong penalty — keeper is a fallback only
    if (laneClear < 0.6 && !isKeeper) return;  // skip clearly blocked field passes

    if (score > bestScore) { bestScore = score; best = q; }
  });
  if (!best) return;

  // Lead the receiver: lead amount depends on flight time. We approximate flight as flatDist / passSpeed.
  const flatDist0 = best.position.distanceTo(p.position);
  const passSpeed = THREE.MathUtils.clamp(flatDist0 * 1.8 + 4, 12, 26);
  const eta = flatDist0 / Math.max(8, passSpeed * 0.65); // travel time estimate (seconds)
  const tx = best.position.x + best.userData.vel.x * eta;
  const tz = best.position.z + best.userData.vel.z * eta;
  const flatDist = Math.hypot(tx - p.position.x, tz - p.position.z);
  const dir = new THREE.Vector3(tx - p.position.x, 0.16, tz - p.position.z).normalize();
  const power = THREE.MathUtils.clamp(flatDist * 1.8 + 4, 12, 26);
  kickBall(dir, power);
  // Shorter cooldown for passes so the receiver can pick it up cleanly.
  game.ballOwnerCooldown = 0.18;
  p.userData.kickPhase = 0.25;
  fx.pass();

  // Predict-switch control to the intended receiver immediately so the player feels in command.
  if (best.userData.team === 1 && best.userData.role !== 'keeper') {
    game.controlled = best;
  }
}

// ============== Updates ==============

function updateControlledPlayer(dt) {
  if (!game.controlled || game.state !== 'play') return;

  const p = game.controlled;
  const ud = p.userData;

  // Staggered or frozen: ignore movement input.
  if (ud.stagger > 0 || ud.frozen > 0) {
    ud.vel.x *= 0.85;
    ud.vel.z *= 0.85;
    // Still drain the action-press buffers so they don't fire when the player un-stuns.
    input.consumeShoot();
    input.consumePass();
    return;
  }

  // Camera is at -Z looking toward +Z. Screen-up (joystick.y < 0) should push player to +Z (away from camera).
  // Screen-right (joystick.x > 0) should push player to -X because the camera is mirrored about Z.
  const mx = -input.move.x;
  const mz = -input.move.y;
  const speed = 9;
  const mag = Math.hypot(mx, mz);
  if (mag > 0.1) {
    ud.vel.x = mx * speed;
    ud.vel.z = mz * speed;
    ud.targetYaw = Math.atan2(mx, mz);
  } else {
    ud.vel.x *= 0.5; ud.vel.z *= 0.5;
  }

  // Shoot / pass: only fires when our controlled player actually has the ball.
  // Otherwise we just drain the input so it doesn't fire stale on the next possession.
  const hasBall = game.ballOwner === p;
  if (input.consumeShoot()) {
    if (hasBall) tryKick(26);
  }
  if (input.consumePass()) {
    if (hasBall) tryPass();
  }
}

function integratePlayer(p, dt) {
  const ud = p.userData;

  // Frozen players don't move at all and bleed their velocity to zero.
  if (ud.frozen > 0) {
    ud.frozen -= dt;
    ud.vel.x = 0; ud.vel.z = 0;
    if (ud.frostBox) ud.frostBox.material.opacity = Math.min(0.55, ud.frostBox.material.opacity + dt * 4);
  } else if (ud.frostBox && ud.frostBox.material.opacity > 0) {
    ud.frostBox.material.opacity = Math.max(0, ud.frostBox.material.opacity - dt * 3);
  }

  // Modifier-driven speed and friction.
  const speedMul = modifiers.getSpeedMultiplier(p);
  const frictionMul = modifiers.getFrictionMultiplier(); // <1 = icy (less deceleration)

  // Apply per-player friction differently for the controlled vs. AI:
  // On ice we keep momentum (apply less per-frame decay even when no input).
  // The AI sets target velocities directly each frame, so for AI we just scale by speed multiplier.
  // For the human (controlled), updateControlledPlayer already sets vel from input; we apply ice drag here.
  if (frictionMul < 1.0) {
    // Icy: keep most momentum even when AI/human tries to stop.
    const keep = 1 - (1 - frictionMul) * 0; // no extra drag tweak needed here
    // (No-op: rely on integratePlayer's natural lack of damping when input is held)
    // But we should resist directional change: blend current vel toward target less aggressively.
    // (Implemented effectively by speedMul + the existing input code; left as a hook.)
  }

  // Apply per-frame velocity (with speed multiplier)
  p.position.x += ud.vel.x * speedMul * dt;
  p.position.z += ud.vel.z * speedMul * dt;
  p.position.x = THREE.MathUtils.clamp(p.position.x, -PITCH.W + 0.5, PITCH.W - 0.5);
  p.position.z = THREE.MathUtils.clamp(p.position.z, -PITCH.H - 0.3, PITCH.H + 0.3);

  // Tick possession grace (used to prevent instant re-tackles after gaining the ball)
  if (ud.postPossessGrace > 0) ud.postPossessGrace -= dt;

  let diff = ud.targetYaw - p.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  p.rotation.y += diff * Math.min(1, dt * 12);

  const sp = Math.hypot(ud.vel.x, ud.vel.z) * speedMul;
  ud.walkPhase += sp * dt * 0.6;
  const swing = Math.sin(ud.walkPhase * 2) * Math.min(0.5, sp * 0.06);
  ud.parts.lLeg.rotation.x = swing;
  ud.parts.rLeg.rotation.x = -swing;
  ud.parts.lArm.rotation.x = -swing * 0.8;
  ud.parts.rArm.rotation.x = swing * 0.8;
  // small bob (none when frozen)
  p.position.y = ud.frozen > 0 ? 0 : Math.abs(Math.sin(ud.walkPhase * 2)) * Math.min(0.12, sp * 0.015);

  if (ud.kickPhase > 0) {
    const k = ud.kickPhase / 0.35;
    ud.parts.rLeg.rotation.x = -k * 2.2;
    ud.kickPhase -= dt;
  }

  if (p === game.controlled) {
    // Pulse the ring slightly for visual life
    const pulse = 0.7 + Math.sin(performance.now() * 0.008) * 0.15;
    ud.ring.material.opacity = pulse;
  } else {
    ud.ring.material.opacity *= 0.88;
  }
}

function updateBall(dt) {
  ballState.vel.y -= 22 * dt;
  ballState.pos.addScaledVector(ballState.vel, dt);

  if (ballState.pos.y < BALL_RADIUS) {
    ballState.pos.y = BALL_RADIUS;
    if (ballState.vel.y < -3) fx.bounce();
    ballState.vel.y = -ballState.vel.y * 0.55;
    ballState.vel.x *= 0.985;
    ballState.vel.z *= 0.985;
  }
  // Icy field reduces ball ground drag dramatically (ball slides longer).
  const ballDrag = modifiers.getBallDragMultiplier();
  ballState.vel.multiplyScalar(1 - (1 - 0.998) * ballDrag);

  // --- Touch lines (sides X): instant clean handoff. ---
  // Throw-in goes to whoever DIDN'T touch the ball last. Spawn the ball right at the spot it went out
  // so the restart is clearly tied to the location.
  if (game.state === 'play' && Math.abs(ballState.pos.x) > PITCH.W - 0.1) {
    const lastTouch = game.lastTouchTeam;
    // If we somehow have no touch history, default to giving it to the team furthest from it (rare).
    const awardTeam = lastTouch === 1 ? 2 : (lastTouch === 2 ? 1 : 2);
    const tx = Math.sign(ballState.pos.x) * (PITCH.W - 1.2);
    const tz = THREE.MathUtils.clamp(ballState.pos.z, -PITCH.H + 3, PITCH.H - 3);
    awardPossessionAt('THROW IN', awardTeam, tx, tz);
    return;
  }

  // --- Goals / back walls: score, or hand off if it crosses the byline outside the goal. ---
  if (Math.abs(ballState.pos.z) > PITCH.H) {
    const insideGoalX = Math.abs(ballState.pos.x) < PITCH.GOAL_W - 0.15;
    const insideGoalY = ballState.pos.y < PITCH.GOAL_H - 0.15;
    if (insideGoalX && insideGoalY && game.state === 'play') {
      const scorer = ballState.pos.z > 0 ? 1 : 2;
      onGoal(scorer);
      return;
    } else if (game.state === 'play') {
      // Out over the byline. Whoever last touched it concedes — the OTHER team gets the restart at the spot.
      // If the attacker put it out: defending team gets a goal kick at their goal area.
      // If the defender put it out: attacking team gets it near the corner (we don't model true corners,
      // so we award it at the corner-ish spot, ahead of the goal line, for clarity and fairness).
      const lastTouch = game.lastTouchTeam;
      const goalAtPlusZ = ballState.pos.z > 0;        // ball went out at +Z end (team 2's goal)
      const defendingTeam = goalAtPlusZ ? 2 : 1;
      const attackingTeam = defendingTeam === 1 ? 2 : 1;
      const awardTeam = (lastTouch === attackingTeam) ? defendingTeam : attackingTeam;

      if (awardTeam === defendingTeam) {
        // Goal kick: spawn near the awarded team's own goal box.
        const sign = TEAM[awardTeam].sign;
        const ownGoalZ = -sign * PITCH.H;
        awardPossessionAt('GOAL KICK', awardTeam, THREE.MathUtils.clamp(ballState.pos.x * 0.3, -6, 6), ownGoalZ + sign * 5);
      } else {
        // Corner-ish: spawn near where the ball went out, on the attacker's side near the byline.
        const cornerX = Math.sign(ballState.pos.x || 1) * (PITCH.W - 4);
        const cornerZ = Math.sign(ballState.pos.z) * (PITCH.H - 3);
        awardPossessionAt('CORNER', awardTeam, cornerX, cornerZ);
      }
      return;
    } else {
      // Not in play (e.g. mid-celebration) - just clamp.
      ballState.pos.z = Math.sign(ballState.pos.z) * PITCH.H;
      ballState.vel.z *= -0.5;
    }
  }

  if (game.ballOwnerCooldown > 0) game.ballOwnerCooldown -= dt;

  // --- Possession & tackling ---
  // The current owner gets a small grace radius and "stickiness" so possession doesn't flicker frame-to-frame
  // in a scrum. Opponents need to win a tackle (probabilistic, with cooldowns) to take the ball.
  const owner = game.ballOwner;
  if (owner) game.ballOwnerStickTime += dt;

  // Find candidates near the ball (sorted by distance).
  const near = [];
  players.forEach(p => {
    if (p.userData.stagger > 0) return;
    const d = Math.hypot(p.position.x - ballState.pos.x, p.position.z - ballState.pos.z);
    if (d < 2.2 && ballState.pos.y < 1.5) near.push({ p, d });
  });
  near.sort((a, b) => a.d - b.d);

  if (game.ballOwnerCooldown <= 0) {
    if (owner && owner.userData.stagger <= 0 && owner.userData.frozen <= 0) {
      // Owner keeps the ball unless an opponent successfully tackles.
      // Tackle is gated by: tackler not on cooldown, owner not in post-possess grace, owner not staggered.
      let tackler = null;
      if (owner.userData.postPossessGrace <= 0) {
        for (const { p, d } of near) {
          if (p.userData.team !== owner.userData.team &&
              p.userData.tackleCooldown <= 0 &&
              p.userData.stagger <= 0 &&
              p.userData.frozen <= 0 &&
              d < 1.15) {
            tackler = p;
            break;
          }
        }
      }
      // Keepers in their own box are uncatchable — opponents can't tackle a goalie holding the ball
      // inside the goal area. Encourages clean clears and stops the "keeper instantly stolen from" bug.
      const ownerIsKeeperInBox = owner.userData.role === 'keeper' &&
        Math.abs(ballState.pos.z - owner.userData.homeZ) < 6 &&
        Math.abs(ballState.pos.x) < PITCH.GOAL_W + 3;
      if (ownerIsKeeperInBox) tackler = null;

      if (tackler) {
        // Probability of winning the tackle: higher if owner is slow / just got the ball, lower if dribbling fast.
        const ownerSpeed = Math.hypot(owner.userData.vel.x, owner.userData.vel.z);
        const dx = ballState.pos.x - tackler.position.x;
        const dz = ballState.pos.z - tackler.position.z;
        const dlen = Math.hypot(dx, dz) || 1;
        const ndx = dx / dlen, ndz = dz / dlen;
        const approach = (tackler.userData.vel.x * ndx + tackler.userData.vel.z * ndz);
        let baseChance = 0.5 + Math.max(0, approach) * 0.04 - Math.min(0.15, ownerSpeed * 0.012);
        // Keepers are sticky-handed: very hard to tackle even outside the box.
        if (owner.userData.role === 'keeper') baseChance -= 0.35;
        const stick = Math.min(0.3, game.ballOwnerStickTime * 0.6);
        const win = Math.random() < (baseChance - stick);

        if (win) {
          // Tackle succeeds: TACKLER takes possession cleanly instead of just kicking the ball loose.
          // This is the main fix for the ping-pong scrum: the ball is no longer a freely-contested
          // object in the middle of two adjacent players each frame.
          ballState.vel.set(0, 0, 0);
          // Place ball at the tackler's feet immediately.
          const facing = new THREE.Vector3(Math.sin(tackler.rotation.y), 0, Math.cos(tackler.rotation.y));
          ballState.pos.set(
            tackler.position.x + facing.x * 0.75,
            BALL_RADIUS,
            tackler.position.z + facing.z * 0.75
          );
          ball.position.copy(ballState.pos);
          game.ballOwner = tackler;
          game.lastTouchTeam = tackler.userData.team;
          game.ballOwnerStickTime = 0;
          // Grace prevents instant counter-tackle from the loser.
          tackler.userData.postPossessGrace = 0.9;
          tackler.userData.tackleCooldown = 0.9;
          tackler.userData.kickPhase = 0.28;
          // The loser is staggered AND knocked back so they don't stand on the ball.
          owner.userData.stagger = 0.7;
          owner.userData.tackleCooldown = 1.1;
          owner.userData.vel.x = -ndx * 4;
          owner.userData.vel.z = -ndz * 4;
          // Physically separate them so they aren't overlapping (this also breaks the chain).
          owner.position.x -= ndx * 0.6;
          owner.position.z -= ndz * 0.6;
          game.shake = Math.min(1.2, game.shake + 0.7);
          fx.tackle();
          if (tackler.userData.team === 1 && tackler.userData.role !== 'keeper') {
            game.controlled = tackler;
          }
        } else {
          // Failed tackle: tackler bounces off and is locked out for a beat.
          tackler.userData.stagger = 0.4;
          tackler.userData.tackleCooldown = 0.9;
          tackler.userData.vel.x = -ndx * 3;
          tackler.userData.vel.z = -ndz * 3;
          // Separate physically.
          tackler.position.x -= ndx * 0.4;
          tackler.position.z -= ndz * 0.4;
        }
      }

      // Owner glues ball to their feet (visual + physics) — unless we just lost it above.
      if (game.ballOwner === owner) {
        const facing = new THREE.Vector3(Math.sin(owner.rotation.y), 0, Math.cos(owner.rotation.y));
        let tx = owner.position.x + facing.x * 0.75;
        let tz = owner.position.z + facing.z * 0.75;
        // Safety: never glue the ball *past* the keeper's own goal line — otherwise a keeper
        // facing their own net briefly drags the ball into the goal for an own-goal.
        if (owner.userData.role === 'keeper') {
          const ownSign = TEAM[owner.userData.team].sign;
          const ownGoalZ = -ownSign * PITCH.H;     // team1's own goal at -Z, team2's at +Z
          // Clamp so the ball stays at least 1.5 units in front of own goal line.
          if (ownSign > 0 && tz < ownGoalZ + 1.5) tz = ownGoalZ + 1.5;
          if (ownSign < 0 && tz > ownGoalZ - 1.5) tz = ownGoalZ - 1.5;
        }
        const target = new THREE.Vector3(tx, BALL_RADIUS, tz);
        ballState.pos.lerp(target, Math.min(1, dt * 14));
        const speedMul = modifiers.getSpeedMultiplier(owner);
        const sp = Math.hypot(owner.userData.vel.x, owner.userData.vel.z) * speedMul;
        ballState.vel.x = facing.x * sp;
        ballState.vel.z = facing.z * sp;
        ballState.vel.y = Math.max(0, ballState.vel.y);
      }
    } else {
      // No owner: nearest valid player within capture radius gains possession (with grace).
      const cand = near.find(c => c.p.userData.frozen <= 0 && c.p.userData.stagger <= 0);
      // Scared ball: tighter capture radius so the ball can flee a bit before being grabbed.
      // Keepers get a noticeably wider capture radius so they can actually pluck shots out of the air.
      let captureR = (modifiers.active && modifiers.active.id === 'scared') ? 0.75 : 0.95;
      if (cand && cand.p.userData.role === 'keeper') captureR = 1.6;
      if (cand && cand.d < captureR) {
        game.ballOwner = cand.p;
        game.lastTouchTeam = cand.p.userData.team;
        game.ballOwnerStickTime = 0;
        // Keepers get a much longer grace right after a save so the human can collect themselves.
        cand.p.userData.postPossessGrace = cand.p.userData.role === 'keeper' ? 1.5 : 0.6;
        if (cand.p.userData.team === 1) {
          if (cand.p.userData.role !== 'keeper') {
            // Field receiver — give the human direct control.
            game.controlled = cand.p;
          } else {
            // Our keeper made a save. The human can't control the keeper, so park control on the
            // most-forward field player on the wing — that's the most likely outlet receiver.
            // This way when the keeper passes upfield, the human is already there.
            let target = null, bestZ = -Infinity;
            players.forEach(q => {
              if (q.userData.team !== 1 || q.userData.role === 'keeper') return;
              if (q.userData.stagger > 0 || q.userData.frozen > 0) return;
              if (q.position.z > bestZ) { bestZ = q.position.z; target = q; }
            });
            if (target) game.controlled = target;
          }
        }
      } else {
        // Ball is loose. Auto-switch control to nearest team-1 field player only when input is idle.
        if (game.state === 'play') {
          let closestT1 = null, cd = Infinity;
          players.forEach(p => {
            if (p.userData.team !== 1 || p.userData.role === 'keeper' || p.userData.frozen > 0) return;
            const d = p.position.distanceTo(ballState.pos);
            if (d < cd) { cd = d; closestT1 = p; }
          });
          if (closestT1 && game.controlled !== closestT1 &&
              Math.hypot(input.move.x, input.move.y) < 0.15) {
            game.controlled = closestT1;
          }
        }
      }
    }
  }

  // visual ball roll
  const ballMesh = ball.children[0];
  if (ballMesh) {
    const speed = Math.hypot(ballState.vel.x, ballState.vel.z);
    if (speed > 0.05) {
      const axis = new THREE.Vector3(-ballState.vel.z, 0, ballState.vel.x).normalize();
      ballMesh.rotateOnWorldAxis(axis, speed * dt / BALL_RADIUS);
    }
  }

  ball.position.copy(ballState.pos);
}

function onGoal(team) {
  game.state = 'goal';
  game.score[team]++;
  updateScoreUI();
  fx.goal();
  fx.crowd();
  goalText.textContent = team === 1 ? 'GOAL!' : 'CONCEDED!';
  goalText.style.color = team === 1 ? '' : '#2ec3ff';
  goalScreen.classList.remove('hidden');
  game.goalCelebrate = 1.0;
  setTimeout(() => {
    goalScreen.classList.add('hidden');
    if (game.time <= 0) {
      finishMatch();
    } else {
      resetPositions();
      game.state = 'kickoff';
      setTimeout(() => {
        if (game.state === 'kickoff') {
          game.state = 'play';
          fx.whistle();
        }
      }, 700);
    }
  }, 1800);
}

// ============== Out-of-bounds: instant clean possession handoff ==============
// Place the ball at exactly (x, z), pick the closest non-keeper player on the awarded team as the
// taker, and resume play immediately. Brief banner + single whistle. The human only takes control
// if team 1 is awarded; otherwise the AI keeps it and the human's controlled player is updated below
// by the normal auto-switch rules.
function awardPossessionAt(bannerLabel, team, x, z) {
  const sign = TEAM[team].sign;
  // Clamp the placement so we never spawn off-pitch.
  const spawnX = THREE.MathUtils.clamp(x, -PITCH.W + 1.2, PITCH.W - 1.2);
  const spawnZ = THREE.MathUtils.clamp(z, -PITCH.H + 1.2, PITCH.H - 1.2);

  // Pick the closest non-keeper field player on the awarded team to be the taker.
  let taker = null, bestD = Infinity;
  players.forEach(p => {
    if (p.userData.team !== team || p.userData.role === 'keeper') return;
    const d = Math.hypot(p.position.x - spawnX, p.position.z - spawnZ);
    if (d < bestD) { bestD = d; taker = p; }
  });
  if (!taker) return;

  // Place the taker right behind the ball, facing the attacking direction.
  taker.position.set(spawnX, 0, spawnZ - sign * 0.75);
  taker.userData.vel.set(0, 0, 0);
  taker.userData.stagger = 0;
  taker.userData.frozen = 0;
  taker.userData.tackleCooldown = 0.4;
  taker.userData.postPossessGrace = 1.2; // generous grace so they can dribble out cleanly
  taker.userData.targetYaw = team === 1 ? 0 : Math.PI;
  taker.rotation.y = taker.userData.targetYaw;

  // Place ball at the taker's feet and give them possession.
  ballState.vel.set(0, 0, 0);
  const facing = new THREE.Vector3(Math.sin(taker.rotation.y), 0, Math.cos(taker.rotation.y));
  ballState.pos.set(
    taker.position.x + facing.x * 0.75,
    BALL_RADIUS,
    taker.position.z + facing.z * 0.75
  );
  ball.position.copy(ballState.pos);
  game.ballOwner = taker;
  game.lastTouchTeam = team;
  game.ballOwnerCooldown = 0;
  game.ballOwnerStickTime = 0;

  // Only hand the human direct control if it's their team's restart.
  if (team === 1) game.controlled = taker;

  // Brief whistle + banner.
  fx.whistle();
  showSetpieceBanner(bannerLabel);
}

function showSetpieceBanner(label) {
  if (!setpieceBanner || !setpieceText) return;
  setpieceText.textContent = label;
  setpieceBanner.classList.remove('hidden');
  // Force CSS animation restart
  setpieceBanner.style.animation = 'none';
  // eslint-disable-next-line no-unused-expressions
  setpieceBanner.offsetHeight;
  setpieceBanner.style.animation = '';
  clearTimeout(showSetpieceBanner._t);
  showSetpieceBanner._t = setTimeout(() => setpieceBanner.classList.add('hidden'), 1400);
}

function finishMatch() {
  game.state = 'end';
  let title = 'FULL TIME', sub = `${game.score[1]} - ${game.score[2]}`;
  if (game.score[1] > game.score[2]) { title = 'YOU WIN!'; sub = `Victory ${game.score[1]} - ${game.score[2]}`; }
  else if (game.score[1] < game.score[2]) { title = 'YOU LOSE'; sub = `Final ${game.score[1]} - ${game.score[2]}`; }
  else { title = 'DRAW'; sub = `Tied ${game.score[1]} - ${game.score[2]}`; }
  endTitle.textContent = title;
  endSub.textContent = sub;
  endScreen.classList.remove('hidden');
  fx.whistle(); setTimeout(()=>fx.whistle(), 220); setTimeout(()=>fx.whistle(), 440);
}

// ============== Camera ==============
const camTarget = new THREE.Vector3(0, 0, 0);
const camOffset = new THREE.Vector3(0, 22, -28);
function updateCamera(dt) {
  const focus = ballState.pos.clone();
  focus.x *= 0.45;
  focus.z = THREE.MathUtils.clamp(focus.z * 0.55, -10, 10);
  camTarget.lerp(focus, Math.min(1, dt * 2.5));
  const desired = camTarget.clone().add(camOffset);
  if (game.goalCelebrate > 0) {
    desired.x += (Math.random() - 0.5) * game.goalCelebrate * 0.8;
    desired.y += (Math.random() - 0.5) * game.goalCelebrate * 0.5;
    game.goalCelebrate -= dt * 1.6;
  }
  if (game.shake > 0) {
    desired.x += (Math.random() - 0.5) * game.shake * 0.5;
    desired.y += (Math.random() - 0.5) * game.shake * 0.3;
    game.shake = Math.max(0, game.shake - dt * 3.5);
  }
  camera.position.lerp(desired, Math.min(1, dt * 4));
  camera.lookAt(camTarget.x, 1, camTarget.z);
}

function updateCrowd(t) {
  const intensity = game.goalCelebrate > 0 ? 0.7 : 0.06;
  crowd.children.forEach(child => {
    if (child.userData.parent) {
      child.position.y = child.userData.parent.position.y + 0.55;
    } else if (child.userData.basY !== undefined) {
      child.position.y = child.userData.basY + Math.abs(Math.sin(t * 4 + child.userData.phase)) * intensity;
    }
  });
}

// ============== Main loop ==============
let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  input.poll();

  // Modifier system pulse-update (also handles per-frame ball forces for scared / black hole).
  modifiers.setOwnerHint(game.ballOwner);
  modifiers.update(dt, game.state);

  if (game.state === 'play') {
    game.time -= dt;
    updateTimerUI();
    if (game.time <= 0) {
      game.time = 0;
      finishMatch();
    }
    updateControlledPlayer(dt);
    aiUpdate(dt);
    players.forEach(p => integratePlayer(p, dt));
    updateBall(dt);
  } else if (game.state === 'kickoff' || game.state === 'goal') {
    aiUpdate(dt);
    players.forEach(p => integratePlayer(p, dt));
    updateBall(dt);
  } else if (game.state === 'title' || game.state === 'end') {
    // Players stand still on title and end screens — render only.
    // Update camera + crowd below for ambient motion.
  } else {
    aiUpdate(dt);
    players.forEach(p => integratePlayer(p, dt));
  }

  // Always update visual ball trail / glow effects
  updateBallVisuals(dt);

  updateCamera(dt);
  updateCrowd(t);
  renderer.render(scene, camera);
}

// Initial demo formation while on title
setupFormation();
selectClosestControlled(1);
requestAnimationFrame(animate);
