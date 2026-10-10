/**
 * PoseRenderer.ts
 * High-performance 2D canvas renderer for the real-time pose skeleton.
 *
 * Capabilities:
 * - High-DPI canvas scaling
 * - Mirrored selfie view (horizontal flip)
 * - Thin clinical cyan connection lines with joint nodes
 * - Exercise-aware live target guide (Shoulder, Knee, Leg Raise)
 * - Exercise-aware joint highlights (Shoulder, Knee, Hip)
 * - Angle readout arc with bisector label
 */

import type { Landmark } from '../../types/pose';
import { LandmarkIndex, KEY_REHAB_LANDMARKS, POSE_CONNECTIONS } from '../../types/pose';
import type { MovementState } from '../biomechanics/biomechanicsTypes';
import type { LiveGuideOverlay, JointHighlight } from '../exercise/ExerciseTypes';

const MIN_VISIBILITY = 0.40;

export interface RenderOverlayOptions {
  angle?: number | null;
  shoulderFlexionAngle?: number | null;
  movementState?: MovementState;
  highlightJoint?: JointHighlight;
  targetAngle?: number;
  liveGuide?: LiveGuideOverlay | null;
  showTargetGuide?: boolean;
}

export interface RenderOptions {
  mirror?: boolean;
  lineColor?: string;
  lineWidth?: number;
  jointFillColor?: string;
  jointStrokeColor?: string;
  glowColor?: string;
  jointRadius?: number;
}

const DEFAULT_OPTIONS: Required<RenderOptions> = {
  mirror: true,
  lineColor: 'rgba(0, 229, 255, 0.85)',
  lineWidth: 2.5,
  jointFillColor: '#FFFFFF',
  jointStrokeColor: 'rgba(0, 229, 255, 1)',
  glowColor: 'rgba(0, 229, 255, 0.45)',
  jointRadius: 4,
};

export class PoseRenderer {
  private options: Required<RenderOptions>;

