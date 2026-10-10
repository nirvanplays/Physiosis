/**
 * SkeletonRenderer.ts
 * Unified Canvas 2D renderer for all Physiosis rehabilitation exercises:
 *   - Standing (Shoulder Flexion)
 *   - Seated (Seated Knee Extension)
 *   - Supine (Straight-Leg Raise)
 *
 * Capabilities:
 *   - Multi-posture hierarchical forward kinematics joint solver
 *   - Volumetric capsule bones with highlight stripes
 *   - Glowing multi-layer rounded joints with specular highlights
 *   - 3D Depth layering (contralateral limbs at 65% opacity and depth offset)
 *   - Dynamic joint angle arc with bisector badge (shoulder / knee / hip)
 *   - Phase-specific overlays:
 *       • LIMITATION: Pulsing amber joint, leader-line annotation card, ghost target guide
 *       • CORRECTION: Cyan guidance styling, live progression toward target guide
 *       • IMPROVED:   Success green highlights, "XX° / XX° ✓" target reached badge
 */

import type {
  ReferencePose,
  BodyProportions,
  JointPositions,
  Vec2,
  ExercisePhase,
} from './PoseTypes';
import { DEFAULT_BODY_PROPORTIONS } from './PoseTypes';
import type { JointHighlight } from './ExerciseTypes';

// ─── Rendering options ────────────────────────────────────────────────────────

export interface SkeletonRenderOptions {
  phase?: ExercisePhase;
  currentAngle?: number;
  targetAngle?: number;
  elapsedMs?: number;
  highlightJoint?: JointHighlight;
  metricName?: string;
  postureMode?: 'standing' | 'seated' | 'supine';
  side?: 'left' | 'right' | 'bilateral';
}

/**
 * Mirror a reference pose when tracking the left limb.
 */
export function mirrorPoseForSide(
  pose: ReferencePose,
  side?: 'left' | 'right' | 'bilateral'
): ReferencePose {
  if (side !== 'left') return pose;

  return {
    ...pose,
    rightShoulderFlexion: pose.leftShoulderFlexion,
    leftShoulderFlexion: pose.rightShoulderFlexion,
    rightShoulderAbduction: pose.leftShoulderAbduction,
    leftShoulderAbduction: pose.rightShoulderAbduction,
    rightElbowFlexion: pose.leftElbowFlexion,
    leftElbowFlexion: pose.rightElbowFlexion,
    rightShoulderElevation: pose.leftShoulderElevation,
    leftShoulderElevation: pose.rightShoulderElevation,
    rightHipFlexion: pose.leftHipFlexion,
    leftHipFlexion: pose.rightHipFlexion,
    rightKneeFlexion: pose.leftKneeFlexion,
    leftKneeFlexion: pose.rightKneeFlexion,
    trunkSideFlexion: -pose.trunkSideFlexion,
    headRotation: -pose.headRotation,
  };
}

// ─── Proportional constants ───────────────────────────────────────────────────

const BODY_HEIGHT_RATIO = 0.80;
const PELVIS_Y_RATIO = 0.690;
const FIGURE_X_RATIO = 0.40;

const THICKNESS_BASE = 500;
const THIGH_THICKNESS_MULT = 1.45;
const UPPER_ARM_THICKNESS_MULT = 1.20;
const FOREARM_THICKNESS_MULT = 1.05;
const SHIN_THICKNESS_MULT = 1.25;
const TRUNK_THICKNESS_MULT = 1.80;
const PELVIS_THICKNESS_MULT = 2.20;

const DEPTH_OFFSET_X = 0.015;
const DEPTH_OFFSET_Y = 0.003;

