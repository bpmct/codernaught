#!/usr/bin/env python3
"""Build public/codernaught_meshes.json from Single_Coder_Bot.3mf.

Full geometry-driven pipeline:
  1. extract vertices/triangles + filament colors
  2. detect arm shoulder joint + body socket via circle fit (see circle_fit.py)
  3. orient + mate each arm into its socket (claw forward, hangs down)
  4. plane-cut the body shell at the hip to make full L/R legs (head/screen kept whole)
  5. emit grouped meshes + pivots + bounds

Run from anywhere:
    python3 build_codernaught.py /path/to/Single_Coder_Bot.3mf /path/to/out.json
Defaults: ~/Single_Coder_Bot.3mf  ->  ~/codernaught/public/codernaught_meshes.json
Then: cp out.json codernaught/public/
"""
import sys, os, zipfile, json
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from circle_fit import (parse_objects, parse_transform, apply_tf, trans, mirror_x,
                        mirror_z, Rx, Ry, fit_circle_2d, slice_at_y, split_lr)

NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
import xml.etree.ElementTree as ET

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Single_Coder_Bot.3mf')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser('~/codernaught/public/codernaught_meshes.json')

# extruder(1-indexed) -> filament hex, from project_settings.config
EXT_COLORS = {'1': '#FFF8F9', '2': '#7E7776', '3': '#000000', '4': '#7000F4'}
# part id -> extruder, from model_settings.config
PART_EXT = {'1':'1','2':'2','3':'1','4':'1','5':'1','6':'1','7':'1','8':'1',
            '9':'4','10':'4','11':'4','12':'4','13':'4','14':'4','15':'4','16':'4','17':'4',
            '18':'3','19':'4','20':'4','21':'1','22':'1','23':'1','24':'1','25':'1',
            '27':'2','28':'1','29':'1','30':'1','32':'1','33':'2','34':'1','35':'1'}

# Leg split params (derived from geometry)
HIP_Y = -8.5      # cut plane: torso above, legs below
SPLIT_X = 0.56    # left/right divide
LEFT_WHOLE = {'23','24','5','6'}    # fully-below parts -> whole into left leg
RIGHT_WHOLE = {'1','25','7','8'}    # fully-below parts -> whole into right leg
SLICE = {'2'}                       # the only crossing part to cut (gray shell)
# part 4 (white front panel) is kept WHOLE in torso so leg tops stay gray.

# Arm mating (from circle-fit detection)
ARM_JOINT = np.array([-4.132, 5.876, 0.0])   # arm shoulder circle center (local, axis Z)
SOCKET_NUDGE = -1.0                           # seat arms deeper into the socket (avoids swing gap)
SOCKET_R = np.array([9.42 + SOCKET_NUDGE, 3.02, -0.75])
SOCKET_L = np.array([-(9.42 + SOCKET_NUDGE), 3.02, -0.75])


def color_of(pid):
    return EXT_COLORS.get(PART_EXT.get(pid, '1'), '#888888')


def main():
    z = zipfile.ZipFile(SRC)
    o5 = parse_objects(z.read('3D/Objects/object_5.model').decode())
    o6 = parse_objects(z.read('3D/Objects/object_6.model').decode())
    o7 = parse_objects(z.read('3D/Objects/object_7.model').decode())
    allo = {**o5, **o6, **o7}

    root = ET.fromstring(z.read('3D/3dmodel.model').decode())
    comps = {}
    for ob in root.findall(f'.//{{{NS}}}object'):
        cs = [{'id': c.get('objectid'),
               'tf': parse_transform(c.get('transform', '1 0 0 0 1 0 0 0 1 0 0 0'))}
              for c in ob.findall(f'.//{{{NS}}}component')]
        if cs:
            comps[ob.get('id')] = cs

    meshes = []

    def addm(pid, group, verts, tris):
        if len(verts) == 0 or len(tris) == 0:
            return
        meshes.append({'part_id': str(pid), 'group': group, 'color': color_of(pid),
                       'vertices': np.asarray(verts).tolist(),
                       'triangles': [list(map(int, t)) for t in tris]})

    # ── Body (obj 26): torso + legs ──────────────────────────────────────────
    for c in comps['26']:
        pid = c['id']
        v = apply_tf(allo[pid]['vertices'], c['tf'])
        tr = allo[pid]['triangles']
        if pid in SLICE:
            uv, ut, lv, lt = slice_at_y(v, tr, HIP_Y)
            addm(pid, 'torso', uv, ut)
            if len(lv):
                (Lv, Lt), (Rv, Rt) = split_lr(lv, lt, SPLIT_X)
                addm(pid, 'leg_left', Lv, Lt)
                addm(pid, 'leg_right', Rv, Rt)
        elif pid in LEFT_WHOLE:
            addm(pid, 'leg_left', v, tr)
        elif pid in RIGHT_WHOLE:
            addm(pid, 'leg_right', v, tr)
        else:
            addm(pid, 'torso', v, tr)

    ll = np.vstack([m['vertices'] for m in meshes if m['group'] == 'leg_left'])
    rl = np.vstack([m['vertices'] for m in meshes if m['group'] == 'leg_right'])
    left_hip = np.array([ll[:, 0].mean(), HIP_Y, ll[:, 2].mean()])
    right_hip = np.array([rl[:, 0].mean(), HIP_Y, rl[:, 2].mean()])

    # ── Arms (obj 31 = right; mirror for left) ───────────────────────────────
    # Ry(90): joint axis Z -> world X.  mirror_z + Rx(330): hang down, claw forward.
    R = mirror_z() @ Rx(330) @ Ry(90)
    R_about = trans(ARM_JOINT) @ R @ trans(-ARM_JOINT)
    jc = apply_tf(ARM_JOINT.reshape(1, 3), R_about)[0]
    r_off = SOCKET_R - jc
    l_off = SOCKET_L - (jc * np.array([-1, 1, 1]))

    def add_arm(extra, mir, group):
        for c in comps['31']:
            pid = c['id']
            v = apply_tf(o6[pid]['vertices'], c['tf'])
            v = apply_tf(v, R_about)
            if mir:
                v = apply_tf(v, mirror_x())
            v = apply_tf(v, extra)
            tr = o6[pid]['triangles']
            flipped = [[t[0], t[2], t[1]] for t in tr]   # reverse winding for mirror_z
            meshes.append({'part_id': pid, 'group': group, 'color': color_of(pid),
                           'vertices': v.tolist(),
                           'triangles': (tr if mir else flipped)})

    add_arm(trans(r_off), False, 'arm_right')
    add_arm(trans(l_off), True, 'arm_left')

    allv = np.array([v for m in meshes for v in m['vertices']])
    out = {
        'meshes': meshes,
        'pivots': {
            'arm_right': SOCKET_R.tolist(), 'arm_left': SOCKET_L.tolist(),
            'leg_left': left_hip.tolist(), 'leg_right': right_hip.tolist(),
        },
        'bounds': {'min': allv.min(axis=0).tolist(), 'max': allv.max(axis=0).tolist()},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w'))
    print(f"Wrote {len(meshes)} meshes -> {OUT}")
    for g in ['torso', 'leg_left', 'leg_right', 'arm_left', 'arm_right']:
        n = sum(1 for m in meshes if m['group'] == g)
        print(f"  {g}: {n} meshes")


if __name__ == '__main__':
    main()
