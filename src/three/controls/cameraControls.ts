/**
 * cameraControls.ts
 * OrbitControls setup with smooth damping and boundary constraints.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraPreset } from '../camera';
import { CAMERA_PRESETS } from '../camera';

export interface ClinicalCameraControls {
  controls: OrbitControls;
  setPreset: (preset: CameraPreset, durationMs?: number) => void;
  toggleAutoRotate: (enabled?: boolean) => boolean;
  update: () => void;
  dispose: () => void;
}

export function createCameraControls(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement
): ClinicalCameraControls {
  const controls = new OrbitControls(camera, domElement);

  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.screenSpacePanning = true;

  // Set default target to mid-torso height
  controls.target.copy(CAMERA_PRESETS.reset.target);

  // Zoom bounds
  controls.minDistance = 1.0;
  controls.maxDistance = 5.5;

  // Polar angle bounds (prevent camera from clipping below the ground)
  controls.maxPolarAngle = Math.PI / 2 + 0.05;
  controls.minPolarAngle = 0.1;

  // Auto rotate configuration
  controls.autoRotate = false;
  controls.autoRotateSpeed = 1.5;

  // Smooth camera transition state
  let transitionStart: number | null = null;
  let transitionDuration = 800;
  let startPos = new THREE.Vector3();
  let startTarget = new THREE.Vector3();
  let endPos = new THREE.Vector3();
  let endTarget = new THREE.Vector3();
  let isTransitioning = false;

  const setPreset = (preset: CameraPreset, durationMs: number = 700) => {
    const targetConfig = CAMERA_PRESETS[preset];
    if (!targetConfig) return;

    startPos.copy(camera.position);
    startTarget.copy(controls.target);
    endPos.copy(targetConfig.position);
    endTarget.copy(targetConfig.target);

    transitionDuration = durationMs;
    transitionStart = performance.now();
    isTransitioning = true;
  };

  const toggleAutoRotate = (enabled?: boolean): boolean => {
    controls.autoRotate = enabled !== undefined ? enabled : !controls.autoRotate;
    return controls.autoRotate;
  };

  const update = () => {
    if (isTransitioning && transitionStart !== null) {
      const elapsed = performance.now() - transitionStart;
      const progress = Math.min(1, elapsed / transitionDuration);
      // Smooth cubic ease out
      const t = 1 - Math.pow(1 - progress, 3);

      camera.position.lerpVectors(startPos, endPos, t);
      controls.target.lerpVectors(startTarget, endTarget, t);

      if (progress >= 1) {
        isTransitioning = false;
        transitionStart = null;
      }
    }

    controls.update();
  };

  const dispose = () => {
    controls.dispose();
  };

  return {
    controls,
    setPreset,
    toggleAutoRotate,
    update,
    dispose,
  };
}