// Base colour palette
const COL = {
  boneBack:      'hsl(215, 14%, 38%)',
  boneMid:       'hsl(215, 18%, 50%)',
  boneFront:     'hsl(215, 22%, 58%)',
  boneArm:       'hsl(210, 35%, 64%)',

  highlightBack: 'rgba(255,255,255,0.10)',
  highlightFront:'rgba(255,255,255,0.20)',
  highlightArm:  'rgba(255,255,255,0.28)',

  jointBack:     'hsl(215, 18%, 50%)',
  jointFront:    'hsl(215, 26%, 68%)',
  jointArm:      'hsl(210, 45%, 76%)',
  jointGlow:     'hsla(210, 60%, 70%, 0.22)',

  headFill:      'hsl(215, 16%, 46%)',
  headStroke:    'hsl(215, 24%, 62%)',
  groundLine:    'hsla(220, 12%, 30%, 0.55)',

  angleSector:   'rgba(255, 200, 80, 0.07)',
  arcStroke:     'rgba(255, 200, 80, 0.88)',
  arcRef:        'rgba(255, 200, 80, 0.28)',
  labelBg:       'rgba(8, 12, 18, 0.84)',
  labelFg:       '#FFD54F',

  // Phase-specific accents
  amberArm:      'hsl(38, 75%, 54%)',
  amberHighlight:'rgba(255, 190, 80, 0.35)',
  amberJoint:    '#FFA726',
  amberGlow:     'rgba(255, 167, 38, 0.45)',

  guidanceArm:   'hsl(190, 85%, 56%)',
  guidanceJoint: '#00E5FF',
  guidanceGlow:  'rgba(0, 229, 255, 0.40)',

  successArm:    'hsl(150, 70%, 50%)',
  successJoint:  '#00E676',
  successGlow:   'rgba(0, 230, 118, 0.45)',

  ghostBone:     'rgba(0, 230, 118, 0.40)',
  ghostJoint:    'rgba(0, 230, 118, 0.65)',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deg2rad(deg: number): number { return (deg * Math.PI) / 180; }
function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }

function step(from: Vec2, canvasAngle: number, length: number): Vec2 {
  return {
    x: from.x + Math.cos(canvasAngle) * length,
    y: from.y + Math.sin(canvasAngle) * length,
  };
}

function perp(from: Vec2, to: Vec2, scale: number): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: (-dy / len) * scale, y: (dx / len) * scale };
}

// ─── Forward Kinematics Joint Solver ───────────────────────────────────────────

