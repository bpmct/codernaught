/**
 * Codernaught — embeddable Web Component (self-contained Three.js renderer).
 *
 *   <script type="module" src="https://bpmct.github.io/codernaught/codernaught-embed.js"></script>
 *   <codernaught-bot walk style="width:360px;height:360px"></codernaught-bot>
 *
 * Loads the rigged codernaught.glb and plays its "Walk" clip with a slow turntable
 * rotation, front-facing idle, and lighting. No model-viewer dependency.
 *
 * Attributes:
 *   src        URL to codernaught.glb (default: alongside this script)
 *   walk       present = play the walk animation + spin; absent = idle, facing front
 *   spin       degrees/sec turntable while walking (default 35)
 *   bg         background CSS color (default transparent)
 *   no-controls present = disable orbit/zoom
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEFAULT_GLB = new URL('./codernaught.glb', import.meta.url).href;

class CodernaughtBot extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: 'open' });
    const host = document.createElement('div');
    host.style.cssText = `width:100%;height:100%;min-height:220px;background:${this.getAttribute('bg') || 'transparent'}`;
    root.appendChild(host);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    camera.position.set(0, 12, 52);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 10, 0);
    controls.enableDamping = true;
    controls.enabled = !this.hasAttribute('no-controls');
    controls.enableZoom = !this.hasAttribute('no-controls');

    scene.add(new THREE.HemisphereLight(0xdde6ff, 0x202028, 0.85));
    const key = new THREE.DirectionalLight(0xfff4e0, 1.2); key.position.set(20, 40, 30); scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.7); fill.position.set(-25, 20, 15); scene.add(fill);

    const resize = () => {
      const w = this.clientWidth || 320, h = this.clientHeight || 320;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(this);
    resize();

    const walk = this.hasAttribute('walk');
    const spin = (parseFloat(this.getAttribute('spin')) || 35) * Math.PI / 180;
    let mixer, model, yaw = 0;
    const clock = new THREE.Clock();

    new GLTFLoader().load(this.getAttribute('src') || DEFAULT_GLB, (g) => {
      model = g.scene;
      scene.add(model);
      if (walk && g.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(g.animations[0]).play();
      }
    });

    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (mixer) mixer.update(dt);
      if (model) {
        if (walk) { yaw += spin * dt; model.rotation.y = yaw; }
        else { yaw += (0 - yaw) * Math.min(dt * 3, 1); model.rotation.y = yaw; }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
  }
}
customElements.define('codernaught-bot', CodernaughtBot);
