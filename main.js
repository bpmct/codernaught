import { gsap } from 'gsap';

// ─── refs ────────────────────────────────────────────────────────────────────
const R = id => document.getElementById(id);

// With the new SVG structure, all pivot groups have transform="translate(px,py)"
// and rotate around (0,0) in their local space.
// GSAP's svgOrigin or transformOrigin="0 0" handles this.
const TO = { transformOrigin: '0 0' }; // local pivot for translate-positioned groups

const e = {
  wrap:  R('body-wrap'), // whole-body: y-bob, squash, lean — never rotate individual limbs here
  head:  R('head'),   // pivot already at translate(160,170) → rotate around 0,0
  la:    R('la'),     // shoulder pivot at translate(84,210)
  ra:    R('ra'),     // shoulder pivot at translate(236,210)
  la2:   R('la2'),    // elbow at translate(-58,1) inside la
  ra2:   R('ra2'),    // elbow at translate(58,1) inside ra
  ll:    R('ll'),     // hip pivot at translate(124,332)
  rl:    R('rl'),     // hip pivot at translate(196,332)
  ll2:   R('ll2'),    // knee at translate(0,62) inside ll
  rl2:   R('rl2'),    // knee at translate(0,62) inside rl
  le:    R('le'),  re: R('re'),
  lp:    R('lp'),  rp: R('rp'),
  lbrow: R('lbrow'), rbrow: R('rbrow'),
  mouth: R('mouth'),
  ant:   R('ant'),
  vscan: R('vscan'),
  shadow:R('shadow'),
  label: R('anim-label'),
  leds:  [1,2,3,4,5].map(i => R('l'+i)),
};

gsap.defaults({ ease: 'power2.inOut' });

// Set transform-origin to 0 0 for all pivot groups once at boot
// (GSAP will respect the existing translate and rotate around local 0,0)
[e.head, e.la, e.ra, e.la2, e.ra2, e.ll, e.rl, e.ll2, e.rl2].forEach(el => {
  gsap.set(el, TO);
});

// ─── state ───────────────────────────────────────────────────────────────────
let activeAnim  = null;
let activeLoops = [];

const kill = () => {
  activeAnim?.kill(); activeAnim = null;
  activeLoops.forEach(t => t?.kill()); activeLoops = [];
};
const addLoop = t => { activeLoops.push(t); return t; };

function resetAll(dur = 0.35) {
  const limbs = [e.head, e.la, e.ra, e.la2, e.ra2, e.ll, e.rl, e.ll2, e.rl2];
  gsap.to(limbs, { rotation: 0, duration: dur, ease: 'power2.out', ...TO });
  gsap.to(e.wrap, { y: 0, x: 0, rotation: 0, scaleY: 1, scaleX: 1, duration: dur, ease: 'power2.out' });
  gsap.to(e.shadow, { scaleX: 1, scaleY: 1, opacity: 0.32, attr: { cy: 463 }, duration: dur });
  sliders.forEach(s => { s.el.value = 0; s.lbl.textContent = '0°'; });
}

// ─── shadow sync ─────────────────────────────────────────────────────────────
// When wrap moves up, shadow should stay on the floor and compress
function shadowUp(dy, dur, ease) {
  // shadow y stays at 463 (floor); scale compresses as robot goes higher
  const sc = Math.max(0.3, 1 - Math.abs(dy) / 180);
  gsap.to(e.shadow, { scaleX: sc, opacity: 0.32 * sc * 2, duration: dur, ease });
}
function shadowDown(dur, ease) {
  gsap.to(e.shadow, { scaleX: 1, opacity: 0.32, duration: dur, ease });
}

// ─── LEDs ────────────────────────────────────────────────────────────────────
function startLEDs() {
  e.leds.forEach((led, i) => gsap.to(led, {
    opacity: 0.1, duration: 0.55 + i * 0.14,
    repeat: -1, yoyo: true, ease: 'sine.inOut', delay: i * 0.2,
  }));
}

// ─── blink ───────────────────────────────────────────────────────────────────
const EY = { transformOrigin: '50% 50%' };
function doBlink(count = 1) {
  const t = [e.le, e.re, e.lp, e.rp];
  const one = () => gsap.to(t, {
    scaleY: 0.05, duration: 0.065, ease: 'power3.in', ...EY,
    onComplete: () => gsap.to(t, { scaleY: 1, duration: 0.11, ease: 'power2.out', ...EY }),
  });
  one();
  for (let i = 1; i < count; i++) setTimeout(one, i * 240);
}
function autoBlink() {
  const next = () => setTimeout(() => {
    doBlink(Math.random() < 0.2 ? 2 : 1);
    next();
  }, 2000 + Math.random() * 4000);
  setTimeout(next, 1800);
}

const setLabel = s => { e.label.textContent = s.toUpperCase(); };

// ════════════════════════════════════════════════════════════════════════════
//  ANIMATIONS
//  Key design rule: whole-body y/scale on e.wrap ONLY.
//  Limb rotations on their own groups, pivot = 0,0 (local translate origin).
// ════════════════════════════════════════════════════════════════════════════

