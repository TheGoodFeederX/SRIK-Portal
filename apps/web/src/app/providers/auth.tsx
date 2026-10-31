import { createContext, useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import type { Permission, Role } from '@srik/shared';

export type Session = { id: string; email: string; displayName: string; roles: Role[]; permissions: Permission[] } | null;

const AuthContext = createContext<{ session: Session; isLoading: boolean; logout: () => void } | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: () => apiGet<Session>('/auth/session'), staleTime: 60_000 });
  const logout = useMutation({
    mutationFn: () => apiPost('/auth/logout'),
    onSuccess: () => qc.clear(),
  });
  return (
    <AuthContext.Provider
      value={{ session: sessionQuery.data ?? null, isLoading: sessionQuery.isLoading, logout: () => logout.mutate() }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
