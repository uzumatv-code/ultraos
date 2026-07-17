import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export type UserRole = 'admin' | 'operador';
export type Permission =
  | 'dashboard.view'
  | 'clientes.create'
  | 'clientes.update'
  | 'clientes.delete'
  | 'cadastros.manage'
  | 'cadastros.delete'
  | 'ordens.create'
  | 'ordens.update'
  | 'ordens.delete'
  | 'ordens.cancel'
  | 'ordens.status'
  | 'lembretes.send'
  | 'financeiro.read'
  | 'financeiro.write'
  | 'nfse.manage'
  | 'settings.manage'
  | 'users.manage'
  | 'audit.read';

interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: { nome?: string; avatar_url?: string };
  app_metadata?: { nivel?: string; conta_id?: string };
}

interface AuthContextValue {
  user: AuthUser | null;
  role: UserRole;
  loading: boolean;
  authenticated: boolean;
  can: (permission: Permission) => boolean;
  refresh: () => Promise<void>;
}

const operatorPermissions = new Set<Permission>([
  'dashboard.view', 'clientes.create', 'clientes.update', 'cadastros.manage',
  'ordens.create', 'ordens.update', 'ordens.status', 'lembretes.send',
]);

const AuthContext = createContext<AuthContextValue | null>(null);

function resolveRole(user: AuthUser | null): UserRole {
  return user?.app_metadata?.nivel === 'admin' ? 'admin' : 'operador';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.auth.getUser();
    setUser((data.user as AuthUser | null) || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((session?.user as AuthUser | null) || null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const role = resolveRole(user);
  const value = useMemo<AuthContextValue>(() => ({
    user,
    role,
    loading,
    authenticated: Boolean(user),
    can: (permission) => role === 'admin' || operatorPermissions.has(permission),
    refresh,
  }), [loading, refresh, role, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