function playIdle() {
  kill(); setLabel('idle');
  addLoop(gsap.to(e.wrap,  { y: -5, duration: 2.1, repeat: -1, yoyo: true, ease: 'sine.inOut' }));
  addLoop(gsap.to(e.head,  { rotation: 2.5, duration: 2.5, repeat: -1, yoyo: true, ease: 'sine.inOut', ...TO }));
  addLoop(gsap.to(e.la,    { rotation:  5,  duration: 2.1, repeat: -1, yoyo: true, ease: 'sine.inOut', ...TO }));
  addLoop(gsap.to(e.ra,    { rotation: -5,  duration: 2.1, repeat: -1, yoyo: true, ease: 'sine.inOut', ...TO }));
  addLoop(gsap.to(e.ant,   { scale: 1.3, duration: 1.4, repeat: -1, yoyo: true, ease: 'sine.inOut', transformOrigin: '50% 50%' }));
  addLoop(gsap.to(e.shadow,{ scaleX: 0.93, duration: 2.1, repeat: -1, yoyo: true, ease: 'sine.inOut' }));
}

// ─────────────────────────────────────────────────────────────────────────────
function playWalk() {
  kill(); setLabel('walk');
  const D = 0.5, LF = 26, KB = 22, AF = 18;
  const tl = gsap.timeline({ repeat: -1 });
  // Phase A
  tl.to(e.ll,  { rotation:  LF, duration: D, ...TO }, 0)
    .to(e.rl,  { rotation: -LF, duration: D, ...TO }, 0)
    .to(e.ll2, { rotation: -KB, duration: D, ...TO }, 0)
    .to(e.rl2, { rotation: KB/2,duration: D, ...TO }, 0)
    .to(e.la,  { rotation: -AF, duration: D, ...TO }, 0)
    .to(e.ra,  { rotation:  AF, duration: D, ...TO }, 0)
    .to(e.la2, { rotation:  8,  duration: D, ...TO }, 0)
    .to(e.ra2, { rotation: -8,  duration: D, ...TO }, 0)
    .to(e.wrap,{ y: -6, duration: D/2, ease: 'power2.out' }, 0)
    .to(e.wrap,{ y:  0, duration: D/2, ease: 'power2.in'  }, D/2)
  // Phase B
    .to(e.ll,  { rotation: -LF, duration: D, ...TO }, D)
    .to(e.rl,  { rotation:  LF, duration: D, ...TO }, D)
    .to(e.ll2, { rotation: KB/2,duration: D, ...TO }, D)
    .to(e.rl2, { rotation: -KB, duration: D, ...TO }, D)
    .to(e.la,  { rotation:  AF, duration: D, ...TO }, D)
    .to(e.ra,  { rotation: -AF, duration: D, ...TO }, D)
    .to(e.la2, { rotation: -8,  duration: D, ...TO }, D)
    .to(e.ra2, { rotation:  8,  duration: D, ...TO }, D)
    .to(e.wrap,{ y: -6, duration: D/2, ease: 'power2.out' }, D)
    .to(e.wrap,{ y:  0, duration: D/2, ease: 'power2.in'  }, D*1.5);
  addLoop(gsap.to(e.head,  { rotation: 3, duration: D*2, repeat: -1, yoyo: true, ease: 'sine.inOut', ...TO }));
  addLoop(gsap.to(e.shadow,{ scaleX: 0.86, duration: D, repeat: -1, yoyo: true }));
  activeAnim = tl;
}

// ─────────────────────────────────────────────────────────────────────────────
function playRun() {
  kill(); setLabel('run');
  const D = 0.22, LF = 28, KB = 28, AF = 30;
  // lean the whole body forward — reduced to -5° to minimize limb detachment
  gsap.to(e.wrap, { rotation: -5, duration: 0.3, ease: 'power2.out' });
  const tl = gsap.timeline({ repeat: -1 });
  tl.to(e.ll,  { rotation:  LF, duration: D, ease: 'power3.inOut', ...TO }, 0)
    .to(e.rl,  { rotation: -LF, duration: D, ease: 'power3.inOut', ...TO }, 0)
    .to(e.ll2, { rotation: -KB, duration: D, ...TO }, 0)
    .to(e.rl2, { rotation:  10, duration: D, ...TO }, 0)
    .to(e.la,  { rotation: -AF, duration: D, ease: 'power3.inOut', ...TO }, 0)
    .to(e.ra,  { rotation:  AF, duration: D, ease: 'power3.inOut', ...TO }, 0)
    .to(e.la2, { rotation:  14, duration: D, ...TO }, 0)
    .to(e.ra2, { rotation: -14, duration: D, ...TO }, 0)
    .to(e.wrap,{ y: -12, duration: D/2, ease: 'power2.out' }, 0)
    .to(e.wrap,{ y:   0, duration: D/2, ease: 'power2.in'  }, D/2)

    .to(e.ll,  { rotation: -LF, duration: D, ease: 'power3.inOut', ...TO }, D)
    .to(e.rl,  { rotation:  LF, duration: D, ease: 'power3.inOut', ...TO }, D)
    .to(e.ll2, { rotation:  10, duration: D, ...TO }, D)
    .to(e.rl2, { rotation: -KB, duration: D, ...TO }, D)
    .to(e.la,  { rotation:  AF, duration: D, ease: 'power3.inOut', ...TO }, D)
    .to(e.ra,  { rotation: -AF, duration: D, ease: 'power3.inOut', ...TO }, D)
    .to(e.la2, { rotation: -14, duration: D, ...TO }, D)
    .to(e.ra2, { rotation:  14, duration: D, ...TO }, D)
    .to(e.wrap,{ y: -12, duration: D/2, ease: 'power2.out' }, D)
    .to(e.wrap,{ y:   0, duration: D/2, ease: 'power2.in'  }, D*1.5);
  addLoop(gsap.to(e.shadow,{ scaleX: 0.7, opacity: 0.2, duration: D, repeat: -1, yoyo: true }));
  activeAnim = tl;
}

