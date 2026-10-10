/**
 * camera.ts
 * Clinical PerspectiveCamera setup and preset viewpoints.
 */

import * as THREE from 'three';

export type CameraPreset = 'front' | 'side' | 'back' | 'reset';

export interface CameraPresetConfig {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export const CAMERA_PRESETS: Record<CameraPreset, CameraPresetConfig> = {
  reset: {
    // Front 3/4 view (default inspection perspective)
    position: new THREE.Vector3(-1.4, 1.35, 2.2),
    target: new THREE.Vector3(0, 0.95, 0),
  },
  front: {
    // Coronal view
    position: new THREE.Vector3(0, 1.10, 2.5),
    target: new THREE.Vector3(0, 0.95, 0),
  },
  side: {
    // Sagittal view (ideal for Shoulder Flexion)
    position: new THREE.Vector3(-2.6, 1.10, 0),
    target: new THREE.Vector3(0, 0.95, 0),
  },
  back: {
    // Posterior view
    position: new THREE.Vector3(0, 1.10, -2.5),
    target: new THREE.Vector3(0, 0.95, 0),
  },
};

export function createClinicalCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 50);
  camera.name = 'Physiosis_Main_Camera';

  const defaultPreset = CAMERA_PRESETS.reset;
  camera.position.copy(defaultPreset.position);
  camera.lookAt(defaultPreset.target);

  return camera;
}
