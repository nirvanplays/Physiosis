/**
 * SkeletonViewerController.ts
 * Main engine orchestrator for Three.js 3D biomechanics skeletal visualization.
 *
 * Provides a clean API completely decoupled from React render loops.
 */

import * as THREE from 'three';
import { createClinicalScene, type ClinicalScene } from '../scene';
import { createClinicalLighting, type LightingRig } from '../lighting';
import { createClinicalCamera, type CameraPreset } from '../camera';
import { createCameraControls, type ClinicalCameraControls } from '../controls/cameraControls';
import { SkeletonRig, type JointHighlightStyle, type BodyRegionId } from './SkeletonRig';
import type { SkeletonPose3D, JointName3D } from './SkeletonPose3D';
import { ANATOMICAL_REST_POSE, clonePose3D, lerpPose3D, copyPose3D } from './SkeletonPose3D';

export interface SkeletonViewerOptions {
  container: HTMLElement;
  initialPose?: SkeletonPose3D;
  onFrame?: (currentPose: SkeletonPose3D) => void;
}

export class SkeletonViewerController {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sceneObj: ClinicalScene;
  private readonly lighting: LightingRig;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: ClinicalCameraControls;
  private readonly rig: SkeletonRig;

  // Raycasting for 3D Body Map selection
  private readonly raycaster = new THREE.Raycaster();
  private readonly mouseVec = new THREE.Vector2();

  // Trajectory & visual augmentations
  private trajectoryLine: THREE.Line | null = null;
  private therapyBallMesh: THREE.Mesh | null = null;

  // Pose interpolation state
  private currentPose: SkeletonPose3D;
  private targetPose: SkeletonPose3D;
  private startPose: SkeletonPose3D;
  private poseTransitionStart: number | null = null;
  private poseTransitionDuration = 0;
  private isPoseTransitioning = false;

  // Latest-Pose Buffer (Decouples MediaPipe tracking from Three.js rendering)
  private latestLivePose: SkeletonPose3D;
  private latestPoseTimestamp: number = 0;
  private isLiveTracking: boolean = false;
  private renderFps: number = 60;
  private renderFrameCount = 0;
  private lastRenderFpsCalcTime = performance.now();

  // Adaptive Performance Monitoring (Low-End Device Fallback)
  private frameCount = 0;
  private lastFpsCheckTime = performance.now();
  private isLowPerformanceMode = false;

  private onFrameCallback?: (currentPose: SkeletonPose3D) => void;
  private isDisposed = false;

  constructor(options: SkeletonViewerOptions) {
    this.container = options.container;
    this.onFrameCallback = options.onFrame;

    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 400;

    // 1. WebGLRenderer Setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.xr.enabled = true;

    this.container.appendChild(this.renderer.domElement);

    // 2. Scene & Lighting
    this.sceneObj = createClinicalScene();
    this.lighting = createClinicalLighting();
    this.sceneObj.scene.add(this.lighting.group);

    // 3. Camera & Controls
    this.camera = createClinicalCamera(width / height);
    this.controls = createCameraControls(this.camera, this.renderer.domElement);

    // 4. Skeleton Rig
    this.rig = new SkeletonRig();
    this.sceneObj.scene.add(this.rig.group);

    // 5. Initialize Poses
    this.currentPose = clonePose3D(options.initialPose || ANATOMICAL_REST_POSE);
    this.targetPose = clonePose3D(this.currentPose);
    this.startPose = clonePose3D(this.currentPose);
    this.latestLivePose = clonePose3D(this.currentPose);
    this.rig.updatePose(this.currentPose);

    // 6. Start Three.js Animation Loop
    this.renderer.setAnimationLoop(this.renderLoop);
  }