// ─────────────────────────────────────────────────────────────────────────────
function playJump() {
  kill(); setLabel('jump');
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.5 });
  tl// crouch
    .to(e.wrap, { y: 14, scaleY: 0.86, duration: 0.21, ease: 'power2.in' })
    .to(e.ll,   { rotation:  20, duration: 0.21, ...TO }, '<')
    .to(e.rl,   { rotation: -20, duration: 0.21, ...TO }, '<')
    .to(e.ll2,  { rotation:  28, duration: 0.21, ...TO }, '<')
    .to(e.rl2,  { rotation:  28, duration: 0.21, ...TO }, '<')
    .to(e.la,   { rotation:  32, duration: 0.21, ...TO }, '<')
    .to(e.ra,   { rotation: -32, duration: 0.21, ...TO }, '<')
    // launch
    .to(e.wrap, { y: -95, scaleY: 1.08, duration: 0.38, ease: 'power3.out' })
    .to(e.ll,   { rotation: -25, duration: 0.34, ...TO }, '<')
    .to(e.rl,   { rotation:  25, duration: 0.34, ...TO }, '<')
    .to(e.ll2,  { rotation: -30, duration: 0.3,  ...TO }, '<')
    .to(e.rl2,  { rotation: -30, duration: 0.3,  ...TO }, '<')
    .to(e.la,   { rotation: -88, duration: 0.3, ease: 'back.out(1.8)', ...TO }, '<')
    .to(e.ra,   { rotation:  88, duration: 0.3, ease: 'back.out(1.8)', ...TO }, '<')
    .to(e.head, { rotation: -12, duration: 0.28, ...TO }, '<')
    .to(e.ant,  { scale: 1.9, duration: 0.32, transformOrigin: '50% 50%' }, '<')
    // apex hang
    .to({}, { duration: 0.16 })
    .call(() => shadowUp(-95, 0.38, 'power3.out'))
    // fall
    .to(e.wrap, { y: 0, scaleY: 0.82, duration: 0.27, ease: 'power3.in' })
    .to(e.ll,   { rotation:  22, duration: 0.23, ...TO }, '<')
    .to(e.rl,   { rotation: -22, duration: 0.23, ...TO }, '<')
    .to(e.ll2,  { rotation:  38, duration: 0.22, ...TO }, '<')
    .to(e.rl2,  { rotation:  38, duration: 0.22, ...TO }, '<')
    .to(e.la,   { rotation:  30, duration: 0.23, ...TO }, '<')
    .to(e.ra,   { rotation: -30, duration: 0.23, ...TO }, '<')
    .to(e.ant,  { scale: 1,   duration: 0.24, transformOrigin: '50% 50%' }, '<')
    // land squash
    .to(e.wrap, { scaleY: 0.8, y: 6, duration: 0.1, ease: 'power4.out' })
    .to(e.shadow,{ scaleX: 1.5, opacity: 0.55, duration: 0.1 }, '<')
    // bounce recovery
    .to(e.wrap, { scaleY: 1, y: 0, duration: 0.38, ease: 'elastic.out(1,0.55)' })
    .to(e.ll,   { rotation: 0, duration: 0.3, ...TO }, '<')
    .to(e.rl,   { rotation: 0, duration: 0.3, ...TO }, '<')
    .to(e.ll2,  { rotation: 0, duration: 0.3, ...TO }, '<')
    .to(e.rl2,  { rotation: 0, duration: 0.3, ...TO }, '<')
    .to(e.la,   { rotation: 0, duration: 0.3, ...TO }, '<')
    .to(e.ra,   { rotation: 0, duration: 0.3, ...TO }, '<')
    .to(e.head, { rotation: 0, duration: 0.3, ...TO }, '<')
    .to(e.shadow,{ scaleX: 1, opacity: 0.32, duration: 0.35 }, '<');
  activeAnim = tl;
}

