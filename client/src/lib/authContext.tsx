/**
 * React Auth Context for Ali's Aigoo Apocalypse
 */

import { createContext, useContext, useState, useEffect, ReactNode, ComponentType } from 'react';
import auth, { getToken } from './auth';
import type { User, AuthContextValue } from '@/types/auth';

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setToken(getToken());
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName: string): Promise<User> => {
    setError(null);
    try {
      const newUser = await auth.signUp(email, password, displayName);
      setUser(newUser);
      setToken(getToken());
      return newUser;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      setError(message);
      throw err;
    }
  };

  const signIn = async (email: string, password: string): Promise<User> => {
    setError(null);
    try {
      const loggedInUser = await auth.signIn(email, password);
      setUser(loggedInUser);
      setToken(getToken());
      return loggedInUser;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      throw err;
    }
  };

  const signOut = async (): Promise<void> => {
    setError(null);
    try {
      await auth.signOut();
      setUser(null);
      setToken(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      setError(message);
      throw err;
    }
  };

  const value: AuthContextValue = {
    user,
    token,
    loading,
    error,
    signUp,
    signIn,
    signOut,
    isAuthenticated: !!user,
    isPlayer: user?.role === 'player',
    isParent: user?.role === 'parent',
    hasGameAccess: user?.customClaims?.gameAccess ?? false,
    hasDashboardAccess: user?.customClaims?.dashboardAccess ?? false
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface WithAuthOptions {
  requiredRole?: 'player' | 'parent';
  redirectTo?: string;
}

// Higher-order component for protected routes
export function withAuth<P extends object>(
  Component: ComponentType<P>, 
  options: WithAuthOptions = {}
): ComponentType<P> {
  const { requiredRole, redirectTo = '/login' } = options;

  return function ProtectedComponent(props: P) {
    const { user, loading, isAuthenticated } = useAuth();

    if (loading) {
      return <div>Loading...</div>;
    }

    if (!isAuthenticated) {
      window.location.href = redirectTo;
      return null;
    }

    if (requiredRole && user?.role !== requiredRole) {
      return <div>Access Denied: {requiredRole} role required</div>;
    }

    return <Component {...props} />;
  };
}

export default AuthContext;
