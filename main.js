import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Live UI state ─────────────────────────────────────────────────────────────
const ui = {
  render: 'flat',   // 'flat' | 'lit'
  shadows: false,
  walk: true,
  speed: 5.0,
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
const data = await fetch('/codernaught_meshes.json').then(r => r.json());
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

  // Lit lights at full strength; flat mode uses a single bright ambient so colors stay pure.
  hemi.intensity = lit ? 0.9  : 0.0;
  key.intensity  = lit ? 1.5  : 0.0;
  fill.intensity = lit ? 1.1  : 0.0;
  rim.intensity  = lit ? 0.6  : 0.0;
  amb.intensity  = lit ? 0.25 : 1.0;   // flat: full flat ambient (MeshBasic ignores it anyway)

  renderer.toneMapping = lit ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.3;

  applyShadows();
  ground.visible = lit;
  grid.visible = lit;
}

function applyShadows() {
  const on = ui.shadows && ui.render === 'lit';
  key.castShadow = on;
  ground.receiveShadow = on;
  for (const m of allMeshes) { m.castShadow = on; m.receiveShadow = on; }
  renderer.shadowMap.needsUpdate = true;
}

// ── UI wiring ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
$('renderMode').value = ui.render;
$('shadows').checked = ui.shadows;
$('walk').checked = ui.walk;
$('speed').value = ui.speed; $('speedVal').textContent = ui.speed.toFixed(1);
$('shadows').disabled = ui.render !== 'lit';

$('renderMode').addEventListener('change', e => {
  ui.render = e.target.value;
  $('shadows').disabled = ui.render !== 'lit';
  applyRenderMode();
});
$('shadows').addEventListener('change', e => { ui.shadows = e.target.checked; applyShadows(); });
$('walk').addEventListener('change', e => { ui.walk = e.target.checked; });
$('speed').addEventListener('input', e => { ui.speed = parseFloat(e.target.value); $('speedVal').textContent = ui.speed.toFixed(1); });

applyRenderMode();

// ── Animation: idle + walk cycle ──────────────────────────────────────────────
const clock = new THREE.Clock();
let phase = 0;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  if (ui.walk) {
    phase += dt * ui.speed;
    const s = Math.sin(phase);
    legRight.rotation.x =  s * 0.5;
    legLeft.rotation.x  = -s * 0.5;
    armRight.rotation.x = -s * 0.35;
    armLeft.rotation.x  =  s * 0.35;
    robot.position.y = Math.abs(Math.sin(phase)) * 0.6;
    robot.rotation.z = s * 0.03;
  } else {
    const sway = Math.sin(t * 1.4) * 0.12;
    armRight.rotation.x =  sway; armLeft.rotation.x = -sway;
    legRight.rotation.x = 0; legLeft.rotation.x = 0;
    robot.position.y = 0; robot.rotation.z = 0;
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();