// ─────────────────────────────────────────────────────────────────────────────
function playWave() {
  kill(); setLabel('wave');
  const tl = gsap.timeline({ repeat: -1 });
  tl.to(e.ra,  { rotation: -80, duration: 0.4, ease: 'back.out(1.4)', ...TO })
    .to(e.ra2, { rotation:  -28, duration: 0.32, ...TO }, '<')
    .to(e.head,{ rotation:  -12, duration: 0.32, ...TO }, '<')
    .to(e.ra2, { rotation:   34, duration: 0.2, ease: 'power1.inOut', ...TO })
    .to(e.ra2, { rotation:  -40, duration: 0.2, ease: 'power1.inOut', ...TO })
    .to(e.ra2, { rotation:   34, duration: 0.2, ease: 'power1.inOut', ...TO })
    .to(e.ra2, { rotation:  -40, duration: 0.2, ease: 'power1.inOut', ...TO })
    .to(e.ra2, { rotation:   34, duration: 0.2, ease: 'power1.inOut', ...TO })
    .to(e.ra2, { rotation:  -40, duration: 0.2, ease: 'power1.inOut', ...TO })
    .to(e.ra2, { rotation:   34, duration: 0.2, ease: 'power1.inOut', ...TO })
    .to(e.ra,  { rotation:    0, duration: 0.4, ease: 'power2.in', ...TO })
    .to(e.ra2, { rotation:    0, duration: 0.32, ...TO }, '<')
    .to(e.head,{ rotation:    0, duration: 0.32, ...TO }, '<')
    .to({}, { duration: 0.65 });
  activeAnim = tl;
}

// ─────────────────────────────────────────────────────────────────────────────
function playThink() {
  kill(); setLabel('think');
  const tl = gsap.timeline({ repeat: -1 });
  tl// raise arm to chin
    .to(e.la,  { rotation: -42, duration: 0.5, ease: 'power2.out', ...TO })
    .to(e.la2, { rotation:  62, duration: 0.4, ...TO }, '<0.1')
    .to(e.head,{ rotation: -24, duration: 0.5, ease: 'power2.out', ...TO }, '<0.1')
    .to(e.ra,  { rotation:  18, duration: 0.4, ...TO }, '<0.1') // resting on hip
    // chin scratch
    .to(e.la2, { rotation: 50, duration: 0.12, ease: 'power1.inOut', ...TO })
    .to(e.la2, { rotation: 64, duration: 0.12, ease: 'power1.inOut', ...TO })
    .to(e.la2, { rotation: 50, duration: 0.12, ease: 'power1.inOut', ...TO })
    .to(e.la2, { rotation: 64, duration: 0.12, ease: 'power1.inOut', ...TO })
    .to(e.la2, { rotation: 50, duration: 0.12, ease: 'power1.inOut', ...TO })
    // ponder bob — look up, look left, look at ground
    .to(e.head,{ rotation: -14, duration: 0.35, ease: 'sine.inOut', repeat: 2, yoyo: true, ...TO })
    .to(e.ant, { scale: 1.7, duration: 0.32, repeat: 2, yoyo: true, transformOrigin: '50% 50%' }, '<')
    // return
    .to(e.la,  { rotation: 0, duration: 0.48, ...TO })
    .to(e.la2, { rotation: 0, duration: 0.4, ...TO }, '<0.1')
    .to(e.head,{ rotation: 0, duration: 0.45, ...TO }, '<0.1')
    .to(e.ra,  { rotation: 0, duration: 0.4, ...TO }, '<0.1')
    .to({}, { duration: 1.0 });
  activeAnim = tl;
}

