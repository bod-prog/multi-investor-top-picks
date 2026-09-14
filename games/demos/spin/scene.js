/*
 * Spin — the smallest useful three.js scene: a lit, rotating solid you can steer.
 *
 * Start a 3D game by copying this file: the renderer setup, the resize handling,
 * the fixed-step loop and the shared input are already wired the way a game wants
 * them, and nothing here depends on a CDN.
 */
import * as THREE from '../../vendor/three/three.module.min.js';

const stage = document.getElementById('stage');
const fallback = document.getElementById('fallback');

// WebGL is missing on some locked-down and headless browsers; say so instead of
// throwing an unreadable context error.
if (!document.createElement('canvas').getContext('webgl2') &&
    !document.createElement('canvas').getContext('webgl')) {
  fallback.hidden = false;
} else {
  const BASE_W = 640;
  const BASE_H = 360;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(BASE_W, BASE_H, false);
  renderer.setClearColor(0x070b14, 1);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, BASE_W / BASE_H, 0.1, 100);
  camera.position.set(0, 1.2, 4.2);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x3b82f6, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 2);
  scene.add(key);

  const solid = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.85, 0.28, 160, 24),
    new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.35, metalness: 0.45 })
  );
  scene.add(solid);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardMaterial({ color: 0x0d1528, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.6;
  scene.add(floor);

  const input = new Arcade.Input({ surface: renderer.domElement });
  Arcade.Sfx.define('blip', 'blipSelect');

  const palette = [0x3b82f6, 0x10b981, 0xf59e0b, 0xf43f5e, 0xa78bfa];
  let colorIndex = 0;
  let spin = 0.6;

  const loop = new Arcade.Loop((dt) => {
    const axis = input.axis();

    if (input.pressed('action') || input.pressed('touch')) {
      colorIndex = (colorIndex + 1) % palette.length;
      solid.material.color.setHex(palette[colorIndex]);
      Arcade.Sfx.play('blip');
    }

    // Steering nudges the idle spin instead of replacing it, so the scene never
    // sits perfectly still.
    spin += axis.x * dt * 1.6;
    spin = Math.max(-3, Math.min(3, spin));
    solid.rotation.y += spin * dt;
    solid.rotation.x += (0.35 - axis.y * 1.2) * dt;

    input.endFrame();
    renderer.render(scene, camera);
  });

  function resize() {
    const width = Math.min(stage.clientWidth || BASE_W, BASE_W);
    const height = Math.round(width * (BASE_H / BASE_W));
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = width + 'px';
    renderer.domElement.style.height = height + 'px';
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  addEventListener('resize', resize);
  resize();
  loop.start();

  // Headless check hook: one frame is enough to know the pipeline drew something.
  renderer.render(scene, camera);
  document.body.dataset.spin = 'running';
}
