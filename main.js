import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Renderer ──────────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
document.body.appendChild(renderer.domElement);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d14);
// No fog — it caused the model to fade out when zooming.

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 12, 55);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 10, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 12;
controls.maxDistance = 300;
controls.update();

// ── Lighting ──────────────────────────────────────────────────────────────────
// Hemisphere gives even sky/ground fill so neither side goes fully dark.
scene.add(new THREE.HemisphereLight(0xdde6ff, 0x202028, 0.9));
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

const key = new THREE.DirectionalLight(0xfff4e0, 1.5);
key.position.set(25, 50, 40);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 200;
key.shadow.camera.top = key.shadow.camera.right = 60;
key.shadow.camera.bottom = key.shadow.camera.left = -60;
key.shadow.bias = -0.0005;
scene.add(key);

// Strong fill from the opposite side to balance the dark half.
const fill = new THREE.DirectionalLight(0xc8d8ff, 1.1);
fill.position.set(-35, 25, 20);
scene.add(fill);

const rim = new THREE.DirectionalLight(0x9966ff, 0.6);
rim.position.set(0, 10, -45);
scene.add(rim);

// Ground
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(120, 64),
  new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.95, metalness: 0.1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.GridHelper(120, 60, 0x1e1e2e, 0x181828));

// ── Coordinate remap: 3MF Y-up → Three.js Y-up ───────────────────────────────
// The model already stands upright along Y in the 3MF. Y stays up.
// 3MF: X=right, Y=up, Z=depth(thin).  Three.js: X=right, Y=up, Z=depth.
// Direct mapping (x,y,z) → (x,y,z). No axis swap needed.
function remap(x, y, z) { return [x, y, z]; }

// ── Material cache ────────────────────────────────────────────────────────────
const matCache = {};
function getMat(hex) {
  if (matCache[hex]) return matCache[hex];
  matCache[hex] = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: hex === '#7000F4' ? 0.25 : hex === '#7E7776' ? 0.45 : 0.6,
    metalness: hex === '#7E7776' ? 0.6  : hex === '#7000F4' ? 0.1  : 0.08,
  });
  return matCache[hex];
}

// ── Load data ─────────────────────────────────────────────────────────────────
const data = await fetch('/codernaught_meshes.json').then(r => r.json());
const { meshes, pivots, bounds } = data;

// Model height along Y (3MF up axis)
const modelHeight = bounds.max[1] - bounds.min[1];
const scale = 22 / modelHeight;
const cx = (bounds.min[0] + bounds.max[0]) / 2; // horizontal center
const cyFloor = bounds.min[1];                   // bottom → sits on ground
const cz = (bounds.min[2] + bounds.max[2]) / 2;  // depth center

// Centering helper: shift vertex into robot-local space (feet at y=0, centered)
function center(v) {
  return [v[0] - cx, v[1] - cyFloor, v[2] - cz];
}

// Build a geometry from a list of (already-centered) verts + triangles
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

// ── Robot hierarchy ───────────────────────────────────────────────────────────
const robot = new THREE.Group();
robot.scale.setScalar(scale);
scene.add(robot);

const bodyGroup = new THREE.Group();
robot.add(bodyGroup);

// Pivot (hinge) groups positioned at the shoulder sockets, in centered robot space
function shoulderPos(pivot3mf) {
  const c = center(pivot3mf);
  return new THREE.Vector3(c[0], c[1], c[2]);
}
const rPivotPos = shoulderPos(pivots.arm_right);
const lPivotPos = shoulderPos(pivots.arm_left);

const armRight = new THREE.Group();
armRight.position.copy(rPivotPos);
robot.add(armRight);

const armLeft = new THREE.Group();
armLeft.position.copy(lPivotPos);
robot.add(armLeft);

// Distribute meshes into the correct groups, making arm verts relative to pivot
for (const part of meshes) {
  const cverts = part.vertices.map(center); // robot-local centered verts

  if (part.group === 'body') {
    const m = new THREE.Mesh(makeGeo(cverts, part.triangles), getMat(part.color));
    m.castShadow = true; m.receiveShadow = true;
    bodyGroup.add(m);
  } else {
    const pivot = part.group === 'arm_right' ? rPivotPos : lPivotPos;
    const localVerts = cverts.map(v => [v[0]-pivot.x, v[1]-pivot.y, v[2]-pivot.z]);
    const m = new THREE.Mesh(makeGeo(localVerts, part.triangles), getMat(part.color));
    m.castShadow = true; m.receiveShadow = true;
    (part.group === 'arm_right' ? armRight : armLeft).add(m);
  }
}

// ── Animation: hinged arm swing ───────────────────────────────────────────────
const clock = new THREE.Clock();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Arms hinge forward/back around the X axis (the shoulder pivot).
  const swing = Math.sin(t * 1.4) * 0.12;     // radians (gentle)
  armRight.rotation.x =  swing;
  armLeft.rotation.x  = -swing;

  controls.update();
  renderer.render(scene, camera);
}
animate();