// ─────────────────────────────────────────────────────────────────────────────
function playParty() {
  kill(); setLabel('party');
  const B = 0.38;
  const tl = gsap.timeline({ repeat: -1 });
  // Party = groovy side-to-side groove with body rotation + alternating arm swings
  // beat 1 — groove left: body rotates -12°, L arm sweeps down-back, R arm up
  tl.to(e.wrap,{ rotation: -12, y: -8, duration: B, ease: 'power2.out' }, 0)
    .to(e.head, { rotation: 14, duration: B, ...TO }, 0)        // head counter-leans
    .to(e.la,   { rotation:  28, duration: B, ease: 'power2.out', ...TO }, 0)   // L sweeps back
    .to(e.ra,   { rotation: -72, duration: B, ease: 'back.out(1.6)', ...TO }, 0) // R swings up
    .to(e.la2,  { rotation:  18, duration: B, ...TO }, 0)
    .to(e.ra2,  { rotation: -18, duration: B, ...TO }, 0)
    .to(e.ll,   { rotation: -16, duration: B, ...TO }, 0)
    .to(e.rl,   { rotation:  10, duration: B, ...TO }, 0)
  // beat 2 — groove right: body rotates +12°, R arm sweeps down-back, L arm up
    .to(e.wrap, { rotation:  12, y: -8, duration: B, ease: 'power2.out' }, B)
    .to(e.head, { rotation: -14, duration: B, ...TO }, B)       // head counter-leans
    .to(e.la,   { rotation: -72, duration: B, ease: 'back.out(1.6)', ...TO }, B) // L swings up
    .to(e.ra,   { rotation:  28, duration: B, ease: 'power2.out', ...TO }, B)   // R sweeps back
    .to(e.la2,  { rotation: -18, duration: B, ...TO }, B)
    .to(e.ra2,  { rotation:  18, duration: B, ...TO }, B)
    .to(e.ll,   { rotation:  10, duration: B, ...TO }, B)
    .to(e.rl,   { rotation: -16, duration: B, ...TO }, B)
  // beat 3 — spin-center: both arms out wide low (Charleston pose), big body bob
    .to(e.wrap, { rotation: 0, y: -22, scaleY: 1.06, duration: B*0.6, ease: 'power3.out' }, B*2)
    .to(e.la,   { rotation:  42, duration: B*0.6, ease: 'power2.out', ...TO }, B*2)  // arms out 45°
    .to(e.ra,   { rotation: -42, duration: B*0.6, ease: 'power2.out', ...TO }, B*2)
    .to(e.la2,  { rotation:  12, duration: B*0.6, ...TO }, B*2)
    .to(e.ra2,  { rotation: -12, duration: B*0.6, ...TO }, B*2)
    .to(e.ll,   { rotation: -14, duration: B*0.6, ...TO }, B*2)
    .to(e.rl,   { rotation:  14, duration: B*0.6, ...TO }, B*2)
    .to(e.head, { rotation: 0, duration: B*0.6, ...TO }, B*2)
    // land
    .to(e.wrap, { y: 4, scaleY: 0.87, duration: B*0.28, ease: 'power4.in' }, B*2.62)
    .to(e.shadow,{ scaleX: 1.45, opacity: 0.52, duration: B*0.28 }, B*2.62)
  // beat 4 — bounce recover, arms settle
    .to(e.wrap, { y: 0, scaleY: 1.0, duration: B*0.5, ease: 'elastic.out(1,0.55)' }, B*2.9)
    .to(e.shadow,{ scaleX: 1, opacity: 0.32, duration: B*0.45 }, B*2.9)
    .to(e.la,   { rotation: -8, duration: B*0.45, ...TO }, B*2.9)
    .to(e.ra,   { rotation:  8, duration: B*0.45, ...TO }, B*2.9)
    .to(e.ll,   { rotation:  0, duration: B*0.4, ...TO }, B*2.9)
    .to(e.rl,   { rotation:  0, duration: B*0.4, ...TO }, B*2.9);
  addLoop(gsap.to(e.ant, { scale: 1.9, duration: B*0.5, repeat: -1, yoyo: true, ease: 'power3.inOut', transformOrigin: '50% 50%' }));
  addLoop(gsap.to(e.leds,{ opacity: 1, stagger: 0.06, duration: B/2, repeat: -1, yoyo: true }));
  activeAnim = tl;
}

// ─────────────────────────────────────────────────────────────────────────────
function playCheer() {
  kill(); setLabel('cheer');
  // Cheer = straight-up fist pumps, NO body lean, small hop on each pump
  // Distinct from Party (groove) — this is pure vertical energy
  const tl = gsap.timeline({ repeat: -1 });
  tl// raise arms straight up — fists toward sky
    .to(e.la,   { rotation: -85, duration: 0.28, ease: 'power2.out', ...TO })
    .to(e.ra,   { rotation:  85, duration: 0.28, ease: 'power2.out', ...TO }, '<')
    .to(e.la2,  { rotation: -12, duration: 0.28, ...TO }, '<')
    .to(e.ra2,  { rotation:  12, duration: 0.28, ...TO }, '<')
    .to(e.head, { rotation:  -6, duration: 0.28, ...TO }, '<')   // slight tilt back = looking up
    .to(e.wrap, { y: -12, scaleY: 1.04, duration: 0.28, ease: 'power2.out' }, '<')
    .to(e.shadow,{ scaleX: 0.82, opacity: 0.22, duration: 0.28 }, '<')
    // pump down — fists drop to ~45°, land hop
    .to(e.la,   { rotation: -55, duration: 0.18, ease: 'power3.in', ...TO })
    .to(e.ra,   { rotation:  55, duration: 0.18, ease: 'power3.in', ...TO }, '<')
    .to(e.wrap, { y: 3, scaleY: 0.92, duration: 0.18, ease: 'power3.in' }, '<')
    .to(e.shadow,{ scaleX: 1.12, opacity: 0.4, duration: 0.18 }, '<')
    // recovery bounce
    .to(e.wrap, { y: 0, scaleY: 1.0, duration: 0.22, ease: 'power2.out' })
    .to(e.shadow,{ scaleX: 1, opacity: 0.32, duration: 0.22 }, '<')
    // pump UP again — 2nd fist pump
    .to(e.la,   { rotation: -85, duration: 0.24, ease: 'power2.out', ...TO })
    .to(e.ra,   { rotation:  85, duration: 0.24, ease: 'power2.out', ...TO }, '<')
    .to(e.wrap, { y: -12, scaleY: 1.04, duration: 0.24, ease: 'power2.out' }, '<')
    .to(e.shadow,{ scaleX: 0.82, opacity: 0.22, duration: 0.24 }, '<')
    // pump down again
    .to(e.la,   { rotation: -55, duration: 0.18, ease: 'power3.in', ...TO })
    .to(e.ra,   { rotation:  55, duration: 0.18, ease: 'power3.in', ...TO }, '<')
    .to(e.wrap, { y: 3, scaleY: 0.92, duration: 0.18, ease: 'power3.in' }, '<')
    .to(e.shadow,{ scaleX: 1.12, opacity: 0.4, duration: 0.18 }, '<')
    .to(e.wrap, { y: 0, scaleY: 1.0, duration: 0.2, ease: 'power2.out' })
    .to(e.shadow,{ scaleX: 1, opacity: 0.32, duration: 0.2 }, '<')
    // arms back down, rest pause
    .to(e.la,   { rotation: 0, duration: 0.32, ease: 'power2.inOut', ...TO })
    .to(e.ra,   { rotation: 0, duration: 0.32, ease: 'power2.inOut', ...TO }, '<')
    .to(e.la2,  { rotation: 0, duration: 0.28, ...TO }, '<')
    .to(e.ra2,  { rotation: 0, duration: 0.28, ...TO }, '<')
    .to(e.head, { rotation: 0, duration: 0.28, ...TO }, '<')
    .to({}, { duration: 0.42 });
  addLoop(gsap.to(e.ant, { scale: 1.6, duration: 0.24, repeat: -1, yoyo: true, transformOrigin: '50% 50%' }));
  activeAnim = tl;
}

