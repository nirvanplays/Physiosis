/**
 * SessionHistory.tsx
 * Session history browser supporting both inline card display and modal overlay view.
 */

import React, { useState } from 'react';
import { History, Trash2, ChevronRight, Award, Repeat, X } from 'lucide-react';
import type { PhysiosisSession } from '../../engine/session/SessionTypes';
import { formatSessionDate } from '../../engine/session/SessionAnalytics';
import { clearSessions, deleteSession } from '../../engine/session/SessionStorage';

interface SessionHistoryProps {
  sessions: PhysiosisSession[];
  onSelectSession: (session: PhysiosisSession) => void;
  onRefreshSessions: () => void;
  isModal?: boolean;
  onClose?: () => void;
}

export const SessionHistory: React.FC<SessionHistoryProps> = ({
  sessions,
  onSelectSession,
  onRefreshSessions,
  isModal = false,
  onClose,
}) => {
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const handleClearAll = () => {
    clearSessions();
    setIsConfirmingClear(false);
    onRefreshSessions();
  };

  const handleDeleteOne = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteSession(id);
    onRefreshSessions();
  };

  const content = (
    <div className={`card session-history-card ${isModal ? 'session-history-card--modal' : ''}`}>
      <div className="card__header">
        <div className="card__header-left">
          <History size={16} />
          <div>
            <span className="card__title">Previous Sessions</span>
            <span className="recovery-trend-card__sub">{sessions.length} saved records</span>
          </div>
        </div>

        <div className="card__header-right">
          {sessions.length > 0 && (
            <>
              {!isConfirmingClear ? (
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setIsConfirmingClear(true)}
                  title="Clear all session history"
                  aria-label="Clear session history"
                >
                  <Trash2 size={13} />
                </button>
              ) : (
                <div className="session-history__clear-confirm">
                  <span>Clear all?</span>
                  <button type="button" className="btn-link text-crit" onClick={handleClearAll}>
                    Yes
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => setIsConfirmingClear(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}

          {isModal && onClose && (
            <button
              type="button"
              className="btn-icon"
              onClick={onClose}
              title="Close history"
              aria-label="Close history modal"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="session-history-card__empty">
          <p>No completed sessions yet.</p>
          <span>Saved session records and recovery trends will appear here after completing live exercises.</span>
        </div>
      ) : (
        <div className="session-history-list">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="session-history-item"
              onClick={() => onSelectSession(s)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelectSession(s);
              }}
            >
              <div className="session-history-item__left">
                <div className="session-history-item__title">
                  <span className="session-history-item__exercise">{s.exercise}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '3px',
                      background: 'rgba(0, 229, 255, 0.1)',
                      color: 'var(--accent-cyan)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {s.laterality === 'bilateral' ? 'Bilateral' : (s.laterality || 'Right')}
                  </span>
                  <span className="session-history-item__date">{formatSessionDate(s.startedAt)}</span>
                </div>
                <div className="session-history-item__metrics">
                  <span>
                    <Repeat size={11} /> {s.totalReps} reps
                  </span>
                  <span>
                    <Award size={11} /> Best: {s.bestROM}°
                  </span>
                  <span>Quality: {s.averageScore}/100</span>
                  {s.limitationsDetected > 0 ? (
                    <span className="session-rep-tag session-rep-tag--limited">
                      {s.limitationsDetected} Limited
                    </span>
                  ) : (
                    <span className="session-rep-tag session-rep-tag--target-reached">
                      Target Met
                    </span>
                  )}
                </div>
              </div>

              <div className="session-history-item__right">
                <button
                  type="button"
                  className="session-history-item__del-btn"
                  onClick={(e) => handleDeleteOne(e, s.id)}
                  title="Delete session"
                  aria-label="Delete this session record"
                >
                  <Trash2 size={12} />
                </button>
                <ChevronRight size={14} className="session-history-item__arrow" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="session-summary-overlay" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="session-history-modal-wrap">
          {content}
        </div>
      </div>
    );
  }

  return content;
};
