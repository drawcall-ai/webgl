import * as THREE from "three/webgpu";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// Original-input scenes with browser WebGPU reference images.
export const SCENES = ["pbr", "soldier", "tokyo"];
export const WIDTH = 1280;
export const HEIGHT = 720;

async function loadGLB(base, path) {
  const draco = new DRACOLoader().setWorkerLimit(1).setDecoderPath(`${base}/node_modules/three/examples/jsm/libs/draco/gltf/`);
  try {
    return await new GLTFLoader().setDRACOLoader(draco).loadAsync(`${base}/test/${path}`);
  } finally {
    draco.dispose();
  }
}

function roomEnvironment(renderer, sigma) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), sigma).texture;
  pmrem.dispose();
  return env;
}

// Returns { scene, camera } ready for renderer.render().
export async function buildScene(name, renderer, base, aspect) {
  if (name === "pbr") {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202428);
    scene.environment = roomEnvironment(renderer, 0.04);
    const geometry = new THREE.SphereGeometry(0.4, 48, 32);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const material = new THREE.MeshStandardMaterial({ color: 0xc8553d, roughness: x / 4, metalness: y / 4 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set((x - 2) * 1.0, (y - 2) * 1.0, 0);
        scene.add(mesh);
      }
    }
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(3, 4, 5);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
    camera.position.set(0, 0, 8);
    return { scene, camera };
  }

  if (name === "soldier") {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0a0a0);
    scene.fog = new THREE.Fog(0xa0a0a0, 10, 50);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 3);
    hemi.position.set(0, 20, 0);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 3);
    dir.position.set(-3, 10, -10);
    dir.castShadow = true;
    Object.assign(dir.shadow.camera, { top: 2, bottom: -2, left: -2, right: 2, near: 0.1, far: 40 });
    scene.add(dir);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshPhongMaterial({ color: 0xcbcbcb, depthWrite: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const gltf = await loadGLB(base, "models/Soldier.glb");
    gltf.scene.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    scene.add(gltf.scene);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, "Walk")).play();
    mixer.update(1.0);
    const camera = new THREE.PerspectiveCamera(45, aspect, 1, 1000);
    camera.position.set(1, 2, -3);
    camera.lookAt(0, 1, 0);
    return { scene, camera };
  }

  if (name === "tokyo") {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfe3dd);
    scene.environment = roomEnvironment(renderer, 0.04);
    const gltf = await loadGLB(base, "models/LittlestTokyo.glb");
    const model = gltf.scene;
    model.position.set(1, 1, 0);
    model.scale.set(0.01, 0.01, 0.01);
    scene.add(model);
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(gltf.animations[0]).play();
    mixer.update(1.0);
    const camera = new THREE.PerspectiveCamera(40, aspect, 1, 100);
    camera.position.set(5, 2, 8);
    camera.lookAt(0, 0.5, 0);
    return { scene, camera };
  }

  throw new Error(`unknown scene ${name}`);
}