export function computeJointPositions(
  pose: ReferencePose,
  canvasWidth: number,
  canvasHeight: number,
  proportions: BodyProportions = DEFAULT_BODY_PROPORTIONS,
): JointPositions {
  const H = canvasHeight;
  const bh = H * BODY_HEIGHT_RATIO;
  const px = (v: number) => v * bh;
  const mode = pose.postureMode ?? 'standing';
  const trunkRad = deg2rad(pose.trunkLean);

  // ── SEATED POSTURE (Seated Knee Extension) ──────────────────────────────────
  if (mode === 'seated') {
    const pelvisX = canvasWidth * 0.34;
    const pelvisY = H * 0.60;
    const pelvis: Vec2 = { x: pelvisX, y: pelvisY };

    const trunkAngle = -Math.PI / 2 + trunkRad;
    const spine: Vec2 = step(pelvis, trunkAngle, px(proportions.trunkLength * 0.5));
    const neckBase: Vec2 = step(pelvis, trunkAngle, px(proportions.trunkLength));
    const headCenter: Vec2 = step(neckBase, trunkAngle, px(proportions.neckLength + proportions.headRadius));

    const shoulderDrop = px(0.012);
    const rightShoulder: Vec2 = {
      x: neckBase.x + px(proportions.shoulderHalfWidth * 0.28),
      y: neckBase.y + shoulderDrop,
    };
    const leftShoulder: Vec2 = {
      x: neckBase.x - px(proportions.shoulderHalfWidth * 0.12),
      y: neckBase.y + shoulderDrop,
    };

    // Arms resting naturally forward on lap
    const rArmAngle = Math.PI / 3;
    const rightElbow = step(rightShoulder, rArmAngle, px(proportions.upperArmLength));
    const rightWrist = step(rightElbow, 0, px(proportions.forearmLength));

    const lArmAngle = Math.PI / 3;
    const leftElbow = step(leftShoulder, lArmAngle, px(proportions.upperArmLength));
    const leftWrist = step(leftElbow, 0, px(proportions.forearmLength));

    const rightHip: Vec2 = { x: pelvis.x + px(proportions.hipHalfWidth * 0.22), y: pelvis.y };
    const leftHip: Vec2 = { x: pelvis.x - px(proportions.hipHalfWidth * 0.10), y: pelvis.y };

    // Right extending leg (thigh horizontal, knee flexion controls shin angle)
    const rThighAngle = deg2rad(pose.rightHipFlexion);
    const rightKnee = step(rightHip, rThighAngle, px(proportions.thighLength));
    const rShinAngle = rThighAngle + deg2rad(pose.rightKneeFlexion);
    const rightAnkle = step(rightKnee, rShinAngle, px(proportions.shinLength));
    const rightToe: Vec2 = {
      x: rightAnkle.x + px(proportions.footLength * 0.8),
      y: rightAnkle.y + px(proportions.footLength * 0.2),
    };

    // Left stationary seated leg
    const lThighAngle = deg2rad(pose.leftHipFlexion);
    const leftKnee = step(leftHip, lThighAngle, px(proportions.thighLength));
    const lShinAngle = lThighAngle + deg2rad(pose.leftKneeFlexion);
    const leftAnkle = step(leftKnee, lShinAngle, px(proportions.shinLength));
    const leftToe: Vec2 = {
      x: leftAnkle.x + px(proportions.footLength * 0.8),
      y: leftAnkle.y + px(proportions.footLength * 0.2),
    };

    return {
      pelvis, spine, neckBase, headCenter,
      rightShoulder, rightElbow, rightWrist,
      leftShoulder, leftElbow, leftWrist,
      rightHip, rightKnee, rightAnkle, rightToe,
      leftHip, leftKnee, leftAnkle, leftToe,
    };
  }

  // ── SUPINE POSTURE (Straight-Leg Raise) ──────────────────────────────────────
  if (mode === 'supine') {
    const pelvisX = canvasWidth * 0.44;
    const pelvisY = H * 0.72;
    const pelvis: Vec2 = { x: pelvisX, y: pelvisY };

    const trunkAngle = Math.PI + trunkRad; // horizontal lying to left
    const spine: Vec2 = step(pelvis, trunkAngle, px(proportions.trunkLength * 0.5));
    const neckBase: Vec2 = step(pelvis, trunkAngle, px(proportions.trunkLength));
    const headCenter: Vec2 = step(neckBase, trunkAngle, px(proportions.neckLength + proportions.headRadius));

    const rightShoulder: Vec2 = { x: neckBase.x, y: neckBase.y - px(0.015) };
    const leftShoulder: Vec2 = { x: neckBase.x - px(0.015), y: neckBase.y - px(0.015) };

    const rightElbow = step(rightShoulder, 0, px(proportions.upperArmLength));
    const rightWrist = step(rightElbow, 0, px(proportions.forearmLength));
    const leftElbow = step(leftShoulder, 0, px(proportions.upperArmLength));
    const leftWrist = step(leftElbow, 0, px(proportions.forearmLength));

    const rightHip: Vec2 = { x: pelvis.x, y: pelvis.y };
    const leftHip: Vec2 = { x: pelvis.x - px(0.012), y: pelvis.y };

    // Right leg elevating upward around hip
    const rThighAngle = -deg2rad(pose.rightHipFlexion);
    const rightKnee = step(rightHip, rThighAngle, px(proportions.thighLength));
    const rShinAngle = rThighAngle + deg2rad(pose.rightKneeFlexion);
    const rightAnkle = step(rightKnee, rShinAngle, px(proportions.shinLength));
    const rightToe: Vec2 = {
      x: rightAnkle.x + px(proportions.footLength * 0.7),
      y: rightAnkle.y - px(proportions.footLength * 0.3),
    };

    // Left stationary resting flat leg
    const lThighAngle = 0;
    const leftKnee = step(leftHip, lThighAngle, px(proportions.thighLength));
    const lShinAngle = 0;
    const leftAnkle = step(leftKnee, lShinAngle, px(proportions.shinLength));
    const leftToe: Vec2 = {
      x: leftAnkle.x + px(proportions.footLength * 0.8),
      y: leftAnkle.y + px(proportions.footLength * 0.1),
    };

    return {
      pelvis, spine, neckBase, headCenter,
      rightShoulder, rightElbow, rightWrist,
      leftShoulder, leftElbow, leftWrist,
      rightHip, rightKnee, rightAnkle, rightToe,
      leftHip, leftKnee, leftAnkle, leftToe,
    };
  }

  // ── STANDING POSTURE (Shoulder Flexion - default) ────────────────────────────
  const pelvisX = canvasWidth * FIGURE_X_RATIO;
  const pelvisY = H * PELVIS_Y_RATIO;
  const pelvis: Vec2 = { x: pelvisX, y: pelvisY };

  const trunkAngle = -Math.PI / 2 + trunkRad;
  const spine: Vec2 = step(pelvis, trunkAngle, px(proportions.trunkLength * 0.5));
  const neckBase: Vec2 = step(pelvis, trunkAngle, px(proportions.trunkLength));

  const rShoulderElev = px(proportions.headRadius * 0.12 * (pose.rightShoulderElevation / 10));

  const neckAngle = trunkAngle + deg2rad(pose.headFlexion * 0.5);
  const neckTip: Vec2 = step(neckBase, neckAngle, px(proportions.neckLength));
  const headCenter: Vec2 = step(neckTip, neckAngle, px(proportions.headRadius));

  const shoulderDrop = px(0.012);
  const rightShoulder: Vec2 = {
    x: neckBase.x + px(proportions.shoulderHalfWidth * 0.28),
    y: neckBase.y + shoulderDrop - rShoulderElev,
  };
  const leftShoulder: Vec2 = {
    x: neckBase.x - px(proportions.shoulderHalfWidth * 0.12),
    y: neckBase.y + shoulderDrop,
  };

  // Right arm chain (forward kinematics)
  const rArmAngle = Math.PI / 2 - deg2rad(pose.rightShoulderFlexion);
  const rightElbow = step(rightShoulder, rArmAngle, px(proportions.upperArmLength));
  const rForeAngle = rArmAngle - deg2rad(pose.rightElbowFlexion);
  const rightWrist = step(rightElbow, rForeAngle, px(proportions.forearmLength));

  // Left arm chain
  const lArmAngle = Math.PI / 2 - deg2rad(pose.leftShoulderFlexion);
  const leftElbow = step(leftShoulder, lArmAngle, px(proportions.upperArmLength));
  const lForeAngle = lArmAngle - deg2rad(pose.leftElbowFlexion);
  const leftWrist = step(leftElbow, lForeAngle, px(proportions.forearmLength));

  // Hips
  const rightHip: Vec2 = { x: pelvis.x + px(proportions.hipHalfWidth * 0.22), y: pelvis.y };
  const leftHip: Vec2 = { x: pelvis.x - px(proportions.hipHalfWidth * 0.10), y: pelvis.y };

  // Legs
  const rThighAngle = Math.PI / 2 + deg2rad(pose.rightHipFlexion);
  const rightKnee = step(rightHip, rThighAngle, px(proportions.thighLength));
  const rShinAngle = rThighAngle + deg2rad(pose.rightKneeFlexion);
  const rightAnkle = step(rightKnee, rShinAngle, px(proportions.shinLength));
  const rightToe: Vec2 = {
    x: rightAnkle.x + px(proportions.footLength * 0.85),
    y: rightAnkle.y + px(proportions.footLength * 0.18),
  };

  const lThighAngle = Math.PI / 2 + deg2rad(pose.leftHipFlexion);
  const leftKnee = step(leftHip, lThighAngle, px(proportions.thighLength));
  const lShinAngle = lThighAngle + deg2rad(pose.leftKneeFlexion);
  const leftAnkle = step(leftKnee, lShinAngle, px(proportions.shinLength));
  const leftToe: Vec2 = {
    x: leftAnkle.x + px(proportions.footLength * 0.85),
    y: leftAnkle.y + px(proportions.footLength * 0.18),
  };

  return {
    pelvis, spine, neckBase, headCenter,
    rightShoulder, rightElbow, rightWrist,
    leftShoulder, leftElbow, leftWrist,
    rightHip, rightKnee, rightAnkle, rightToe,
    leftHip, leftKnee, leftAnkle, leftToe,
  };
}

