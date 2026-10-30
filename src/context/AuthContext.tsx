/**
 * AuthContext.tsx
 * React Context providing patient session state, profile data,
 * and seamless direct access without a login gate.
 *
 * Automatically restores valid Supabase sessions if available,
 * while defaulting to an active patient profile so no login is required.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { ProfileRow } from '../types/database';
import { authService, type SignUpParams, type SignInParams } from '../services/authService';
import { patientService } from '../services/patientService';
import { isSupabaseConfigured } from '../lib/supabase';

interface SignUpResponse {
  error: Error | null;
  patientId?: string;
  emailConfirmationRequired?: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: ProfileRow | null;
  isAuthenticated: boolean;
  loading: boolean;
  isBackendConfigured: boolean;
  signIn: (params: SignInParams) => Promise<{ error: Error | null }>;
  signUp: (params: SignUpParams) => Promise<SignUpResponse>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Active patient profile - available immediately without login
const DEFAULT_USER: User = {
  id: 'patient-001',
  app_metadata: {},
  user_metadata: { full_name: 'Patient' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
  email: 'patient@physiosis.local',
} as User;

const DEFAULT_PROFILE: ProfileRow = {
  id: 'demo-patient-001',
  auth_user_id: 'patient-001',
  patient_login_id: 'PHS-100001',
  full_name: 'Patient',
  email: 'patient@physiosis.local',
  phone: null,
  role: 'PATIENT',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isBackendConfigured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(DEFAULT_USER);
  const [profile, setProfile] = useState<ProfileRow | null>(DEFAULT_PROFILE);
  const [loading] = useState<boolean>(false);

  // Helper to fetch/ensure profile from database if Supabase session is active
  const fetchProfile = useCallback(async (authUserId: string) => {
    try {
      const currentUser = await authService.getCurrentUser();
      if (!currentUser) return;

      const { profile: ensuredProfile } = await patientService.ensureProfile(currentUser);
      if (ensuredProfile) {
        setProfile(ensuredProfile);
      } else {
        const { profile: fetchedProfile } = await patientService.getProfile(authUserId);
        if (fetchedProfile) {
          setProfile(fetchedProfile);
        }
      }
    } catch (err) {
      console.warn('[AuthContext] Profile fetch warning:', err);
    }
  }, []);

  // Initialize session on mount if Supabase is connected
  useEffect(() => {
    if (!isBackendConfigured) {
      return;
    }

    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const session = await authService.getSession();
        if (session && session.user && isMounted) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        }
      } catch (err) {
        console.warn('[AuthContext] Session check:', err);
      }
    };

    initializeAuth();

    // Listen for auth state changes
    const { data: subscription } = authService.onAuthStateChange(async (_event, session: Session | null) => {
      if (!isMounted) return;
      if (session && session.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      } else {
        setUser(DEFAULT_USER);
        setProfile(DEFAULT_PROFILE);
      }
    });

    return () => {
      isMounted = false;
      if (subscription?.subscription) {
        subscription.subscription.unsubscribe();
      }
    };
  }, [isBackendConfigured, fetchProfile]);

  const signIn = async (params: SignInParams): Promise<{ error: Error | null }> => {
    if (!isBackendConfigured) {
      setUser({ id: 'patient-001', email: params.email } as User);
      setProfile({ ...DEFAULT_PROFILE, email: params.email });
      return { error: null };
    }

    const { data, error } = await authService.signIn(params);
    if (error) {
      return { error: error instanceof Error ? error : new Error(String(error)) };
    }

    if (data?.user) {
      setUser(data.user);
      await fetchProfile(data.user.id);
    }

    return { error: null };
  };

  const signUp = async (params: SignUpParams): Promise<SignUpResponse> => {
    const demoId = 'PHS-100001';
    setUser({ id: 'patient-001', email: params.email } as User);
    setProfile({
      ...DEFAULT_PROFILE,
      full_name: params.fullName,
      email: params.email,
      patient_login_id: demoId,
    });
    return { error: null, patientId: demoId, emailConfirmationRequired: false };
  };

  const signOut = async (): Promise<void> => {
    if (isBackendConfigured) {
      await authService.signOut().catch(() => {});
    }
    setUser(DEFAULT_USER);
    setProfile(DEFAULT_PROFILE);
  };

  const resetPassword = async (email: string): Promise<{ error: Error | null }> => {
    const { error } = await authService.resetPassword(email);
    return { error: error ? (error instanceof Error ? error : new Error('Failed to reset password.')) : null };
  };

  const refreshProfile = async (): Promise<void> => {
    if (user && user.id !== 'patient-001') {
      await fetchProfile(user.id);
    }
  };

  // Direct access: always authenticated
  const isAuthenticated = true;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAuthenticated,
        loading,
        isBackendConfigured,
        signIn,
        signUp,
        signOut,
        resetPassword,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
};
