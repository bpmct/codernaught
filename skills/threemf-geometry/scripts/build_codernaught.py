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
# Seat so the arm's shoulder shell face sits FLUSH against the body wall (X=10.38),
# with a ~1mm overlap so there's never a gap. Value derived from geometry: the
# oriented shell inner face must land at the wall (see analysis); plug center -> 13.52.
# Pull in 1.0mm (12.52) so the shell overlaps the wall by ~1mm (flush, no gap, no deep bury).
SOCKET_R = np.array([12.52, 3.021, -0.742])
SOCKET_L = np.array([-12.52, 3.021, -0.742])


def color_of(pid):
    return EXT_COLORS.get(PART_EXT.get(pid, '1'), '#888888')



JET_COLORS = {'1': '#6E6A6B', '2': '#FF7A1A', '3': '#FFC21A'}   # body gray, flame orange, inner-flame yellow

def add_boosters(jets_path, meshes):
    """Load one jet from Jets.3mf, orient flame-down, place under each foot.
    Tagged group 'booster_left'/'booster_right' (hidden until the fly action).
    Returns pivot dict (the foot-bottom attach points)."""
    z = zipfile.ZipFile(jets_path)
    jo = {}
    for n in z.namelist():
        if n.startswith('3D/Objects/'):
            jo.update(parse_objects(z.read(n).decode()))
    jroot = ET.fromstring(z.read('3D/3dmodel.model').decode())
    jcomps = {}
    for ob in jroot.findall(f'.//{{{NS}}}object'):
        cs = [{'id': c.get('objectid'),
               'tf': parse_transform(c.get('transform', '1 0 0 0 1 0 0 0 1 0 0 0'))}
              for c in ob.findall(f'.//{{{NS}}}component')]
        if cs:
            jcomps[ob.get('id')] = cs
    # object '4' = one jet (parts 1 body, 2/3 flame). Assemble in local space.
    parts = []
    for c in jcomps['4']:
        v = apply_tf(jo[c['id']]['vertices'], c['tf'])
        parts.append((c['id'], v, jo[c['id']]['triangles']))
    allv = np.vstack([v for _, v, _ in parts])
    # jet vertical axis is local Z; flame at +Z. Rotate Rx(90): +Z -> -Y (down).
    def Rx(d):
        r = np.radians(d); c, s = np.cos(r), np.sin(r)
        m = np.eye(4); m[1,1]=c; m[1,2]=-s; m[2,1]=s; m[2,2]=c; return m
    R = Rx(90)
    SCALE = 0.42                                       # jet lateral ~16.7mm -> ~7mm (foot width)
    # Build a SHARED transform: orient+scale the whole jet, then center its X/Z and
    # put its top at y=0, so every part shares the same offset (stays assembled).
    oriented_all = apply_tf(allv, R) * SCALE
    off = np.array([oriented_all[:,0].mean(), oriented_all[:,1].max(), oriented_all[:,2].mean()])
    foot = {'left': np.array([-3.51, -22.78, -1.11]), 'right': np.array([4.62, -22.78, -1.11])}
    pivots = {}
    for side in ('left', 'right'):
        grp = f'booster_{side}'
        fc = foot[side]
        for pid, v, tris in parts:
            vv = apply_tf(v, R) * SCALE - off          # orient+scale, shared center (X/Z) & top at y=0
            vv = vv + fc                               # drop to under the foot
            meshes.append({'part_id': f'jet{pid}_{side}', 'group': grp,
                           'color': JET_COLORS.get(pid, '#888'),
                           'vertices': vv.tolist(), 'triangles': tris})
        pivots[grp] = fc.tolist()                     # attach pivot = foot bottom
    return pivots


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

    # ── Boosters (Jets.3mf) — one jet tucked under each foot, flame pointing down ──
    jets_path = os.path.join(os.path.dirname(SRC), 'Jets.3mf')
    booster_pivots = {}
    if os.path.exists(jets_path):
        booster_pivots = add_boosters(jets_path, meshes)

    allv = np.array([v for m in meshes for v in m['vertices']])
    out = {
        'meshes': meshes,
        'pivots': {
            'arm_right': SOCKET_R.tolist(), 'arm_left': SOCKET_L.tolist(),
            'leg_left': left_hip.tolist(), 'leg_right': right_hip.tolist(),
            **booster_pivots,
        },
        'bounds': {'min': allv.min(axis=0).tolist(), 'max': allv.max(axis=0).tolist()},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w'))
    print(f"Wrote {len(meshes)} meshes -> {OUT}")
    for g in ['torso', 'leg_left', 'leg_right', 'arm_left', 'arm_right', 'booster_left', 'booster_right']:
        n = sum(1 for m in meshes if m['group'] == g)
        print(f"  {g}: {n} meshes")


if __name__ == '__main__':
    main()