// ─── Renderer Class ───────────────────────────────────────────────────────────

export class SkeletonRenderer {
  private dpr = 1;

  syncCanvas(canvas: HTMLCanvasElement): void {
    this.dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * this.dpr);
    const h = Math.round(rect.height * this.dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  render(
    canvas: HTMLCanvasElement,
    pose: ReferencePose,
    options: SkeletonRenderOptions = {},
    proportions: BodyProportions = DEFAULT_BODY_PROPORTIONS,
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const phase = options.phase ?? 'REFERENCE';
    const elapsedMs = options.elapsedMs ?? 0;
    const targetAngle = options.targetAngle ?? 165;
    const highlightJoint = options.highlightJoint ?? 'shoulder';
    const displayedAngle =
      options.currentAngle ?? pose.activeAngleDeg ?? pose.rightShoulderFlexion;

    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // Background gradient
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.55, 0, W * 0.5, H * 0.55, H * 0.72);
    bg.addColorStop(0, 'hsl(218, 16%, 12%)');
    bg.addColorStop(1, 'hsl(220, 16%, 7%)');
    ctx.fillStyle = bg;
    const effectivePose = mirrorPoseForSide(pose, options.side);
    const joints = computeJointPositions(effectivePose, W, H, proportions);
    const boneBase = (H / THICKNESS_BASE) * 9;

    // Ground line
    const groundY = Math.max(joints.rightAnkle.y, joints.leftAnkle.y, joints.pelvis.y) + H * 0.022;
    ctx.strokeStyle = COL.groundLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W * 0.05, groundY);
    ctx.lineTo(W * 0.95, groundY);
    ctx.stroke();

