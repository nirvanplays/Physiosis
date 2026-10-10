/**
 * usePoseTracking.ts
 * Unified React hook managing the MediaPipe webcam stream, landmark smoothing,
 * exercise-aware kinematics calculation, session analytics, and canvas rendering.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { PoseProviderManager, type PoseProviderType } from '../engine/pose/PoseProvider';
import { LandmarkSmoother } from '../engine/pose/LandmarkSmoother';
import { PoseRenderer } from '../engine/pose/PoseRenderer';
import { ExerciseKinematicsTracker } from '../engine/biomechanics/ExerciseKinematicsTracker';
import { ExerciseSessionEngine } from '../engine/session/ExerciseSession';
import type { Landmark, PoseTrackingStats } from '../types/pose';
import { KEY_REHAB_LANDMARKS } from '../types/pose';
import type { EngineStatus } from '../types/engine';
import type { ShoulderFlexionAnalysis } from '../engine/biomechanics/biomechanicsTypes';
import type { LiveSessionState } from '../engine/session/SessionTypes';
import { INITIAL_LIVE_SESSION_STATE } from '../engine/session/SessionTypes';
import type { ExerciseDefinition } from '../engine/exercise/ExerciseTypes';
import { getDefaultExercise } from '../engine/exercise/ExerciseRegistry';
import { temporalInferenceEngine } from '../engine/ai/temporal/TemporalInferenceEngine';
import type { TemporalPredictionOutput } from '../engine/ai/temporal/TemporalTypes';

const INITIAL_STATS: PoseTrackingStats = {
  fps: 0,
  landmarkCount: 0,
  confidence: 0,
  poseDetected: false,
};

const INITIAL_ANALYSIS: ShoulderFlexionAnalysis = {
  angle: null,
  targetAngle: 165,
  deviation: null,
  rangePercentage: null,
  state: 'WAITING',
  score: null,
  repCount: 0,
  currentRep: 0,
  lastRepPeak: null,
  confidence: null,
  feedback: 'Move into view to begin tracking.',
};

export interface LiveBiomechanicsPacket {
  angle: number | null;
  targetAngle: number;
  deviation: number | null;
  rangePercentage: number | null;
  state: string;
  score: number | null;
  repCount: number;
  currentRep: number;
  lastRepPeak: number | null;
  confidence: number | null;
  feedback: string;
  timestamp: number;
  landmarks: Landmark[] | null;
}

export interface UsePoseTrackingReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  engineStatus: EngineStatus;
  isStreaming: boolean;
  isInitializing: boolean;
  errorMessage: string | null;
  stats: PoseTrackingStats;
  shoulderFlexion: ShoulderFlexionAnalysis;
  liveAnalysis: ShoulderFlexionAnalysis;
  sessionState: LiveSessionState;
  latestLandmarks: Landmark[] | null;
  latestBiomechanicsRef: React.MutableRefObject<ShoulderFlexionAnalysis>;
  temporalPrediction: TemporalPredictionOutput | null;
  providerType: 'yolo' | 'mediapipe';
  isFallback: boolean;
  setProviderMode: (mode: PoseProviderType) => Promise<void>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  toggleCamera: () => Promise<void>;
  startExerciseSession: (durationSeconds?: number) => void;
  pauseExerciseSession: () => void;
  resumeExerciseSession: () => void;
  stopExerciseSession: (finalState?: 'COMPLETED' | 'IDLE') => void;
  resetExerciseSession: () => void;
  setOnAutoEnd: (callback: () => void) => void;
}

export function usePoseTracking(
  activeExercise: ExerciseDefinition = getDefaultExercise()
): UsePoseTrackingReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<PoseTrackingStats>(INITIAL_STATS);
  const [latestLandmarks, setLatestLandmarks] = useState<Landmark[] | null>(null);
  const [analysis, setAnalysis] = useState<ShoulderFlexionAnalysis>({
    ...INITIAL_ANALYSIS,
    targetAngle: activeExercise.targetAngle,
  });
  const [sessionState, setSessionState] = useState<LiveSessionState>(
    INITIAL_LIVE_SESSION_STATE
  );
  const [temporalPrediction, setTemporalPrediction] = useState<TemporalPredictionOutput | null>(null);

  useEffect(() => {
    const unsubscribe = temporalInferenceEngine.addPredictionListener((pred) => {
      setTemporalPrediction(pred);
    });
    return () => unsubscribe();
  }, []);

  // Engine references
  const providerRef = useRef<PoseProviderManager | null>(null);
  const smootherRef = useRef<LandmarkSmoother>(new LandmarkSmoother(0.35));
  const rendererRef = useRef<PoseRenderer>(new PoseRenderer({ mirror: true }));
  const trackerRef = useRef<ExerciseKinematicsTracker>(
    new ExerciseKinematicsTracker(activeExercise)
  );
  const sessionEngineRef = useRef<ExerciseSessionEngine>(new ExerciseSessionEngine(180));

  // Stream & RAF references
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const isLoopRunningRef = useRef(false);

  const latestLandmarksRef = useRef<Landmark[] | null>(null);
  const latestBiomechanicsRef = useRef<ShoulderFlexionAnalysis>({
    ...INITIAL_ANALYSIS,
    targetAngle: activeExercise.targetAngle,
  });
  const activeExerciseRef = useRef<ExerciseDefinition>(activeExercise);

  // Throttled stats tracking
  const frameCountRef = useRef(0);
  const lastFpsCalcTimeRef = useRef(performance.now());
  const lastUiUpdateRef = useRef(0);
  const lastStatsUpdateRef = useRef(0);

  // Keep active exercise in sync without tearing down the webcam loop
  useEffect(() => {
    activeExerciseRef.current = activeExercise;
    trackerRef.current.setExercise(activeExercise);
    sessionEngineRef.current.reset();
    const snap = trackerRef.current.getSnapshot();
    latestBiomechanicsRef.current = snap;
    setAnalysis(snap);
    setSessionState(sessionEngineRef.current.getSnapshot());
  }, [activeExercise]);

  const startExerciseSession = useCallback((durationSeconds = 180) => {
    trackerRef.current.reset();
    sessionEngineRef.current.start(durationSeconds);
    const snap = trackerRef.current.getSnapshot();
    latestBiomechanicsRef.current = snap;
    setAnalysis(snap);
    setSessionState(sessionEngineRef.current.getSnapshot());
  }, []);

  const pauseExerciseSession = useCallback(() => {
    sessionEngineRef.current.pause();
    setSessionState(sessionEngineRef.current.getSnapshot());
  }, []);

  const resumeExerciseSession = useCallback(() => {
    sessionEngineRef.current.resume();
    setSessionState(sessionEngineRef.current.getSnapshot());
  }, []);

  const stopExerciseSession = useCallback((finalState: 'COMPLETED' | 'IDLE' = 'COMPLETED') => {
    sessionEngineRef.current.stop(finalState);
    setSessionState(sessionEngineRef.current.getSnapshot());
  }, []);

  const resetExerciseSession = useCallback(() => {
    trackerRef.current.reset();
    sessionEngineRef.current.reset();
    temporalInferenceEngine.reset();
    setTemporalPrediction(null);
    const snap = trackerRef.current.getSnapshot();
    latestBiomechanicsRef.current = snap;
    setAnalysis(snap);
    setSessionState(sessionEngineRef.current.getSnapshot());
  }, []);

  const setOnAutoEnd = useCallback((callback: () => void) => {
    sessionEngineRef.current.setOnAutoEnd(callback);
  }, []);

  /**
   * Stop the camera stream and animation loop.
   */
  const stopCamera = useCallback(() => {
    isLoopRunningRef.current = false;

    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (canvasRef.current) {
      rendererRef.current.clear(canvasRef.current);
    }

    smootherRef.current.reset();
    trackerRef.current.reset();
    sessionEngineRef.current.stop();
    temporalInferenceEngine.reset();
    setTemporalPrediction(null);
    latestLandmarksRef.current = null;

    setIsStreaming(false);
    setIsInitializing(false);
    setEngineStatus('idle');
    setStats(INITIAL_STATS);
    setAnalysis(trackerRef.current.getSnapshot());
    setSessionState(sessionEngineRef.current.getSnapshot());
  }, []);

  const setProviderMode = useCallback(async (mode: PoseProviderType) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('POSE_PROVIDER', mode);
    }
    if (providerRef.current) {
      providerRef.current.dispose();
      providerRef.current = new PoseProviderManager(mode);
      if (isStreaming) {
        await providerRef.current.initialize();
      }
    }
  }, [isStreaming]);

  /**
   * Start the camera stream and initialize pose provider (YOLO CUDA primary / MediaPipe fallback).
   */
  const startCamera = useCallback(async () => {
    if (isStreaming || isInitializing) return;

    setErrorMessage(null);
    setIsInitializing(true);
    setEngineStatus('initializing');

    try {
      if (!providerRef.current) {
        const preferredMode =
          (typeof window !== 'undefined'
            ? (localStorage.getItem('POSE_PROVIDER') as PoseProviderType)
            : 'auto') || 'auto';
        providerRef.current = new PoseProviderManager(preferredMode);
      }
      await providerRef.current.initialize();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam API is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        throw new Error('Video element ref is not available.');
      }

      video.srcObject = stream;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          video
            .play()
            .then(() => resolve())
            .catch((e) => reject(e));
        };
        video.onerror = (e) => reject(e);
      });

      setIsStreaming(true);
      setIsInitializing(false);
      setEngineStatus('running');

      smootherRef.current.reset();
      trackerRef.current.reset();
      sessionEngineRef.current.start();

      isLoopRunningRef.current = true;

      const runFrame = () => {
        if (!isLoopRunningRef.current) return;

        const currentVideo = videoRef.current;
        const currentCanvas = canvasRef.current;
        const provider = providerRef.current;

        if (
          currentVideo &&
          currentCanvas &&
          provider &&
          currentVideo.readyState >= 2
        ) {
          rendererRef.current.syncCanvasSize(currentCanvas, currentVideo);
          const now = performance.now();
          const currentEx = activeExerciseRef.current;

          // Detect pose (YOLO CUDA socket / MediaPipe fallback)
          const result = provider.detect(currentVideo, now);

          if (result && result.landmarks && result.landmarks.length > 0) {
            const smoothed = smootherRef.current.smooth(result.landmarks);
            latestLandmarksRef.current = smoothed;

            // Compute authoritative live biomechanics
            const analysisSnapshot = trackerRef.current.update(smoothed);
            latestBiomechanicsRef.current = analysisSnapshot;
            sessionEngineRef.current.update(analysisSnapshot);

            // Feed to Temporal Movement Intelligence Pipeline (asynchronous, non-blocking)
            temporalInferenceEngine.processFrame({
              timestamp: now,
              currentAngle: analysisSnapshot.angle,
              landmarks: smoothed,
              activeExercise: currentEx,
              movementPhase: analysisSnapshot.state,
              postureResult: analysisSnapshot.postureResult,
            });

            // Generate live guide
            const liveGuide = currentEx.getLiveGuide
              ? currentEx.getLiveGuide(smoothed, currentCanvas.width, currentCanvas.height)
              : null;

            // Render 2D canvas skeleton
            rendererRef.current.render(currentCanvas, smoothed, {
              angle: analysisSnapshot.angle,
              movementState: analysisSnapshot.state,
              highlightJoint: currentEx.highlightJoint,
              targetAngle: currentEx.targetAngle,
              liveGuide,
              showTargetGuide: true,
            });

            const visibleKeyCount = KEY_REHAB_LANDMARKS.filter(
              (idx) => (smoothed[idx]?.visibility ?? 1) >= 0.40
            ).length;

            const avgConf =
              smoothed.reduce((acc, curr) => acc + (curr.visibility ?? 1), 0) /
              smoothed.length;

            frameCountRef.current += 1;

            // Continuous UI synchronization (~30Hz / 33ms throttle for smooth DOM updates without CPU thrashing)
            if (now - lastUiUpdateRef.current >= 33) {
              lastUiUpdateRef.current = now;
              setLatestLandmarks(smoothed);
              setAnalysis(analysisSnapshot);
              setSessionState(sessionEngineRef.current.getSnapshot());
            }

            // Stats / FPS calculation throttled to 500ms
            if (now - lastStatsUpdateRef.current >= 500) {
              const elapsedSec = (now - lastFpsCalcTimeRef.current) / 1000;
              const calculatedFps =
                elapsedSec > 0 ? Math.round(frameCountRef.current / elapsedSec) : 0;

              frameCountRef.current = 0;
              lastFpsCalcTimeRef.current = now;
              lastStatsUpdateRef.current = now;

              const metrics = provider.getMetrics();

              setStats({
                fps: metrics.fps || calculatedFps,
                landmarkCount: visibleKeyCount,
                confidence: Math.round(avgConf * 100),
                poseDetected: true,
                providerType: provider.activeType,
                inferenceMs: metrics.inferenceMs,
                endToEndMs: metrics.endToEndMs,
                device: metrics.device,
                modelName: metrics.modelName,
                isCuda: metrics.isCuda,
                isFallback: provider.isFallbackActive,
              });
            }
          } else {
            rendererRef.current.clear(currentCanvas);
            latestLandmarksRef.current = null;
            smootherRef.current.reset();
            const emptySnapshot = trackerRef.current.update(null);
            latestBiomechanicsRef.current = emptySnapshot;
            sessionEngineRef.current.update(emptySnapshot);

            temporalInferenceEngine.processFrame({
              timestamp: now,
              currentAngle: null,
              landmarks: null,
              activeExercise: currentEx,
              movementPhase: emptySnapshot.state,
              postureResult: null,
            });

            frameCountRef.current += 1;

            if (now - lastUiUpdateRef.current >= 33) {
              lastUiUpdateRef.current = now;
              setLatestLandmarks(null);
              setAnalysis(emptySnapshot);
              setSessionState(sessionEngineRef.current.getSnapshot());
            }

            if (now - lastStatsUpdateRef.current >= 500) {
              const elapsedSec = (now - lastFpsCalcTimeRef.current) / 1000;
              const calculatedFps =
                elapsedSec > 0 ? Math.round(frameCountRef.current / elapsedSec) : 0;

              frameCountRef.current = 0;
              lastFpsCalcTimeRef.current = now;
              lastStatsUpdateRef.current = now;

              const metrics = provider.getMetrics();

              setStats((prev) => ({
                ...prev,
                fps: metrics.fps || calculatedFps,
                landmarkCount: 0,
                poseDetected: false,
                providerType: provider.activeType,
                inferenceMs: metrics.inferenceMs,
                endToEndMs: metrics.endToEndMs,
                device: metrics.device,
                modelName: metrics.modelName,
                isCuda: metrics.isCuda,
                isFallback: provider.isFallbackActive,
              }));
            }
          }
        }

        animationFrameIdRef.current = requestAnimationFrame(runFrame);
      };

      animationFrameIdRef.current = requestAnimationFrame(runFrame);
    } catch (err: unknown) {
      console.error('[usePoseTracking] Camera initialization failed:', err);
      let userMsg = 'Failed to access camera.';
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          userMsg = 'Camera permission denied. Please enable camera access in your browser settings.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          userMsg = 'No webcam device found on your system.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          userMsg = 'Webcam is currently in use by another application.';
        }
      } else if (err instanceof Error) {
        userMsg = err.message;
      }

      setErrorMessage(userMsg);
      setEngineStatus('error');
      setIsInitializing(false);
      setIsStreaming(false);
      stopCamera();
    }
  }, [isStreaming, isInitializing, stopCamera]);

  const toggleCamera = useCallback(async () => {
    if (isStreaming) {
      stopCamera();
    } else {
      await startCamera();
    }
  }, [isStreaming, startCamera, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (providerRef.current) {
        providerRef.current.dispose();
        providerRef.current = null;
      }
    };
  }, [stopCamera]);

  return {
    videoRef,
    canvasRef,
    engineStatus,
    isStreaming,
    isInitializing,
    errorMessage,
    stats,
    shoulderFlexion: analysis,
    liveAnalysis: analysis,
    sessionState,
    latestLandmarks,
    latestBiomechanicsRef,
    temporalPrediction,
    providerType: providerRef.current?.activeType || 'yolo',
    isFallback: providerRef.current?.isFallbackActive || false,
    setProviderMode,
    startCamera,
    stopCamera,
    toggleCamera,
    startExerciseSession,
    pauseExerciseSession,
    resumeExerciseSession,
    stopExerciseSession,
    resetExerciseSession,
    setOnAutoEnd,
  };
}
