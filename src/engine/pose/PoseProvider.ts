/**
 * PoseProvider.ts
 * Unified PoseProvider abstraction for Physiosis.
 *
 * Supports:
 *   - YOLOPoseProvider (Primary GPU provider via local WebSocket CUDA sidecar)
 *   - MediaPipePoseProvider (In-browser WASM/WebGL fallback)
 *   - PoseProviderManager (Automatic fallback & zero-snap recovery)
 */

import type { PoseResult } from '../../types/pose';
import { MediaPipeEngine } from './MediaPipeEngine';
import { adaptYoloToPhysiosisLandmarks } from './YOLOAdapter';

export type PoseProviderType = 'yolo' | 'mediapipe' | 'auto';
export type PoseProviderStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'running'
  | 'fallback'
  | 'error';

export interface PoseProviderMetrics {
  fps: number;
  inferenceMs: number;
  endToEndMs: number;
  droppedFrames: number;
  confidence: number;
  device: string;
  modelName: string;
  isCuda: boolean;
  providerType: 'yolo' | 'mediapipe';
}

export interface PoseProvider {
  readonly type: 'yolo' | 'mediapipe';
  readonly status: PoseProviderStatus;
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): void;
  detect(video: HTMLVideoElement, timestampMs: number): PoseResult | null;
  sendFrame(source: HTMLCanvasElement | HTMLVideoElement, timestampMs: number): void;
  getLatestPose(): PoseResult | null;
  getMetrics(): PoseProviderMetrics;
  dispose(): void;
}

// ── 1. MediaPipe Pose Provider (In-Browser Fallback) ───────────────────────
export class MediaPipePoseProvider implements PoseProvider {
  public readonly type = 'mediapipe' as const;
  private engine: MediaPipeEngine | null = null;
  private _status: PoseProviderStatus = 'idle';
  private latestPose: PoseResult | null = null;

  private frameCount = 0;
  private lastFpsCalcTime = performance.now();
  private measuredFps = 35;
  private lastInferMs = 20;

  get status(): PoseProviderStatus {
    return this._status;
  }

  async initialize(): Promise<void> {
    if (this._status === 'ready' || this._status === 'running') return;
    this._status = 'initializing';
    try {
      this.engine = new MediaPipeEngine();
      await this.engine.initialize();
      this._status = 'ready';
    } catch (err) {
      this._status = 'error';
      throw err;
    }
  }

  async start(): Promise<void> {
    if (!this.engine) await this.initialize();
    this._status = 'running';
  }

  stop(): void {
    this._status = 'ready';
  }

  detect(video: HTMLVideoElement, timestampMs: number): PoseResult | null {
    if (!this.engine || this._status !== 'running') return null;

    const t0 = performance.now();
    const result = this.engine.detect(video, timestampMs);
    const t1 = performance.now();

    this.lastInferMs = Math.round(t1 - t0);
    this.frameCount++;

    if (t1 - this.lastFpsCalcTime >= 1000) {
      this.measuredFps = Math.round((this.frameCount * 1000) / (t1 - this.lastFpsCalcTime));
      this.frameCount = 0;
      this.lastFpsCalcTime = t1;
    }

    if (result) {
      this.latestPose = result;
    }
    return result;
  }

  sendFrame(_source: HTMLCanvasElement | HTMLVideoElement, _timestampMs: number): void {
    // In-browser MediaPipe reads HTMLVideoElement directly in detect()
  }

  getLatestPose(): PoseResult | null {
    return this.latestPose;
  }

  getMetrics(): PoseProviderMetrics {
    return {
      fps: this.measuredFps,
      inferenceMs: this.lastInferMs,
      endToEndMs: this.lastInferMs,
      droppedFrames: 0,
      confidence: this.latestPose?.landmarks ? 90 : 0,
      device: 'WebGL / WASM (CPU/iGPU)',
      modelName: 'MediaPipe PoseLandmarker (Lite)',
      isCuda: false,
      providerType: 'mediapipe',
    };
  }

  dispose(): void {
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
    this._status = 'idle';
    this.latestPose = null;
  }
}

// ── 2. YOLO11n-Pose CUDA Provider (High-Performance GPU Sidecar) ───────────
export class YOLOPoseProvider implements PoseProvider {
  public readonly type = 'yolo' as const;
  private ws: WebSocket | null = null;
  private _status: PoseProviderStatus = 'idle';
  private wsUrl: string;

  private latestPose: PoseResult | null = null;
  private isAwaitingResponse = false;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;

  // Performance telemetry
  private frameCount = 0;
  private lastFpsCalcTime = performance.now();
  private measuredFps = 60;
  private lastInferenceMs = 15.0;
  private lastEndToEndMs = 16.0;
  private droppedFrames = 0;
  private deviceName = 'cuda:0 (NVIDIA RTX 4070)';
  private isCudaDevice = true;

