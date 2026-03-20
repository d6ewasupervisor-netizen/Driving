/**
 * Auth Types for Ali's Aigoo Apocalypse
 */

export interface CustomClaims {
  role: 'player' | 'parent';
  gameAccess: boolean;
  dashboardAccess: boolean;
  canSendRadioMessages?: boolean;
  journey?: {
    startLocation: string;
    destination: string;
    totalMiles: number;
  };
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: 'player' | 'parent';
  customClaims?: CustomClaims;
  parentName?: string;
  inviteCode?: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  token: string;
}

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  signUp: (email: string, password: string, displayName: string) => Promise<User>;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  isPlayer: boolean;
  isParent: boolean;
  hasGameAccess: boolean;
  hasDashboardAccess: boolean;
}
