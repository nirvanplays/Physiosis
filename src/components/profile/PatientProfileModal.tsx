/**
 * PatientProfileModal.tsx
 * Patient account details modal dialog.
 *
 * Displays:
 *   - Full Name
 *   - Email
 *   - Patient Login ID (e.g. PHS-100001)
 *   - Role
 *   - Registration Date
 */

import React from 'react';
import { X, User, Mail, Shield, Calendar, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface PatientProfileModalProps {
  onClose: () => void;
  onOpenHistory?: () => void;
}

export const PatientProfileModal: React.FC<PatientProfileModalProps> = ({
  onClose,
  onOpenHistory,
}) => {
  const { profile, user } = useAuth();

  const fullName = profile?.full_name || user?.user_metadata?.full_name || 'Patient';
  const email = profile?.email || user?.email || '—';
  const patientId = profile?.patient_login_id || 'PHS-100001';
  const role = profile?.role || 'PATIENT';
  const createdAt = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'Active';

  return (
    <div className="session-summary-overlay" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
      <div className="session-summary-modal patient-profile-modal">
        {/* Header */}
        <div className="session-summary__header">
          <div className="flex items-center gap-2">
            <div className="patient-avatar-circle">
              <User size={18} className="text-cyan" />
            </div>
            <div>
              <div className="session-summary__badge">Patient Account</div>
              <h2 id="profile-modal-title" className="session-summary__title">
                {fullName}
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="session-summary__close-btn"
            onClick={onClose}
            aria-label="Close profile"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="patient-profile-body">
          {/* Patient ID Banner */}
          <div className="profile-id-hero">
            <div className="profile-id-hero__left">
              <span className="profile-id-hero__label">Assigned Patient ID</span>
              <span className="profile-id-hero__value mono">{patientId}</span>
            </div>
            <div className="profile-role-badge">
              <Shield size={12} />
              <span>{role}</span>
            </div>
          </div>

          {/* Account Details Grid */}
          <div className="profile-details-grid">
            <div className="profile-detail-card">
              <div className="profile-detail-card__icon"><Mail size={14} /></div>
              <div className="profile-detail-card__content">
                <span className="profile-detail-card__label">Email Address</span>
                <span className="profile-detail-card__value">{email}</span>
              </div>
            </div>

            <div className="profile-detail-card">
              <div className="profile-detail-card__icon"><Calendar size={14} /></div>
              <div className="profile-detail-card__content">
                <span className="profile-detail-card__label">Member Since</span>
                <span className="profile-detail-card__value">{createdAt}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          {onOpenHistory && (
            <div className="profile-quick-actions">
              <button
                type="button"
                className="btn btn--secondary flex items-center gap-2 w-full"
                onClick={() => {
                  onClose();
                  onOpenHistory();
                }}
              >
                <FileText size={14} />
                <span>View Previous Session History</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
