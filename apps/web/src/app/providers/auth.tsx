import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AppAuthState, AuthCode, Permission, Role } from '@srik/shared';
import { apiGet, apiPost } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

export type AppUser = {
  profileId: string;
  authUserId: string;
  email: string;
  displayName: string;
  roles: Role[];
  permissions: Permission[];
  mustChangePassword: boolean;
};

/** Signed-out + the explicit application states (spec §18, R2 §10). */
export type AuthState = 'loading' | 'signed-out' | AppAuthState | 'authenticated-password-change-required';

type SessionPayload = {
  state: AuthState;
  user: AppUser | null;
  code?: AuthCode;
  message?: string;
  email?: string;
};

type AuthContextValue = {
  state: AuthState;
  user: AppUser | null;
  denial: { code?: AuthCode; message?: string; email?: string } | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<SessionPayload>('/auth/session');
      setSession(data);
    } catch {
      // A network/API failure must not masquerade as an authenticated state.
      setSession({ state: 'signed-out', user: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await authClient?.signOut();
    } finally {
      await apiPost('/auth/logout').catch(() => undefined);
      // Sensitive data from the previous user must not stay rendered (spec §49).
      qc.clear();
      setSession({ state: 'signed-out', user: null });
    }
  }, [qc]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state: loading ? 'loading' : (session?.state ?? 'signed-out'),
      user: session?.user ?? null,
      denial: session && !session.user ? { code: session.code, message: session.message, email: session.email } : null,
      refresh,
      signOut,
    }),
    [loading, session, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Only this state may enter the operational app shell (spec §57). */
export const isOperational = (state: AuthState) => state === 'authenticated-active';

/** Must change password before any operational screen (R2 §10). */
export const mustChangePassword = (state: AuthState) => state === 'authenticated-password-change-required';
