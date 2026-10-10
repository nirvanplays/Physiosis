/**
 * scene.ts
 * Clinical 3D rehabilitation scene setup, radial floor grid, and coordinate reference.
 */

import * as THREE from 'three';

export interface ClinicalScene {
  scene: THREE.Scene;
  floorGroup: THREE.Group;
  dispose: () => void;
}

export function createClinicalScene(): ClinicalScene {
  const scene = new THREE.Scene();
  scene.name = 'Physiosis_3D_Scene';

  // Dark clinical background with subtle depth fog
  const bgColor = new THREE.Color(0x0a0f16);
  scene.background = bgColor;
  scene.fog = new THREE.FogExp2(bgColor.getHex(), 0.08);

  const floorGroup = new THREE.Group();
  floorGroup.name = 'Clinical_Floor_Reference';

  // 1. Subtle radial circular grid
  const gridHelper = new THREE.GridHelper(4.0, 20, 0x1f3448, 0x132230);
  gridHelper.position.y = 0;
  floorGroup.add(gridHelper);

  // 2. Concentric range rings (0.5m, 1.0m, 1.5m)
  const ringMaterial = new THREE.LineBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.18,
  });

  [0.5, 1.0, 1.5].forEach((radius) => {
    const ringGeom = new THREE.BufferGeometry();
    const points: THREE.Vector3[] = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(theta) * radius, 0.001, Math.sin(theta) * radius));
    }
    ringGeom.setFromPoints(points);
    const ringLine = new THREE.Line(ringGeom, ringMaterial);
    floorGroup.add(ringLine);
  });

  // 3. Directional Axis Indicator (Subtle Forward Z marker)
  const axisMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.35 });
  const axisGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.002, 0),
    new THREE.Vector3(0, 0.002, 1.2),
  ]);
  const axisLine = new THREE.Line(axisGeom, axisMat);
  floorGroup.add(axisLine);

  scene.add(floorGroup);

  const dispose = () => {
    gridHelper.dispose();
    ringMaterial.dispose();
    axisMat.dispose();
  };

  return {
    scene,
    floorGroup,
    dispose,
  };
}