// ─────────────────────────────────────────────────────────────────────────────
function playSneak() {
  kill(); setLabel('sneak');
  const D = 0.62, LF = 18, KB = 22, AF = 18;
  // crouch + forward lean
  gsap.to(e.wrap, { y: 22, rotation: -10, duration: 0.4 });
  const tl = gsap.timeline({ repeat: -1 });
  tl.to(e.ll,  { rotation:  LF, duration: D, ease: 'power1.inOut', ...TO }, 0)
    .to(e.rl,  { rotation: -LF, duration: D, ease: 'power1.inOut', ...TO }, 0)
    .to(e.ll2, { rotation: -KB, duration: D, ...TO }, 0)
    .to(e.rl2, { rotation: KB/2,duration: D, ...TO }, 0)
    .to(e.la,  { rotation: -AF, duration: D, ease: 'power1.inOut', ...TO }, 0)
    .to(e.ra,  { rotation:  AF, duration: D, ease: 'power1.inOut', ...TO }, 0)
    .to(e.ll,  { rotation: -LF, duration: D, ease: 'power1.inOut', ...TO }, D)
    .to(e.rl,  { rotation:  LF, duration: D, ease: 'power1.inOut', ...TO }, D)
    .to(e.ll2, { rotation: KB/2,duration: D, ...TO }, D)
    .to(e.rl2, { rotation: -KB, duration: D, ...TO }, D)
    .to(e.la,  { rotation:  AF, duration: D, ease: 'power1.inOut', ...TO }, D)
    .to(e.ra,  { rotation: -AF, duration: D, ease: 'power1.inOut', ...TO }, D);
  addLoop(gsap.to(e.shadow,{ scaleX: 0.82, duration: D, repeat: -1, yoyo: true }));
  activeAnim = tl;
}

// ─────────────────────────────────────────────────────────────────────────────
function playFall() {
  kill(); setLabel('fall');
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4 });
  tl// stumble
    .to(e.wrap, { rotation: 10, y:  8, duration: 0.45, ease: 'power1.in' })
    .to(e.la,   { rotation: -52, duration: 0.4, ...TO }, '<0.1')
    .to(e.ra,   { rotation:  52, duration: 0.4, ...TO }, '<0.1')
    .to(e.head, { rotation:  18, duration: 0.4, ...TO }, '<0.1')
    // tip accelerates
    .to(e.wrap, { rotation: 88, y: 84, duration: 0.48, ease: 'power3.in' })
    .to(e.la,   { rotation: -90, duration: 0.42, ...TO }, '<')
    .to(e.ra,   { rotation:  90, duration: 0.42, ...TO }, '<')
    .to(e.head, { rotation:  38,  duration: 0.42, ...TO }, '<')
    .to(e.ll,   { rotation:  20, duration: 0.3, ...TO }, '<0.2')
    .to(e.rl,   { rotation: -10, duration: 0.3, ...TO }, '<')
    // SMACK
    .to(e.wrap, { rotation: 90, y: 88, scaleY: 0.76, duration: 0.08, ease: 'power4.in' })
    .to(e.shadow,{ scaleX: 1.8, opacity: 0.65, duration: 0.08 }, '<')
    // stunned wobble
    .to(e.wrap, { scaleY: 1.04, duration: 0.5, ease: 'elastic.out(1,0.4)' })
    .to(e.head, { rotation: 46, duration: 0.1, ease: 'power1.inOut', repeat: 6, yoyo: true, ...TO }, '<0.05')
    .to({}, { duration: 0.55 })
    // get up (reverse tip)
    .to(e.wrap, { rotation: 0, y: 0, scaleY: 1, duration: 0.7, ease: 'back.out(1.4)' })
    .to(e.la,   { rotation: 0, duration: 0.6, ...TO }, '<')
    .to(e.ra,   { rotation: 0, duration: 0.6, ...TO }, '<')
    .to(e.head, { rotation: 0, duration: 0.55, ...TO }, '<')
    .to(e.ll,   { rotation: 0, duration: 0.5, ...TO }, '<')
    .to(e.rl,   { rotation: 0, duration: 0.5, ...TO }, '<')
    .to(e.shadow,{ scaleX: 1, opacity: 0.32, duration: 0.55 }, '<');
  activeAnim = tl;
}

