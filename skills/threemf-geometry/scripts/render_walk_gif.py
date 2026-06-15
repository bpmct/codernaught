#!/usr/bin/env python3
"""Render a transparent walking-turntable GIF of the 3D Codernaught (software renderer).

Loads codernaught_meshes.json, applies the same walk pose + body Y-rotation as the
web app, projects triangles, painter-sorts by depth, flat-shades by face normal, and
writes a looping transparent GIF — drop straight into Google Slides / Docs.

Usage:  python3 render_walk_gif.py [meshes.json] [out.gif]
Needs:  numpy, Pillow.
"""
import sys, os, json, math
import numpy as np
from PIL import Image, ImageDraw

IN = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/codernaught/public/codernaught_meshes.json')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.expanduser('~/codernaught/public/2d/codernaught-walk3d.gif')
os.makedirs(os.path.dirname(OUT), exist_ok=True)

data = json.load(open(IN))
meshes, pivots, bounds = data['meshes'], data['pivots'], data['bounds']
cx = (bounds['min'][0] + bounds['max'][0]) / 2
cyF = bounds['min'][1]
cz = (bounds['min'][2] + bounds['max'][2]) / 2

def center(v):
    return np.array([v[0]-cx, v[1]-cyF, v[2]-cz], float)

def hexrgb(h):
    h = h.lstrip('#'); return np.array([int(h[i:i+2],16) for i in (0,2,4)], float)

# group pivots (centered space)
GP = {g: center(pivots[g]) for g in ('arm_left','arm_right','leg_left','leg_right')}
GP['torso'] = np.array([0,0,0.0])

# precompute per-mesh centered verts grouped
prep = []
for m in meshes:
    g = m['group']
    piv = GP.get(g, GP['torso'])
    V = np.array([center(v) - piv for v in m['vertices']])
    prep.append((g, piv, V, m['triangles'], hexrgb(m['color'])))

def Rx(a):
    c,s=math.cos(a),math.sin(a); return np.array([[1,0,0],[0,c,-s],[0,s,c]])
def Ry(a):
    c,s=math.cos(a),math.sin(a); return np.array([[c,0,s],[0,1,0],[-s,0,c]])

W, H = 360, 560
SCALE = 11.0           # px per model unit
LIGHT = np.array([-0.4, 0.7, 0.6]); LIGHT /= np.linalg.norm(LIGHT)
CAMTILT = Rx(math.radians(-8))

def render_frame(phase, yaw):
    img = Image.new('RGBA', (W, H), (0,0,0,0))
    dr = ImageDraw.Draw(img, 'RGBA')
    s = math.sin(phase)
    limbrot = {
        'leg_right': Rx(s*0.5), 'leg_left': Rx(-s*0.5),
        'arm_right': Rx(-s*0.35), 'arm_left': Rx(s*0.35), 'torso': np.eye(3),
    }
    body = Ry(yaw)
    bob = abs(s) * 0.6
    faces = []
    for g, piv, V, tris, col in prep:
        Rl = limbrot.get(g, np.eye(3))
        # world = body * (limbrot*V + piv) ; then camera tilt
        W3 = (V @ Rl.T + piv) @ body.T
        W3 = W3 @ CAMTILT.T
        W3[:,1] += bob
        for t in tris:
            p = W3[t]
            n = np.cross(p[1]-p[0], p[2]-p[0])
            nn = np.linalg.norm(n)
            if nn < 1e-9: continue
            n /= nn
            if n[2] <= 0: continue                     # backface cull (camera looks -Z)
            shade = 0.55 + 0.45 * max(0, n @ LIGHT)
            c = tuple(int(min(255, x*shade)) for x in col)
            zmean = p[:,2].mean()
            pts = [(W/2 + q[0]*SCALE, H*0.92 - (q[1])*SCALE) for q in p]
            faces.append((zmean, pts, c))
    faces.sort(key=lambda f: f[0])                     # painter's: far first
    for _, pts, c in faces:
        dr.polygon(pts, fill=c + (255,))
    return img

frames = []
N = 30
for i in range(N):
    a = i / N * 2*math.pi
    ph = a * 2                           # 2 strides per loop
    yaw = math.sin(a) * math.radians(18) # gentle front-facing sway (no side separation)
    frames.append(render_frame(ph, yaw))

def to_p_transparent(rgba):
    # quantize RGB to 255 colors, reserve index 255 for transparency
    a = rgba.split()[3]
    p = rgba.convert('RGB').quantize(colors=255, method=Image.MEDIANCUT)
    # mark transparent where alpha < 128
    mask = a.point(lambda v: 255 if v < 128 else 0)
    p.paste(255, mask.convert('1'))
    p.info['transparency'] = 255
    return p

pframes = [to_p_transparent(f) for f in frames]
pframes[0].save(OUT, save_all=True, append_images=pframes[1:], loop=0,
                duration=60, disposal=2, transparency=255)
# transparent hero png (RGBA, real alpha)
render_frame(0, 0).save(OUT.replace('.gif', '.png'))
print(f"wrote {OUT} ({N} frames, transparent) + hero png")
