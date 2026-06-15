#!/usr/bin/env python3
"""Bake codernaught_meshes.json into a portable, rigged, animated codernaught.glb.

Produces a glTF 2.0 binary with:
  - a node hierarchy: root -> torso + arm_left/right + leg_left/right pivot nodes
  - each limb's meshes parented under its pivot node (verts already pivot-relative)
  - a "Walk" animation clip (rotation keyframes on the 4 limb pivots + root bob)
  - vertex colors baked from filament colors (so it renders correctly with no textures)

This .glb is the canonical portable asset: drop into model-viewer, Spline, Rive (3D),
Blender, Unity, or any Three.js / Claude-generated site.

Usage:
  python3 build_glb.py [meshes.json] [out.glb]
"""
import sys, os, json, struct
import numpy as np

IN = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/codernaught/public/codernaught_meshes.json')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser('~/codernaught/public/codernaught.glb')

data = json.load(open(IN))
meshes, pivots, bounds = data['meshes'], data['pivots'], data['bounds']

# Match the web app's centering + scale so the GLB looks identical.
cx = (bounds['min'][0] + bounds['max'][0]) / 2
cyFloor = bounds['min'][1]
cz = (bounds['min'][2] + bounds['max'][2]) / 2
SCALE = 22.0 / (bounds['max'][1] - bounds['min'][1])

def center(v):
    return [v[0] - cx, v[1] - cyFloor, v[2] - cz]

def hex_rgb(h):
    h = h.lstrip('#')
    return [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]

GROUPS = ['torso', 'arm_left', 'arm_right', 'leg_left', 'leg_right']
PIVOT3MF = {
    'torso': [cx, cyFloor, cz],   # torso "pivot" = origin after centering
    'arm_left': pivots['arm_left'], 'arm_right': pivots['arm_right'],
    'leg_left': pivots['leg_left'], 'leg_right': pivots['leg_right'],
}

# ── Binary buffer accumulation ────────────────────────────────────────────────
buf = bytearray()
bufviews, accessors = [], []

def pad4(b):
    while len(b) % 4: b += b'\x00'
    return b

def add_view(blob, target=None):
    global buf
    off = len(buf)
    buf += blob
    bv = {'buffer': 0, 'byteOffset': off, 'byteLength': len(blob)}
    if target: bv['bufferView'] = target  # unused; placeholder
    bufviews.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(blob)})
    return len(bufviews) - 1

def acc_vec3(arr):
    arr = np.asarray(arr, np.float32)
    bv = add_view(arr.tobytes())
    accessors.append({'bufferView': bv, 'componentType': 5126, 'count': len(arr),
                      'type': 'VEC3', 'min': arr.min(0).tolist(), 'max': arr.max(0).tolist()})
    return len(accessors) - 1

def acc_vec4(arr):
    arr = np.asarray(arr, np.float32)
    bv = add_view(arr.tobytes())
    accessors.append({'bufferView': bv, 'componentType': 5126, 'count': len(arr), 'type': 'VEC4'})
    return len(accessors) - 1

def acc_scalar_f(arr):
    arr = np.asarray(arr, np.float32)
    bv = add_view(arr.tobytes())
    accessors.append({'bufferView': bv, 'componentType': 5126, 'count': len(arr),
                      'type': 'SCALAR', 'min': [float(arr.min())], 'max': [float(arr.max())]})
    return len(accessors) - 1

def acc_idx(arr):
    arr = np.asarray(arr, np.uint32)
    bv = add_view(arr.tobytes())
    accessors.append({'bufferView': bv, 'componentType': 5125, 'count': len(arr), 'type': 'SCALAR'})
    return len(accessors) - 1

# ── One material (vertex-color, unlit-friendly) ───────────────────────────────
materials = [{
    'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0,
                             'roughnessFactor': 0.8},
    'name': 'codernaught'
}]

