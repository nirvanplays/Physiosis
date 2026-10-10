/**
 * lighting.ts
 * Professional 3-point clinical & sports-science lighting rig for Three.js.
 */

import * as THREE from 'three';

export interface LightingRig {
  group: THREE.Group;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
  ambientLight: THREE.AmbientLight;
  dispose: () => void;
}

export function createClinicalLighting(): LightingRig {
  const group = new THREE.Group();
  group.name = 'Clinical_Lighting_Rig';

  // 1. Ambient baseline
  const ambientLight = new THREE.AmbientLight(0x1a2430, 0.9);
  group.add(ambientLight);

  // 2. Key Light (Soft cool daylight from upper right-front)
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(2.5, 3.5, 3.0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 10;
  keyLight.shadow.camera.left = -1.5;
  keyLight.shadow.camera.right = 1.5;
  keyLight.shadow.camera.top = 2.5;
  keyLight.shadow.camera.bottom = -0.5;
  keyLight.shadow.bias = -0.0005;
  group.add(keyLight);

  // 3. Fill Light (Soft cyan/blue diffuse fill from left)
  const fillLight = new THREE.DirectionalLight(0x70a8d8, 1.2);
  fillLight.position.set(-3.0, 2.0, 2.0);
  group.add(fillLight);

  // 4. Rim / Silhouette Light (Accent back-light from behind-left)
  const rimLight = new THREE.DirectionalLight(0x00e5ff, 1.6);
  rimLight.position.set(-1.8, 3.0, -2.5);
  group.add(rimLight);

  const dispose = () => {
    keyLight.dispose();
    fillLight.dispose();
    rimLight.dispose();
    ambientLight.dispose();
  };

  return {
    group,
    keyLight,
    fillLight,
    rimLight,
    ambientLight,
    dispose,
  };
}
