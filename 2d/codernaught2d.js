/**
 * Codernaught 2D — a rigged SVG sprite of the Coder mascot robot.
 *
 * Geometry preserves the real 3MF front-view layout (normalized boxes measured
 * from Single_Coder_Bot.3mf):
 *   head/screen at top, 3x3 face grid on torso, arms at the sides, two split legs.
 * Art style follows the Coder "space friends" look: white suit, black terminal
 * screen with a >_ prompt, Coder-purple accents (#7000F4).
 *
 * Exports:
 *   createCodernaught(opts) -> { svg, parts, setPose(p), pose }
 *     parts: { root, headG, armL, armR, legL, legR, ... } (SVG groups, riggable)
 *     setPose({ armL, armR, legL, legR, lean, bob, ... }) rotates/translates groups
 *
 * Drop the returned svg into any DOM node, or render frames to PNG/GIF for Slides.
 */

const C = {
  white:  '#FFF8F9',   // suit (matches 3MF cream-white)
  gray:   '#C9C4C5',   // shaded sides
  grayD:  '#9a9598',   // deeper shade
  screen: '#0b0b12',   // terminal screen
  purple: '#7000F4',   // Coder purple
  ppL:    '#b79bff',   // light lavender (prompt text / accents)
  ppD:    '#4a3aa0',   // deep indigo (screen frame)
  outline:'#1a1424',
};

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}) => { const e = document.createElementNS(SVGNS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };

export function createCodernaught(opts = {}) {
  // viewBox 100 x 160 ; feet at y=150, head top ~y=8 (preserves ~0.60 W:H aspect)
  const svg = el('svg', { viewBox: '0 0 100 160', width: opts.width || 100, height: opts.height || 160 });
  svg.style.overflow = 'visible';

  const root = el('g', { id: 'cn-root' });
  svg.appendChild(root);

  // ── helper builders ─────────────────────────────────────────────────────────
  const rect = (x, y, w, h, fill, extra = {}) =>
    el('rect', { x, y, width: w, height: h, fill, rx: extra.rx ?? 2, ...extra });

  // ── LEGS (drawn first = behind torso). Two split legs, like the 3MF. ─────────
  // Legs occupy front-view y[0.00..0.31] of the model -> here lower region.
  function makeLeg(cxHip) {
    const g = el('g');                 // pivot at hip
    g.setAttribute('transform', `translate(${cxHip},112)`);
    // thigh + shin (white) with purple suit stripe; gray foot
    g.appendChild(rect(-9, 0, 18, 30, C.white, { rx: 3 }));
    g.appendChild(rect(-9, 0, 4, 30, C.purple, { rx: 2, opacity: .9 })); // inner stripe
    g.appendChild(rect(-11, 30, 22, 10, C.gray, { rx: 3 }));            // foot
    return g;
  }
  const legL = makeLeg(38);
  const legR = makeLeg(62);
  root.appendChild(legL); root.appendChild(legR);

  // ── ARMS (behind torso edges). Stubby blocky arms with purple shoulder band. ─
  function makeArm(cxSh, side) {
    const g = el('g');                 // pivot at shoulder
    g.setAttribute('transform', `translate(${cxSh},60)`);
    const x = side === 'L' ? -14 : 2;
    g.appendChild(rect(x, 0, 12, 34, C.gray, { rx: 4 }));        // upper arm (gray)
    g.appendChild(rect(x, 0, 12, 6, C.purple, { rx: 3 }));       // shoulder band
    g.appendChild(rect(x - 1, 30, 14, 12, C.white, { rx: 4 }));  // hand/claw (white)
    return g;
  }
  const armL = makeArm(20, 'L');
  const armR = makeArm(80, 'R');
  root.appendChild(armL); root.appendChild(armR);

  // ── FLAG (Coder banner) parented to the LEFT arm's hand; hidden by default ──
  const flag = el('g', { id: 'cn-flag', opacity: 0 });
  flag.appendChild(rect(-12, -46, 2.5, 52, C.white, { rx: 1 }));                 // pole
  flag.appendChild(rect(-12, -46, 28, 18, C.white, { rx: 1, stroke: C.outline, 'stroke-width': 0.6 })); // banner
  flag.appendChild(el('path', { transform: 'translate(-8,-43) scale(0.46)',
    d: 'M 26 4 L 14 4 A 14 14 0 1 0 14 32 L 26 32 L 26 22 L 16 22 A 6 6 0 1 1 16 14 L 26 14 Z',
    fill: '#090b0b' }));                                                          // Coder C mark
  armL.appendChild(flag);

  // ── TORSO + HEAD as one upper group (body) ──────────────────────────────────
  const body = el('g', { id: 'cn-body' });
  root.appendChild(body);

  // torso shell: gray base + white front (front-view y[0.31..1.0] -> y ~48..118)
  body.appendChild(rect(18, 60, 64, 58, C.grayD, { rx: 8 }));   // gray side/back
  body.appendChild(rect(22, 60, 56, 56, C.white, { rx: 7 }));   // white front panel
  // waist purple stripe
  body.appendChild(rect(22, 104, 56, 5, C.purple, { rx: 2, opacity: .9 }));

  // 3x3 chest button grid (the torso "face"), colors from the space-friends art
  const dotColors = [
    ['#b79bff', '#4a3aa0', '#0c6f7e'],
    ['#1d4d7d', '#b79bff', '#9fe7f2'],
    ['#9fe7f2', '#0c6f7e', '#4a3aa0'],
  ];
  const gx = 33, gy = 72, gs = 11;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    body.appendChild(rect(gx + c * gs, gy + r * gs, 8, 8, dotColors[r][c], { rx: 2 }));

  // ── HEAD (separate group so it can tilt). White helmet + black screen + >_ ──
  const headG = el('g', { id: 'cn-head' });
  headG.setAttribute('transform', 'translate(50,38)'); // neck pivot
  body.appendChild(headG);

  headG.appendChild(rect(-30, -32, 60, 44, C.gray, { rx: 9 }));    // helmet gray edge
  headG.appendChild(rect(-30, -32, 60, 44, C.white, { rx: 9, transform: 'translate(2,0)' }));
  headG.appendChild(rect(-26, -28, 52, 36, C.ppD, { rx: 6 }));     // screen frame (indigo)
  headG.appendChild(rect(-23, -25, 46, 30, C.screen, { rx: 4 }));  // black screen
  // >_ prompt
  headG.appendChild(el('path', { d: 'M -16 -16 L -8 -10 L -16 -4', fill: 'none',
    stroke: C.ppL, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  headG.appendChild(rect(-4, -7, 12, 3, C.ppL, { rx: 1.5 }));      // underscore cursor
  // antenna
  headG.appendChild(rect(24, -44, 3, 14, C.white, { rx: 1 }));
  headG.appendChild(el('circle', { cx: 25.5, cy: -45, r: 4, fill: C.purple }));

  // ── pose API ────────────────────────────────────────────────────────────────
  const pose = { armL: 0, armR: 0, legL: 0, legR: 0, lean: 0, bob: 0, headTilt: 0, faceX: 0 };
  const base = {
    legL: 'translate(38,112)', legR: 'translate(62,112)',
    armL: 'translate(20,60)',  armR: 'translate(80,60)',
    head: 'translate(50,38)',
  };
  function setPose(p) {
    Object.assign(pose, p);
    legL.setAttribute('transform', `${base.legL} rotate(${pose.legL})`);
    legR.setAttribute('transform', `${base.legR} rotate(${pose.legR})`);
    armL.setAttribute('transform', `${base.armL} rotate(${pose.armL})`);
    armR.setAttribute('transform', `${base.armR} rotate(${pose.armR})`);
    headG.setAttribute('transform', `${base.head} rotate(${pose.headTilt})`);
    root.setAttribute('transform', `translate(${pose.faceX},${pose.bob}) rotate(${pose.lean},50,90)`);
  }
  setPose(pose);

  const showFlag = (on) => flag.setAttribute('opacity', on ? 1 : 0);
  return { svg, parts: { root, body, headG, armL, armR, legL, legR, flag }, setPose, showFlag, pose, palette: C };
}

// ── Animation presets (return a function of time t in seconds) ────────────────
export const animations = {
  idle: (t) => ({ bob: Math.sin(t * 2) * 2, armL: Math.sin(t * 2) * 4, armR: -Math.sin(t * 2) * 4, headTilt: Math.sin(t * 1.3) * 1.5 }),
  run: (t) => {
    const p = t * 11;
    return { legR: Math.sin(p) * 38, legL: -Math.sin(p) * 38, armR: -Math.sin(p) * 32, armL: Math.sin(p) * 32, lean: 8, bob: Math.abs(Math.sin(p)) * -3 };
  },
  jump: () => ({ legR: 22, legL: -22, armR: -120, armL: 120, lean: 0, bob: 0 }),
  fall: () => ({ legR: 14, legL: -14, armR: -150, armL: 150 }),
  fly: (t) => ({ legR: 18 + Math.sin(t * 4) * 6, legL: -18 - Math.sin(t * 4) * 6, armR: -140, armL: 70, lean: -6, bob: Math.sin(t * 3) * 3, headTilt: -4 }),
};