  constructor(wsUrl = 'ws://127.0.0.1:8765') {
    this.wsUrl = wsUrl;
  }

  get status(): PoseProviderStatus {
    return this._status;
  }

  async initialize(): Promise<void> {
    if (this._status === 'ready' || this._status === 'running') return;
    this._status = 'initializing';

    return new Promise((resolve, reject) => {
      try {
        const socket = new WebSocket(this.wsUrl);
        socket.binaryType = 'arraybuffer';

        const timeout = setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            socket.close();
            this._status = 'error';
            reject(new Error('YOLO sidecar connection timed out.'));
          }
        }, 2000);

        socket.onopen = () => {
          clearTimeout(timeout);
          this.ws = socket;
          this._status = 'ready';
          // Send ping for device info
          socket.send(JSON.stringify({ type: 'ping' }));
          resolve();
        };

        socket.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        socket.onerror = (err) => {
          clearTimeout(timeout);
          this._status = 'error';
          reject(err);
        };

        socket.onclose = () => {
          this._status = 'error';
          this.isAwaitingResponse = false;
        };
      } catch (err) {
        this._status = 'error';
        reject(err);
      }
    });
  }

  private handleMessage(data: string | ArrayBuffer): void {
    if (typeof data !== 'string') return;

    try {
      const msg = JSON.parse(data);
      if (msg.type === 'pong') {
        this.deviceName = `${msg.device} (${msg.gpu || 'NVIDIA GPU'})`;
        this.isCudaDevice = !!msg.isCuda;
      } else if (msg.type === 'pose') {
        const now = performance.now();
        this.isAwaitingResponse = false;

        const clientTs = msg.clientTimestamp || now;
        this.lastInferenceMs = msg.inferenceMs || 15.0;
        this.lastEndToEndMs = Math.max(1, Math.round(now - clientTs));
        this.deviceName = `${msg.device} (${msg.gpu || 'NVIDIA GPU'})`;
        this.isCudaDevice = !!msg.isCuda;

        this.frameCount++;
        if (now - this.lastFpsCalcTime >= 1000) {
          this.measuredFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsCalcTime));
          this.frameCount = 0;
          this.lastFpsCalcTime = now;
        }

        if (msg.keypoints && msg.keypoints.length > 0) {
          const adaptedLandmarks = adaptYoloToPhysiosisLandmarks(msg.keypoints);
          this.latestPose = {
            landmarks: adaptedLandmarks,
            timestampMs: now,
          };
        }
      }
    } catch {
      // Ignored malformed packets
    }
  }

  async start(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.initialize();
    }
    this._status = 'running';
  }

  stop(): void {
    this._status = 'ready';
    this.isAwaitingResponse = false;
  }

  /**
   * Encodes the current video frame into a lightweight 640x480 JPEG and transmits to YOLO CUDA sidecar.
   * Employs strict latest-frame dropping: never sends a frame if GPU is still processing.
   */
  sendFrame(source: HTMLCanvasElement | HTMLVideoElement, timestampMs: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this._status !== 'running') return;

    // Latest-frame throttle: drop frame if previous frame is still in flight
    if (this.isAwaitingResponse) {
      this.droppedFrames++;
      return;
    }

    if (!this.offscreenCanvas) {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = 640;
      this.offscreenCanvas.height = 480;
      this.offscreenCtx = this.offscreenCanvas.getContext('2d', { alpha: false });
    }

    const ctx = this.offscreenCtx;
    if (!ctx) return;

    try {
      ctx.drawImage(source, 0, 0, 640, 480);
      this.isAwaitingResponse = true;

      this.offscreenCanvas.toBlob(
        (blob) => {
          if (!blob || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.isAwaitingResponse = false;
            return;
          }

          blob.arrayBuffer().then((buffer) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
              this.isAwaitingResponse = false;
              return;
            }

            // Prepend 8-byte Float64 client timestamp header
            const header = new ArrayBuffer(8);
            new DataView(header).setFloat64(0, timestampMs, false);

            const combined = new Uint8Array(8 + buffer.byteLength);
            combined.set(new Uint8Array(header), 0);
            combined.set(new Uint8Array(buffer), 8);

            this.ws.send(combined);
          });
        },
        'image/jpeg',
        0.70
      );
    } catch {
      this.isAwaitingResponse = false;
    }
  }

  detect(_video: HTMLVideoElement, _timestampMs: number): PoseResult | null {
    // Returns the latest pose from the WebSocket stream
    return this.latestPose;
  }

  getLatestPose(): PoseResult | null {
    return this.latestPose;
  }

  getMetrics(): PoseProviderMetrics {
    return {
      fps: this.measuredFps,
      inferenceMs: this.lastInferenceMs,
      endToEndMs: this.lastEndToEndMs,
      droppedFrames: this.droppedFrames,
      confidence: this.latestPose?.landmarks ? 92 : 0,
      device: this.deviceName,
      modelName: 'YOLO11n-Pose (Ultralytics)',
      isCuda: this.isCudaDevice,
      providerType: 'yolo',
    };
  }

  dispose(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignored
      }
      this.ws = null;
    }
    this._status = 'idle';
    this.latestPose = null;
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
  }
}

