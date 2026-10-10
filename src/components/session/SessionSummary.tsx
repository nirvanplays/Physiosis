/**
 * SessionSummary.tsx
 * End-of-Session rehabilitation summary modal.
 *
 * Displays overview metrics, detected limitations, improvement change,
 * repetition breakdown, and advisory guidance.
 */

import React from 'react';
import { X, Award, Activity, Repeat, Clock, AlertTriangle, TrendingUp, CheckCircle, ShieldAlert } from 'lucide-react';
import type { PhysiosisSession } from '../../engine/session/SessionTypes';
import { formatElapsedTime } from '../../utils/format';
import { generateAdvisoryGuidance, formatSessionDate } from '../../engine/session/SessionAnalytics';

interface SessionSummaryProps {
  session: PhysiosisSession;
  onClose: () => void;
  onStartNewSession?: () => void;
}

export const SessionSummary: React.FC<SessionSummaryProps> = ({
  session,
  onClose,
  onStartNewSession,
}) => {
  const guidanceText = generateAdvisoryGuidance(session);
  const hasLimitations = session.limitationsDetected > 0;

  return (
    <div className="session-summary-overlay" role="dialog" aria-modal="true" aria-labelledby="session-summary-title">
      <div className="session-summary-modal">
        {/* ── Modal Header ─────────────────────────────────────────────── */}
        <div className="session-summary__header">
          <div>
            <div className="session-summary__badge">Rehabilitation Session Report</div>
            <h2 id="session-summary-title" className="session-summary__title">
              Physiosis Session Summary
            </h2>
            <div className="session-summary__meta">
              <span>{session.exercise}</span>
              <span>•</span>
              <span>{formatSessionDate(session.startedAt)}</span>
            </div>
          </div>
          <button
            type="button"
            className="session-summary__close-btn"
            onClick={onClose}
            aria-label="Close summary"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Modal Scrollable Body ────────────────────────────────────── */}
        <div className="session-summary__body">
          {/* Key Metric Tiles Grid */}
          <div className="session-summary__grid">
            <div className="summary-tile">
              <div className="summary-tile__icon"><Clock size={16} /></div>
              <div className="summary-tile__content">
                <span className="summary-tile__value">{formatElapsedTime(session.durationSeconds * 1000)}</span>
                <span className="summary-tile__label">Duration</span>
              </div>
            </div>

            <div className="summary-tile">
              <div className="summary-tile__icon"><Repeat size={16} /></div>
              <div className="summary-tile__content">
                <span className="summary-tile__value">{session.totalReps}</span>
                <span className="summary-tile__label">Completed Reps</span>
              </div>
            </div>

            <div className="summary-tile summary-tile--highlight">
              <div className="summary-tile__icon"><Award size={16} /></div>
              <div className="summary-tile__content">
                <span className="summary-tile__value">{session.bestROM}°</span>
                <span className="summary-tile__label">Best ROM (Ref: 165°)</span>
              </div>
            </div>

            <div className="summary-tile">
              <div className="summary-tile__icon"><Activity size={16} /></div>
              <div className="summary-tile__content">
                <span className="summary-tile__value">{session.averageROM}°</span>
                <span className="summary-tile__label">Average ROM</span>
              </div>
            </div>

            <div className="summary-tile">
              <div className="summary-tile__icon"><CheckCircle size={16} /></div>
              <div className="summary-tile__content">
                <span className="summary-tile__value">{session.averageScore} / 100</span>
                <span className="summary-tile__label">Average Quality</span>
              </div>
            </div>

            <div className="summary-tile">
              <div className="summary-tile__icon"><TrendingUp size={16} /></div>
              <div className="summary-tile__content">
                <span className="summary-tile__value">
                  {session.improvementDegrees !== null
                    ? `${session.improvementDegrees >= 0 ? '+' : ''}${session.improvementDegrees}°`
                    : '—'}
                </span>
                <span className="summary-tile__label">Range Change</span>
              </div>
            </div>
          </div>

          {/* Limitation Analysis Box */}
          {hasLimitations ? (
            <div className="session-summary__alert session-summary__alert--warning">
              <div className="session-summary__alert-header">
                <AlertTriangle size={16} />
                <span>Detected Movement Limitation ({session.limitationsDetected} reps below reference)</span>
              </div>
              <p className="session-summary__alert-text">
                Shoulder range remained below the selected 165° reference target during {session.limitationsDetected} of {session.totalReps} completed repetitions (observed average: {session.averageROM}°).
              </p>
            </div>
          ) : (
            <div className="session-summary__alert session-summary__alert--success">
              <div className="session-summary__alert-header">
                <CheckCircle size={16} />
                <span>Target Range Consistently Achieved</span>
              </div>
              <p className="session-summary__alert-text">
                All repetitions reached the reference movement target range with proper elevation control.
              </p>
            </div>
          )}

          {/* Advisory Recommendation Box */}
          <div className="session-summary__section">
            <h3 className="session-summary__section-title">Advisory Guidance</h3>
            <div className="session-summary__guidance-box">
              <p>{guidanceText}</p>
            </div>
          </div>

          {/* Repetition Breakdown Table */}
          <div className="session-summary__section">
            <h3 className="session-summary__section-title">Repetition Breakdown</h3>
            <div className="session-summary__table-wrap">
              <table className="session-summary__table">
                <thead>
                  <tr>
                    <th>Rep</th>
                    <th>Peak ROM</th>
                    <th>Target</th>
                    <th>Change vs Previous</th>
                    <th>Quality</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {session.reps.map((r, idx) => {
                    const prevRep = idx > 0 ? session.reps[idx - 1] : null;
                    const delta = r.improvementFromPrevious ?? (prevRep ? r.peakAngle - prevRep.peakAngle : null);

                    return (
                      <tr key={r.repNumber}>
                        <td className="mono">Rep {r.repNumber}</td>
                        <td className="mono font-bold">{r.peakAngle}°</td>
                        <td className="mono text-muted">{r.targetAngle}°</td>
                        <td className="mono">
                          {delta !== null ? (
                            <span style={{ color: delta > 0 ? '#00E676' : delta < 0 ? '#FF5252' : 'var(--text-muted)' }}>
                              {delta >= 0 ? `+${delta}°` : `${delta}°`}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="mono">{r.qualityScore}/100</td>
                        <td>
                          <span className={`session-rep-tag session-rep-tag--${r.statusLabel.toLowerCase().replace(' ', '-')}`}>
                            {r.statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Modal Footer & Disclaimer ─────────────────────────────────── */}
        <div className="session-summary__footer">
          <div className="session-summary__disclaimer">
            <ShieldAlert size={12} style={{ flexShrink: 0 }} />
            <span>Physiosis provides advisory movement analysis and does not replace assessment by a licensed physiotherapist.</span>
          </div>

          <div className="session-summary__actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
            >
              Close
            </button>
            {onStartNewSession && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  onClose();
                  onStartNewSession();
                }}
              >
                Start New Session
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