# ── Build one glTF mesh per group (merge that group's parts, pivot-relative) ──
gltf_meshes = []
group_mesh_index = {}
for g in GROUPS:
    piv = PIVOT3MF[g]
    pc = center(piv)  # pivot in centered space
    V, C, I = [], [], []
    base = 0
    for m in meshes:
        if m['group'] != g:
            continue
        rgb = hex_rgb(m['color'])
        for v in m['vertices']:
            cv = center(v)
            V.append([cv[0]-pc[0], cv[1]-pc[1], cv[2]-pc[2]])  # pivot-relative
            C.append(rgb + [1.0])
        for t in m['triangles']:
            I += [base + t[0], base + t[1], base + t[2]]
        base += len(m['vertices'])
    if not V:
        continue
    prim = {'attributes': {'POSITION': acc_vec3(V), 'COLOR_0': acc_vec4(C)},
            'indices': acc_idx(I), 'material': 0}
    gltf_meshes.append({'primitives': [prim], 'name': g})
    group_mesh_index[g] = len(gltf_meshes) - 1

# ── Node hierarchy: root scales everything; limb pivots positioned in centered space
nodes = []
root_children = []

# limb pivot nodes (translation = pivot point in centered space)
pivot_node = {}
for g in GROUPS:
    pc = center(PIVOT3MF[g])
    n = {'name': g, 'mesh': group_mesh_index[g], 'translation': pc,
         'rotation': [0, 0, 0, 1]}
    nodes.append(n)
    pivot_node[g] = len(nodes) - 1
    root_children.append(len(nodes) - 1)

# root node applies the global scale
nodes.append({'name': 'Codernaught', 'scale': [SCALE, SCALE, SCALE], 'children': root_children})
root_idx = len(nodes) - 1

# ── Walk animation: rotation keyframes (X-axis quaternions) on limb pivots ────
def quat_x(theta):
    return [np.sin(theta/2), 0.0, 0.0, np.cos(theta/2)]

FPS_SAMPLES = 33
period = 1.0           # 1s stride loop
times = np.linspace(0, period, FPS_SAMPLES)
time_acc = acc_scalar_f(times)

channels, samplers = [], []
def add_rot_channel(node, amp, phase_shift=0.0):
    quats = []
    for t in times:
        ang = np.sin(2*np.pi*t/period + phase_shift) * amp
        quats.append(quat_x(ang))
    out = acc_vec4(quats)
    samplers.append({'input': time_acc, 'output': out, 'interpolation': 'LINEAR'})
    channels.append({'sampler': len(samplers)-1,
                     'target': {'node': node, 'path': 'rotation'}})

add_rot_channel(pivot_node['leg_right'],  0.5, 0.0)
add_rot_channel(pivot_node['leg_left'],   0.5, np.pi)     # opposite phase
add_rot_channel(pivot_node['arm_right'], 0.35, np.pi)     # counter-swing
add_rot_channel(pivot_node['arm_left'],  0.35, 0.0)

animations = [{'name': 'Walk', 'channels': channels, 'samplers': samplers}]

# ── Assemble glTF ─────────────────────────────────────────────────────────────
buf = pad4(buf)
gltf = {
    'asset': {'version': '2.0', 'generator': 'codernaught build_glb.py'},
    'scene': 0,
    'scenes': [{'nodes': [root_idx]}],
    'nodes': nodes,
    'meshes': gltf_meshes,
    'materials': materials,
    'accessors': accessors,
    'bufferViews': bufviews,
    'buffers': [{'byteLength': len(buf)}],
    'animations': animations,
}

# ── Write .glb (binary container) ─────────────────────────────────────────────
json_blob = json.dumps(gltf, separators=(',', ':')).encode()
json_blob = pad4(json_blob) if len(json_blob) % 4 == 0 else json_blob + b' ' * (4 - len(json_blob) % 4)
bin_blob = buf
glb = bytearray()
glb += struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(json_blob) + 8 + len(bin_blob))
glb += struct.pack('<II', len(json_blob), 0x4E4F534A) + json_blob   # JSON chunk
glb += struct.pack('<II', len(bin_blob), 0x004E4942) + bin_blob     # BIN chunk
open(OUT, 'wb').write(glb)
print(f"Wrote {OUT} ({len(glb)} bytes), {len(gltf_meshes)} meshes, walk anim {len(channels)} channels")
