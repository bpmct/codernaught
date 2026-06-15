import { createCodernaught, animations } from './codernaught2d.js';

const botEl = document.getElementById('bot');
const stateEl = document.getElementById('state');
const cn = createCodernaught({ width: 130, height: 215 });
botEl.appendChild(cn.svg);

// ── World / physics ───────────────────────────────────────────────────────────
const W = () => window.innerWidth, H = () => window.innerHeight;
const GROUND_H = 90;
const platforms = () => [...document.querySelectorAll('.platform')].map(p => {
  const r = p.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width };
});

const bot = { x: 120, y: 0, vx: 0, vy: 0, w: 95, h: 185, onGround: false, face: 1 };
bot.y = H() - GROUND_H - bot.h;

const keys = {};
let flyMode = false;
let autoFly = false;
let jumps = 0;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') {
    e.preventDefault();
    if (flyMode) { bot.vy = -6; }
    else if (bot.onGround) { bot.vy = -16; jumps = 1; bot.onGround = false; }
    else if (jumps < 2) { bot.vy = -13; jumps = 2; flyMode = true; autoFly = true; }  // double-jump -> fly
  }
  if (e.code === 'KeyF' && !e.repeat) flyMode = !flyMode;
});
addEventListener('keyup', e => { keys[e.code] = false; });

const GRAV = 0.7, MOVE = 0.9, MAXVX = 7, FRICTION = 0.82;

let state = 'idle';
let t0 = performance.now();

function physics() {
  // horizontal input
  if (keys['ArrowLeft'])  { bot.vx -= MOVE; bot.face = -1; }
  if (keys['ArrowRight']) { bot.vx += MOVE; bot.face = 1; }
  bot.vx = Math.max(-MAXVX, Math.min(MAXVX, bot.vx));
  if (!keys['ArrowLeft'] && !keys['ArrowRight']) bot.vx *= FRICTION;

  // gravity (reduced while flying)
  bot.vy += flyMode ? GRAV * 0.25 : GRAV;
  if (flyMode && keys['Space']) bot.vy = -6;

  bot.x += bot.vx;
  bot.y += bot.vy;

  // walls
  bot.x = Math.max(0, Math.min(W() - bot.w, bot.x));

  // ground
  const floor = H() - GROUND_H - bot.h;
  bot.onGround = false;
  if (bot.y >= floor) { bot.y = floor; bot.vy = 0; bot.onGround = true; }

  // platforms (land on top when falling)
  if (bot.vy >= 0) {
    for (const p of platforms()) {
      const feet = bot.y + bot.h, prevFeet = feet - bot.vy;
      const cx = bot.x + bot.w / 2;
      if (cx > p.x - 10 && cx < p.x + p.w + 10 && prevFeet <= p.y + 6 && feet >= p.y) {
        bot.y = p.y - bot.h; bot.vy = 0; bot.onGround = true;
      }
    }
  }
  if (bot.onGround) { jumps = 0; if (autoFly) { flyMode = false; autoFly = false; } }
}

function pickState() {
  if (flyMode && !bot.onGround) return 'fly';
  if (!bot.onGround) return bot.vy < 0 ? 'jump' : 'fall';
  if (Math.abs(bot.vx) > 0.6) return 'run';
  return 'idle';
}

function frame(now) {
  requestAnimationFrame(frame);
  physics();
  state = pickState();
  const t = (now - t0) / 1000;

  const animFn = animations[state] || animations.idle;
  const p = animFn(t);
  cn.showFlag(state === 'fly');
  // run/fly anims read facing via lean sign
  if (state === 'run') { p.lean = 8 * bot.face; }
  cn.setPose(p);

  // place + flip sprite to face movement direction
  botEl.style.transform = `translate(${bot.x}px,${bot.y}px) scaleX(${bot.face})`;
  stateEl.textContent = 'state: ' + state + (flyMode ? ' ✈' : '');
}
requestAnimationFrame(frame);

addEventListener('resize', () => { bot.y = Math.min(bot.y, H() - GROUND_H - bot.h); });