    // Depth offset for contralateral limbs
    const depthX = H * DEPTH_OFFSET_X;
    const depthY = H * DEPTH_OFFSET_Y;
    const offset = (p: Vec2): Vec2 => add(p, { x: -depthX, y: -depthY });

    // Active limb colours
    let activeBoneColor = COL.boneArm;
    let activeHighlight = COL.highlightArm;
    let activeJointColor = COL.jointArm;
    let activeJointGlow = COL.jointGlow;

    if (phase === 'LIMITATION') {
      activeBoneColor = COL.amberArm;
      activeHighlight = COL.amberHighlight;
      activeJointColor = COL.amberJoint;
      activeJointGlow = COL.amberGlow;
    } else if (phase === 'CORRECTION') {
      activeBoneColor = COL.guidanceArm;
      activeHighlight = COL.highlightArm;
      activeJointColor = COL.guidanceJoint;
      activeJointGlow = COL.guidanceGlow;
    } else if (phase === 'IMPROVED') {
      activeBoneColor = COL.successArm;
      activeHighlight = COL.highlightArm;
      activeJointColor = COL.successJoint;
      activeJointGlow = COL.successGlow;
    }

    // ── Draw Bones (Back to Front) ───────────────────────────────────────────
    const isArmActive = highlightJoint === 'shoulder';
    const isLegActive = highlightJoint === 'knee' || highlightJoint === 'hip';

    // 1. Left (rear) leg
    this.drawBone(ctx, offset(joints.leftHip), offset(joints.leftKnee), boneBase * THIGH_THICKNESS_MULT, COL.boneBack, COL.highlightBack, 0.65);
    this.drawBone(ctx, offset(joints.leftKnee), offset(joints.leftAnkle), boneBase * SHIN_THICKNESS_MULT, COL.boneBack, COL.highlightBack, 0.65);
    this.drawBone(ctx, offset(joints.leftAnkle), offset(joints.leftToe), boneBase * 0.85, COL.boneBack, COL.highlightBack, 0.65);

    // 2. Left (rear) arm
    this.drawBone(ctx, offset(joints.leftShoulder), offset(joints.leftElbow), boneBase * UPPER_ARM_THICKNESS_MULT, COL.boneBack, COL.highlightBack, 0.65);
    this.drawBone(ctx, offset(joints.leftElbow), offset(joints.leftWrist), boneBase * FOREARM_THICKNESS_MULT, COL.boneBack, COL.highlightBack, 0.65);

    // 3. Pelvis
    this.drawBone(ctx, joints.leftHip, joints.rightHip, boneBase * PELVIS_THICKNESS_MULT, COL.boneMid, COL.highlightFront, 1.0);

    // 4. Trunk
    this.drawBone(ctx, joints.pelvis, joints.spine, boneBase * TRUNK_THICKNESS_MULT * 1.05, COL.boneMid, COL.highlightFront, 1.0);
    this.drawBone(ctx, joints.spine, joints.neckBase, boneBase * TRUNK_THICKNESS_MULT * 0.90, COL.boneMid, COL.highlightFront, 1.0);

    // 5. Right (front) leg
    const rThighColor = isLegActive ? activeBoneColor : COL.boneFront;
    const rThighHigh = isLegActive ? activeHighlight : COL.highlightFront;
    const rShinColor = isLegActive ? activeBoneColor : COL.boneFront;
    const rShinHigh = isLegActive ? activeHighlight : COL.highlightFront;

    this.drawBone(ctx, joints.rightHip, joints.rightKnee, boneBase * THIGH_THICKNESS_MULT, rThighColor, rThighHigh, 1.0);
    this.drawBone(ctx, joints.rightKnee, joints.rightAnkle, boneBase * SHIN_THICKNESS_MULT, rShinColor, rShinHigh, 1.0);
    this.drawBone(ctx, joints.rightAnkle, joints.rightToe, boneBase * 0.85, COL.boneFront, COL.highlightFront, 1.0);

    // 6. Neck
    this.drawBone(ctx, joints.neckBase, joints.headCenter, boneBase * 0.85, COL.boneFront, COL.highlightFront, 1.0);

    // 7. Right (front) arm
    const rArmColor = isArmActive ? activeBoneColor : COL.boneFront;
    const rArmHigh = isArmActive ? activeHighlight : COL.highlightFront;
    this.drawBone(ctx, joints.rightShoulder, joints.rightElbow, boneBase * UPPER_ARM_THICKNESS_MULT, rArmColor, rArmHigh, 1.0);
    this.drawBone(ctx, joints.rightElbow, joints.rightWrist, boneBase * FOREARM_THICKNESS_MULT, rArmColor, rArmHigh, 1.0);

