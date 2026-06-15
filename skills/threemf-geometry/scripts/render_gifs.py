#!/usr/bin/env python3
"""Render Codernaught 2D animated GIFs (transparent) for Google Slides / docs.

Builds the same rigged SVG sprite as 2d/codernaught2d.js, samples each animation
(idle / run / fly) across a loop, rasterizes frames with ImageMagick, and writes
looping GIFs to public/2d/.

Usage:  python3 render_gifs.py
Needs:  ImageMagick `convert`, Pillow.
"""
import os, math, subprocess, tempfile
from PIL import Image

OUT = os.path.expanduser('~/codernaught/public/2d')
os.makedirs(OUT, exist_ok=True)

C = dict(white='#FFF8F9', gray='#C9C4C5', grayD='#9a9598', screen='#0b0b12',
         purple='#7000F4', ppL='#b79bff', ppD='#4a3aa0', outline='#1a1424')

def leg(cx, rot):
    return f'''<g transform="translate({cx},112) rotate({rot})">
      <rect x="-9" y="0" width="18" height="30" rx="3" fill="{C['white']}"/>
      <rect x="-9" y="0" width="4" height="30" rx="2" fill="{C['purple']}" opacity="0.9"/>
      <rect x="-11" y="30" width="22" height="10" rx="3" fill="{C['gray']}"/></g>'''

def arm(cx, side, rot, flag=False):
    x = -14 if side == 'L' else 2
    fl = ''
    if flag:
        fl = f'''<g><rect x="-12" y="-46" width="2.5" height="52" rx="1" fill="{C['white']}"/>
          <rect x="-12" y="-46" width="28" height="18" rx="1" fill="{C['white']}" stroke="{C['outline']}" stroke-width="0.6"/>
          <path transform="translate(-8,-43) scale(0.46)" fill="#090b0b"
            d="M 26 4 L 14 4 A 14 14 0 1 0 14 32 L 26 32 L 26 22 L 16 22 A 6 6 0 1 1 16 14 L 26 14 Z"/></g>'''
    return f'''<g transform="translate({cx},60) rotate({rot})">
      <rect x="{x}" y="0" width="12" height="34" rx="4" fill="{C['gray']}"/>
      <rect x="{x}" y="0" width="12" height="6" rx="3" fill="{C['purple']}"/>
      <rect x="{x-1}" y="30" width="14" height="12" rx="4" fill="{C['white']}"/>{fl}</g>'''

def head(tilt):
    dots_done = True
    return f'''<g transform="translate(50,38) rotate({tilt})">
      <rect x="-30" y="-32" width="60" height="44" rx="9" fill="{C['gray']}"/>
      <rect x="-28" y="-32" width="60" height="44" rx="9" fill="{C['white']}"/>
      <rect x="-26" y="-28" width="52" height="36" rx="6" fill="{C['ppD']}"/>
      <rect x="-23" y="-25" width="46" height="30" rx="4" fill="{C['screen']}"/>
      <path d="M -16 -16 L -8 -10 L -16 -4" fill="none" stroke="{C['ppL']}" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="-4" y="-7" width="12" height="3" rx="1.5" fill="{C['ppL']}"/>
      <rect x="24" y="-44" width="3" height="14" rx="1" fill="{C['white']}"/>
      <circle cx="25.5" cy="-45" r="4" fill="{C['purple']}"/></g>'''

def torso():
    dot_colors = [['#b79bff', '#4a3aa0', '#0c6f7e'],
                  ['#1d4d7d', '#b79bff', '#9fe7f2'],
                  ['#9fe7f2', '#0c6f7e', '#4a3aa0']]
    dots = ''
    gx, gy, gs = 33, 72, 11
    for r in range(3):
        for c in range(3):
            dots += f'<rect x="{gx+c*gs}" y="{gy+r*gs}" width="8" height="8" rx="2" fill="{dot_colors[r][c]}"/>'
    return f'''<g>
      <rect x="18" y="60" width="64" height="58" rx="8" fill="{C['grayD']}"/>
      <rect x="22" y="60" width="56" height="56" rx="7" fill="{C['white']}"/>
      <rect x="22" y="104" width="56" height="5" rx="2" fill="{C['purple']}" opacity="0.9"/>
      {dots}{head(0)}</g>'''

def svg_for(p):
    rootT = f'translate({p.get("faceX",0)},{p.get("bob",0)}) rotate({p.get("lean",0)},50,90)'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 160" width="200" height="320">
      <g transform="{rootT}">
        {leg(38, p.get('legL',0))}{leg(62, p.get('legR',0))}
        {arm(20,'L',p.get('armL',0), p.get('flag',False))}{arm(80,'R',p.get('armR',0))}
        {torso()}
      </g></svg>'''

# animation pose functions (mirror codernaught2d.js)
def idle(t): return dict(bob=math.sin(t*2)*2, armL=math.sin(t*2)*4, armR=-math.sin(t*2)*4)
def run(t):
    p = t*11
    return dict(legR=math.sin(p)*38, legL=-math.sin(p)*38, armR=-math.sin(p)*32,
                armL=math.sin(p)*32, lean=8, bob=abs(math.sin(p))*-3)
def fly(t):
    return dict(legR=18+math.sin(t*4)*6, legL=-18-math.sin(t*4)*6, armR=-140, armL=70,
                lean=-6, bob=math.sin(t*3)*3, flag=True)

def render(name, fn, period, nframes=24, fps=24):
    frames = []
    with tempfile.TemporaryDirectory() as td:
        for i in range(nframes):
            t = period * i / nframes
            svg = svg_for(fn(t))
            sp = os.path.join(td, f'{i}.svg'); pp = os.path.join(td, f'{i}.png')
            open(sp, 'w').write(svg)
            subprocess.run(['convert', '-background', 'none', sp, pp], check=True)
            frames.append(Image.open(pp).convert('RGBA'))
        dur = int(1000/fps)
        out = os.path.join(OUT, f'codernaught-{name}.gif')
        frames[0].save(out, save_all=True, append_images=frames[1:], loop=0,
                       duration=dur, disposal=2, transparency=0)
        # also a single hero PNG
        frames[len(frames)//4].save(os.path.join(OUT, f'codernaught-{name}.png'))
        print(f'wrote {out} ({nframes} frames)')

render('idle', idle, period=math.pi, nframes=20)
render('run',  run,  period=2*math.pi/11, nframes=18, fps=30)
render('fly',  fly,  period=2*math.pi/3,  nframes=24)