  constructor(options?: RenderOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  syncCanvasSize(canvas: HTMLCanvasElement, video: HTMLVideoElement): void {
    const width = video.videoWidth || video.clientWidth || 640;
    const height = video.videoHeight || video.clientHeight || 480;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  clear(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  render(
    canvas: HTMLCanvasElement,
    landmarks: Landmark[],
    overlay?: RenderOverlayOptions
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx || !landmarks || landmarks.length === 0) return;

    const width = canvas.width;
    const height = canvas.height;
    const movementState = overlay?.movementState ?? 'WAITING';
    const angle = overlay?.angle ?? overlay?.shoulderFlexionAngle ?? null;
    const highlightJoint = overlay?.highlightJoint ?? 'shoulder';
    const targetAngle = overlay?.targetAngle ?? 165;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    const toScreen = (lm: Landmark): { x: number; y: number; visible: boolean } => {
      const isVis = (lm.visibility ?? 1.0) >= MIN_VISIBILITY;
      const x = this.options.mirror ? (1 - lm.x) * width : lm.x * width;
      const y = lm.y * height;
      return { x, y, visible: isVis };
    };

    // 1. Draw exercise live target guide
    if (overlay?.showTargetGuide !== false && (movementState === 'LIFTING' || movementState === 'LOW_RANGE' || movementState === 'READY')) {
      if (overlay?.liveGuide) {
        this.drawCustomLiveGuide(ctx, overlay.liveGuide, width);
      } else {
        this.drawLiveTargetGuide(ctx, landmarks, toScreen);
      }
    }

    // 2. Draw connection lines
    ctx.lineWidth = this.options.lineWidth;
    ctx.strokeStyle = this.options.lineColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = this.options.glowColor;
    ctx.shadowBlur = 6;

    for (const [idxA, idxB] of POSE_CONNECTIONS) {
      const lmA = landmarks[idxA];
      const lmB = landmarks[idxB];
      if (!lmA || !lmB) continue;

      const ptA = toScreen(lmA);
      const ptB = toScreen(lmB);

      if (ptA.visible && ptB.visible) {
        ctx.beginPath();
        ctx.moveTo(ptA.x, ptA.y);
        ctx.lineTo(ptB.x, ptB.y);
        ctx.stroke();
      }
    }

    // 3. Draw key joint nodes
    const targetJointIndex =
      highlightJoint === 'knee'
        ? LandmarkIndex.RIGHT_KNEE
        : highlightJoint === 'hip'
        ? LandmarkIndex.RIGHT_HIP
        : LandmarkIndex.RIGHT_SHOULDER;

    for (const idx of KEY_REHAB_LANDMARKS) {
      const lm = landmarks[idx];
      if (!lm) continue;

      const pt = toScreen(lm);
      if (!pt.visible) continue;

      const isTargetJoint = idx === targetJointIndex;

      let fillColor = this.options.jointFillColor;
      let strokeColor = this.options.jointStrokeColor;
      let radius = this.options.jointRadius;

      if (isTargetJoint) {
        radius = this.options.jointRadius * 1.5;
        if (movementState === 'AT_TARGET') {
          fillColor = '#00E676';
          strokeColor = '#00E676';
          ctx.shadowColor = 'rgba(0, 230, 118, 0.9)';
          ctx.shadowBlur = 14;
        } else if (movementState === 'LIFTING' || movementState === 'LOW_RANGE') {
          fillColor = '#FFA726';
          strokeColor = '#FFA726';
          ctx.shadowColor = 'rgba(255, 167, 38, 0.85)';
          ctx.shadowBlur = 12;
        }
      }

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (isTargetJoint && (movementState === 'LIFTING' || movementState === 'AT_TARGET')) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius * 2.0, 0, 2 * Math.PI);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // 4. Draw Angle Arc
    if (angle !== null && angle !== undefined) {
      this.drawAngleArc(ctx, landmarks, angle, toScreen, movementState, highlightJoint, targetAngle);
    }

    ctx.restore();
  }

  private drawCustomLiveGuide(
    ctx: CanvasRenderingContext2D,
    guide: LiveGuideOverlay,
    canvasWidth: number,
  ): void {
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(0, 230, 118, 0.70)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';

    const startX = this.options.mirror ? canvasWidth - guide.start.x : guide.start.x;
    const endX = this.options.mirror ? canvasWidth - guide.end.x : guide.end.x;

    ctx.beginPath();
    ctx.moveTo(startX, guide.start.y);
    ctx.lineTo(endX, guide.end.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(0, 230, 118, 0.85)';
    ctx.beginPath();
    ctx.arc(endX, guide.end.y, 4, 0, 2 * Math.PI);
    ctx.fill();

    ctx.font = '600 10.5px var(--font-sans, sans-serif)';
    ctx.fillText(guide.label, endX + 8, guide.end.y - 4);
    ctx.restore();
  }

  private drawLiveTargetGuide(
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[],
    toScreen: (lm: Landmark) => { x: number; y: number; visible: boolean }
  ): void {
    const shoulder = landmarks[LandmarkIndex.RIGHT_SHOULDER];
    const hip = landmarks[LandmarkIndex.RIGHT_HIP];
    const elbow = landmarks[LandmarkIndex.RIGHT_ELBOW];
    const wrist = landmarks[LandmarkIndex.RIGHT_WRIST];

    if (!shoulder || !hip) return;
    const ptS = toScreen(shoulder);
    const ptH = toScreen(hip);
    if (!ptS.visible || !ptH.visible) return;

    let armLength = 110;
    if (elbow && wrist) {
      const ptE = toScreen(elbow);
      const ptW = toScreen(wrist);
      if (ptE.visible && ptW.visible) {
        const uLen = Math.hypot(ptE.x - ptS.x, ptE.y - ptS.y);
        const fLen = Math.hypot(ptW.x - ptE.x, ptW.y - ptE.y);
        if (uLen > 10 && fLen > 10) armLength = uLen + fLen;
      }
    }

    const torsoDx = ptS.x - ptH.x;
    const torsoDy = ptS.y - ptH.y;
    const torsoAngle = Math.atan2(torsoDy, torsoDx);

    const ccw = torsoDx > 0;
    const targetAngleRad = torsoAngle + (ccw ? -1 : 1) * ((180 - 165) * (Math.PI / 180));

    const targetWristX = ptS.x + Math.cos(targetAngleRad) * armLength;
    const targetWristY = ptS.y + Math.sin(targetAngleRad) * armLength;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(0, 230, 118, 0.55)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(ptS.x, ptS.y);
    ctx.lineTo(targetWristX, targetWristY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(0, 230, 118, 0.75)';
    ctx.beginPath();
    ctx.arc(targetWristX, targetWristY, 3.5, 0, 2 * Math.PI);
    ctx.fill();

    const labelX = targetWristX + (ccw ? -8 : 8);
    const labelY = targetWristY - 6;
    ctx.font = '600 10px var(--font-sans, sans-serif)';
    ctx.fillStyle = 'rgba(0, 230, 118, 0.85)';
    ctx.textAlign = ccw ? 'right' : 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Target 165°', labelX, labelY);
    ctx.restore();
  }

  private drawAngleArc(
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[],
    angleDeg: number,
    toScreen: (lm: Landmark) => { x: number; y: number; visible: boolean },
    movementState: MovementState,
    highlightJoint?: JointHighlight,
    _targetAngle?: number,
  ): void {
    let ptOrigin: { x: number; y: number; visible: boolean } | null = null;
    let ptRef: { x: number; y: number; visible: boolean } | null = null;
    let ptLimb: { x: number; y: number; visible: boolean } | null = null;

    if (highlightJoint === 'knee') {
      const hip = landmarks[24];
      const knee = landmarks[26];
      const ankle = landmarks[28];
      if (hip && knee && ankle) {
        ptOrigin = toScreen(knee);
        ptRef = toScreen(hip);
        ptLimb = toScreen(ankle);
      }
    } else if (highlightJoint === 'hip') {
      const shoulder = landmarks[12];
      const hip = landmarks[24];
      const ankle = landmarks[28] ?? landmarks[26];
      if (hip && ankle) {
        ptOrigin = toScreen(hip);
        ptRef = shoulder ? toScreen(shoulder) : { x: ptOrigin.x + 50, y: ptOrigin.y, visible: true };
        ptLimb = toScreen(ankle);
      }
    } else {
      const shoulder = landmarks[12];
      const hip = landmarks[24];
      const wrist = landmarks[16] ?? landmarks[14];
      if (shoulder && hip && wrist) {
        ptOrigin = toScreen(shoulder);
        ptRef = toScreen(hip);
        ptLimb = toScreen(wrist);
      }
    }

    if (!ptOrigin || !ptRef || !ptLimb || !ptOrigin.visible) return;

    const dir1X = ptRef.x - ptOrigin.x;
    const dir1Y = ptRef.y - ptOrigin.y;
    const dir2X = ptLimb.x - ptOrigin.x;
    const dir2Y = ptLimb.y - ptOrigin.y;

    const arcRadius = 34;
    const startAngle = Math.atan2(dir1Y, dir1X);
    const endAngle = Math.atan2(dir2Y, dir2X);

    let arcColor = 'rgba(255, 213, 79, 0.9)';
    let labelColor = '#FFD54F';
    if (movementState === 'AT_TARGET') {
      arcColor = 'rgba(0, 230, 118, 0.95)';
      labelColor = '#00E676';
    } else if (movementState === 'LIFTING' || movementState === 'LOW_RANGE') {
      arcColor = 'rgba(255, 167, 38, 0.95)';
      labelColor = '#FFA726';
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(ptOrigin.x, ptOrigin.y, arcRadius, startAngle, endAngle, false);
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    const label = `${Math.round(angleDeg)}°`;
    ctx.font = 'bold 12px ui-monospace, monospace';
    const tw = ctx.measureText(label).width;
    const lx = ptOrigin.x + 16;
    const ly = ptOrigin.y - 16;

    ctx.fillStyle = 'rgba(10, 14, 20, 0.85)';
    ctx.beginPath();
    ctx.roundRect(lx - tw / 2 - 4, ly - 8, tw + 8, 16, 4);
    ctx.fill();

    ctx.fillStyle = labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx, ly);

    ctx.restore();
  }
}