// ── 3. Pose Provider Manager (Auto-Selection & Graceful Fallback) ───────────
export class PoseProviderManager {
  private activeProvider: PoseProvider | null = null;
  private yoloProvider: YOLOPoseProvider;
  private mediapipeProvider: MediaPipePoseProvider;
  private mode: PoseProviderType = 'auto';
  private isFallback = false;
  private healthCheckTimer: number | null = null;

  constructor(preferredMode: PoseProviderType = 'auto') {
    this.mode = preferredMode;
    this.yoloProvider = new YOLOPoseProvider();
    this.mediapipeProvider = new MediaPipePoseProvider();
  }

  public get activeType(): 'yolo' | 'mediapipe' {
    return this.activeProvider?.type || 'mediapipe';
  }

  public get isFallbackActive(): boolean {
    return this.isFallback;
  }

  public get status(): PoseProviderStatus {
    return this.activeProvider?.status || 'idle';
  }

  async initialize(): Promise<void> {
    if (this.mode === 'mediapipe') {
      await this.useMediaPipe();
      return;
    }

    if (this.mode === 'yolo') {
      try {
        await this.useYOLO();
        return;
      } catch (err) {
        console.warn('[PoseProviderManager] YOLO manual mode failed to connect:', err);
        throw err;
      }
    }

    // Auto Mode: Probe YOLO sidecar first, fallback to MediaPipe if unavailable
    try {
      await this.useYOLO();
      console.info('[PoseProviderManager] Selected YOLO11n-Pose (CUDA) as primary pose provider.');
      this.isFallback = false;
    } catch {
      console.info('[PoseProviderManager] YOLO sidecar unavailable. Falling back to MediaPipe.');
      await this.useMediaPipe();
      this.isFallback = true;
      this.startBackgroundHealthCheck();
    }
  }

  private async useYOLO(): Promise<void> {
    await this.yoloProvider.initialize();
    await this.yoloProvider.start();
    this.activeProvider = this.yoloProvider;
    this.isFallback = false;
  }

  private async useMediaPipe(): Promise<void> {
    await this.mediapipeProvider.initialize();
    await this.mediapipeProvider.start();
    this.activeProvider = this.mediapipeProvider;
  }

  private startBackgroundHealthCheck(): void {
    if (this.healthCheckTimer !== null || typeof window === 'undefined') return;

    this.healthCheckTimer = window.setInterval(async () => {
      if (this.mode === 'auto' && this.isFallback) {
        try {
          const testSocket = new WebSocket('ws://127.0.0.1:8765');
          testSocket.onopen = async () => {
            testSocket.close();
            console.info('[PoseProviderManager] YOLO sidecar detected! Gracefully transitioning from MediaPipe to YOLO.');
            try {
              await this.useYOLO();
              this.isFallback = false;
              if (this.healthCheckTimer) {
                clearInterval(this.healthCheckTimer);
                this.healthCheckTimer = null;
              }
            } catch {
              // Transition retry
            }
          };
        } catch {
          // Still offline
        }
      }
    }, 4000);
  }

  detect(video: HTMLVideoElement, timestampMs: number): PoseResult | null {
    if (!this.activeProvider) return null;

    if (this.activeProvider.type === 'yolo') {
      // Send video frame asynchronously to YOLO sidecar
      this.activeProvider.sendFrame(video, timestampMs);
      return this.activeProvider.getLatestPose();
    }

    return this.activeProvider.detect(video, timestampMs);
  }

  getMetrics(): PoseProviderMetrics {
    if (!this.activeProvider) {
      return {
        fps: 0,
        inferenceMs: 0,
        endToEndMs: 0,
        droppedFrames: 0,
        confidence: 0,
        device: 'None',
        modelName: 'None',
        isCuda: false,
        providerType: 'mediapipe',
      };
    }
    return this.activeProvider.getMetrics();
  }

  dispose(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.yoloProvider.dispose();
    this.mediapipeProvider.dispose();
    this.activeProvider = null;
  }
}
