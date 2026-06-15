import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Live UI state ─────────────────────────────────────────────────────────────
const ui = {
  render: 'flat',   // 'flat' | 'lit'
  shadows: false,
  walk: true,
  spin: false,
  speed: 5.0,
  light: 0.55,      // master light multiplier (lit mode)
};

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;          // toggled live via light/mesh flags
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d14);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 12, 55);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 10, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 12;
controls.maxDistance = 300;
controls.update();

// ── Lights (created once, intensity scaled by render mode) ────────────────────
const hemi = new THREE.HemisphereLight(0xdde6ff, 0x202028, 0.9);
const amb  = new THREE.AmbientLight(0xffffff, 0.25);
const key  = new THREE.DirectionalLight(0xfff4e0, 1.5);
key.position.set(25, 50, 40);
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far = 200;
key.shadow.camera.top = key.shadow.camera.right = 60;
key.shadow.camera.bottom = key.shadow.camera.left = -60;
key.shadow.bias = -0.0005;
const fill = new THREE.DirectionalLight(0xc8d8ff, 1.1); fill.position.set(-35, 25, 20);
const rim  = new THREE.DirectionalLight(0x9966ff, 0.6); rim.position.set(0, 10, -45);
scene.add(hemi, amb, key, fill, rim);

// Ground + grid (used for shadows / lit look)
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(120, 64),
  new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.95, metalness: 0.1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(120, 60, 0x1e1e2e, 0x181828);
scene.add(grid);

// ── Materials: pre-build BOTH flat + lit variants per color, swap at runtime ──
const flatMat = {}, litMat = {};
function matFor(hex) {
  if (ui.render === 'lit') {
    if (!litMat[hex]) litMat[hex] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex),
      roughness: hex === '#7000F4' ? 0.25 : hex === '#7E7776' ? 0.45 : 0.6,
      metalness: hex === '#7E7776' ? 0.6  : hex === '#7000F4' ? 0.1  : 0.08,
      side: THREE.DoubleSide,
    });
    return litMat[hex];
  }
  if (!flatMat[hex]) flatMat[hex] = new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex), side: THREE.DoubleSide,
  });
  return flatMat[hex];
}

// ── Load mesh data ────────────────────────────────────────────────────────────
const data = await fetch(import.meta.env.BASE_URL + 'codernaught_meshes.json').then(r => r.json());
const { meshes, pivots, bounds } = data;

const modelHeight = bounds.max[1] - bounds.min[1];
const scale = 22 / modelHeight;
const cx = (bounds.min[0] + bounds.max[0]) / 2;
const cyFloor = bounds.min[1];
const cz = (bounds.min[2] + bounds.max[2]) / 2;
const center = v => [v[0] - cx, v[1] - cyFloor, v[2] - cz];

function makeGeo(verts, triangles) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    pos[i*3] = verts[i][0]; pos[i*3+1] = verts[i][1]; pos[i*3+2] = verts[i][2];
  }
  const idx = new Uint32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    idx[i*3] = triangles[i][0]; idx[i*3+1] = triangles[i][1]; idx[i*3+2] = triangles[i][2];
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}

// ── Hierarchy: torso + 2 arms + 2 legs, each child a pivot group ──────────────
const robot = new THREE.Group();
robot.scale.setScalar(scale);
scene.add(robot);

const bodyGroup = new THREE.Group();
robot.add(bodyGroup);

const pivotPos = p => { const c = center(p); return new THREE.Vector3(c[0], c[1], c[2]); };
const rArmPivot = pivotPos(pivots.arm_right);
const lArmPivot = pivotPos(pivots.arm_left);
const rLegPivot = pivotPos(pivots.leg_right);
const lLegPivot = pivotPos(pivots.leg_left);

const armRight = new THREE.Group(); armRight.position.copy(rArmPivot); robot.add(armRight);
const armLeft  = new THREE.Group(); armLeft.position.copy(lArmPivot);  robot.add(armLeft);
const legRight = new THREE.Group(); legRight.position.copy(rLegPivot); robot.add(legRight);
const legLeft  = new THREE.Group(); legLeft.position.copy(lLegPivot);  robot.add(legLeft);

const TARGET = { body: bodyGroup, arm_right: armRight, arm_left: armLeft, leg_right: legRight, leg_left: legLeft };
const PIVOT  = { body: new THREE.Vector3(0,0,0), arm_right: rArmPivot, arm_left: lArmPivot, leg_right: rLegPivot, leg_left: lLegPivot };

const allMeshes = [];
for (const part of meshes) {
  const cverts = part.vertices.map(center);
  const piv = PIVOT[part.group] || PIVOT.body;
  const localVerts = cverts.map(v => [v[0]-piv.x, v[1]-piv.y, v[2]-piv.z]);
  const m = new THREE.Mesh(makeGeo(localVerts, part.triangles), matFor(part.color));
  m.userData.hex = part.color;
  allMeshes.push(m);
  (TARGET[part.group] || bodyGroup).add(m);
}