// ════════════════════════════════════════════════════════════════════════════
//  EXPRESSIONS
// ════════════════════════════════════════════════════════════════════════════
const TF = { transformOrigin: '50% 50%' };
const MP = [1,2,3,4,5,6].map(i => R('mp'+i));

function exprHappy() {
  // squint + upturned mouth
  gsap.to([e.le,e.re],  { scaleY: 0.28, duration: 0.18, yoyo:true, repeat:1, ...TF });
  gsap.to([e.lp,e.rp],  { scaleY: 0.28, duration: 0.18, yoyo:true, repeat:1, ...TF });
  gsap.to([MP[0],MP[5]], { y: 3,  duration: 0.2, yoyo:true, repeat:1 });
  gsap.to([MP[1],MP[4]], { y: 1.5,duration: 0.2, yoyo:true, repeat:1 });
  gsap.to(e.wrap, { y: -16, duration: 0.18, ease:'power2.out', yoyo:true, repeat:2 });
  gsap.to(e.leds, { opacity:1, stagger:0.04, duration:0.15, yoyo:true, repeat:3 });
}

function exprCurious() {
  gsap.to(e.head,{ rotation: -26, duration: 0.38, ease:'back.out(1.5)', ...TO });
  gsap.to(e.le,  { scaleX: 1.45, scaleY: 1.45, duration: 0.3, ...TF });
  gsap.to(e.re,  { scaleX: 0.68, scaleY: 1.1,  duration: 0.3, ...TF });
  gsap.to(e.ant, { scale: 1.55, duration: 0.3, ...TF });
  setTimeout(() => {
    gsap.to(e.head,{ rotation:0, duration:0.42, ...TO });
    gsap.to([e.le,e.re],{ scaleX:1,scaleY:1, duration:0.35, ...TF });
    gsap.to(e.ant, { scale:1, duration:0.35, ...TF });
  }, 2900);
}

function exprBlink() { doBlink(1); }

function exprWink() {
  gsap.to(e.re, { scaleY:0.05, duration:0.07, ease:'power3.in', ...TF,
    onComplete:()=>setTimeout(()=>gsap.to(e.re,{scaleY:1,duration:0.13,ease:'power2.out',...TF}),380)});
  gsap.to(e.rp, { scaleY:0.05, duration:0.07, ease:'power3.in', ...TF,
    onComplete:()=>setTimeout(()=>gsap.to(e.rp,{scaleY:1,duration:0.13,ease:'power2.out',...TF}),380)});
  gsap.to(e.head,{ rotation:12, duration:0.24, yoyo:true, repeat:1, ...TO });
}

function exprAngry() {
  gsap.set([e.lbrow,e.rbrow],{ opacity:1 });
  gsap.to(e.lbrow,{ rotation: 18, duration:0.2, transformOrigin:'100% 50%' });
  gsap.to(e.rbrow,{ rotation:-18, duration:0.2, transformOrigin:'0% 50%' });
  gsap.to(e.le,{ scaleX:1.18,scaleY:0.5, rotation: 8, duration:0.2, ...TF });
  gsap.to(e.re,{ scaleX:1.18,scaleY:0.5, rotation:-8, duration:0.2, ...TF });
  gsap.to(e.lp,{ scaleY:0.5, duration:0.2, ...TF });
  gsap.to(e.rp,{ scaleY:0.5, duration:0.2, ...TF });
  gsap.to(e.head,{ rotation:-10, duration:0.15, ease:'power1.inOut', repeat:4, yoyo:true, ...TO,
    onComplete:()=>{
      gsap.to(e.head,{ rotation:0, duration:0.2, ...TO });
      setTimeout(()=>{
        gsap.to([e.lbrow,e.rbrow],{ rotation:0, opacity:0, duration:0.3 });
        gsap.to([e.le,e.re],{ scaleX:1,scaleY:1,rotation:0, duration:0.35, ...TF });
        gsap.to([e.lp,e.rp],{ scaleY:1, duration:0.35, ...TF });
      }, 700);
    },
  });
  gsap.to(e.leds,{ opacity:1, stagger:0.04, duration:0.12 });
  setTimeout(()=>gsap.to(e.leds,{ opacity:0.5, duration:0.7 }), 2100);
}

