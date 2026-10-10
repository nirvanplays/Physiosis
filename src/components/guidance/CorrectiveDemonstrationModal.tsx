/**
 * CorrectiveDemonstrationModal.tsx
 * Autonomous AI Physiotherapy Form Correction & Visual Demonstration Studio.
 *
 * Provides:
 *   1. "Fault vs. Fix" side-by-side biomechanical comparator.
 *   2. Procedural 60fps canvas demonstration player showing the corrective drill.
 *   3. Clinical step-by-step neuromuscular cues.
 *   4. Spoken AI voice coaching via SpeechOutputService.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import type { DetectedCompensation } from '../../engine/biomechanics/biomechanicsTypes';
import {
  getDrillForAbnormalPosture,
  type CorrectiveDrill,
} from '../../engine/guidance/CorrectiveDrillRegistry';
import { speechOutputService } from '../../services/voice/SpeechOutputService';

interface CorrectiveDemonstrationModalProps {
  compensation: DetectedCompensation | null;
  onClose: () => void;
  onContinuePractice: () => void;
}

export const CorrectiveDemonstrationModal: React.FC<CorrectiveDemonstrationModalProps> = ({
  compensation,
  onClose,
  onContinuePractice,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  const drill: CorrectiveDrill = getDrillForAbnormalPosture(compensation?.type);

  // ── Procedural Biomechanical Canvas Demonstration Player ──────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let startTime = performance.now();
    let isCancelled = false;

    const render = (now: number) => {
      if (isCancelled) return;
      if (isPlaying) {
        const elapsed = (now - startTime) / 1000;

        // Canvas dimensions
        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        // 1. Draw modern clinical grid & backdrop
        ctx.fillStyle = '#080e1a';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(0, 229, 255, 0.06)';
        ctx.lineWidth = 1;
        const gridSize = 24;
        for (let x = 0; x < w; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        // Center coordinates
        const cx = w * 0.5;
        const groundY = h * 0.88;

        // Draw ground reference line
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w * 0.15, groundY);
        ctx.lineTo(w * 0.85, groundY);
        ctx.stroke();

        // 2. Animate drill skeleton based on drill.animationType
        // A periodic cycle of 3.5 seconds
        const cyclePeriod = 3.5;
        const t = (elapsed % cyclePeriod) / cyclePeriod;
        // Smooth sine wave progress 0 -> 1 -> 0
        const progress = Math.sin(t * Math.PI);

        // Core anatomical nodes
        const pelvisX = cx;
        const pelvisY = groundY - 110;
        const spineLength = 70;

        let spineAngle = 0;
        let leftShoulderHike = 0;
        let rightShoulderHike = 0;
        let rightArmAngle = -Math.PI * 0.5 * progress; // Arm raise
        let kneeValgusOffset = 0;
        let headOffset = 0;

        if (drill.animationType === 'spine_lateral_reset') {
          // Demonstrating keeping spine 100% vertical while arm elevates
          spineAngle = 0; // Pure vertical
          // Draw ghost fault trace
          const faultAngle = (14 * Math.PI) / 180 * progress;
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 82, 82, 0.35)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(pelvisX, pelvisY);
          ctx.lineTo(
            pelvisX + Math.sin(faultAngle) * spineLength,
            pelvisY - Math.cos(faultAngle) * spineLength
          );
          ctx.stroke();
          ctx.restore();
        } else if (drill.animationType === 'scapular_depression_reset') {
          // Demonstrating keeping shoulders locked level
          rightShoulderHike = 0; // Fixed!
          // Ghost fault shoulder hiking up
          const ghostHike = 16 * progress;
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 167, 38, 0.4)';
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(cx + 34, pelvisY - spineLength - ghostHike, 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else if (drill.animationType === 'knee_tracking_reset') {
          kneeValgusOffset = 0; // Aligned!
          // Ghost knee caving
          const faultKneeX = cx + 22 - 18 * progress;
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 82, 82, 0.4)';
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(faultKneeX, pelvisY + 55, 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else if (drill.animationType === 'chin_tuck_reset') {
          headOffset = -14 * progress; // Retracting back into neutral
        }

        const chestX = pelvisX + Math.sin(spineAngle) * spineLength;
        const chestY = pelvisY - Math.cos(spineAngle) * spineLength;
        const neckY = chestY - 14;
        const headX = chestX + headOffset;
        const headY = neckY - 20;

        // 3. Draw Patient Spine & Pelvis
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#00E5FF';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pelvisX, pelvisY);
        ctx.lineTo(chestX, chestY);
        ctx.stroke();

        // Plumb line vertical reference
        ctx.strokeStyle = 'rgba(0, 230, 118, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(pelvisX, groundY - 20);
        ctx.lineTo(pelvisX, headY - 25);
        ctx.stroke();
        ctx.setLineDash([]);

        // Head
        ctx.fillStyle = '#E0F7FA';
        ctx.beginPath();
        ctx.arc(headX, headY, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Shoulders
        const shoulderWidth = 34;
        const lShoulderX = chestX - shoulderWidth;
        const lShoulderY = chestY - leftShoulderHike;
        const rShoulderX = chestX + shoulderWidth;
        const rShoulderY = chestY - rightShoulderHike;

        // Clavicle line
        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(lShoulderX, lShoulderY);
        ctx.lineTo(rShoulderX, rShoulderY);
        ctx.stroke();

        // Left arm (resting)
        ctx.strokeStyle = 'rgba(214, 226, 236, 0.7)';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(lShoulderX, lShoulderY);
        ctx.lineTo(lShoulderX - 8, lShoulderY + 45);
        ctx.lineTo(lShoulderX - 10, lShoulderY + 90);
        ctx.stroke();

        // Right arm (active drill motion)
        const upperArmLen = 42;
        const forearmLen = 42;
        const rElbowX = rShoulderX + Math.cos(rightArmAngle + Math.PI * 0.5) * upperArmLen;
        const rElbowY = rShoulderY + Math.sin(rightArmAngle + Math.PI * 0.5) * upperArmLen;
        const rWristX = rElbowX + Math.cos(rightArmAngle + Math.PI * 0.5) * forearmLen;
        const rWristY = rElbowY + Math.sin(rightArmAngle + Math.PI * 0.5) * forearmLen;

        ctx.strokeStyle = '#00E676';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(rShoulderX, rShoulderY);
        ctx.lineTo(rElbowX, rElbowY);
        ctx.lineTo(rWristX, rWristY);
        ctx.stroke();

        // Pelvis & Legs
        const hipWidth = 20;
        const lHipX = pelvisX - hipWidth;
        const rHipX = pelvisX + hipWidth;

        // Legs
        ctx.strokeStyle = 'rgba(214, 226, 236, 0.7)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        // Left leg
        ctx.moveTo(lHipX, pelvisY);
        ctx.lineTo(lHipX - 4, pelvisY + 55);
        ctx.lineTo(lHipX - 6, groundY);
        // Right leg
        ctx.moveTo(rHipX, pelvisY);
        ctx.lineTo(rHipX + 4 + kneeValgusOffset, pelvisY + 55);
        ctx.lineTo(rHipX + 6, groundY);
        ctx.stroke();

        // Joint Halos
        const drawJoint = (x: number, y: number, color: string = '#00E5FF', r: number = 4) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        };

        drawJoint(rShoulderX, rShoulderY, '#00E676', 5);
        drawJoint(rElbowX, rElbowY, '#00E676', 4.5);
        drawJoint(rWristX, rWristY, '#00E676', 4);
        drawJoint(lShoulderX, lShoulderY, '#00E5FF', 4);
        drawJoint(chestX, chestY, '#00E5FF', 4);
        drawJoint(pelvisX, pelvisY, '#00E5FF', 5);

        // 4. Overlaid Movement Guidance Text inside canvas
        ctx.fillStyle = '#00E676';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText('✓ CLINICAL TARGET DRILL', 14, 24);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '10px monospace';
        ctx.fillText(
          `CYCLE PROGRESS: ${Math.round(progress * 100)}% · SYMMETRY: 100%`,
          14,
          38
        );
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      isCancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, drill]);

  // ── AI Voice Coaching Speech Synthesizer ─────────────────────────────────
  const handleToggleVoice = useCallback(() => {
    if (isSpeaking) {
      speechOutputService.stop();
      setIsSpeaking(false);
    } else {
      const speechText = `Form Correction Guidance. Detected issue: ${compensation?.name || drill.title}. ${drill.faultDescription}. Here is how to fix it: ${drill.cues.join('. ')}`;
      setIsSpeaking(true);
      speechOutputService.speak(speechText, 'en', 'correction').then(() => {
        setIsSpeaking(false);
      });
    }
  }, [isSpeaking, compensation, drill]);

  const handleRestartAnimation = () => {
    setIsPlaying(true);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div
        className="modal-content"
        style={{
          maxWidth: '820px',
          width: '95vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(0, 229, 255, 0.3)',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.8), 0 0 24px rgba(0, 229, 255, 0.15)',
        }}
      >
        {/* ── 1. Modal Header ────────────────────────────────────────────── */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'linear-gradient(90deg, rgba(8, 14, 26, 0.95), rgba(13, 24, 41, 0.95))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(255, 82, 82, 0.15)',
                border: '1px solid rgba(255, 82, 82, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FF5252',
              }}
            >
              <AlertTriangle size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2
                  id="modal-title"
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  AI Biomechanical Form Correction
                </h2>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background:
                      compensation?.severity === 'SEVERE'
                        ? 'rgba(255, 82, 82, 0.2)'
                        : 'rgba(255, 167, 38, 0.2)',
                    color:
                      compensation?.severity === 'SEVERE' ? '#FF5252' : '#FFA726',
                    border: '1px solid currentColor',
                  }}
                >
                  {compensation?.severity || 'ACTIVE'} COMPENSATION
                </span>
              </div>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  display: 'block',
                  marginTop: '2px',
                }}
              >
                Target Protocol: <strong style={{ color: 'var(--accent-cyan)' }}>{drill.title}</strong> · {drill.targetArea}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleToggleVoice}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: isSpeaking ? 'var(--accent-cyan)' : 'var(--text-primary)',
                borderColor: isSpeaking ? 'var(--accent-cyan)' : 'var(--border-subtle)',
              }}
              title="Listen to AI physiotherapist spoken cues"
            >
              {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
              <span>{isSpeaking ? 'Stop Voice' : 'AI Voice Coach'}</span>
            </button>

            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              aria-label="Close modal"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── 2. Modal Body (Scrollable) ─────────────────────────────────── */}
        <div
          style={{
            padding: '16px 20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Clinical Rationale Alert */}
          <div
            style={{
              background: 'rgba(0, 229, 255, 0.05)',
              border: '1px solid rgba(0, 229, 255, 0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              lineHeight: 1.45,
            }}
          >
            <ShieldCheck size={18} style={{ color: 'var(--accent-cyan)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ color: 'var(--accent-cyan)' }}>Clinical Rationale: </strong>
              {drill.clinicalRationale}
            </div>
          </div>

          {/* Side-by-Side "Fault vs. Fix" Comparison */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '14px',
            }}
          >
            {/* Left: What Went Wrong (Fault) */}
            <div
              style={{
                background: 'rgba(255, 82, 82, 0.04)',
                border: '1px solid rgba(255, 82, 82, 0.25)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#FF5252',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Detected Fault
                </span>
                {compensation && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#FF5252',
                    }}
                  >
                    {compensation.measuredValue}
                    {compensation.unit} (Tol: {compensation.thresholdValue}
                    {compensation.unit})
                  </span>
                )}
              </div>

              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {compensation?.name || drill.faultType}
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {drill.faultDescription}
              </div>
            </div>

            {/* Right: How to Correct It (Fix) */}
            <div
              style={{
                background: 'rgba(0, 230, 118, 0.05)',
                border: '1px solid rgba(0, 230, 118, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#00E676',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Target Clinical Fix
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#00E676',
                  }}
                >
                  Isolated & Stable
                </span>
              </div>

              <div style={{ fontSize: '13px', fontWeight: 600, color: '#00E676' }}>
                {drill.title}
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {drill.fixDescription}
              </div>
            </div>
          </div>

          {/* Procedural 60fps Biomechanical Demonstration Canvas */}
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
              background: '#080e1a',
            }}
          >
            <canvas
              ref={canvasRef}
              width={760}
              height={260}
              style={{ width: '100%', height: '220px', display: 'block' }}
            />

            {/* Canvas Playback Controls Bar */}
            <div
              style={{
                position: 'absolute',
                bottom: '10px',
                right: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(8, 14, 26, 0.85)',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(6px)',
              }}
            >
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setIsPlaying(!isPlaying)}
                style={{ padding: '2px 8px', height: '24px', fontSize: '11px' }}
                title={isPlaying ? 'Pause demonstration' : 'Play demonstration'}
              >
                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={handleRestartAnimation}
                style={{ padding: '2px 8px', height: '24px', fontSize: '11px' }}
                title="Restart demonstration loop"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Step-by-Step Clinical Neuromuscular Cues */}
          <div
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                Neuromuscular Execution Cues
              </span>
              <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                {drill.recommendedDose}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {drill.cues.map((cue, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '12.5px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.4,
                  }}
                >
                  <CheckCircle2
                    size={14}
                    style={{ color: '#00E676', flexShrink: 0, marginTop: '2px' }}
                  />
                  <span>{cue}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 3. Modal Footer Actions ────────────────────────────────────── */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-base)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Practice these cues carefully to prevent injury and maximize functional rehabilitation.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onClose}
              style={{ height: '32px', padding: '0 14px', fontSize: '12px' }}
            >
              Close
            </button>

            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={onContinuePractice}
              style={{
                height: '32px',
                padding: '0 16px',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>Apply Fix to Practice</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
