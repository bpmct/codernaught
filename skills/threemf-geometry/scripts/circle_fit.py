"""Reusable geometry helpers for 3MF → Three.js rigging.

- Kasa algebraic circle fit (find ball/cylinder joint centers + radii)
- 3MF parsing (vertices, triangles, transforms)
- transform builders (translate, mirror, rotate)
- plane cut (slice a mesh at Y=level, interpolating the cut edge)

Import these from a model-specific build script (see build_codernaught.py).
"""
import numpy as np
import xml.etree.ElementTree as ET

NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'


# ── 3MF parsing ───────────────────────────────────────────────────────────────
def parse_objects(xml_str):
    """Return {object_id: {'vertices': Nx3 array, 'triangles': [[i,i,i],...]}}."""
    root = ET.fromstring(xml_str)
    objs = {}
    for ob in root.findall(f'.//{{{NS}}}object'):
        mesh = ob.find(f'{{{NS}}}mesh')
        if mesh is None:
            continue
        verts = np.array([[float(v.get('x')), float(v.get('y')), float(v.get('z'))]
                          for v in mesh.findall(f'.//{{{NS}}}vertex')])
        tris = [[int(t.get('v1')), int(t.get('v2')), int(t.get('v3'))]
                for t in mesh.findall(f'.//{{{NS}}}triangle')]
        objs[ob.get('id')] = {'vertices': verts, 'triangles': tris}
    return objs


def parse_transform(s):
    """3MF transform string (12 floats, column-major 3x4) -> 4x4 matrix."""
    v = list(map(float, s.split()))
    m = np.eye(4)
    m[0, 0] = v[0]; m[1, 0] = v[1]; m[2, 0] = v[2]
    m[0, 1] = v[3]; m[1, 1] = v[4]; m[2, 1] = v[5]
    m[0, 2] = v[6]; m[1, 2] = v[7]; m[2, 2] = v[8]
    m[0, 3] = v[9]; m[1, 3] = v[10]; m[2, 3] = v[11]
    return m


def apply_tf(verts, tf):
    return (tf @ np.hstack([verts, np.ones((len(verts), 1))]).T).T[:, :3]


# ── Transform builders ────────────────────────────────────────────────────────
def trans(o):
    m = np.eye(4); m[0, 3], m[1, 3], m[2, 3] = o[0], o[1], o[2]; return m

def mirror_x():
    m = np.eye(4); m[0, 0] = -1; return m

def mirror_z():
    m = np.eye(4); m[2, 2] = -1; return m

def Rx(d):
    r = np.radians(d); c, s = np.cos(r), np.sin(r)
    m = np.eye(4); m[1, 1] = c; m[1, 2] = -s; m[2, 1] = s; m[2, 2] = c; return m

def Ry(d):
    r = np.radians(d); c, s = np.cos(r), np.sin(r)
    m = np.eye(4); m[0, 0] = c; m[0, 2] = s; m[2, 0] = -s; m[2, 2] = c; return m

def Rz(d):
    r = np.radians(d); c, s = np.cos(r), np.sin(r)
    m = np.eye(4); m[0, 0] = c; m[0, 1] = -s; m[1, 0] = s; m[1, 1] = c; return m


# ── Circle fit (find ball/socket joint centers) ───────────────────────────────
def fit_circle_2d(pts2d):
    """Kasa algebraic circle fit. pts2d: Nx2. Returns (cx, cy, r, mean_residual).

    Apply to the projection of joint vertices onto the plane perpendicular to the
    joint axis. Low residual + a matching radius on the mating part = real joint.
    """
    x, y = pts2d[:, 0], pts2d[:, 1]
    A = np.c_[2 * x, 2 * y, np.ones(len(x))]
    b = x ** 2 + y ** 2
    c, *_ = np.linalg.lstsq(A, b, rcond=None)
    cx, cy = c[0], c[1]
    r = np.sqrt(c[2] + cx ** 2 + cy ** 2)
    resid = np.abs(np.sqrt((x - cx) ** 2 + (y - cy) ** 2) - r).mean()
    return cx, cy, r, resid


# ── Plane cut (split a limb off a shared shell, no holes/normal bugs) ──────────
def slice_at_y(verts, tris, ylevel):
    """Split a triangle mesh by the plane Y=ylevel.

    Straddling triangles are clipped (new vertices interpolated on the cut edge) and
    re-triangulated as fans, so each side stays watertight and normals compute cleanly.
    Returns (upper_verts, upper_tris, lower_verts, lower_tris).
    """
    up_v, up_t, up_i = [], [], {}
    lo_v, lo_t, lo_i = [], [], {}

    def push(bv, bi, p):
        key = tuple(np.round(p, 5))
        if key not in bi:
            bi[key] = len(bv); bv.append(list(p))
        return bi[key]

    for tri in tris:
        P = [np.array(verts[i], float) for i in tri]
        s = [p[1] - ylevel for p in P]
        if all(x >= 0 for x in s):
            up_t.append([push(up_v, up_i, p) for p in P]); continue
        if all(x <= 0 for x in s):
            lo_t.append([push(lo_v, lo_i, p) for p in P]); continue

        def clip(keep_upper):
            poly = []
            for i in range(3):
                a, b = P[i], P[(i + 1) % 3]
                sa, sb = s[i], s[(i + 1) % 3]
                a_in = (sa >= 0) if keep_upper else (sa <= 0)
                b_in = (sb >= 0) if keep_upper else (sb <= 0)
                if a_in:
                    poly.append(a)
                if (a_in != b_in) and (sa != sb):
                    t = sa / (sa - sb); poly.append(a + t * (b - a))
            return poly

        for poly, bv, bi, bt in [(clip(True), up_v, up_i, up_t),
                                 (clip(False), lo_v, lo_i, lo_t)]:
            if len(poly) >= 3:
                idx = [push(bv, bi, p) for p in poly]
                for k in range(1, len(idx) - 1):
                    bt.append([idx[0], idx[k], idx[k + 1]])
    return np.array(up_v), up_t, np.array(lo_v), lo_t


def split_lr(verts, tris, xlevel):
    """Split a mesh by plane X=xlevel into (left, right), each (verts, tris)."""
    out = {'L': ([], [], {}), 'R': ([], [], {})}

    def push(side, p):
        bv, bt, bi = out[side]
        key = tuple(np.round(p, 5))
        if key not in bi:
            bi[key] = len(bv); bv.append(list(p))
        return bi[key]

    for tri in tris:
        P = [np.array(verts[i], float) for i in tri]
        s = [p[0] - xlevel for p in P]
        if all(x <= 0 for x in s):
            out['L'][1].append([push('L', p) for p in P]); continue
        if all(x >= 0 for x in s):
            out['R'][1].append([push('R', p) for p in P]); continue

        def clip(left):
            poly = []
            for i in range(3):
                a, b = P[i], P[(i + 1) % 3]
                sa, sb = s[i], s[(i + 1) % 3]
                ain = (sa <= 0) if left else (sa >= 0)
                bin_ = (sb <= 0) if left else (sb >= 0)
                if ain:
                    poly.append(a)
                if (ain != bin_) and sa != sb:
                    t = sa / (sa - sb); poly.append(a + t * (b - a))
            return poly

        for side, want in [('L', True), ('R', False)]:
            poly = clip(want)
            if len(poly) >= 3:
                idx = [push(side, p) for p in poly]
                for k in range(1, len(idx) - 1):
                    out[side][1].append([idx[0], idx[k], idx[k + 1]])
    return (np.array(out['L'][0]), out['L'][1]), (np.array(out['R'][0]), out['R'][1])
