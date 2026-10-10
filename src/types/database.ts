/**
 * database.ts
 * TypeScript type definitions for Supabase PostgreSQL database tables.
 */

export type UserRole = 'PATIENT' | 'THERAPIST' | 'ADMIN';
export type SessionMode = 'LIVE' | 'DEMO';
export type TrendDirection = 'IMPROVING' | 'STABLE' | 'DECLINING';

export interface ProfileRow {
  id: string;
  auth_user_id: string;
  patient_login_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface ProfileInsert {
  id?: string;
  auth_user_id: string;
  patient_login_id?: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role?: UserRole;
  created_at?: string;
  updated_at?: string;
}

export interface ProfileUpdate {
  full_name?: string;
  phone?: string | null;
  role?: UserRole;
  updated_at?: string;
}

export interface ExerciseRow {
  id: string;
  exercise_code: string;
  name: string;
  description: string | null;
  target_angle: number;
  category: string;
  plane: string;
  difficulty: string;
  dataset_source?: string;
  dataset_exercise_code?: string | null;
  laterality_type?: 'BILATERAL' | 'LEFT_RIGHT' | string;
  body_region?: string | null;
  reference_available?: boolean;
  created_at: string;
}

export interface RehabSessionRow {
  id: string;
  patient_id: string;
  exercise_id: string;
  mode: SessionMode;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  total_reps: number;
  best_rom: number;
  average_rom: number;
  best_quality: number;
  average_quality: number;
  limitations_detected: number;
  average_deviation: number;
  average_severity: number;
  first_rep_rom: number | null;
  last_rep_rom: number | null;
  movement_progress: number;
  trend: TrendDirection;
  ended_reason?: 'manual' | 'automatic' | null;
  created_at: string;
}

export interface RehabSessionInsert {
  id?: string;
  patient_id: string;
  exercise_id: string;
  mode?: SessionMode;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  total_reps: number;
  best_rom: number;
  average_rom: number;
  best_quality?: number;
  average_quality?: number;
  limitations_detected?: number;
  average_deviation?: number;
  average_severity?: number;
  first_rep_rom?: number | null;
  last_rep_rom?: number | null;
  movement_progress?: number;
  trend?: TrendDirection;
  ended_reason?: 'manual' | 'automatic' | null;
  created_at?: string;
}

export interface SessionRepRow {
  id: string;
  session_id: string;
  rep_number: number;
  peak_angle: number;
  target_angle: number;
  rom_percentage: number;
  deviation: number;
  quality_score: number;
  severity: number;
  limitation_detected: boolean;
  status_label: string;
  created_at: string;
}

export interface SessionRepInsert {
  id?: string;
  session_id: string;
  rep_number: number;
  peak_angle: number;
  target_angle: number;
  rom_percentage: number;
  deviation: number;
  quality_score: number;
  severity?: number;
  limitation_detected?: boolean;
  status_label?: string;
  created_at?: string;
}

export interface MovementSampleRow {
  id: string;
  session_id: string;
  timestamp_ms: number;
  angle: number;
  rom_percentage: number;
  quality_score: number;
  severity: number;
  movement_state: string;
  created_at: string;
}

export interface MovementSampleInsert {
  id?: string;
  session_id: string;
  timestamp_ms: number;
  angle: number;
  rom_percentage: number;
  quality_score: number;
  severity?: number;
  movement_state: string;
  created_at?: string;
}

export interface SessionReportRow {
  id: string;
  session_id: string;
  patient_id: string;
  report_title: string;
  summary: string;
  limitation_summary: string | null;
  advisory_guidance: string;
  movement_progress: number;
  trend: TrendDirection;
  generated_at: string;
  created_at: string;
}

export interface SessionReportInsert {
  id?: string;
  session_id: string;
  patient_id: string;
  report_title?: string;
  summary: string;
  limitation_summary?: string | null;
  advisory_guidance: string;
  movement_progress?: number;
  trend?: TrendDirection;
  generated_at?: string;
  created_at?: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      exercises: {
        Row: ExerciseRow;
        Insert: Omit<ExerciseRow, 'id' | 'created_at'>;
        Update: Partial<Omit<ExerciseRow, 'id' | 'created_at'>>;
      };
      rehab_sessions: {
        Row: RehabSessionRow;
        Insert: RehabSessionInsert;
        Update: Partial<RehabSessionInsert>;
      };
      session_reps: {
        Row: SessionRepRow;
        Insert: SessionRepInsert;
        Update: Partial<SessionRepInsert>;
      };
      movement_samples: {
        Row: MovementSampleRow;
        Insert: MovementSampleInsert;
        Update: Partial<MovementSampleInsert>;
      };
      session_reports: {
        Row: SessionReportRow;
        Insert: SessionReportInsert;
        Update: Partial<SessionReportInsert>;
      };
    };
  };
}
