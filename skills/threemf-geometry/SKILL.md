---
name: threemf-geometry
description: Convert a multi-body 3MF print model into a riggable, animatable Three.js scene — extract exact geometry + filament colors, detect joints/sockets from the mesh, split limbs, mate parts, and drive walk/idle animation. Use when working with the Codernaught (Single_Coder_Bot.3mf) or any similar Bambu/PrusaSlicer multi-body 3MF.
---

# 3MF → Animatable Three.js Geometry

Workflow for turning a printable multi-body `.3mf` into a rigged, walking web model.
**Everything is geometry-driven.** Compute positions, colors, joints, sockets, and
pivots from the mesh data. Use computer-use **only** to verify the result, never to
guess placement.

## Golden rules (learned the hard way)
1. **Never eyeball placement.** Fit it from geometry: bounding boxes, circle fits,
   plane cuts, PCA. If you find yourself guessing an offset, stop and measure.
2. **Keep meshes whole whenever possible.** Slicing a mesh per-triangle breaks
   `computeVertexNormals` and leaves see-through holes. Only cut the *specific* parts
   that cross a joint line; leave the rest (head, screen, panels) untouched.
3. **When you must cut, cut on a plane and interpolate the edge** (don't classify by
   centroid). Use `side: THREE.DoubleSide` so any seam can't show through.
4. **Verify with a sub-agent screenshot after every structural change**, and ask for
   precise factual descriptions (not ratings) — e.g. "which way does the claw face,
   in +Z or -Z relative to the joint".
5. **Default to flat rendering** (`MeshBasicMaterial`) while debugging — shadows and
   PBR hide/exaggerate geometry bugs. Add a lit mode as a toggle.

## Pipeline

### 1. Inspect the 3MF
A 3MF is a ZIP. Key files:
- `3D/3dmodel.model` — top-level: `<build><item>` (per-object world transforms) and
  `<object><components>` (per-part component transforms, `p:path` → object files).
- `3D/Objects/object_*.model` — the actual `<mesh>` (`<vertices>`, `<triangles>`).
- `Metadata/model_settings.config` — part → extruder, source file, names.
- `Metadata/project_settings.config` — `filament_colour` array (extruder→hex).

```bash
python3 -c "import zipfile;z=zipfile.ZipFile('Single_Coder_Bot.3mf');print('\n'.join(z.namelist()))"
```

Map **extruder → color** from `project_settings.config` `filament_colour`
(1-indexed), and **part → extruder** from `model_settings.config` `<part>` blocks.
Codernaught colors: `1=#FFF8F9` (cream), `2=#7E7776` (gray), `3=#000000` (black),
`4=#7000F4` (Coder purple).

### 2. Extract geometry
Use `scripts/build_codernaught.py`. It:
- parses each object file's vertices/triangles,
- applies **component transforms only** (NOT the build/print-bed transforms — those
  lay parts flat for printing and rotate them oddly),
- tags each mesh with its filament color,
- emits `public/codernaught_meshes.json`:
  `{ meshes:[{part_id,group,color,vertices,triangles}], pivots:{...}, bounds:{min,max} }`.

### 3. Coordinate system
This model stands upright along **Y** in 3MF local space (Y≈45mm tall, Z≈9mm thin).
Three.js is also Y-up, so the mapping is **direct (x,y,z)→(x,y,z)** — no axis swap.
The **front is +Z** (face screen + button grid live at +Z). Always re-derive this per
model: tallest AABB axis = up; the side with the "face" features = front.

### 4. Detect joints & sockets (circle fit)
Ball/cylinder joints appear as rings of coplanar vertices. Fit a circle (Kasa
algebraic fit) in the plane perpendicular to the joint axis:
- **Arm shoulder joint** (object 31 / part 27): circle in XY, center `(-4.13, 5.88)`,
  radius `2.12`, axis along local **Z**.
- **Body socket** (object 26 / part 2 right wall): circle in YZ, center
  `(9.42, 3.02, -0.75)` (X = wall depth), radius `2.04`.
- Matching radii (2.04 ≈ 2.12) **confirms the mating pair**.

Mate by translating the arm so its joint center lands exactly on the socket center,
after rotating the joint axis to be perpendicular to the socket wall.

### 5. Orient a limb (no guessing)
The arm is a flat slab printed at an angle. To seat it:
1. `Ry(90)` — turn the joint's local-Z axis to world-X (so it plugs into the side wall).
2. `mirror_z` + `Rx(330)` — make the limb hang straight down with the **claw facing
   forward (+Z)**. Found by sweeping `rx` 0–360° and scoring: limb points down
   (`limbY < -0.85`), arm bulk below the joint, claw forward, minimal Z-sweep.
3. Translate joint center → socket center.
4. Mirror the whole arm in X for the other side; **reverse triangle winding** on
   mirrored/`mirror_z` meshes so normals stay outward.

When debugging a limb's facing, track the **actual hand/claw parts** (object 31 parts
28,29), not "farthest vertex" — the claw spreads and fools naive heuristics.

### 6. Split a limb off a shared shell (plane cut)
The legs are the lower half of the single body shell (part 2). To make full legs:
- Find which parts **cross** the hip line (only part 2 crosses; head/screen/panels are
  fully above → keep whole). The dedicated foot/stripe parts (1,5,6,7,8,23,24,25) are
  fully below → assign whole to a leg by X side.
- Cut **only the crossing part** on plane `Y = hip` (interpolate new vertices along
  the cut edge — see `slice_at_y` in `scripts/build_codernaught.py`). Upper → torso,
  lower → split L/R on `X = split_x`.
- Hip pivot = top-center of each leg group, at the cut line.
- Keep the white **front panel whole in the torso** so leg tops read gray, not white.

### 7. Rig & animate (Three.js)
Hierarchy: `robot` → `bodyGroup` + four pivot groups (`armLeft/Right`, `legLeft/Right`).
Each pivot group sits at its joint center (in centered robot space); child vertices are
stored **relative to that pivot** so rotating the group hinges the limb.

Walk cycle (`main.js`): `legRight.rotation.x = sin(phase)*0.5`, legLeft opposite;
arms counter-swing (`*0.35`); body bob `|sin(phase)|*0.6`; sway `sin(phase)*0.03`.
Idle: gentle arm sway only. Phase advances by `dt * speed`.

### 8. Rendering modes (configurable)
- **Flat** (default): `MeshBasicMaterial`, no lights/shadows/ground — pure colors,
  best for verifying geometry.
- **Lit**: `MeshStandardMaterial` + hemisphere/key/fill/rim lights, optional shadows,
  ground plane. A **Light** slider scales all light intensities (`ui.light`); shadows
  toggle only enabled in lit mode.
- Pre-build both material sets and swap `mesh.material` at runtime; toggle light
  intensities and `castShadow`/`receiveShadow` live.
- Always use `side: THREE.DoubleSide` so cut seams never show through.

## Verifying
After any structural change: rebuild (`npm run build`), then spawn a `computer_use`
agent to screenshot `http://localhost:3000/` and describe **specifically** what it
sees (facing direction, gaps, holes, which parts move). Iterate until correct. Keep a
running git commit per milestone.

## Files
- `scripts/build_codernaught.py` — full extractor + joint/socket detection + splitter +
  assembler. Run it, then `cp codernaught_meshes.json public/`.
- `scripts/circle_fit.py` — standalone Kasa circle fit + helpers, reusable for any model.