    // 8. Joints (rear)
    const jrBack = boneBase * 0.90;
    this.drawJoint(ctx, offset(joints.leftHip), jrBack, COL.jointBack, COL.jointGlow, 0.65);
    this.drawJoint(ctx, offset(joints.leftKnee), jrBack, COL.jointBack, COL.jointGlow, 0.65);
    this.drawJoint(ctx, offset(joints.leftAnkle), jrBack, COL.jointBack, COL.jointGlow, 0.65);
    this.drawJoint(ctx, offset(joints.leftShoulder), jrBack, COL.jointBack, COL.jointGlow, 0.65);
    this.drawJoint(ctx, offset(joints.leftElbow), jrBack, COL.jointBack, COL.jointGlow, 0.65);
    this.drawJoint(ctx, offset(joints.leftWrist), jrBack * 0.80, COL.jointBack, COL.jointGlow, 0.55);

    // 9. Joints (front)
    const jrFront = boneBase * 1.05;
    this.drawJoint(ctx, joints.pelvis, jrFront * 0.95, COL.jointFront, COL.jointGlow, 1.0);

    const rHipJointColor = highlightJoint === 'hip' ? activeJointColor : COL.jointFront;
    const rHipJointGlow = highlightJoint === 'hip' ? activeJointGlow : COL.jointGlow;
    this.drawJoint(ctx, joints.rightHip, jrFront, rHipJointColor, rHipJointGlow, 1.0);

    const rKneeJointColor = highlightJoint === 'knee' ? activeJointColor : COL.jointFront;
    const rKneeJointGlow = highlightJoint === 'knee' ? activeJointGlow : COL.jointGlow;
    this.drawJoint(ctx, joints.rightKnee, jrFront, rKneeJointColor, rKneeJointGlow, 1.0);

    this.drawJoint(ctx, joints.rightAnkle, jrFront * 0.90, COL.jointFront, COL.jointGlow, 1.0);
    this.drawJoint(ctx, joints.neckBase, jrFront * 0.85, COL.jointFront, COL.jointGlow, 1.0);

    // Right arm joints
    const rShoulderJointColor = highlightJoint === 'shoulder' ? activeJointColor : COL.jointFront;
    const rShoulderJointGlow = highlightJoint === 'shoulder' ? activeJointGlow : COL.jointGlow;
    this.drawJoint(ctx, joints.rightShoulder, jrFront * 1.20, rShoulderJointColor, rShoulderJointGlow, 1.0);
    this.drawJoint(ctx, joints.rightElbow, jrFront * 1.05, isArmActive ? activeJointColor : COL.jointFront, COL.jointGlow, 1.0);
    this.drawJoint(ctx, joints.rightWrist, jrFront * 0.90, isArmActive ? activeJointColor : COL.jointFront, COL.jointGlow, 1.0);

    // 10. Head
    this.drawHead(ctx, joints.headCenter, joints.neckBase, H * 0.066);

    // 11. Target Joint & Focus Point
    const focusPoint =
      highlightJoint === 'knee'
        ? joints.rightKnee
        : highlightJoint === 'hip'
        ? joints.rightHip
        : joints.rightShoulder;

    // 12. Angle Arc
    this.drawExerciseAngleArc(ctx, joints, displayedAngle, H, phase, highlightJoint, options.side);

    // 13. Phase-specific annotations
    if (phase === 'LIMITATION') {
      this.drawLimitationAnnotation(ctx, focusPoint, displayedAngle, targetAngle, H, W, elapsedMs);
    } else if (phase === 'CORRECTION') {
      this.drawCorrectionGuidance(ctx, focusPoint, displayedAngle, targetAngle, H, elapsedMs);
    } else if (phase === 'IMPROVED') {
      this.drawImprovedBadge(ctx, focusPoint, targetAngle, H);
    }