// ── Apply render mode (materials + lights + shadows) ──────────────────────────
function applyRenderMode() {
  const lit = ui.render === 'lit';
  for (const m of allMeshes) m.material = matFor(m.userData.hex);

  // Lit lights scaled by the master Light dial; flat mode uses pure colors.
  const L = ui.light;
  hemi.intensity = lit ? 0.9 * L : 0.0;
  key.intensity  = lit ? 1.5 * L : 0.0;
  fill.intensity = lit ? 1.1 * L : 0.0;
  rim.intensity  = lit ? 0.6 * L : 0.0;
  amb.intensity  = lit ? 0.4 * L : 1.0;

  renderer.toneMapping = lit ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.3;

  applyShadows();
  ground.visible = lit;
  grid.visible = lit;
}

function applyLight() {
  if (ui.render !== 'lit') return;
  const L = ui.light;
  hemi.intensity = 0.9 * L; key.intensity = 1.5 * L;
  fill.intensity = 1.1 * L; rim.intensity = 0.6 * L; amb.intensity = 0.4 * L;
}

function applyShadows() {
  const on = ui.shadows && ui.render === 'lit';
  key.castShadow = on;
  ground.receiveShadow = on;
  for (const m of allMeshes) { m.castShadow = on; m.receiveShadow = on; }
  renderer.shadowMap.needsUpdate = true;
}

// ── Embed mode: ?embed=1 hides chrome for clean iframe use ────────────────────
const EMBED = new URLSearchParams(location.search).get('embed') === '1';
if (EMBED) {
  const p = document.getElementById('panel'); if (p) p.style.display = 'none';
  const inf = document.getElementById('info'); if (inf) inf.style.display = 'none';
}

// ── UI wiring ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
$('renderMode').value = ui.render;
$('shadows').checked = ui.shadows;
$('walk').checked = ui.walk;
if ($('spin')) $('spin').checked = ui.spin;
$('speed').value = ui.speed; $('speedVal').textContent = ui.speed.toFixed(1);
$('light').value = ui.light; $('lightVal').textContent = ui.light.toFixed(2);
$('shadows').disabled = ui.render !== 'lit';
$('light').disabled = ui.render !== 'lit';

$('renderMode').addEventListener('change', e => {
  ui.render = e.target.value;
  $('shadows').disabled = ui.render !== 'lit';
  $('light').disabled = ui.render !== 'lit';
  applyRenderMode();
});
$('shadows').addEventListener('change', e => { ui.shadows = e.target.checked; applyShadows(); });
$('walk').addEventListener('change', e => { ui.walk = e.target.checked; });
$('spin').addEventListener('change', e => { ui.spin = e.target.checked; });
$('speed').addEventListener('input', e => { ui.speed = parseFloat(e.target.value); $('speedVal').textContent = ui.speed.toFixed(1); });
$('light').addEventListener('input', e => { ui.light = parseFloat(e.target.value); $('lightVal').textContent = ui.light.toFixed(2); applyLight(); });

applyRenderMode();

const jb = document.getElementById('jumpBtn'); if (jb) jb.addEventListener('click', () => triggerJump());

// ── Animation: idle + walk cycle ──────────────────────────────────────────────
const clock = new THREE.Clock();
let phase = 0;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// jump state
let jumpT = -1;                       // -1 = grounded
function triggerJump(){ if (jumpT < 0) jumpT = 0; }
window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); triggerJump(); } });
renderer.domElement.addEventListener('dblclick', triggerJump);

let yaw = 0;                          // body facing (radians); 0 = facing camera
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // jump arc (independent of walk)
  let jumpY = 0, tuck = 0;
  if (jumpT >= 0) {
    jumpT += dt * 1.7;
    const j = Math.sin(Math.PI * Math.min(jumpT, 1));   // 0..1..0
    jumpY = j * 7.5;
    tuck = j;                                           // legs tuck at apex
    if (jumpT >= 1) jumpT = -1;
  }

  if (ui.walk) {
    phase += dt * ui.speed;
    const s = Math.sin(phase);
    legRight.rotation.x =  s * 0.5 + tuck * 0.5;
    legLeft.rotation.x  = -s * 0.5 + tuck * 0.5;
    armRight.rotation.x = -s * 0.22 - tuck * 0.6;
    armLeft.rotation.x  =  s * 0.22 - tuck * 0.6;
    if (ui.spin) {
      yaw += dt * 0.6;                       // optional turntable
      robot.rotation.y = yaw;
    } else {
      // walk in place, facing you, with a subtle look-around
      yaw += (Math.sin(t * 0.5) * 0.25 - yaw) * Math.min(dt * 3, 1);
      robot.rotation.y = yaw;
    }
    robot.position.y = Math.abs(s) * 0.6 + jumpY;
    robot.rotation.z = s * 0.03;
  } else {
    // idle: ease back to facing the camera (front)
    yaw += (0 - yaw) * Math.min(dt * 3, 1);
    robot.rotation.y = yaw;
    const sway = Math.sin(t * 1.4) * 0.10;
    armRight.rotation.x =  sway - tuck * 0.6; armLeft.rotation.x = -sway - tuck * 0.6;
    legRight.rotation.x = tuck * 0.5; legLeft.rotation.x = tuck * 0.5;
    robot.position.y = Math.sin(t*2) * 0.3 + jumpY;
    robot.rotation.z = 0;
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();