function exprShock() {
  gsap.to([e.le,e.re],{ scaleX:1.45,scaleY:1.45, duration:0.11, ease:'power3.out', ...TF });
  gsap.to([e.lp,e.rp],{ scaleX:1.2, scaleY:1.2,  duration:0.11, ...TF });
  gsap.to(e.wrap,{ y:-12, duration:0.11, ease:'power3.out', yoyo:true, repeat:1 });
  gsap.to(e.ant, { scale:2.1, duration:0.14, ...TF,
    onComplete:()=>gsap.to(e.ant,{scale:1,duration:0.55,delay:0.9,...TF}) });
  setTimeout(()=>gsap.to([e.le,e.re,e.lp,e.rp],{scaleX:1,scaleY:1,duration:0.4,...TF}), 3000);
}

function exprScan() {
  gsap.to(e.vscan,{  x:72, duration:0.62, ease:'power1.inOut', repeat:5, yoyo:true,
    onComplete:()=>gsap.set(e.vscan,{x:0}) });
  gsap.to([e.lp,e.rp],{ x:9, duration:0.62, ease:'power1.inOut', repeat:5, yoyo:true,
    onComplete:()=>gsap.set([e.lp,e.rp],{x:0}) });
  gsap.to(e.head,{ rotation:7, duration:0.5, yoyo:true, repeat:1, ...TO });
}

function exprSleepy() {
  gsap.to([e.le,e.re],{ scaleY:0.42, duration:0.7, ease:'power1.out', ...TF });
  gsap.to([e.lp,e.rp],{ scaleY:0.42, duration:0.7, ...TF });
  gsap.to(e.head,{ rotation:10, duration:0.8, ease:'power1.out', ...TO });
  gsap.to(e.wrap,{ y:6, duration:0.8 });
  gsap.to(e.ant, { opacity:0.3, scale:0.65, duration:1.0, ...TF });
  setTimeout(()=>{
    gsap.to([e.le,e.re,e.lp,e.rp],{ scaleY:1, duration:0.5, ...TF });
    gsap.to(e.head,{ rotation:0, duration:0.5, ...TO });
    gsap.to(e.wrap,{ y:0, duration:0.5 });
    gsap.to(e.ant, { opacity:1, scale:1, duration:0.5, ...TF });
  }, 3000);
}

// ════════════════════════════════════════════════════════════════════════════
//  SLIDERS
// ════════════════════════════════════════════════════════════════════════════
const sliderDefs = [
  { id:'s-head', lbl:'v-head', target:e.head },
  { id:'s-la',   lbl:'v-la',   target:e.la   },
  { id:'s-ra',   lbl:'v-ra',   target:e.ra   },
  { id:'s-ll',   lbl:'v-ll',   target:e.ll   },
  { id:'s-rl',   lbl:'v-rl',   target:e.rl   },
];
const sliders = sliderDefs.map(s => ({ ...s, el:R(s.id), lbl:R(s.lbl) }));
sliders.forEach(s => {
  s.el.addEventListener('input', () => {
    const v = +s.el.value;
    s.lbl.textContent = v + '°';
    gsap.to(s.target, { rotation:v, duration:0.08, ease:'none', ...TO });
  });
});

// ════════════════════════════════════════════════════════════════════════════
//  WIRING
// ════════════════════════════════════════════════════════════════════════════
const animMap = { idle:playIdle, walk:playWalk, run:playRun, jump:playJump,
  wave:playWave, think:playThink, party:playParty, cheer:playCheer,
  sneak:playSneak, fall:playFall };

const exprMap = { happy:exprHappy, curious:exprCurious, blink:exprBlink,
  wink:exprWink, angry:exprAngry, shock:exprShock, scan:exprScan, sleep:exprSleepy };

document.querySelectorAll('[data-anim]').forEach(btn => {
  btn.addEventListener('click', () => {
    kill(); resetAll(0.25);
    document.querySelectorAll('[data-anim]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    setTimeout(() => animMap[btn.dataset.anim]?.(), 280);
  });
});

document.querySelectorAll('[data-expr]').forEach(btn => {
  btn.addEventListener('click', () => {
    exprMap[btn.dataset.expr]?.();
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 700);
  });
});

R('btn-reset').addEventListener('click', () => {
  kill(); resetAll(0.4);
  document.querySelectorAll('[data-anim]').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-anim="idle"]').classList.add('active');
  setTimeout(playIdle, 450);
  setLabel('idle');
});

// ════════════════════════════════════════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════════════════════════════════════════
startLEDs();
autoBlink();
playIdle();