  /**
   * Main render loop driven by WebGLRenderer.setAnimationLoop (Native 60 FPS).
   */
  private renderLoop = (_time: number): void => {
    if (this.isDisposed) return;

    const now = performance.now();
    this.renderFrameCount++;

    // Calculate Render FPS every 500ms
    if (now - this.lastRenderFpsCalcTime >= 500) {
      const elapsed = (now - this.lastRenderFpsCalcTime) / 1000;
      this.renderFps = elapsed > 0 ? Math.round(this.renderFrameCount / elapsed) : 60;
      this.renderFrameCount = 0;
      this.lastRenderFpsCalcTime = now;
    }

    // Adaptive performance monitoring (evaluate frame rate every 2s)
    this.frameCount++;
    if (now - this.lastFpsCheckTime > 2000) {
      const fps = (this.frameCount * 1000) / (now - this.lastFpsCheckTime);
      this.frameCount = 0;
      this.lastFpsCheckTime = now;

      if (fps < 32 && !this.isLowPerformanceMode) {
        this.isLowPerformanceMode = true;
        this.renderer.setPixelRatio(1.0);
        this.renderer.shadowMap.enabled = false;
        console.info('[SkeletonViewerController] Adaptive performance optimization engaged (pixelRatio capped, shadows disabled).');
      }
    }

    // 1. Live Tracking Interpolation (Consumes Latest-Pose Buffer with low latency)
    if (this.isLiveTracking) {
      const ageMs = now - this.latestPoseTimestamp;
      if (ageMs < 500) {
        // High-responsiveness low-latency lerp (0.35 factor per frame)
        lerpPose3D(this.currentPose, this.latestLivePose, 0.35, this.currentPose);
        this.rig.updatePose(this.currentPose);
        if (this.onFrameCallback) this.onFrameCallback(this.currentPose);
      }
    }
    // 2. Offline Smooth Keyframe Pose Interpolation
    else if (this.isPoseTransitioning && this.poseTransitionStart !== null) {
      const elapsed = now - this.poseTransitionStart;
      const progress = Math.min(1, elapsed / Math.max(1, this.poseTransitionDuration));
      // Cubic easing
      const t = 1 - Math.pow(1 - progress, 3);

      lerpPose3D(this.startPose, this.targetPose, t, this.currentPose);
      this.rig.updatePose(this.currentPose);

      if (this.onFrameCallback) {
        this.onFrameCallback(this.currentPose);
      }

      if (progress >= 1) {
        this.isPoseTransitioning = false;
        this.poseTransitionStart = null;
      }
    }

    // Update OrbitControls
    this.controls.update();

    // Render Scene
    this.renderer.render(this.sceneObj.scene, this.camera);
  };

  /**
   * Sets the 3D skeleton pose with optional smooth duration (milliseconds).
   */
  public setPose(newPose: SkeletonPose3D, durationMs: number = 0): void {
    this.isLiveTracking = false;
    if (durationMs <= 0) {
      copyPose3D(newPose, this.currentPose);
      copyPose3D(newPose, this.targetPose);
      this.isPoseTransitioning = false;
      this.poseTransitionStart = null;
      this.rig.updatePose(this.currentPose);
      if (this.onFrameCallback) this.onFrameCallback(this.currentPose);
      return;
    }

    copyPose3D(this.currentPose, this.startPose);
    copyPose3D(newPose, this.targetPose);
    this.poseTransitionDuration = durationMs;
    this.poseTransitionStart = performance.now();
    this.isPoseTransitioning = true;
  }

  /**
   * Updates the Latest-Pose Buffer for high-frequency (60fps) webcam retargeting with zero memory allocation.
   */
  public setLivePose(newPose: SkeletonPose3D): void {
    if (this.isDisposed) return;
    copyPose3D(newPose, this.latestLivePose);
    this.latestPoseTimestamp = performance.now();
    this.isLiveTracking = true;
    this.isPoseTransitioning = false;
  }

  /**
   * Returns diagnostic rendering statistics for developer telemetry.
   */
  public getRenderStats() {
    return {
      renderFps: this.renderFps,
      poseAgeMs: this.isLiveTracking ? Math.round(performance.now() - this.latestPoseTimestamp) : 0,
      isStale: this.isLiveTracking && performance.now() - this.latestPoseTimestamp > 500,
    };
  }

  /**
   * Updates the semi-transparent Target Ghost skeleton pose.
   */
  public setGhostPose(pose: SkeletonPose3D | null): void {
    this.rig.updateGhostPose(pose);
  }

  /**
   * Highlights specific joints with clinical color accents.
   */
  public setJointHighlight(joints: JointName3D[], style: JointHighlightStyle = 'active'): void {
    this.rig.setJointHighlight(joints, style);
  }

  /**
   * Resets the skeleton to standard anatomical rest pose.
   */
  public resetPose(durationMs: number = 600): void {
    this.setPose(ANATOMICAL_REST_POSE, durationMs);
    this.setJointHighlight([], 'none');
    this.setGhostPose(null);
  }

  /**
   * Switches camera viewpoint preset (front, side, back, reset).
   */
  public setCameraPreset(preset: CameraPreset, durationMs: number = 700): void {
    this.controls.setPreset(preset, durationMs);
  }

  /**
   * Toggles auto-rotate mode.
   */
  public toggleAutoRotate(enabled?: boolean): boolean {
    return this.controls.toggleAutoRotate(enabled);
  }

