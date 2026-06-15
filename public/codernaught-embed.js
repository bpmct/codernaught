/**
 * Codernaught — embeddable Web Component.
 *
 * Usage (drop into any HTML page):
 *   <script type="module" src="https://bpmct.github.io/codernaught/codernaught-embed.js"></script>
 *   <codernaught-bot walk speed="1" camera-orbit="0deg 80deg 110%"></codernaught-bot>
 *
 * Attributes:
 *   src          URL to codernaught.glb (defaults to the GH Pages copy)
 *   walk         present = autoplay the walk animation
 *   speed        animation speed multiplier (default 1)
 *   background   CSS background (default transparent)
 *   auto-rotate  present = slowly spin the camera
 *   no-controls  present = disable user orbit/zoom
 *
 * Internally wraps Google's <model-viewer> (loaded on demand). The canonical asset
 * is the .glb — you can also use it directly anywhere that accepts glTF.
 */
const MV_SRC = 'https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
const DEFAULT_GLB = new URL('./codernaught.glb', import.meta.url).href;

let mvLoading;
function ensureModelViewer() {
  if (window.customElements?.get('model-viewer')) return Promise.resolve();
  if (!mvLoading) {
    mvLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'module'; s.src = MV_SRC;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return mvLoading;
}

class CodernaughtBot extends HTMLElement {
  static get observedAttributes() { return ['src', 'walk', 'speed', 'background', 'auto-rotate', 'no-controls']; }

  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:100%;min-height:240px;display:block';
    shadow.appendChild(wrap);

    ensureModelViewer().then(() => {
      const mv = document.createElement('model-viewer');
      mv.setAttribute('src', this.getAttribute('src') || DEFAULT_GLB);
      mv.setAttribute('camera-controls', this.hasAttribute('no-controls') ? 'false' : 'true');
      mv.setAttribute('interaction-prompt', 'none');
      mv.setAttribute('shadow-intensity', '0.6');
      mv.setAttribute('exposure', '0.9');
      mv.setAttribute('environment-image', 'neutral');
      mv.setAttribute('camera-orbit', this.getAttribute('camera-orbit') || '15deg 80deg 110%');
      if (this.hasAttribute('walk')) {
        mv.setAttribute('autoplay', '');
        mv.setAttribute('animation-name', 'Walk');
      }
      if (this.hasAttribute('auto-rotate')) mv.setAttribute('auto-rotate', '');
      mv.style.cssText = `width:100%;height:100%;background:${this.getAttribute('background') || 'transparent'}`;

      const sp = parseFloat(this.getAttribute('speed') || '1');
      mv.addEventListener('load', () => { try { mv.timeScale = sp; } catch (e) {} });

      wrap.appendChild(mv);
      this._mv = mv;
    });
  }

  attributeChangedCallback(name, _old, val) {
    if (!this._mv) return;
    if (name === 'speed') { try { this._mv.timeScale = parseFloat(val || '1'); } catch (e) {} }
    if (name === 'walk') {
      if (this.hasAttribute('walk')) { this._mv.setAttribute('animation-name', 'Walk'); this._mv.play(); }
      else this._mv.pause();
    }
  }
}

customElements.define('codernaught-bot', CodernaughtBot);