    ctx.restore();
  }

  // ── Private Drawing Methods ─────────────────────────────────────────────────

  private drawBone(
    ctx: CanvasRenderingContext2D,
    from: Vec2,
    to: Vec2,
    thickness: number,
    fillColor: string,
    highlightColor: string,
    alpha: number,
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.strokeStyle = fillColor;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    const p = perp(from, to, thickness * 0.22);
    ctx.strokeStyle = highlightColor;
    ctx.lineWidth = thickness * 0.32;
    ctx.beginPath();
    ctx.moveTo(from.x + p.x, from.y + p.y);
    ctx.lineTo(to.x + p.x, to.y + p.y);
    ctx.stroke();

    ctx.restore();
  }

  private drawJoint(
    ctx: CanvasRenderingContext2D,
    pos: Vec2,
    radius: number,
    fillColor: string,
    glowColor: string,
    alpha: number,
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 1.60, 0, 2 * Math.PI);
    ctx.fillStyle = glowColor;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = fillColor;
    ctx.fill();

    const grad = ctx.createRadialGradient(
      pos.x - radius * 0.30, pos.y - radius * 0.30, 0,
      pos.x, pos.y, radius,
    );
    grad.addColorStop(0, 'rgba(255,255,255,0.30)');
    grad.addColorStop(1, 'rgba(255,255,255,0.00)');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.restore();
  }

  private drawHead(
    ctx: CanvasRenderingContext2D,
    center: Vec2,
    neckBase: Vec2,
    radius: number,
  ): void {
    ctx.save();

    const neckDx = center.x - neckBase.x;
    const neckDy = center.y - neckBase.y;
    const neckAngle = Math.atan2(neckDy, neckDx);

    ctx.translate(center.x, center.y);
    ctx.rotate(neckAngle + Math.PI / 2);

    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = radius * 0.6;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = radius * 0.15;

    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.92, radius * 1.08, 0, 0, 2 * Math.PI);
    ctx.fillStyle = COL.headFill;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = COL.headStroke;
    ctx.lineWidth = radius * 0.14;
    ctx.stroke();

    const hGrad = ctx.createRadialGradient(-radius * 0.2, -radius * 0.35, 0, 0, 0, radius * 0.9);
    hGrad.addColorStop(0, 'rgba(255,255,255,0.22)');
    hGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.92, radius * 1.08, 0, 0, 2 * Math.PI);
    ctx.fillStyle = hGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(radius * 0.78, radius * 0.12, radius * 0.18, 0, 2 * Math.PI);
    ctx.fillStyle = COL.headFill;
    ctx.strokeStyle = COL.headStroke;
    ctx.lineWidth = radius * 0.12;
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawExerciseAngleArc(
    ctx: CanvasRenderingContext2D,
    joints: JointPositions,
    displayedAngle: number,
    canvasHeight: number,
    phase: ExercisePhase,
    highlightJoint?: JointHighlight,
    side?: 'left' | 'right' | 'bilateral',
  ): void {
    const isLeft = side === 'left';
    let origin = isLeft ? joints.leftShoulder : joints.rightShoulder;
    let v1 = isLeft
      ? { x: joints.leftHip.x - joints.leftShoulder.x, y: joints.leftHip.y - joints.leftShoulder.y }
      : { x: joints.rightHip.x - joints.rightShoulder.x, y: joints.rightHip.y - joints.rightShoulder.y };
    let v2 = isLeft
      ? { x: joints.leftElbow.x - joints.leftShoulder.x, y: joints.leftElbow.y - joints.leftShoulder.y }
      : { x: joints.rightElbow.x - joints.rightShoulder.x, y: joints.rightElbow.y - joints.rightShoulder.y };

    if (highlightJoint === 'knee') {
      origin = isLeft ? joints.leftKnee : joints.rightKnee;
      v1 = isLeft
        ? { x: joints.leftHip.x - joints.leftKnee.x, y: joints.leftHip.y - joints.leftKnee.y }
        : { x: joints.rightHip.x - joints.rightKnee.x, y: joints.rightHip.y - joints.rightKnee.y };
      v2 = isLeft
        ? { x: joints.leftAnkle.x - joints.leftKnee.x, y: joints.leftAnkle.y - joints.leftKnee.y }
        : { x: joints.rightAnkle.x - joints.rightKnee.x, y: joints.rightAnkle.y - joints.rightKnee.y };
    } else if (highlightJoint === 'hip') {
      origin = isLeft ? joints.leftHip : joints.rightHip;
      v1 = isLeft
        ? { x: joints.rightHip.x - joints.rightAnkle.x, y: 0 }
        : { x: joints.leftHip.x - joints.leftAnkle.x, y: 0 };
      v2 = isLeft
        ? { x: joints.leftKnee.x - joints.leftHip.x, y: joints.leftKnee.y - joints.leftHip.y }
        : { x: joints.rightKnee.x - joints.rightHip.x, y: joints.rightKnee.y - joints.rightHip.y };
    }

    const a1 = Math.atan2(v1.y, v1.x);
    const a2 = Math.atan2(v2.y, v2.x);
    const arcR = canvasHeight * 0.085;

    let arcColor = COL.arcStroke;
    let labelColor = COL.labelFg;

    if (phase === 'LIMITATION') {
      arcColor = '#FFA726';
      labelColor = '#FFA726';
    } else if (phase === 'CORRECTION') {
      arcColor = '#00E5FF';
      labelColor = '#00E5FF';
    } else if (phase === 'IMPROVED') {
      arcColor = '#00E676';
      labelColor = '#00E676';
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, arcR, a1, a2, false);
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Bisector label badge
    const midA = (a1 + a2) / 2;
    const labelDist = arcR + canvasHeight * 0.045;
    const lx = origin.x + Math.cos(midA) * labelDist;
    const ly = origin.y + Math.sin(midA) * labelDist;

    const label = `${Math.round(displayedAngle)}°`;
    ctx.font = `bold ${Math.round(canvasHeight * 0.034)}px ui-monospace, monospace`;
    const tw = ctx.measureText(label).width;
    const padX = 6, padY = 3;

    ctx.fillStyle = COL.labelBg;
    ctx.beginPath();
    ctx.roundRect(lx - tw / 2 - padX, ly - canvasHeight * 0.017 - padY, tw + padX * 2, canvasHeight * 0.034 + padY * 2, 4);
    ctx.fill();

    ctx.fillStyle = labelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx, ly);

    ctx.restore();
  }

  private drawLimitationAnnotation(
    ctx: CanvasRenderingContext2D,
    joint: Vec2,
    angle: number,
    targetAngle: number,
    H: number,
    W: number,
    elapsedMs: number,
  ): void {
    ctx.save();

    const pulseFactor = 0.5 + 0.5 * Math.sin(elapsedMs * 0.007);
    const pulseRadius = H * 0.035 + pulseFactor * H * 0.016;

    ctx.beginPath();
    ctx.arc(joint.x, joint.y, pulseRadius, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(255, 167, 38, ${0.40 + pulseFactor * 0.40})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    const offset = H * 0.04;
    const p1 = { x: joint.x + 8, y: joint.y - 8 };
    const p2 = { x: joint.x + offset + 30, y: joint.y - offset - 15 };
    const p3 = { x: Math.min(W - 12, p2.x + 85), y: p2.y };

    ctx.strokeStyle = '#FFA726';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();

    const cardW = 120;
    const cardH = 46;
    const cardX = Math.min(W - cardW - 8, p2.x);
    const cardY = p2.y - cardH - 4;

    ctx.fillStyle = 'rgba(12, 16, 24, 0.90)';
    ctx.strokeStyle = 'rgba(255, 167, 38, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFA726';
    ctx.font = '700 8.5px var(--font-sans, sans-serif)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('DETECTED LIMITATION', cardX + 8, cardY + 6);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 13px ui-monospace, monospace';
    ctx.fillText(`${Math.round(angle)}° / ${targetAngle}°`, cardX + 8, cardY + 18);

    ctx.fillStyle = 'hsl(220, 12%, 65%)';
    ctx.font = '500 8.5px var(--font-sans, sans-serif)';
    ctx.fillText('Below reference range', cardX + 8, cardY + 33);

    ctx.restore();
  }

  private drawCorrectionGuidance(
    ctx: CanvasRenderingContext2D,
    joint: Vec2,
    angle: number,
    targetAngle: number,
    H: number,
    elapsedMs: number,
  ): void {
    ctx.save();

    const wave = ((elapsedMs - 8000) % 1500) / 1500;
    const waveR = H * 0.035 + wave * H * 0.045;

    ctx.beginPath();
    ctx.arc(joint.x, joint.y, waveR, -Math.PI * 0.7, 0);
    ctx.strokeStyle = `rgba(0, 229, 255, ${Math.max(0, 0.6 - wave * 0.6)})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    const bx = joint.x + H * 0.06;
    const by = joint.y - H * 0.06;
    ctx.fillStyle = 'rgba(10, 18, 30, 0.85)';
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx - 35, by - 12, 70, 24, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00E5FF';
    ctx.font = '700 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(angle)}° / ${targetAngle}°`, bx, by);

    ctx.restore();
  }

  private drawImprovedBadge(
    ctx: CanvasRenderingContext2D,
    joint: Vec2,
    targetAngle: number,
    H: number,
  ): void {
    ctx.save();

    const bx = joint.x + H * 0.06;
    const by = joint.y - H * 0.06;

    ctx.fillStyle = 'rgba(10, 26, 18, 0.88)';
    ctx.strokeStyle = 'rgba(0, 230, 118, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx - 45, by - 12, 90, 24, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#00E676';
    ctx.font = '700 10.5px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${targetAngle}° / ${targetAngle}° ✓`, bx, by);

    ctx.restore();
  }
}