  /**
   * Handles container resize.
   */
  public resize(width: number, height: number): void {
    if (width <= 0 || height <= 0 || this.isDisposed) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  /**
   * Displays or clears a 3D trajectory guide line (e.g. for Arm Circumduction).
   */
  public setTrajectoryPoints(points: THREE.Vector3[] | null): void {
    if (this.trajectoryLine) {
      this.sceneObj.scene.remove(this.trajectoryLine);
      this.trajectoryLine.geometry.dispose();
      (this.trajectoryLine.material as THREE.Material).dispose();
      this.trajectoryLine = null;
    }

    if (points && points.length > 1) {
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.45,
        linewidth: 2,
      });
      this.trajectoryLine = new THREE.Line(geom, mat);
      this.trajectoryLine.name = 'Physiosis_Trajectory_Guide';
      this.sceneObj.scene.add(this.trajectoryLine);
    }
  }

  /**
   * Displays or clears an abstract rehabilitation prop (e.g. therapy ball for Ball Press).
   */
  public setAbstractVisualObject(type: 'therapy_ball' | 'none', compressionProgress: number = 0): void {
    if (type === 'none') {
      if (this.therapyBallMesh) {
        this.sceneObj.scene.remove(this.therapyBallMesh);
        this.therapyBallMesh.geometry.dispose();
        (this.therapyBallMesh.material as THREE.Material).dispose();
        this.therapyBallMesh = null;
      }
      return;
    }

    if (type === 'therapy_ball') {
      if (!this.therapyBallMesh) {
        const geom = new THREE.SphereGeometry(0.088, 24, 20);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x00e5ff,
          emissive: 0x008da6,
          emissiveIntensity: 0.25,
          transparent: true,
          opacity: 0.35,
          roughness: 0.3,
          metalness: 0.1,
          depthWrite: false,
        });
        this.therapyBallMesh = new THREE.Mesh(geom, mat);
        this.therapyBallMesh.name = 'Physiosis_Therapy_Ball_Visual';
        this.therapyBallMesh.position.set(0, 1.28, 0.36);
        this.sceneObj.scene.add(this.therapyBallMesh);
      }

      // Subtle squeeze along X axis during compression
      const scaleX = Math.max(0.65, 1 - compressionProgress * 0.35);
      const scaleYZ = 1 + compressionProgress * 0.12;
      this.therapyBallMesh.scale.set(scaleX, scaleYZ, scaleYZ);
    }
  }

  /**
   * Raycasts screen coordinates against primary skeleton meshes to determine which body region was clicked/hovered.
   */
  public getBodyRegionAtScreenCoords(clientX: number, clientY: number): BodyRegionId | null {
    if (this.isDisposed) return null;
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    this.mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    const meshes = this.rig.getRaycastMeshes();
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      return (hit.userData.bodyRegion as BodyRegionId) || null;
    }
    return null;
  }

  /**
   * Applies subtle hover highlight to a body region during mouse inspection.
   */
  public setHoveredBodyRegion(region: BodyRegionId | null): void {
    if (this.isDisposed) return;
    this.rig.setRegionHighlight(region, 'hover');
  }

  /**
   * Exposes internal SkeletonRig instance.
   */
  public getRig(): SkeletonRig {
    return this.rig;
  }

  /**
   * Toggles Augmented Reality (AR) optical passthrough mode.
   * Clears scene background to transparent alpha and hides the virtual floor grid,
   * overlaying the 3D skeleton and target ghost directly onto the live camera stream.
   */
  public setARPassthroughMode(enabled: boolean): void {
    if (this.isDisposed) return;
    if (enabled) {
      this.sceneObj.scene.background = null;
      this.sceneObj.floorGroup.visible = false;
      this.renderer.setClearColor(0x000000, 0);
    } else {
      this.sceneObj.scene.background = new THREE.Color(0x0a0f16);
      this.sceneObj.floorGroup.visible = true;
      this.renderer.setClearColor(0x0a0f16, 1);
    }
  }

  /**
   * Highlights compensating joints and limbs in glowing warning amber/coral.
   */
  public setCompensatingJoints(joints: JointName3D[]): void {
    if (this.isDisposed) return;
    if (joints && joints.length > 0) {
      this.rig.setJointHighlight(joints, 'compensation');
    }
  }

  /**
   * Initiates WebXR Immersive VR Session if supported by device / headset.
   */
  public async enterWebXRVR(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('xr' in navigator)) return false;
    try {
      const xr = (navigator as unknown as { xr?: { isSessionSupported: (mode: string) => Promise<boolean>; requestSession: (mode: string) => Promise<any> } }).xr;
      if (!xr) return false;
      const supported = await xr.isSessionSupported('immersive-vr');
      if (!supported) return false;
      const session = await xr.requestSession('immersive-vr');
      await this.renderer.xr.setSession(session);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initiates WebXR Immersive AR Session if supported.
   */
  public async enterWebXRAR(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('xr' in navigator)) return false;
    try {
      const xr = (navigator as unknown as { xr?: { isSessionSupported: (mode: string) => Promise<boolean>; requestSession: (mode: string) => Promise<any> } }).xr;
      if (!xr) return false;
      const supported = await xr.isSessionSupported('immersive-ar');
      if (!supported) return false;
      const session = await xr.requestSession('immersive-ar');
      await this.renderer.xr.setSession(session);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Completely cleans up WebGL context, geometries, and materials upon unmount.
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.renderer.setAnimationLoop(null);

    this.setTrajectoryPoints(null);
    this.setAbstractVisualObject('none');

    this.controls.dispose();
    this.rig.dispose();
    this.lighting.dispose();
    this.sceneObj.dispose();

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }

    try {
      this.renderer.forceContextLoss();
    } catch {
      // Ignore if context is already lost
    }

    this.renderer.dispose();
  }
}
